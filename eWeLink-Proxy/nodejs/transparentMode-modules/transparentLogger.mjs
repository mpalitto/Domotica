/*
Author: Matteo Palitto
Date: January 9, 2024

Description: transparentLogger.mjs
Handles logging for transparent capture mode
*/

import { appendFileSync } from 'fs';
import { transparentMode, LOGS_DIR } from '../sharedVARs.js';

export class TransparentLogger {
    /**
     * Initialize transparent logging
     */
    static initialize(deviceID) {
        transparentMode.logFile = `${LOGS_DIR}/${deviceID}-transparent.log`;
        
        const header = `
${'='.repeat(80)}
TRANSPARENT CAPTURE MODE - ${new Date().toISOString()}
Device ID: ${deviceID}
Logging raw protocol messages WITHOUT proxy processing
${'='.repeat(80)}

`;
        
        try {
            appendFileSync(transparentMode.logFile, header);
        } catch (err) {
            console.error('Error initializing transparent log:', err);
        }
    }

    /**
     * Log message to file
     */
    static log(direction, message) {
        if (!transparentMode.enabled || !transparentMode.logFile) {
            return;
        }
        
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${direction}\n${message}\n\n`;
        
        try {
            appendFileSync(transparentMode.logFile, logEntry);
        } catch (err) {
            console.error('Error writing to transparent log:', err);
        }
    }

    /**
     * Log cloud connection event
     */
    static logCloudConnection(cloudUrl, cloudIP, cloudPort) {
        const message = `
${'─'.repeat(80)}
🔍 Register message detected, connecting to cloud...
🔍 Cloud server: ${cloudUrl}
   IP: ${cloudIP}
   Port: ${cloudPort}
✅ Connected to cloud, starting transparent forwarding...
${'─'.repeat(80)}
`;
        
        this.log('', message);
    }

    /**
     * Log device message
     */
    static logDeviceMessage(message) {
        this.log('📥 Device → Proxy', message);
    }

    /**
     * Log proxy to cloud message
     */
    static logProxyToCloud(message) {
        this.log('📤 Proxy → Cloud', message);
    }

    /**
     * Log cloud message
     */
    static logCloudMessage(message) {
        this.log('📥 Cloud → Proxy', message);
    }

    /**
     * Log proxy to device message
     */
    static logProxyToDevice(message) {
        this.log('📤 Proxy → Device', message);
    }

    /**
     * Log error
     */
    static logError(error) {
        this.log('❌ ERROR', error);
    }

    /**
     * Log close event
     */
    static logClose(source, code, reason) {
        const message = `
${'─'.repeat(80)}
🔌 ${source} connection closed
   Code: ${code}
   Reason: ${reason || 'No reason provided'}
${'─'.repeat(80)}
`;
        this.log('', message);
    }
}
