/*
Author: Matteo Palitto
Date: January 9, 2024

Description: cloudWebSocket.mjs
Manages WebSocket connections to cloud servers
*/

import WebSocket from 'ws';
import { sONOFF, proxyEvent } from '../sharedVARs.js';
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
        
        // Store the deviceID in the WebSocket object
        ws.deviceID = deviceID;
        ws.cloudUrl = cloudUrl;
        ws.messagesReceived = [];
        ws.registrationComplete = false;
        
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
        
        CloudLogger.log('📤 Sending registration to cloud', JSON.parse(registerMessage));
        console.log(`📤 Sending registration to cloud...`);
        
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
            stack: err.stack
        });
        
        console.log(`❌ Cloud WebSocket error for device ${deviceID}:`, err.message);
        
        // If error occurs before registration completes, emit failure
        if (!ws.registrationComplete) {
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

        // Clear registration timeout
        CloudRegistration.clearTimeout(deviceID);

        // Mark cloud as disconnected
        if (sONOFF[deviceID]) {
            sONOFF[deviceID]['cloudConnected'] = false;
        }

        // Log all messages received before close
        CloudLogger.log('🔌 CLOUD WEBSOCKET CLOSED', {
            deviceID: deviceID,
            closeCode: code,
            reason: reason.toString() || 'No reason provided',
            timestamp: new Date().toISOString(),
            wasRegistered: wasRegistered,
            messagesReceivedBeforeClose: ws.messagesReceived,
            totalMessagesReceived: ws.messagesReceived.length
        });
        
        this.#logCloseDetails(deviceID, code, reason, wasRegistered, ws.messagesReceived);
        
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
        
        // Emit cloudConnectionClosed event
        console.log(`📢 Emitting cloudConnectionClosed event for device ${deviceID}`);
        proxyEvent.emit('cloudConnectionClosed', deviceID);
        
        // Auto-reconnect if device is still online locally
        this.#attemptReconnect(deviceID, url);
    }

    /**
     * Log close details
     */
    static #logCloseDetails(deviceID, code, reason, wasRegistered, messages) {
        console.log('\n' + '='.repeat(80));
        console.log('🔌 CLOUD WEBSOCKET CLOSED');
        console.log('='.repeat(80));
        console.log('Device:', deviceID);
        console.log('Alias:', sONOFF[deviceID]?.alias || 'unknown');
        console.log('Close code:', code);
        console.log('Reason:', reason.toString() || 'No reason');
        console.log('Was registered:', wasRegistered ? 'Yes' : 'No');
        console.log('Messages received:', messages.length);
        
        if (messages.length > 0) {
            console.log('\n📨 Messages from cloud before disconnect:');
            messages.forEach((msg, idx) => {
                console.log(`  [${idx + 1}] ${msg.timestamp}`);
                console.log(`      ${msg.message.substring(0, 200)}${msg.message.length > 200 ? '...' : ''}`);
            });
        } else {
            console.log('\n⚠️  NO messages received from cloud before disconnect!');
            console.log('    Possible causes:');
            console.log('    1. Cloud rejected the registration message');
            console.log('    2. Device already connected to cloud from another proxy');
            console.log('    3. Invalid API key or device credentials');
            console.log('    4. Cloud detected duplicate device connection');
        }
        console.log('='.repeat(80) + '\n');
    }

    /**
     * Attempt to reconnect
     */
    static #attemptReconnect(deviceID, url) {
        // Check if device is still online locally
        if (!sONOFF[deviceID] || !sONOFF[deviceID].conn || !sONOFF[deviceID].conn.ws) {
            CloudLogger.log('ℹ️ No reconnection scheduled', {
                deviceID: deviceID,
                reason: 'Device offline locally'
            });
            console.log(`ℹ️  Device ${deviceID} offline locally - not reconnecting to cloud`);
            
            // Reset reconnect counter
            if (sONOFF[deviceID]) {
                sONOFF[deviceID].cloudReconnectAttempts = 0;
            }
            return;
        }

        // Get reconnect attempts
        const reconnectAttempts = sONOFF[deviceID].cloudReconnectAttempts || 0;
        
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
            return;
        }
        
        // Calculate delay with exponential backoff
        const reconnectDelay = Math.min(
            CLOUD_CONFIG.RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempts),
            CLOUD_CONFIG.RECONNECT_MAX_DELAY_MS
        );
        
        sONOFF[deviceID].cloudReconnectAttempts = reconnectAttempts + 1;
        
        CloudLogger.log('🔄 Scheduling reconnection', {
            deviceID: deviceID,
            delay: reconnectDelay + 'ms',
            attemptNumber: reconnectAttempts + 1,
            reason: 'Device still online locally'
        });
        
        console.log(`🔄 Device ${deviceID} still online - reconnecting to cloud in ${reconnectDelay/1000}s... (attempt ${reconnectAttempts + 1})`);
        
        const timer = setTimeout(() => {
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
