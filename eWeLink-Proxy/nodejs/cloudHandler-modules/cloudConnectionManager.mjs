/*
Author: Matteo Palitto
Date: January 9, 2024 (Updated)

Description: cloudConnectionManager.mjs
High-level cloud connection management
Integrated with three-state system
*/

import WebSocket from 'ws';
import { sONOFF, proxyEvent, ConnectionState } from '../sharedVARs.js';
import { DeviceTracking } from '../requestHandler-modules/deviceTracking.mjs';
import { CloudLogger } from './cloudLogger.mjs';
import { CloudDispatch } from './cloudDispatch.mjs';
import { CloudWebSocket } from './cloudWebSocket.mjs';
import { CloudHeartbeat } from './cloudHeartbeat.mjs';
import { CloudRegistration } from './cloudRegistration.mjs';

export class CloudConnectionManager {
    /**
     * Initiate cloud connection for device
     */
    static connect(deviceID) {
        CloudLogger.log('🌐 CLOUD CONNECTION INITIATED', {
            deviceID: deviceID,
            timestamp: new Date().toISOString()
        });
        
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🌐 INITIATING CLOUD CONNECTION FOR DEVICE: ${deviceID}`);
        console.log(`${'='.repeat(80)}\n`);
        
        // Validate device exists and has necessary data
        if (!this.#validateDevice(deviceID)) {
            return;
        }
        
        // Check for existing connection
        if (this.#hasActiveConnection(deviceID)) {
            return;
        }
        
        // Validate we have device's original API key
        const deviceApiKey = sONOFF[deviceID].conn.deviceApiKey;
        if (!deviceApiKey) {
            console.log(`❌ Cannot connect to cloud: device ${deviceID} has no deviceApiKey stored`);
            console.log(`   This should have been stored during device registration`);
            DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.OFFLINE);
            proxyEvent.emit('cloudConnectionFailed', deviceID, 'No deviceApiKey');
            return;
        }
        
        CloudLogger.log('✅ Device has valid deviceApiKey, proceeding to dispatch', {
            deviceID,
            deviceApiKey: deviceApiKey.substring(0, 8) + '...',
            alias: sONOFF[deviceID].alias
        });
        
        console.log(`📋 Using device's original apikey: ${deviceApiKey.substring(0, 8)}...`);
        
        // Get cloud server via dispatch
        CloudDispatch.getCloudServer(
            deviceID,
            (cloudUrl) => {
                CloudWebSocket.connect(deviceID, cloudUrl);
            },
            (error) => {
                console.log(`❌ Failed to get cloud server for ${deviceID}: ${error}`);
                DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.OFFLINE);
            }
        );
    }

    /**
     * Validate device has necessary information
     */
    static #validateDevice(deviceID) {
        if (!sONOFF[deviceID]) {
            CloudLogger.log('❌ Device not found in sONOFF', { deviceID });
            console.log('❌ Cannot connect to cloud: device', deviceID, 'not found in sONOFF');
            proxyEvent.emit('cloudConnectionFailed', deviceID, 'Device not found');
            return false;
        }
        
        if (!sONOFF[deviceID].conn) {
            CloudLogger.log('❌ Device has no connection info', {
                deviceID,
                deviceData: sONOFF[deviceID]
            });
            console.log('❌ Cannot connect to cloud: device', deviceID, 'has no connection info');
            DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.OFFLINE);
            proxyEvent.emit('cloudConnectionFailed', deviceID, 'No connection info');
            return false;
        }
        
        return true;
    }

    /**
     * Check if device has active connection
     */
    static #hasActiveConnection(deviceID) {
        const existingWS = CloudWebSocket.getConnection(deviceID);
        
        if (existingWS) {
            if (existingWS.readyState === WebSocket.OPEN) {
                CloudLogger.log('⚠️ Cloud connection already exists and is OPEN', { deviceID });
                console.log('⚠️ Cloud connection already exists for device:', deviceID);
                return true;
            } else {
                // Clean up stale connection
                CloudLogger.log('🧹 Cleaning up stale connection', {
                    deviceID,
                    state: existingWS.readyState
                });
                console.log('🧹 Cleaning up stale cloud connection for device:', deviceID);
                this.closeConnection(deviceID);
            }
        }
        
        return false;
    }

    /**
     * Forward message to cloud
     * Uses appropriate API key based on registration status
     */
    static forward2cloud(deviceID, message) {
        if (!deviceID) {
            CloudLogger.log('⚠️ forward2cloud called without deviceID');
            console.log('⚠️ forward2cloud called without deviceID');
            return;
        }
        
        const cloudWS = CloudWebSocket.getConnection(deviceID);
        
        if (!cloudWS || cloudWS.readyState !== WebSocket.OPEN) {
            CloudLogger.log('⚠️ CANNOT FORWARD TO CLOUD: connection not open', {
                deviceID,
                connectionExists: !!cloudWS,
                wsState: cloudWS ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][cloudWS.readyState] : 'no websocket'
            });
            
            console.log(`⚠️  Cannot forward to cloud for device ${deviceID} - not connected`);
            
            if (cloudWS) {
                console.log(`   Connection state: ${['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][cloudWS.readyState]}`);
            }
            return;
        }
        
        // **FIXED: Use correct API key based on registration status**
        let cloudMessage = message;
        
        if (sONOFF[deviceID] && sONOFF[deviceID].conn) {
            // Priority: Use cloud-provided key if available, otherwise device's original key
            const cloudApiKey = sONOFF[deviceID].conn.cloudApiKey;  // Set after successful registration
            const deviceApiKey = sONOFF[deviceID].conn.deviceApiKey; // Original device key
            
            const keyToUse = cloudApiKey || deviceApiKey;
            
            if (!keyToUse) {
                console.log(`❌ Cannot forward to cloud: no API key available for ${deviceID}`);
                return;
            }
            
            // Replace any apikey in message with the cloud key
            const apikeyRegex = /"apikey"\s*:\s*"[^"]+"/g;
            cloudMessage = message.replace(apikeyRegex, `"apikey":"${keyToUse}"`);
            
            CloudLogger.log('🔑 API key replaced for cloud', {
                usingCloudApiKey: !!cloudApiKey,
                usingDeviceApiKey: !cloudApiKey && !!deviceApiKey,
                keyUsed: keyToUse.substring(0, 8) + '...'
            });
            
            if (cloudApiKey) {
                console.log(`🔑 Using cloud-provided apikey for ${deviceID}`);
            } else {
                console.log(`🔑 Using device original apikey for ${deviceID} (not yet registered)`);
            }
        }
        
        CloudLogger.log('⬆️ FORWARDING TO CLOUD', {
            deviceID,
            cloudMessage: cloudMessage
        });
        
        cloudWS.send(cloudMessage);
        console.log(`⬆️  Forwarded to cloud for device ${deviceID}`);
    }

    /**
     * Close cloud connection
     */
    static closeConnection(deviceID) {
        if (!deviceID) {
            CloudLogger.log('⚠️ closeConnection called without deviceID');
            console.log('⚠️ closeConnection called with undefined/null deviceID - ignoring');
            return;
        }
        
        CloudLogger.log('🔒 CLOSING CLOUD CONNECTION', { deviceID });
        console.log(`🔒 Closing cloud connection for device: ${deviceID}`);
        
        // Clear registration timeout
        CloudRegistration.clearTimeout(deviceID);
        
        // Clear heartbeat
        CloudHeartbeat.stop(deviceID);
        
        // Close WebSocket
        const closed = CloudWebSocket.closeConnection(deviceID);
        
        if (closed) {
            console.log(`   ✅ Terminated`);
        }
        
        // Update cloud connection state
        DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.OFFLINE);
        
        // Clean up sONOFF reference
        if (sONOFF[deviceID]) {
            if (sONOFF[deviceID]['cloudWS']) {
                delete sONOFF[deviceID]['cloudWS'];
            }
        }
        
        // Emit event (will be handled by messageHandler to update states)
        proxyEvent.emit('cloudConnectionClosed', deviceID);
    }
}
