/*
Author: Matteo Palitto
Date: January 9, 2024 (Updated)

Description: cloudMessageHandler.mjs
Handles incoming messages from cloud servers
Integrated with three-state system
*/

import { sONOFF, proxyEvent, deviceStats, deviceDiagnostics, ConnectionState } from '../sharedVARs.js';
import { DeviceTracking } from '../requestHandler-modules/deviceTracking.mjs';
import { CloudLogger } from './cloudLogger.mjs';
import { CloudRegistration } from './cloudRegistration.mjs';
import { CloudHeartbeat } from './cloudHeartbeat.mjs';
import { CLOUD_CONFIG } from './cloudConfig.mjs';

export class CloudMessageHandler {
    /**
     * Handle message from cloud
     */
    static handleMessage(deviceID, message, ws) {
        // Store message for later analysis if connection closes
        ws.messagesReceived.push({
            timestamp: new Date().toISOString(),
            message: message
        });

        CloudLogger.log('📨 MESSAGE FROM CLOUD', {
            deviceID: deviceID,
            message: message,
            messageNumber: ws.messagesReceived.length
        });
        
        // Increment cloud message counter
        DeviceTracking.initStats(deviceID);
        if (!deviceStats[deviceID].CLOUD_MSG) {
            deviceStats[deviceID].CLOUD_MSG = 0;
        }
        deviceStats[deviceID].CLOUD_MSG++;
        
        try {
            const msgObj = JSON.parse(message);
            
            // Check for error responses
            if (msgObj.error && msgObj.error !== 0) {
                return this.#handleErrorResponse(deviceID, msgObj, ws);
            }
            
            // Handle successful registration response
            if (msgObj.error === 0 && msgObj.apikey && msgObj.config && !ws.registrationComplete) {
                return this.#handleRegistrationSuccess(deviceID, msgObj, ws);
            }
            
            // Handle update commands from cloud (app sending command)
            if (msgObj.action === 'update' && msgObj.params) {
                return this.#handleUpdateCommand(deviceID, msgObj, message);
            }
            
            // Handle query/heartbeat responses - CONFIGURABLE LOGGING
            if (msgObj.error === 0 && msgObj.sequence && typeof msgObj.params !== 'undefined' && !msgObj.action) {
                return this.#handleHeartbeatResponse(deviceID, ws);
            }

            // Handle explicit query action responses
            if ((msgObj.action === 'query' || msgObj.action === 'queryInfo') && msgObj.error === 0) {
                return this.#handleHeartbeatResponse(deviceID, ws);
            }
            
            // Handle other success messages (catch-all)
            if (msgObj.error === 0) {
                return this.#handleGenericAck(deviceID, msgObj);
            }
            
            // Unexpected message format
            this.#handleUnexpectedMessage(deviceID, msgObj);
            
        } catch (err) {
            CloudLogger.log('❌ Error parsing cloud message', {
                deviceID: deviceID,
                error: err.message,
                rawMessage: message
            });
            
            console.log(`❌ Error parsing cloud message for device ${deviceID}:`, err.message);
        }
    }

    /**
     * Handle error response from cloud
     */
    static #handleErrorResponse(deviceID, msgObj, ws) {
        CloudLogger.log('❌ CLOUD ERROR RESPONSE', {
            deviceID: deviceID,
            error: msgObj.error,
            reason: msgObj.reason || 'No reason provided',
            fullMessage: msgObj
        });
        
        console.log(`❌ Cloud returned error for device ${deviceID}`);
        console.log(`   Error code: ${msgObj.error}`);
        console.log(`   Reason: ${msgObj.reason || 'No reason provided'}`);
        
        // Clear registration timeout
        CloudRegistration.clearTimeout(deviceID);
        
