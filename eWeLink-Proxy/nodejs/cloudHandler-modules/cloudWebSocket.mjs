/*
Author: Matteo Palitto
Date: January 9, 2024 (Updated)

Description: cloudWebSocket.mjs
Manages WebSocket connections to cloud servers
Integrated with three-state system
*/

import WebSocket from 'ws';
import { sONOFF, proxyEvent, ConnectionState } from '../sharedVARs.js';
import { DeviceTracking } from '../requestHandler-modules/deviceTracking.mjs';
import { CloudLogger } from './cloudLogger.mjs';
import { CloudRegistration } from './cloudRegistration.mjs';
import { CloudHeartbeat } from './cloudHeartbeat.mjs';
import { CloudMessageHandler } from './cloudMessageHandler.mjs';
import { CLOUD_CONFIG } from './cloudConfig.mjs';

// Store active cloud connections
const cloudConnections = new Map();

// Store reconnection timers
const reconnectTimers = new Map();

export class CloudWebSocket {
    /**
     * Connect to cloud WebSocket server
     */
    static connect(deviceID, cloudUrl) {
        CloudLogger.log('🔌 CONNECTING TO CLOUD WEBSOCKET', {
            deviceID,
            cloudUrl,
            timestamp: new Date().toISOString()
        });
        
        console.log(`🔌 Connecting to cloud WebSocket for device ${deviceID}...`);
        console.log(`   URL: ${cloudUrl}`);
        
        const ws = new WebSocket(cloudUrl, {
            rejectUnauthorized: false
        });
        
        // Store metadata in the WebSocket object
        ws.deviceID = deviceID;
        ws.cloudUrl = cloudUrl;
        ws.messagesReceived = [];
        ws.registrationComplete = false;
        ws.heartbeatCount = 0;
        ws.connectionStartTime = Date.now();
        
        this.#setupEventHandlers(ws);
        
        return ws;
    }

    /**
     * Setup WebSocket event handlers
     */
    static #setupEventHandlers(ws) {
        ws.on('open', () => this.#handleOpen(ws));
        ws.on('message', (data) => this.#handleMessage(ws, data));
        ws.on('ping', () => this.#handlePing(ws));
        ws.on('pong', () => this.#handlePong(ws));
        ws.on('error', (err) => this.#handleError(ws, err));
        ws.on('close', (code, reason) => this.#handleClose(ws, code, reason));
    }

    /**
     * Handle WebSocket open event
     */
    static #handleOpen(ws) {
        const deviceID = ws.deviceID;
        
        CloudLogger.log('✅ CLOUD WEBSOCKET CONNECTED', {
            deviceID: deviceID,
            timestamp: new Date().toISOString()
        });
        
        console.log(`✅ Connected to cloud WebSocket for device: ${deviceID}`);
        
        // **UPDATE STATE TO WS_CONNECTED**
        DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.WS_CONNECTED);
        
        // Store the cloud WebSocket connection
        if (sONOFF[deviceID]) {
            sONOFF[deviceID]['cloudWS'] = ws;
        }
        cloudConnections.set(deviceID, ws);
        
        CloudLogger.log('📊 Connection stored', {
            totalCloudConnections: cloudConnections.size
        });
        
        // Clear any reconnection timer
        if (reconnectTimers.has(deviceID)) {
            clearTimeout(reconnectTimers.get(deviceID));
            reconnectTimers.delete(deviceID);
            CloudLogger.log('🔄 Cleared reconnection timer', { deviceID: deviceID });
        }
        
        // Start registration timeout
        CloudRegistration.startTimeout(deviceID, ws);
        
        // Build and send registration message
        const registerMessage = CloudRegistration.buildRegistrationMessage(deviceID);
        
        if (!registerMessage) {
            console.log(`❌ Failed to build registration message for ${deviceID}`);
            DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.OFFLINE);
            ws.close(1008, 'Cannot build registration');
            return;
        }
        
        CloudLogger.log('📤 Sending registration to cloud', JSON.parse(registerMessage));
        console.log(`📤 Sending registration to cloud...`);
        
        // **UPDATE STATE TO REGISTERED (optimistic, will revert on error)**
        DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.REGISTERED);
        
        ws.send(registerMessage);
    }

    /**
     * Handle incoming message
     */
    static #handleMessage(ws, data) {
        const deviceID = ws.deviceID;
        const message = data.toString();
        
        CloudMessageHandler.handleMessage(deviceID, message, ws);
    }

