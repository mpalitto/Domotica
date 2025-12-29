/*
Author: Matteo Palitto
Date: January 9, 2024
Description: sONOFFserver.mjs
Main server file with three-state system integration
*/

// imports from third party libraries
import { createServer } from 'https';
import { createServer as createHttpServer } from 'http';
import { readFileSync, appendFileSync } from 'fs';
import { WebSocketServer } from 'ws';
import { exec } from 'child_process';
import { promisify } from 'util';

// imports from sub-modules
import { handleHttpRequest, handleWebSocketConnection } from './requestHandler-modules/requestHandler.mjs';
import { PROXY_IP, PROXY_PORT, TLS_KEY_PATH, TLS_CERT_PATH, sONOFF, reAPIkey, proxyAPIKey, protocolCapture, ConnectionState } from './sharedVARs.js';
import { DeviceTracking } from './requestHandler-modules/deviceTracking.mjs';

const execPromise = promisify(exec);

// Disabling TLS rejection for testing purposes
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

// **Startup validation**
function validateConfiguration() {
    console.log('\n' + '🔍'.repeat(40));
    console.log('Validating configuration...');
    console.log('🔍'.repeat(40));
    
    // Validate proxyAPIKey
    if (!proxyAPIKey || proxyAPIKey.length < 30) {
        console.error('\n❌ FATAL ERROR: proxyAPIKey not configured or too short!');
        console.error('   proxyAPIKey must be a valid UUID (36 characters)');
        console.error('   Current value:', proxyAPIKey || 'undefined');
        process.exit(1);
    }
    console.log(`✅ proxyAPIKey configured: ${proxyAPIKey.substring(0, 8)}...`);
    
    // Validate network configuration
    if (!PROXY_IP) {
        console.error('❌ FATAL ERROR: PROXY_IP not configured!');
        process.exit(1);
    }
    console.log(`✅ PROXY_IP: ${PROXY_IP}`);
    
    if (!PROXY_PORT || PROXY_PORT < 1 || PROXY_PORT > 65535) {
        console.error('❌ FATAL ERROR: Invalid PROXY_PORT!');
        process.exit(1);
    }
    console.log(`✅ PROXY_PORT: ${PROXY_PORT}`);
    
    // Validate TLS files exist
    try {
        readFileSync(TLS_KEY_PATH);
        console.log(`✅ TLS Key found: ${TLS_KEY_PATH}`);
    } catch (err) {
        console.error(`❌ FATAL ERROR: TLS key file not found: ${TLS_KEY_PATH}`);
        process.exit(1);
    }
    
    try {
        readFileSync(TLS_CERT_PATH);
        console.log(`✅ TLS Cert found: ${TLS_CERT_PATH}`);
    } catch (err) {
        console.error(`❌ FATAL ERROR: TLS cert file not found: ${TLS_CERT_PATH}`);
        process.exit(1);
    }
    
    console.log('🔍'.repeat(40) + '\n');
}

