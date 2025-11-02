/*
Author: Matteo Palitto
Date: January 9, 2024

Description: cloudLogger.mjs
Logging functionality for cloud connections
*/

import { appendFileSync } from 'fs';
import { cloudDebugMode } from '../sharedVARs.js';

export class CloudLogger {
    /**
     * Log cloud protocol debug information
     */
    static log(message, data = null) {
        if (!cloudDebugMode.enabled) return;
        
        const timestamp = new Date().toISOString();
        let logEntry = `[${timestamp}] ${message}`;
        
        if (data !== null) {
            if (typeof data === 'object') {
                logEntry += '\n' + JSON.stringify(data, null, 2);
            } else {
                logEntry += '\n' + data;
            }
        }
        
        logEntry += '\n' + '-'.repeat(80) + '\n';
        
        try {
            appendFileSync(cloudDebugMode.logFile, logEntry);
        } catch (err) {
            console.error('Error writing to cloud debug log:', err);
        }
        
        // Also print to console in debug mode
        if (cloudDebugMode.enabled) {
            console.log(logEntry);
        }
    }
}