    /**
     * Handle ping from cloud
     */
    static #handlePing(ws) {
        const deviceID = ws.deviceID;
        CloudLogger.log('📡 Cloud PING received', { deviceID: deviceID });
        // WebSocket automatically sends pong
    }

    /**
     * Handle pong from cloud
     */
    static #handlePong(ws) {
        const deviceID = ws.deviceID;
        CloudLogger.log('📡 Cloud PONG received (heartbeat acknowledged)', { deviceID: deviceID });
    }

    /**
     * Handle WebSocket error
     */
    static #handleError(ws, err) {
        const deviceID = ws.deviceID;
        
        CloudLogger.log('❌ CLOUD WEBSOCKET ERROR', {
            deviceID: deviceID,
            error: err.message,
            code: err.code,
            stack: err.stack,
            currentState: sONOFF[deviceID]?.cloudConnectionState
        });
        
        console.log(`❌ Cloud WebSocket error for device ${deviceID}:`, err.message);
        console.log(`   Current cloud state: ${sONOFF[deviceID]?.cloudConnectionState || 'unknown'}`);
        
        // If error occurs before registration completes, update state and emit failure
        if (!ws.registrationComplete) {
            DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.OFFLINE);
            proxyEvent.emit('cloudConnectionFailed', deviceID, `WebSocket error: ${err.message}`);
        }
    }

    /**
     * Handle WebSocket close
     */
    static #handleClose(ws, code, reason) {
        const deviceID = ws.deviceID;
        const url = ws.cloudUrl;
        const wasRegistered = ws.registrationComplete;
        const connectionDuration = ((Date.now() - ws.connectionStartTime) / 1000).toFixed(1);

        // Clear registration timeout
        CloudRegistration.clearTimeout(deviceID);

        // **UPDATE STATE TO OFFLINE**
        DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.OFFLINE);

        // Log all messages received before close
        CloudLogger.log('🔌 CLOUD WEBSOCKET CLOSED', {
            deviceID: deviceID,
            closeCode: code,
            reason: reason.toString() || 'No reason provided',
            timestamp: new Date().toISOString(),
            wasRegistered: wasRegistered,
            connectionDuration: connectionDuration + 's',
            messagesReceivedBeforeClose: ws.messagesReceived,
            totalMessagesReceived: ws.messagesReceived.length,
            heartbeatsSent: ws.heartbeatCount || 0
        });
        
        this.#logCloseDetails(deviceID, code, reason, wasRegistered, connectionDuration, ws);
        
        // Clean up heartbeat
        CloudHeartbeat.stop(deviceID);
        
        // Clean up connection
        cloudConnections.delete(deviceID);
        if (sONOFF[deviceID] && sONOFF[deviceID]['cloudWS']) {
            delete sONOFF[deviceID]['cloudWS'];
        }
        
        CloudLogger.log('📊 Connection cleaned up', {
            remainingConnections: cloudConnections.size
        });
        
        // Emit cloudConnectionClosed event (handled by messageHandler)
        console.log(`📢 Emitting cloudConnectionClosed event for device ${deviceID}`);
        proxyEvent.emit('cloudConnectionClosed', deviceID);
        
        // Auto-reconnect if device is still online locally AND was successfully registered
        if (wasRegistered) {
            this.#attemptReconnect(deviceID, url);
        } else {
            console.log(`ℹ️  Not reconnecting ${deviceID} - never successfully registered`);
        }
    }

    /**
     * Log close details
     */
    static #logCloseDetails(deviceID, code, reason, wasRegistered, duration, ws) {
        console.log('\n' + '='.repeat(80));
        console.log('🔌 CLOUD WEBSOCKET CLOSED');
        console.log('='.repeat(80));
        console.log('Device:', deviceID);
        console.log('Alias:', sONOFF[deviceID]?.alias || 'unknown');
        console.log('Close code:', code);
        console.log('Reason:', reason.toString() || 'No reason');
        console.log('Duration:', duration + 's');
        console.log('Was registered:', wasRegistered ? 'Yes' : 'No');
        console.log('Messages received:', ws.messagesReceived.length);
        console.log('Heartbeats sent:', ws.heartbeatCount || 0);
        
        if (ws.messagesReceived.length > 0) {
            console.log('\n📨 Messages from cloud before disconnect:');
            ws.messagesReceived.slice(0, 5).forEach((msg, idx) => {
                console.log(`  [${idx + 1}] ${msg.timestamp}`);
                console.log(`      ${msg.message.substring(0, 200)}${msg.message.length > 200 ? '...' : ''}`);
            });
            if (ws.messagesReceived.length > 5) {
                console.log(`  ... and ${ws.messagesReceived.length - 5} more messages`);
            }
        } else {
            console.log('\n⚠️  NO messages received from cloud before disconnect!');
            console.log('    Possible causes:');
            console.log('    1. Cloud rejected the registration message');
            console.log('    2. Device already connected to cloud from another source');
            console.log('    3. Invalid API key or device credentials');
            console.log('    4. Cloud detected duplicate device connection');
            console.log('    5. Network connectivity issue');
        }
        console.log('='.repeat(80) + '\n');
    }

    /**
     * Attempt to reconnect
     */
    static #attemptReconnect(deviceID, url) {
        // Check if device is still online locally
        const device = sONOFF[deviceID];
        
        if (!device) {
            CloudLogger.log('ℹ️ No reconnection scheduled - device removed', { deviceID });
            console.log(`ℹ️  Device ${deviceID} removed - not reconnecting to cloud`);
            return;
        }
        
        // Check local connection state
        const localState = device.localConnectionState;
        const isLocalOnline = localState === ConnectionState.ONLINE || localState === ConnectionState.REGISTERED;
        
        if (!isLocalOnline) {
            CloudLogger.log('ℹ️ No reconnection scheduled', {
                deviceID: deviceID,
                reason: 'Device not online locally',
                localState: localState
            });
            console.log(`ℹ️  Device ${deviceID} not online locally (${localState}) - not reconnecting to cloud`);
            
            // Reset reconnect counter
            if (device) {
                device.cloudReconnectAttempts = 0;
            }
            return;
        }

        // Get reconnect attempts
        const reconnectAttempts = device.cloudReconnectAttempts || 0;
        
        // Don't reconnect if too many failed attempts
        if (reconnectAttempts >= CLOUD_CONFIG.MAX_RECONNECT_ATTEMPTS) {
            CloudLogger.log('⚠️ Too many reconnection attempts, giving up', {
                deviceID: deviceID,
                attempts: reconnectAttempts
            });
            console.log(`⚠️  Device ${deviceID} failed to connect ${reconnectAttempts} times - giving up`);
            console.log('    Possible reasons:');
            console.log('    - Device may already be connected to cloud directly');
            console.log('    - Invalid credentials or API key');
            console.log('    - Cloud server rejecting the connection');
            console.log('    💡 Try: Restart device or check device credentials');
            return;
        }
        
        // Calculate delay with exponential backoff
        const reconnectDelay = Math.min(
            CLOUD_CONFIG.RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempts),
            CLOUD_CONFIG.RECONNECT_MAX_DELAY_MS
        );
        
        device.cloudReconnectAttempts = reconnectAttempts + 1;
        
        CloudLogger.log('🔄 Scheduling reconnection', {
            deviceID: deviceID,
            delay: reconnectDelay + 'ms',
            attemptNumber: reconnectAttempts + 1,
            reason: 'Device still online locally'
        });
        
        console.log(`🔄 Device ${deviceID} still online locally - reconnecting to cloud in ${reconnectDelay/1000}s... (attempt ${reconnectAttempts + 1}/${CLOUD_CONFIG.MAX_RECONNECT_ATTEMPTS})`);
        
        const timer = setTimeout(() => {
            // Double-check device is still online before reconnecting
            const currentLocalState = sONOFF[deviceID]?.localConnectionState;
            const stillOnline = currentLocalState === ConnectionState.ONLINE || 
                              currentLocalState === ConnectionState.REGISTERED;
            
            if (!stillOnline) {
                console.log(`ℹ️  Device ${deviceID} went offline - cancelling cloud reconnect`);
                reconnectTimers.delete(deviceID);
                return;
            }
            
            CloudLogger.log('🔄 Attempting reconnection', {  
                deviceID: deviceID,
                attemptNumber: reconnectAttempts + 1
            });
            console.log(`🔄 Reconnecting device ${deviceID} to cloud... (attempt ${reconnectAttempts + 1})`);
            
            // Reconnect using stored URL
            this.connect(deviceID, url);
            
            reconnectTimers.delete(deviceID);
        }, reconnectDelay);
        
        reconnectTimers.set(deviceID, timer);
    }

    /**
     * Get active connection
     */
    static getConnection(deviceID) {
        return cloudConnections.get(deviceID);
    }

    /**
     * Close connection
     */
    static closeConnection(deviceID) {
        // Clear reconnection timer if exists
        if (reconnectTimers.has(deviceID)) {
            clearTimeout(reconnectTimers.get(deviceID));
            reconnectTimers.delete(deviceID);
            CloudLogger.log('🔄 Cleared reconnection timer', { deviceID });
        }
        
        const ws = cloudConnections.get(deviceID);
        
        if (ws) {
            ws.terminate();
            cloudConnections.delete(deviceID);
            
            CloudLogger.log('✅ Cloud connection terminated', {
                deviceID,
                remainingConnections: cloudConnections.size
            });
            
            return true;
        }
        
        return false;
    }
}
