/*
Author: Matteo Palitto
Date: January 9, 2024

Description: cloudMessageHandler.mjs
Handles incoming messages from cloud servers
*/

import { sONOFF, proxyEvent, deviceStats, deviceDiagnostics } from '../sharedVARs.js';
import { CloudLogger } from './cloudLogger.mjs';
import { CloudRegistration } from './cloudRegistration.mjs';
import { CloudHeartbeat } from './cloudHeartbeat.mjs';
import { initDeviceStats, initDeviceDiagnostics } from '../requestHandler-modules/requestHandler.mjs';

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
        initDeviceStats(deviceID);
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
            
            // Handle query/heartbeat responses - SUPPRESS SPAM
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
        
        // Update the apikey with the one cloud gave us
        const cloudApiKey = msgObj.apikey;
        
        // Store the cloud-provided apikey for future use
        if (sONOFF[deviceID] && sONOFF[deviceID].conn) {
            const oldApiKey = sONOFF[deviceID].conn.apikey;
            sONOFF[deviceID].conn.cloudApiKey = cloudApiKey;
            
            console.log(`   Device apikey: ${oldApiKey}`);
            console.log(`   Cloud apikey:  ${cloudApiKey}`);
            
            if (oldApiKey !== cloudApiKey) {
                console.log(`   ⚠️  API keys differ - will use cloud apikey for cloud communication`);
            }
            
            // Mark cloud as connected
            sONOFF[deviceID].cloudConnected = true;
        }
        
        if (msgObj.date) {
            console.log(`   Server date: ${msgObj.date}`);
        }
        
        if (msgObj.config) {
            console.log(`   Heartbeat config: ${JSON.stringify(msgObj.config)}`);
        }
        
        // Start the application-level heartbeat timer
        CloudHeartbeat.start(deviceID, ws);
        
        // Reset reconnect counter on successful connection
        if (sONOFF[deviceID]) {
            sONOFF[deviceID].cloudReconnectAttempts = 0;
        }
        
        // Update diagnostics
        initDeviceDiagnostics(deviceID);
        deviceDiagnostics[deviceID].lastCloudConnectionTime = new Date().toISOString();
        
        // Emit success event
        console.log(`🎉 Emitting cloudConnectionEstablished event for device ${deviceID}`);
        proxyEvent.emit('cloudConnectionEstablished', deviceID);
        
        console.log(`\n✅ Device ${deviceID} "${sONOFF[deviceID]?.alias || 'unknown'}" is now FULLY ONLINE (local + cloud)\n`);
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
        
        proxyEvent.emit('messageFromCloud', deviceID, message);
    }

    /**
     * Handle heartbeat response (suppress spam)
     */
    static #handleHeartbeatResponse(deviceID, ws) {
        CloudLogger.log('💓 Cloud heartbeat response', {
            deviceID: deviceID
        });
        
        // Initialize counter
        if (!ws.heartbeatCount) ws.heartbeatCount = 0;
        ws.heartbeatCount++;
        
        // Only log every 100th heartbeat
        if (ws.heartbeatCount === 1 || ws.heartbeatCount % 100 === 0) {
            console.log(`💓 Cloud heartbeat OK for ${deviceID} "${sONOFF[deviceID]?.alias || 'unknown'}" (count: ${ws.heartbeatCount})`);
        }
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
