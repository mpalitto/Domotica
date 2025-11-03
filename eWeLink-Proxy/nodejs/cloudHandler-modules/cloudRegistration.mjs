/*
Author: Matteo Palitto
Date: January 9, 2024

Description: cloudRegistration.mjs
Manages cloud registration timeouts and validation
*/

import { sONOFF, proxyEvent } from '../sharedVARs.js';
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
     */
    static buildRegistrationMessage(deviceID) {
        // Get device's ORIGINAL apikey (not proxyAPIKey!)
        const deviceOriginalApiKey = sONOFF[deviceID].conn?.deviceApiKey || 
                                      sONOFF[deviceID].conn?.apikey;
        
        if (!deviceOriginalApiKey) {
            console.log(`⚠️  No device apikey found for ${deviceID}`);
            return null;
        }
        
        // Use the device's original registration message if available
        if (sONOFF[deviceID] && sONOFF[deviceID].registerSTR) {
            // Parse and replace apikey with device's original
            try {
                const regObj = JSON.parse(sONOFF[deviceID].registerSTR);
                regObj.apikey = deviceOriginalApiKey;  // Use device's original apikey
                
                const registerMessage = JSON.stringify(regObj);
                
                CloudLogger.log('🔁 Using device original registration message', {
                    deviceID,
                    message: regObj
                });
                
                console.log(`📝 Using device's original registration with device apikey`);
                return registerMessage;
            } catch (err) {
                console.log(`⚠️  Could not parse stored registration: ${err.message}`);
            }
        }
        
        // Fallback: construct registration using device's original apikey
        const regObj = {
            action: 'register',
            deviceid: deviceID,
            apikey: deviceOriginalApiKey,  // ← Device's ORIGINAL apikey
            userAgent: 'device',
            sequence: Date.now().toString(),
            ts: 0,
            version: CLOUD_CONFIG.DEFAULT_VERSION,
            romVersion: CLOUD_CONFIG.DEFAULT_ROM_VERSION,
            model: CLOUD_CONFIG.DEFAULT_MODEL
        };
        
        const registerMessage = JSON.stringify(regObj);
        
        CloudLogger.log('⚠️ Constructed new registration with device apikey', {
            deviceID,
            message: regObj
        });
        
        console.log('⚠️ Constructing device registration with original apikey');
        
        return registerMessage;
    }
}