// **Startup cleanup function**
async function cleanupOldConnections() {
    console.log('\n' + '='.repeat(80));
    console.log('🧹 STARTUP CLEANUP - Clearing stale connections');
    console.log('='.repeat(80));
    
    try {
        // 1. Check if port is already in use
        console.log(`Checking if port ${PROXY_PORT} is already in use...`);
        const { stdout: netstatOutput } = await execPromise(`ss -tlnp | grep :${PROXY_PORT} || true`);
        
        if (netstatOutput.trim()) {
            console.log('⚠️  Port is already in use:');
            console.log(netstatOutput);
            
            // Try to find and kill the process
            const pidMatch = netstatOutput.match(/pid=(\d+)/);
            if (pidMatch) {
                const pid = pidMatch[1];
                console.log(`Found process ${pid} using port ${PROXY_PORT}`);
                console.log('Attempting to kill old process...');
                
                try {
                    await execPromise(`kill ${pid}`);
                    console.log('✅ Old process killed');
                    // Wait a bit for the port to be released
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (err) {
                    console.log('⚠️  Could not kill process:', err.message);
                    console.log('You may need to run: sudo kill', pid);
                }
            }
        } else {
            console.log('✅ Port is free');
        }
        
        // 2. Clean up any existing connections to our IP:PORT
        console.log(`\nCleaning up existing connections to ${PROXY_IP}:${PROXY_PORT}...`);
        const { stdout: connOutput } = await execPromise(`ss -tn | grep ${PROXY_IP}:${PROXY_PORT} || true`);
        
        if (connOutput.trim()) {
            const connections = connOutput.trim().split('\n');
            console.log(`Found ${connections.length} existing connection(s):`);
            connections.forEach((conn, idx) => {
                console.log(`  [${idx + 1}] ${conn}`);
            });
            
            console.log('These connections will be closed when devices detect the disconnect');
            console.log('Devices should reconnect within 30-60 seconds');
        } else {
            console.log('✅ No existing connections found');
        }
        
        // 3. Optional: Force TCP RST for immediate cleanup (requires sudo)
        console.log('\nChecking for tcpkill availability (optional)...');
        try {
            await execPromise('which tcpkill');
            console.log('⚠️  tcpkill found - could force immediate disconnect');
            console.log('Run this manually if needed:');
            console.log(`   sudo tcpkill -i any port ${PROXY_PORT}`);
        } catch (err) {
            console.log('ℹ️  tcpkill not available (optional tool)');
        }
        
    } catch (err) {
        console.log('⚠️  Cleanup check failed:', err.message);
        console.log('Continuing anyway...');
    }
    
    console.log('='.repeat(80) + '\n');
}

// **Graceful shutdown handler**
function gracefulShutdown(signal) {
    console.log(`\n\n${'='.repeat(80)}`);
    console.log(`Received ${signal} - Starting graceful shutdown...`);
    console.log('='.repeat(80));
    
    // Close all device connections
    console.log('Closing all device connections...');
    let closedCount = 0;
    Object.keys(sONOFF).forEach(devID => {
        if (sONOFF[devID].conn && sONOFF[devID].conn.ws) {
            try {
                sONOFF[devID].conn.ws.close(1001, 'Server shutdown');
                closedCount++;
            } catch (err) {
                console.error(`Error closing connection for ${devID}:`, err.message);
            }
        }
    });
    console.log(`✅ Closed ${closedCount} device connection(s)`);
    
    console.log('Shutdown complete');
    console.log('='.repeat(80) + '\n');
    
    process.exit(0);
}

// SSL/TLS configuration
const options = {
    // This allows everything from TLS 1.0 up to the latest 1.3
    minVersion: 'TLSv1',
    // This lowers the security level to allow the older ciphers used by ESP8266
    ciphers: 'DEFAULT:@SECLEVEL=0',
    key: readFileSync(TLS_KEY_PATH),
    cert: readFileSync(TLS_CERT_PATH),
};

// **STARTUP SEQUENCE**
console.log('Starting eWeLink Proxy Server...\n');

validateConfiguration();

cleanupOldConnections().then(() => {
    // 1. SECURE SERVER (Dispatch on 443 and WSS on 443/8082)
    const secureServer = createServer(options);
    // Passing the secureServer object to WSS
    const wssSecure = new WebSocketServer({ server: secureServer });

    // 2. PLAIN SERVER (Handles WS on 8081)
    const plainServer = createHttpServer();
    const wssPlain = new WebSocketServer({ server: plainServer });

    // Log TLS handshake failures
    secureServer.on('tlsClientError', (err, socket) => {
        if (err.code !== 'ECONNRESET') {
            console.error(`❌ TLS Handshake Error from ${socket.remoteAddress}: ${err.message}`);
        }
    });

    // Handling HTTP requests (Dispatch)
    secureServer.on('request', handleHttpRequest);
    plainServer.on('request', handleHttpRequest); // Fallback for non-ssl dispatch if needed

    // Handling WebSocket connections
    wssSecure.on('connection', (ws, req) => handleWebSocketConnection(ws, req));
    wssPlain.on('connection', (ws, req) => handleWebSocketConnection(ws, req));

    // Start Secure Server (Port 443)
    secureServer.listen(PROXY_PORT, PROXY_IP, () => {
        console.log('✅'.repeat(20));
        console.log(`SECURE SERVER: https://${PROXY_IP}:${PROXY_PORT}`);
        console.log('✅'.repeat(20));
    });

    // Start Plain Server (Port 8081)
    plainServer.listen(8081, PROXY_IP, () => {
        console.log('✅'.repeat(20));
        console.log(`PLAIN SERVER: http://${PROXY_IP}:8081`);
        console.log('✅'.repeat(20));
    });

    // WSS specifically on 8082 
    const secureServer8082 = createServer(options);
    const wss8082 = new WebSocketServer({ server: secureServer8082 });
    wss8082.on('connection', (ws, req) => handleWebSocketConnection(ws, req));
    secureServer8082.listen(8082, PROXY_IP, () => {
        console.log(`SECURE WSS: wss://${PROXY_IP}:8082`);
    });

    // Import and start command socket
    import('./cmd-modules/cmd.mjs').then(({ cmdSocket }) => {
        cmdSocket();
    });

}).catch(err => {
    console.error('Fatal error during startup:', err);
    process.exit(1);
});

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Ctrl+C
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // nodemon restart

export const sONOFFserver = {

    /**
     * Forward message to device
     * Updates switch state when sending update commands
     */
    forward2device: (devID, message) => {
        let device = sONOFF[devID];
    
        // **Log outgoing WSS message if capture is enabled**
        if (protocolCapture.enabled && devID === protocolCapture.deviceId && protocolCapture.logFile) {
            const timestamp = new Date().toISOString();
            const logEntry = `\n${'='.repeat(80)}\n[${timestamp}] PROXY -> DEVICE (WSS MSG)\n${'-'.repeat(80)}\n${message}\n${'='.repeat(80)}\n`;
            try {
                appendFileSync(protocolCapture.logFile, logEntry);
            } catch (err) {
                console.error('Error writing to capture file:', err);
            }
        }
    
        if (device && device.conn && device.conn.ws) {
            console.log('📤 Forwarding to device:', devID, '"' + (device.alias || 'unknown') + '"');
            
            try {
                let msgObj = JSON.parse(message);
                
                // **Update switch state if this is an update command**
                if (msgObj['action'] == 'update' && msgObj['params'] && msgObj['params']['switch']) {
                    const newState = msgObj['params']['switch'];
                    DeviceTracking.setSwitchState(devID, newState);
                }
                
                // Replace apikey with proxyAPIKey (for local communication)
                const localMessage = message.replace(reAPIkey, 'apikey":"' + proxyAPIKey + '"');
                device.conn.ws.send(localMessage);
                
                if (msgObj['action'] == 'update') {
                    console.log(`   💡 Command sent: ${msgObj['params']['switch']?.toUpperCase() || 'unknown'}`);
                }
                
            } catch (err) {
                console.error(`❌ Error forwarding message to ${devID}:`, err.message);
            }
        } else {
            const alias = device?.alias || 'unknown';
            const localState = device?.localConnectionState || ConnectionState.OFFLINE;
            const cloudState = device?.cloudConnectionState || ConnectionState.OFFLINE;
            
            console.log(`❌ Cannot forward to device ${devID} "${alias}"`);
            console.log(`   Local: ${localState}, Cloud: ${cloudState}`);
            
            if (!device) {
                console.log(`   Device object doesn't exist`);
            } else if (!device.conn) {
                console.log(`   No connection object`);
            } else if (!device.conn.ws) {
                console.log(`   WebSocket not established`);
            }
        }
    },

    /**
     * Check if device is online and handle timeout
     * Updated to work with three-state system
     */
    checkinDeviceOnLine: (deviceid) => {
        // Add null checks to prevent crash on race conditions
        if (!sONOFF[deviceid]) {
            return;
        }

        // Check if device should be online based on connection states
        const shouldBeOnline = (
            sONOFF[deviceid].localConnectionState === ConnectionState.ONLINE &&
            sONOFF[deviceid].cloudConnectionState === ConnectionState.ONLINE
        );

        if (!sONOFF[deviceid]['conn']) {
            if (shouldBeOnline || sONOFF[deviceid]['isOnline']) {
                console.log('⚠️  checkinDeviceOnLine: Device ' + deviceid + ' marked online but no connection - marking offline');
                DeviceTracking.setLocalConnectionState(deviceid, ConnectionState.OFFLINE);
                DeviceTracking.setCloudConnectionState(deviceid, ConnectionState.OFFLINE);
            }
            return;
        }

        if (!sONOFF[deviceid]['conn']['ws']) {
            return;
        }

        let ws = sONOFF[deviceid]['conn']['ws'];

        // Verify WebSocket is still in a valid state
        if (ws.readyState !== 1) { // 1 = OPEN
            return;
        }

        // Close connection if more than 5 minutes from last PING
        // Clear existing timeout if it exists
        if (ws['wsTimeout']) {
            clearTimeout(ws['wsTimeout']);
        }

        // Set a new timeout for 5 minutes (300 seconds)
        ws['wsTimeout'] = setTimeout(() => {
            // Double-check WebSocket is still valid before trying to close
            if (ws.readyState === 1) { // OPEN
                const alias = sONOFF[deviceid]?.alias || 'unknown';
                console.log('\n' + '─'.repeat(80));
                console.log('⏱️  WebSocket connection timeout due to inactivity');
                console.log(`   Device: ${deviceid} "${alias}"`);
                console.log(`   Closing connection after 5 minutes of inactivity`);
                console.log('─'.repeat(80) + '\n');
                ws.terminate(); // Close the WebSocket connection
            } else {
                console.log('⚠️  Timeout fired but WebSocket already closed for: ' + deviceid);
            }
        }, 300000); // 300 seconds (5 minutes) in milliseconds
    }
};