        // Update state to OFFLINE
        DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.OFFLINE);
        
        // Emit failure event
        proxyEvent.emit('cloudConnectionFailed', deviceID, `Cloud error ${msgObj.error}: ${msgObj.reason || 'Unknown'}`);
        
        // Close the connection
        ws.close(1008, `Cloud error: ${msgObj.error}`);
    }

    /**
     * Handle successful registration response
     */
    static #handleRegistrationSuccess(deviceID, msgObj, ws) {
        // Mark as registered to prevent re-processing
        ws.registrationComplete = true;
        
        // Clear registration timeout
        CloudRegistration.clearTimeout(deviceID);
        
        CloudLogger.log('✅ Cloud registration successful', {
            deviceID: deviceID,
            response: msgObj
        });
        
        console.log(`\n${'✅'.repeat(40)}`);
        console.log(`✅ CLOUD REGISTRATION SUCCESSFUL FOR DEVICE ${deviceID}`);
        console.log(`${'✅'.repeat(40)}\n`);
        
        // Get the cloud-provided apikey
        const cloudApiKey = msgObj.apikey;
        const deviceApiKey = sONOFF[deviceID].conn?.deviceApiKey;
        
        // Store the cloud-provided apikey for future use
        if (sONOFF[deviceID] && sONOFF[deviceID].conn) {
            sONOFF[deviceID].conn.cloudApiKey = cloudApiKey;
            
            console.log(`   Device apikey: ${deviceApiKey?.substring(0, 8)}...`);
            console.log(`   Cloud apikey:  ${cloudApiKey.substring(0, 8)}...`);
            
            if (deviceApiKey !== cloudApiKey) {
                console.log(`   ℹ️  API keys differ - using cloud apikey for cloud communication`);
            } else {
                console.log(`   ✅ API keys match`);
            }
        }
        
        if (msgObj.date) {
            console.log(`   Server date: ${msgObj.date}`);
        }
        
        if (msgObj.config) {
            console.log(`   Heartbeat config: ${JSON.stringify(msgObj.config)}`);
        }
        
        // **UPDATE CLOUD STATE TO ONLINE**
        DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.ONLINE);
        
        // Start the application-level heartbeat timer
        CloudHeartbeat.start(deviceID, ws);
        
        // Reset reconnect counter on successful connection
        if (sONOFF[deviceID]) {
            sONOFF[deviceID].cloudReconnectAttempts = 0;
        }
        
        // Update diagnostics
        DeviceTracking.initDiagnostics(deviceID);
        deviceDiagnostics[deviceID].lastCloudConnectionTime = new Date().toISOString();
        
        // Emit success event (handled by messageHandler to update isOnline)
        console.log(`🎉 Emitting cloudConnectionEstablished event for device ${deviceID}`);
        proxyEvent.emit('cloudConnectionEstablished', deviceID);
        
        console.log(`\n✅ Device ${deviceID} "${sONOFF[deviceID]?.alias || 'unknown'}" cloud is now ONLINE\n`);
    }

    /**
     * Handle update command from cloud
     */
    static #handleUpdateCommand(deviceID, msgObj, message) {
        CloudLogger.log('🔄 Cloud UPDATE command - forwarding to device', {
            deviceID: deviceID,
            params: msgObj.params
        });
        
        console.log(`🔄 Cloud command for device ${deviceID} - forwarding to device`);
        console.log(`   Command: ${JSON.stringify(msgObj.params)}`);
        
        // Forward to device via event
        proxyEvent.emit('messageFromCloud', deviceID, message);
    }

    /**
     * Handle heartbeat response (configurable logging)
     */
    static #handleHeartbeatResponse(deviceID, ws) {
        CloudLogger.log('💓 Cloud heartbeat response', {
            deviceID: deviceID
        });
        
        // Initialize counter
        if (!ws.heartbeatCount) ws.heartbeatCount = 0;
        ws.heartbeatCount++;
        
        // Configurable logging based on CLOUD_CONFIG
        const showInterval = CLOUD_CONFIG.SHOW_HEARTBEAT_EVERY;
        
        if (showInterval === 1) {
            // Show every heartbeat
            console.log(`💓 Cloud heartbeat OK for ${deviceID} "${sONOFF[deviceID]?.alias || 'unknown'}" (#${ws.heartbeatCount})`);
        } else if (showInterval > 1) {
            // Show every Nth heartbeat
            if (ws.heartbeatCount === 1 || ws.heartbeatCount % showInterval === 0) {
                console.log(`💓 Cloud heartbeat OK for ${deviceID} "${sONOFF[deviceID]?.alias || 'unknown'}" (count: ${ws.heartbeatCount})`);
            }
        }
        // If showInterval === 0, don't log at all (completely silent)
    }

    /**
     * Handle generic acknowledgment
     */
    static #handleGenericAck(deviceID, msgObj) {
        CloudLogger.log('ℹ️ Cloud acknowledgment (unclassified)', {
            deviceID: deviceID,
            message: msgObj
        });
        
        // Build description of what we received
        let description = 'generic ack';
        if (msgObj.action) {
            description = msgObj.action;
        } else if (msgObj.params !== undefined) {
            description = `response with params=${msgObj.params}`;
        }
        
        console.log(`ℹ️  Cloud ack for device ${deviceID}: ${description}`);
    }

    /**
     * Handle unexpected message
     */
    static #handleUnexpectedMessage(deviceID, msgObj) {
        CloudLogger.log('⚠️ Unexpected cloud message format', {
            deviceID: deviceID,
            message: msgObj
        });
        console.log(`⚠️  Unexpected cloud message for device ${deviceID}:`, msgObj);
    }
}
