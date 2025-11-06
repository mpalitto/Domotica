/*
Author: Matteo Palitto
Date: January 9, 2024 (Updated)

Description: transparentMode.mjs
Implements transparent capture mode - forwards messages without processing
Enhanced with state management, proper lifecycle, and statistics
*/

import WebSocket from 'ws';
import https from 'https';
import { transparentMode, sONOFF, ConnectionState } from '../sharedVARs.js';
import { DeviceTracking } from '../requestHandler-modules/deviceTracking.mjs';
import { TransparentLogger } from './transparentLogger.mjs';
import { CLOUD_CONFIG } from '../cloudHandler-modules/cloudConfig.mjs';

export class TransparentMode {
    // Session statistics
    static #stats = {
        deviceMessages: 0,
        cloudMessages: 0,
        totalForwarded: 0,
        parseErrors: 0,
        forwardErrors: 0,
        sessionStart: null
    };

    /**
     * Check if transparent mode should be used for this connection
     */
    static isEnabled(deviceID, deviceIP) {
        if (!transparentMode.enabled) return false;
        
        // Match by device ID
        if (transparentMode.deviceId && deviceID === transparentMode.deviceId) {
            return true;
        }
        
        // Match by IP address
        if (transparentMode.matchedByIp && deviceIP) {
            const cleanIP = deviceIP.replace('::ffff:', '');
            if (cleanIP === transparentMode.deviceIp) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Initialize transparent mode session
     */
    static initializeSession(deviceID, deviceWS, deviceIP) {
        // Store device WebSocket
        transparentMode.deviceWS = deviceWS;
        transparentMode.deviceId = deviceID;
        transparentMode.deviceIp = deviceIP ? deviceIP.replace('::ffff:', '') : null;
        
        // Initialize statistics
        this.#stats.sessionStart = Date.now();
        this.#stats.deviceMessages = 0;
        this.#stats.cloudMessages = 0;
        this.#stats.totalForwarded = 0;
        this.#stats.parseErrors = 0;
        this.#stats.forwardErrors = 0;
        
        // Initialize logger
        const deviceAlias = sONOFF[deviceID]?.alias || null;
        TransparentLogger.initialize(deviceID, deviceAlias);
        
        // Update connection state (transparent mode tracking)
        if (sONOFF[deviceID]) {
            DeviceTracking.setLocalConnectionState(deviceID, ConnectionState.WS_CONNECTED);
        }
        
        console.log(`🔍 Transparent mode session initialized for ${deviceID}`);
        console.log(`   Device IP: ${transparentMode.deviceIp || 'unknown'}`);
        console.log(`   Log file: ${transparentMode.logFile}`);
    }

    /**
     * Handle message from device in transparent mode
     */
    static handleDeviceMessage(ws, message, deviceIP) {
        const messageString = message.toString();
        
        // If we don't have deviceID yet, try to extract it
        if (!transparentMode.deviceId) {
            try {
                const msgObj = JSON.parse(messageString);
                if (msgObj.deviceid) {
                    this.initializeSession(msgObj.deviceid, ws, deviceIP);
                }
            } catch (err) {
                // Can't parse - initialize with IP-based ID
                if (!transparentMode.deviceId) {
                    const ipBasedId = 'UNKNOWN-' + deviceIP.replace(/[.:]/g, '-');
                    this.initializeSession(ipBasedId, ws, deviceIP);
                    console.log(`⚠️  Transparent: Cannot parse messages, using ID: ${ipBasedId}`);
                }
            }
        }
        
        // Increment stats
        this.#stats.deviceMessages++;
        
        // Log incoming message from device
        TransparentLogger.logDeviceMessage(messageString);
        console.log(`📥 Transparent: Device → Proxy (${messageString.length} bytes, msg #${this.#stats.deviceMessages})`);
        
        try {
            const msgObj = JSON.parse(messageString);
            
            // If this is a register message and we haven't connected to cloud yet
            if (msgObj.action === 'register' && !transparentMode.cloudWS) {
                console.log(`🔍 Transparent: Register detected, connecting to cloud...`);
                
                // Update state
                if (transparentMode.deviceId && sONOFF[transparentMode.deviceId]) {
                    DeviceTracking.setLocalConnectionState(transparentMode.deviceId, ConnectionState.REGISTERED);
                }
                
                this.#connectToCloud(msgObj.deviceid, msgObj.apikey, ws, messageString);
                return;
            }
            
            // Forward to cloud if connected
            if (transparentMode.cloudWS && transparentMode.cloudWS.readyState === WebSocket.OPEN) {
                TransparentLogger.logProxyToCloud(messageString);
                transparentMode.cloudWS.send(messageString);
                this.#stats.totalForwarded++;
                console.log(`📤 Transparent: Proxy → Cloud (${messageString.length} bytes, fwd #${this.#stats.totalForwarded})`);
            } else {
                console.log(`⚠️  Transparent: Cloud not connected, cannot forward device message`);
                this.#stats.forwardErrors++;
                TransparentLogger.logError('Cloud not connected, message not forwarded', messageString.substring(0, 100));
            }
            
        } catch (err) {
            console.error(`❌ Transparent: Error parsing device message:`, err.message);
            this.#stats.parseErrors++;
            TransparentLogger.logError(`Parse error: ${err.message}`, messageString.substring(0, 200));
        }
    }

    /**
     * Handle message from cloud in transparent mode
     */
    static handleCloudMessage(deviceWS, message) {
        const messageString = message.toString();
        
        // Increment stats
        this.#stats.cloudMessages++;
        
        // Log incoming message from cloud
        TransparentLogger.logCloudMessage(messageString);
        console.log(`📥 Transparent: Cloud → Proxy (${messageString.length} bytes, msg #${this.#stats.cloudMessages})`);
        
        // Forward to device
        if (deviceWS && deviceWS.readyState === WebSocket.OPEN) {
            TransparentLogger.logProxyToDevice(messageString);
            deviceWS.send(messageString);
            this.#stats.totalForwarded++;
            console.log(`📤 Transparent: Proxy → Device (${messageString.length} bytes, fwd #${this.#stats.totalForwarded})`);
        } else {
            console.log(`⚠️  Transparent: Device not connected, cannot forward cloud message`);
            this.#stats.forwardErrors++;
            TransparentLogger.logError('Device not connected, message not forwarded', messageString.substring(0, 100));
        }
    }

    /**
     * Connect to cloud server for transparent forwarding
     */
    static #connectToCloud(deviceID, apikey, deviceWS, registerMessage) {
        console.log(`🔍 Transparent: Getting cloud dispatch...`);
        
        // Update state
        if (sONOFF[deviceID]) {
            DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.DISPATCH);
        }
        
        const postData = JSON.stringify({
            accept: 'ws',
            version: CLOUD_CONFIG.DEFAULT_VERSION,
            ts: Math.floor(Date.now() / 1000),
            deviceid: deviceID,
            apikey: apikey,
            model: CLOUD_CONFIG.DEFAULT_MODEL,
            romVersion: CLOUD_CONFIG.DEFAULT_ROM_VERSION,
            imei: deviceID
        });
        
        const options = {
            hostname: CLOUD_CONFIG.DISPATCH_HOSTNAME,
            port: 443,
            path: '/dispatch/device',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            rejectUnauthorized: false
        };
        
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            
            res.on('end', () => {
                try {
                    const response = JSON.parse(body);
                    
                    if (response.error === 0) {
                        const cloudUrl = `wss://${response.IP}:${response.port}/api/ws`;
                        console.log(`✅ Transparent: Cloud dispatch successful`);
                        console.log(`   Cloud server: ${response.IP}:${response.port}`);
                        
                        this.#connectToCloudWebSocket(cloudUrl, response.IP, response.port, deviceWS, registerMessage);
                    } else {
                        console.log(`❌ Transparent: Dispatch error: ${response.error}`);
                        TransparentLogger.logError(`Dispatch error: ${response.error}`, body);
                        
                        // Update state
                        if (sONOFF[deviceID]) {
                            DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.OFFLINE);
                        }
                    }
                } catch (err) {
                    console.log(`❌ Transparent: Error parsing dispatch response:`, err.message);
                    TransparentLogger.logError(`Dispatch parse error: ${err.message}`, body);
                    
                    // Update state
                    if (sONOFF[deviceID]) {
                        DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.OFFLINE);
                    }
                }
            });
        });
        
        req.on('error', (err) => {
            console.log(`❌ Transparent: Dispatch request error:`, err.message);
            TransparentLogger.logError(`Dispatch request error: ${err.message}`);
            
            // Update state
            if (sONOFF[deviceID]) {
                DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.OFFLINE);
            }
        });
        
        req.setTimeout(CLOUD_CONFIG.HTTPS_TIMEOUT_MS);
        req.write(postData);
        req.end();
    }

    /**
     * Connect to cloud WebSocket for transparent forwarding
     */
    static #connectToCloudWebSocket(cloudUrl, cloudIP, cloudPort, deviceWS, registerMessage) {
        const deviceID = transparentMode.deviceId;
        
        console.log(`🔍 Transparent: Connecting to cloud WebSocket...`);
        
        // Update state
        if (sONOFF[deviceID]) {
            DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.WS_CONNECTED);
        }
        
        const cloudWS = new WebSocket(cloudUrl, {
            rejectUnauthorized: false
        });
        
        cloudWS.on('open', () => {
            console.log(`✅ Transparent: Connected to cloud WebSocket`);
            
            TransparentLogger.logCloudConnection(cloudUrl, cloudIP, cloudPort);
            
            // Store cloud WebSocket
            transparentMode.cloudWS = cloudWS;
            
            // Update state
            if (sONOFF[deviceID]) {
                DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.ONLINE);
            }
            
            // Forward the register message to cloud
            TransparentLogger.logProxyToCloud(registerMessage);
            cloudWS.send(registerMessage);
            this.#stats.totalForwarded++;
            console.log(`📤 Transparent: Forwarded register message to cloud`);
        });
        
        cloudWS.on('message', (data) => {
            // Forward all cloud messages to device
            this.handleCloudMessage(deviceWS, data);
        });
        
        cloudWS.on('error', (err) => {
            console.log(`❌ Transparent: Cloud WebSocket error:`, err.message);
            TransparentLogger.logError(`Cloud WebSocket error: ${err.message}`);
            
            // Update state
            if (sONOFF[deviceID]) {
                DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.OFFLINE);
            }
        });
        
        cloudWS.on('close', (code, reason) => {
            console.log(`🔌 Transparent: Cloud WebSocket closed (code: ${code})`);
            TransparentLogger.logClose('Cloud', code, reason.toString());
            
            // Update state
            if (sONOFF[deviceID]) {
                DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.OFFLINE);
            }
            
            transparentMode.cloudWS = null;
        });
        
        cloudWS.on('ping', () => {
            // WebSocket automatically responds to pings
        });
    }

    /**
     * Get current session statistics
     */
    static getStatistics() {
        const duration = this.#stats.sessionStart 
            ? Math.floor((Date.now() - this.#stats.sessionStart) / 1000)
            : 0;
        
        return {
            ...this.#stats,
            duration: `${duration}s`,
            durationSeconds: duration
        };
    }

    /**
     * Cleanup transparent mode connections
     */
    static cleanup() {
        console.log(`🔍 Transparent: Cleaning up session...`);
        
        const deviceID = transparentMode.deviceId;
        
        // Log final statistics
        const stats = this.getStatistics();
        TransparentLogger.logSessionStats(stats);
        TransparentLogger.finalize(stats);
        
        console.log(`📊 Transparent session stats:`);
        console.log(`   Device messages: ${stats.deviceMessages}`);
        console.log(`   Cloud messages: ${stats.cloudMessages}`);
        console.log(`   Total forwarded: ${stats.totalForwarded}`);
        console.log(`   Parse errors: ${stats.parseErrors}`);
        console.log(`   Forward errors: ${stats.forwardErrors}`);
        console.log(`   Duration: ${stats.duration}`);
        
        // Close cloud connection
        if (transparentMode.cloudWS) {
            console.log(`   Closing cloud connection...`);
            transparentMode.cloudWS.close();
            transparentMode.cloudWS = null;
        }
        
        // Update states
        if (deviceID && sONOFF[deviceID]) {
            DeviceTracking.setLocalConnectionState(deviceID, ConnectionState.OFFLINE);
            DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.OFFLINE);
        }
        
        // Clear references
        transparentMode.deviceWS = null;
        transparentMode.deviceId = null;
        transparentMode.deviceIp = null;
        transparentMode.logFile = null;
        
        console.log(`✅ Transparent session cleanup complete`);
    }
}
