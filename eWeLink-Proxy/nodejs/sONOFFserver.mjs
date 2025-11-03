/*
Author: Matteo Palitto
Date: January 9, 2024
Description: sONOFFserver.mjs
*/

// imports from thrid party libraries
import { createServer } from 'https';
// **MODIFIED: Import appendFileSync**
import { readFileSync, appendFileSync } from 'fs';
import { WebSocketServer } from 'ws';
import { exec } from 'child_process';
import { promisify } from 'util';

// imports from sub-modules
import { handleHttpRequest, handleWebSocketConnection } from './requestHandler-modules/requestHandler.mjs';
// **MODIFIED: Import protocolCapture**
import { PROXY_IP, PROXY_PORT, TLS_KEY_PATH, TLS_CERT_PATH, sONOFF, reAPIkey, proxyAPIKey, protocolCapture } from './sharedVARs.js';

const execPromise = promisify(exec);

// Disabling TLS rejection for testing purposes
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

// **NEW: Startup cleanup function**
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

// **NEW: Graceful shutdown handler**
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
  secureProtocol: "TLS_method",
  ciphers: "DEFAULT:@SECLEVEL=0",
  key: readFileSync(TLS_KEY_PATH),
  cert: readFileSync(TLS_CERT_PATH),
};

// **NEW: Run cleanup before starting server**
console.log('Starting eWeLink Proxy Server...\n');

// Run cleanup asynchronously
cleanupOldConnections().then(() => {
  // Create HTTPS server
  const server = createServer(options);
  
  // Handling HTTPS requests
  server.on('request', handleHttpRequest);

  // Web Socket Server
  const wss = new WebSocketServer({ server });
  
  function heartbeat() {
    this.isAlive = true;
  }

  // Handling WebSocket connections
  wss.on('connection', (ws, req) => handleWebSocketConnection(ws, req));

  // Handle server errors
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('\n' + '❌'.repeat(80));
      console.error(`ERROR: Port ${PROXY_PORT} is already in use!`);
      console.error('❌'.repeat(80));
      console.error('\nOptions:');
      console.error(`  1. Kill the process using the port:`);
      console.error(`     netstat -tlnp | grep ${PROXY_PORT}`);
      console.error(`     kill <PID>`);
      console.error(`  2. Use a different port by setting PROXY_PORT environment variable`);
      console.error(`  3. Wait a few seconds and try again\n`);
      process.exit(1);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });

  // Start the server
  server.listen(PROXY_PORT, PROXY_IP, () => {
    console.log('\n' + '✅'.repeat(80));
    console.log(`HTTPS PROXY SERVER RUNNING`);
    console.log('✅'.repeat(80));
    console.log(`  Listening on: ${PROXY_IP}:${PROXY_PORT}`);
    console.log(`  TLS Key: ${TLS_KEY_PATH}`);
    console.log(`  TLS Cert: ${TLS_CERT_PATH}`);
    console.log('✅'.repeat(80) + '\n');
    console.log('Waiting for device connections...\n');
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

  forward2device: (devID, message) => {
      let device = sONOFF[devID]; // get relay information
  
      // **NEW: Log outgoing WSS message if capture is enabled**
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
        console.log('forwarding to device: ' + message);
        let msgObj = JSON.parse(message);
        if(msgObj['action'] == 'update') {
          sONOFF[msgObj['deviceid']]['state'] = msgObj['params']['switch'];
        }
        device.conn.ws.send(message.replace(reAPIkey, 'apikey":"' + proxyAPIKey + '"'));
      } else {
        console.log('Cannot forward to device ' + devID + ': device not connected');
      }
    },

  checkinDeviceOnLine: (deviceid) => {
    // Add null checks to prevent crash on race conditions
    if (!sONOFF[deviceid]) {
      return;
    }

    if (!sONOFF[deviceid]['conn']) {
      if (sONOFF[deviceid]['isOnline']) {
        console.log('⚠️  checkinDeviceOnLine: Device ' + deviceid + ' marked online but no connection - marking offline');
        sONOFF[deviceid]['isOnline'] = false;
        sONOFF[deviceid].state = 'OFFLINE';
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

    // Close connection if more than 30 secs from last PING
    // Clear existing timeout if it exists
    if (ws['wsTimeout']) {
      clearTimeout(ws['wsTimeout']);
    }

    // Set a new timeout for 30 seconds
    ws['wsTimeout'] = setTimeout(() => {
      // Double-check WebSocket is still valid before trying to close
      if (ws.readyState === 1) { // OPEN
        console.log('\n\n----------------------------------------------------');
        console.log('-- WebSocket connection closed due to inactivity. --');
        console.log('-----------         for: ' + ws['deviceid'] + '      -----------');
        console.log('----------------------------------------------------\n\n');
        ws.terminate(); // Close the WebSocket connection
      } else {
        console.log('⚠️  Timeout fired but WebSocket already closed for: ' + ws['deviceid']);
      }
    }, 300000); // 300 seconds in milliseconds
  }
};
