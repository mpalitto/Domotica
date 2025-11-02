/*
Author: Matteo Palitto
Date: January 9, 2024

Description: cloudHeartbeat.mjs
Manages heartbeat (query) messages to cloud servers
*/

import WebSocket from 'ws';
import { sONOFF } from '../sharedVARs.js';
import { CloudLogger } from './cloudLogger.mjs';
import { CLOUD_CONFIG } from './cloudConfig.mjs';

// Store heartbeat intervals
const heartbeatIntervals = new Map();

export class CloudHeartbeat {
    /**
     * Send query heartbeat to cloud
     */
    static sendHeartbeat(deviceID, cloudWS) {
        if (!cloudWS || cloudWS.readyState !== WebSocket.OPEN) {
            CloudLogger.log('⚠️ Heartbeat skipped: Cloud WebSocket not open', { deviceID });
            return; 
        }

        if (!sONOFF[deviceID] || !sONOFF[deviceID].conn || !sONOFF[deviceID].conn.cloudApiKey) {
            CloudLogger.log('❌ Heartbeat failed: Missing device info or cloudApiKey', { deviceID });
            return;
        }
        
        const apikey = sONOFF[deviceID].conn.cloudApiKey;

        // eWeLink requires a 'query' action to reset the connection timeout
        const heartbeatMsg = JSON.stringify({
            action: 'query',
            deviceid: deviceID,
            apikey: apikey,
            sequence: Math.floor(Date.now() / 1000).toString(),
            ts: 0
        });

        CloudLogger.log('💓 SENDING QUERY HEARTBEAT TO CLOUD', { 
            deviceID, 
            message: heartbeatMsg 
        });
        
        cloudWS.send(heartbeatMsg);
    }

    /**
     * Start heartbeat timer for device
     */
    static start(deviceID, cloudWS) {
        // Clear any existing timer first
        this.stop(deviceID);

        const timer = setInterval(() => {
            this.sendHeartbeat(deviceID, cloudWS);
        }, CLOUD_CONFIG.HEARTBEAT_INTERVAL_MS);

        heartbeatIntervals.set(deviceID, timer);
        
        CloudLogger.log('💓 Heartbeat timer STARTED', { 
            deviceID, 
            interval: `${CLOUD_CONFIG.HEARTBEAT_INTERVAL_MS / 1000}s` 
        });
        
        console.log(`💓 Cloud heartbeat timer started for ${deviceID} (${CLOUD_CONFIG.HEARTBEAT_INTERVAL_MS / 1000}s)`);
    }

    /**
     * Stop heartbeat timer for device
     */
    static stop(deviceID) {
        if (heartbeatIntervals.has(deviceID)) {
            clearInterval(heartbeatIntervals.get(deviceID));
            heartbeatIntervals.delete(deviceID);
            
            CloudLogger.log('💓 Heartbeat timer STOPPED', { deviceID });
            console.log(`💓 Cloud heartbeat timer stopped for ${deviceID}`);
        }
    }
}
