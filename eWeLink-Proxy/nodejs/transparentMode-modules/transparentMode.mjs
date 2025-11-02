/*
Author: Matteo Palitto
Date: January 9, 2024

Description: transparentMode.mjs
Implements transparent capture mode - forwards messages without processing
*/

import WebSocket from 'ws';
import https from 'https';
import { transparentMode, sONOFF } from '../sharedVARs.js';
import { TransparentLogger } from './transparentLogger.mjs';

export class TransparentMode {
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
     * Handle message from device in transparent mode
     */
    static handleDeviceMessage(ws, message, deviceIP) {
        const messageString = message.toString();
        
        // If we don't have deviceID yet, try to extract it
        if (!transparentMode.deviceId) {
            try {
                const msgObj = JSON.parse(messageString);
                if (msgObj.deviceid) {
                    transparentMode.deviceId = msgObj.deviceid;
                    transparentMode.deviceIp = deviceIP.replace('::ffff:', '');
                    
                    // Initialize logger now that we have deviceID
                    TransparentLogger.initialize(transparentMode.deviceId);
                    
                    console.log(`🔍 Transparent: Device identified as ${transparentMode.deviceId}`);
                    if (sONOFF[transparentMode.deviceId]) {
                        console.log(`🔍 Transparent: Device alias: ${sONOFF[transparentMode.deviceId].alias || 'N/A'}`);
                    }
                }
            } catch (err) {
                // Can't parse - log as unknown device
                if (!transparentMode.deviceId) {
                    transparentMode.deviceId = 'UNKNOWN-' + deviceIP.replace(/[.:]/g, '-');
                    TransparentLogger.initialize(transparentMode.deviceId);
                    console.log(`🔍 Transparent: Cannot parse messages, using ID: ${transparentMode.deviceId}`);
                }
            }
        }
        
        // Log incoming message from device
        TransparentLogger.logDeviceMessage(messageString);
        console.log(`📥 Transparent: Device → Proxy (${messageString.length} bytes)`);
        
        try {
            const msgObj = JSON.parse(messageString);
            
            // If this is a register message and we haven't connected to cloud yet
            if (msgObj.action === 'register' && !transparentMode.cloudWS) {
                console.log(`🔍 Transparent: Register detected, connecting to cloud...`);
                this.#connectToCloud(msgObj.deviceid, msgObj.apikey, ws, messageString);
                return;
            }
            
            // Forward to cloud if connected
            if (transparentMode.cloudWS && transparentMode.cloudWS.readyState === WebSocket.OPEN) {
                TransparentLogger.logProxyToCloud(messageString);
                transparentMode.cloudWS.send(messageString);
                console.log(`📤 Transparent: Proxy → Cloud (${messageString.length} bytes)`);
            } else {
                console.log(`⚠️  Transparent: Cloud not connected, cannot forward device message`);
                TransparentLogger.logError('Cloud not connected, message not forwarded: ' + messageString);
            }
            
        } catch (err) {
            console.error(`❌ Transparent mode: Error parsing device message:`, err);
            TransparentLogger.logError(`Parse error: ${err.message}\nRaw message: ${messageString}`);
        }
    }

    /**
     * Handle message from cloud in transparent mode
     */
    static handleCloudMessage(deviceWS, message) {
        const messageString = message.toString();
        
        // Log incoming message from cloud
        TransparentLogger.logCloudMessage(messageString);
        console.log(`📥 Transparent: Cloud → Proxy (${messageString.length} bytes)`);
        
        // Forward to device
        if (deviceWS && deviceWS.readyState === WebSocket.OPEN) {
            TransparentLogger.logProxyToDevice(messageString);
            deviceWS.send(messageString);
            console.log(`📤 Transparent: Proxy → Device (${messageString.length} bytes)`);
        } else {
            console.log(`⚠️  Transparent: Device not connected, cannot forward cloud message`);
            TransparentLogger.logError('Device not connected, message not forwarded: ' + messageString);
        }
    }

    /**
     * Connect to cloud server for transparent forwarding
     */
    static #connectToCloud(deviceID, apikey, deviceWS, registerMessage) {
        // Get cloud dispatch
        const dispatchUrl = 'https://eu-disp.coolkit.cc/dispatch/device';
        
        const postData = JSON.stringify({
            accept: 'ws',
            version: 8,
            ts: Math.floor(Date.now() / 1000),
            deviceid: deviceID,
            apikey: apikey,
            model: 'ITA-GZ1-GL',
            romVersion: '3.5.0',
            imei: deviceID
        });
        
        const options = {
            hostname: 'eu-disp.coolkit.cc',
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
                        console.log(`🔍 Transparent: Cloud server: ${cloudUrl}`);
                        
                        this.#connectToCloudWebSocket(cloudUrl, response.IP, response.port, deviceWS, registerMessage);
                    } else {
                        console.log('❌ Transparent: Dispatch error:', response.error);
                        TransparentLogger.logError(`Dispatch error: ${response.error}`);
                    }
                } catch (err) {
                    console.log('❌ Transparent: Error parsing dispatch response:', err);
                    TransparentLogger.logError(`Dispatch parse error: ${err.message}`);
                }
            });
        });
        
        req.on('error', (err) => {
            console.log('❌ Transparent: Dispatch request error:', err.message);
            TransparentLogger.logError(`Dispatch request error: ${err.message}`);
        });
        
        req.setTimeout(10000);
        req.write(postData);
        req.end();
    }

    /**
     * Connect to cloud WebSocket for transparent forwarding
     */
    static #connectToCloudWebSocket(cloudUrl, cloudIP, cloudPort, deviceWS, registerMessage) {
        console.log(`🔍 Transparent: Connecting to cloud WebSocket...`);
        
        const cloudWS = new WebSocket(cloudUrl, {
            rejectUnauthorized: false
        });
        
        cloudWS.on('open', () => {
            console.log(`✅ Transparent: Connected to cloud WebSocket`);
            
            TransparentLogger.logCloudConnection(cloudUrl, cloudIP, cloudPort);
            
            // Store cloud WebSocket
            transparentMode.cloudWS = cloudWS;
            
            // Forward the register message to cloud
            TransparentLogger.logProxyToCloud(registerMessage);
            cloudWS.send(registerMessage);
            console.log(`📤 Transparent: Forwarded register message to cloud`);
        });
        
        cloudWS.on('message', (data) => {
            // Forward all cloud messages to device
            this.handleCloudMessage(deviceWS, data);
        });
        
        cloudWS.on('error', (err) => {
            console.log(`❌ Transparent: Cloud WebSocket error:`, err.message);
            TransparentLogger.logError(`Cloud WebSocket error: ${err.message}`);
        });
        
        cloudWS.on('close', (code, reason) => {
            console.log(`🔌 Transparent: Cloud WebSocket closed (code: ${code})`);
            TransparentLogger.logClose('Cloud', code, reason.toString());
            transparentMode.cloudWS = null;
        });
        
        cloudWS.on('ping', () => {
            // WebSocket automatically responds to pings
        });
    }

    /**
     * Cleanup transparent mode connections
     */
    static cleanup() {
        if (transparentMode.cloudWS) {
            console.log(`🔍 Transparent: Closing cloud connection...`);
            transparentMode.cloudWS.close();
            transparentMode.cloudWS = null;
        }
    }
}
