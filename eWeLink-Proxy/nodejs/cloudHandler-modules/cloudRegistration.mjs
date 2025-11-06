/*
Author: Matteo Palitto
Date: January 9, 2024 (Updated)

Description: cloudRegistration.mjs
Manages cloud registration timeouts and validation
Fixed to use deviceApiKey consistently
*/

import { sONOFF, proxyEvent, ConnectionState } from '../sharedVARs.js';
import { DeviceTracking } from '../requestHandler-modules/deviceTracking.mjs';
import { CloudLogger } from './cloudLogger.mjs';
import { CLOUD_CONFIG } from './cloudConfig.mjs';

// Store registration timeouts
const registrationTimeouts = new Map();

export class CloudRegistration {
    /**
     * Start registration timeout
     */
    static startTimeout(deviceID, ws) {
        // Clear any existing timeout
        this.clearTimeout(deviceID);
        
        const timeout = setTimeout(() => {
            if (!ws.registrationComplete) {
                CloudLogger.log('⏱️ REGISTRATION TIMEOUT', {
                    deviceID,
                    timeout: `${CLOUD_CONFIG.REGISTRATION_TIMEOUT_MS / 1000}s`,
                    messagesReceived: ws.messagesReceived.length
                });
                
                console.log(`❌ Registration timeout for device ${deviceID} (${CLOUD_CONFIG.REGISTRATION_TIMEOUT_MS / 1000}s)`);
                console.log(`   Received ${ws.messagesReceived.length} messages but no successful registration response`);
                
                // Update state
                DeviceTracking.setCloudConnectionState(deviceID, ConnectionState.OFFLINE);
                
                // Emit failure event
                proxyEvent.emit('cloudConnectionFailed', deviceID, 'Registration timeout');
                
                // Close the connection
                ws.close(1008, 'Registration timeout');
            }
        }, CLOUD_CONFIG.REGISTRATION_TIMEOUT_MS);
        
        registrationTimeouts.set(deviceID, timeout);
        
        CloudLogger.log('⏱️ Registration timeout started', {
            deviceID,
            timeout: `${CLOUD_CONFIG.REGISTRATION_TIMEOUT_MS / 1000}s`
        });
    }

    /**
     * Clear registration timeout
     */
    static clearTimeout(deviceID) {
        if (registrationTimeouts.has(deviceID)) {
            clearTimeout(registrationTimeouts.get(deviceID));
            registrationTimeouts.delete(deviceID);
            CloudLogger.log('⏱️ Registration timeout cleared', { deviceID });
        }
    }

    /**
     * Build registration message
     * Uses device's ORIGINAL apikey (not proxyAPIKey!)
     */
    static buildRegistrationMessage(deviceID) {
        // Get device's ORIGINAL apikey
        const deviceApiKey = sONOFF[deviceID].conn?.deviceApiKey;
        
        if (!deviceApiKey) {
            console.log(`❌ No deviceApiKey found for ${deviceID}`);
            CloudLogger.log('❌ Cannot build registration: missing deviceApiKey', { deviceID });
            return null;
        }
        
        // Use the device's original registration message if available
        if (sONOFF[deviceID] && sONOFF[deviceID].registerSTR) {
            // Parse and replace apikey with device's original
            try {
                const regObj = JSON.parse(sONOFF[deviceID].registerSTR);
                regObj.apikey = deviceApiKey;  // Use device's ORIGINAL apikey
                
                const registerMessage = JSON.stringify(regObj);
                
                CloudLogger.log('🔁 Using device original registration message', {
                    deviceID,
                    message: regObj
                });
                
                console.log(`📝 Using device's registration with deviceApiKey: ${deviceApiKey.substring(0, 8)}...`);
                return registerMessage;
            } catch (err) {
                console.log(`⚠️  Could not parse stored registration: ${err.message}`);
            }
        }
        
        // Fallback: construct registration using device's original apikey
        const regObj = {
            action: 'register',
            deviceid: deviceID,
            apikey: deviceApiKey,  // ← Device's ORIGINAL apikey
            userAgent: 'device',
            sequence: Date.now().toString(),
            ts: 0,
            version: CLOUD_CONFIG.DEFAULT_VERSION,
            romVersion: CLOUD_CONFIG.DEFAULT_ROM_VERSION,
            model: CLOUD_CONFIG.DEFAULT_MODEL
        };
        
        const registerMessage = JSON.stringify(regObj);
        
        CloudLogger.log('⚠️ Constructed new registration with deviceApiKey', {
            deviceID,
            message: regObj
        });
        
        console.log('⚠️ Constructing registration with deviceApiKey');
        
        return registerMessage;
    }
}
