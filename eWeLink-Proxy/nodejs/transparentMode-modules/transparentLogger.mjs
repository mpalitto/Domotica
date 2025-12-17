/*
Author: Matteo Palitto
Date: January 9, 2024 (Updated)

Description: transparentLogger.mjs
Handles logging for transparent capture mode
Enhanced with better formatting and rotation
*/

import { appendFileSync, existsSync, renameSync, statSync } from 'fs';
import { transparentMode, LOGS_DIR } from '../sharedVARs.js';

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB

export class TransparentLogger {
    /**
     * Initialize transparent logging
     */
    static initialize(deviceID, deviceAlias = null) {
        transparentMode.logFile = `${LOGS_DIR}/${deviceID}-transparent.log`;
        
        // Rotate existing log if too large
        this.#rotateLogs(transparentMode.logFile);
        
        const header = `
${'='.repeat(80)}
TRANSPARENT CAPTURE MODE STARTED
${'='.repeat(80)}
Timestamp:    ${new Date().toISOString()}
Device ID:    ${deviceID}
Device Alias: ${deviceAlias || 'N/A'}
Mode:         Raw protocol forwarding (NO proxy processing)
Purpose:      Capture device ↔ cloud communication for protocol analysis

This log contains unprocessed messages forwarded between device and cloud.
Messages are logged exactly as received/sent without modification.
${'='.repeat(80)}

`;
        
        try {
            appendFileSync(transparentMode.logFile, header);
            console.log(`📝 Transparent log initialized: ${transparentMode.logFile}`);
        } catch (err) {
            console.error('❌ Error initializing transparent log:', err);
        }
    }

    /**
     * Rotate log file if too large
     */
    static #rotateLogs(logFile) {
        if (!existsSync(logFile)) return;
        
        try {
            const stats = statSync(logFile);
            if (stats.size > MAX_LOG_SIZE) {
                const bakFile = logFile.replace('.log', '.bak.log');
                if (existsSync(bakFile)) {
                    renameSync(bakFile, logFile.replace('.log', '.old.log'));
                }
                renameSync(logFile, bakFile);
                console.log(`📁 Rotated transparent log (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
            }
        } catch (err) {
            console.error('⚠️  Error rotating transparent log:', err.message);
        }
    }

    /**
     * Log message to file with optional parsing
     */
    static log(direction, message, parseJSON = true) {
        if (!transparentMode.enabled || !transparentMode.logFile) {
            return;
        }
        
        const timestamp = new Date().toISOString();
        let logEntry = `\n${'─'.repeat(80)}\n[${timestamp}] ${direction}\n${'─'.repeat(80)}\n`;
        
        // Try to parse and format JSON
        if (parseJSON && typeof message === 'string') {
            try {
                const msgObj = JSON.parse(message);
                logEntry += JSON.stringify(msgObj, null, 2) + '\n';
                
                // Add summary line for quick scanning
                const summary = this.#getSummary(msgObj);
                if (summary) {
                    logEntry += `\nSummary: ${summary}\n`;
                }
            } catch (err) {
                // Not JSON or parse error - log as-is
                logEntry += message + '\n';
            }
        } else {
            logEntry += message + '\n';
        }
        
        logEntry += '─'.repeat(80) + '\n';
        
        try {
            appendFileSync(transparentMode.logFile, logEntry);
        } catch (err) {
            console.error('❌ Error writing to transparent log:', err);
        }
    }

    /**
     * Get one-line summary of message
     */
    static #getSummary(msgObj) {
        if (!msgObj) return null;
        
        const parts = [];
        
        if (msgObj.action) {
            parts.push(`Action: ${msgObj.action}`);
        }
        
        if (msgObj.params) {
            if (msgObj.params.switch) {
                parts.push(`Switch: ${msgObj.params.switch}`);
            }
            if (typeof msgObj.params === 'number') {
                parts.push(`Params: ${msgObj.params}`);
            }
        }
        
        if (msgObj.error !== undefined) {
            parts.push(`Error: ${msgObj.error}`);
        }
        
        if (msgObj.sequence) {
            parts.push(`Seq: ${msgObj.sequence}`);
        }
        
        return parts.length > 0 ? parts.join(' | ') : null;
    }

    /**
     * Log cloud connection event
     */
    static logCloudConnection(cloudUrl, cloudIP, cloudPort) {
        const message = `
🔍 Register message detected, connecting to cloud server...
   Cloud URL:  ${cloudUrl}
   Cloud IP:   ${cloudIP}
   Cloud Port: ${cloudPort}

✅ Connected to cloud successfully
   Starting transparent message forwarding...
   All messages will be logged exactly as transmitted
`;
        
        this.log('🌐 CLOUD CONNECTION ESTABLISHED', message, false);
    }

    /**
     * Log device message
     */
    static logDeviceMessage(message) {
        this.log('📥 Device → Proxy', message, true);
    }

    /**
     * Log proxy to cloud message
     */
    static logProxyToCloud(message) {
        this.log('📤 Proxy → Cloud', message, true);
    }

    /**
     * Log cloud message
     */
    static logCloudMessage(message) {
        this.log('📥 Cloud → Proxy', message, true);
    }

    /**
     * Log proxy to device message
     */
    static logProxyToDevice(message) {
        this.log('📤 Proxy → Device', message, true);
    }

    /**
     * Log error
     */
    static logError(error, context = null) {
        let message = error;
        if (context) {
            message = `Context: ${context}\nError: ${error}`;
        }
        this.log('❌ ERROR', message, false);
    }

    /**
     * Log close event
     */
    static logClose(source, code, reason) {
        const message = `
Connection closed by: ${source}
Close code: ${code}
Reason: ${reason || 'No reason provided'}
Timestamp: ${new Date().toISOString()}
`;
        this.log(`🔌 ${source.toUpperCase()} CONNECTION CLOSED`, message, false);
    }

    /**
     * Log session statistics
     */
    static logSessionStats(stats) {
        const message = `
Device Messages:  ${stats.deviceMessages || 0}
Cloud Messages:   ${stats.cloudMessages || 0}
Total Forwarded:  ${stats.totalForwarded || 0}
Parse Errors:     ${stats.parseErrors || 0}
Forward Errors:   ${stats.forwardErrors || 0}
Session Duration: ${stats.duration || 'N/A'}
`;
        this.log('📊 SESSION STATISTICS', message, false);
    }

    /**
     * Write footer when closing transparent mode
     */
    static finalize(stats = null) {
        if (!transparentMode.logFile) return;
        
        const footer = `
${'='.repeat(80)}
TRANSPARENT CAPTURE MODE ENDED
${'='.repeat(80)}
Timestamp: ${new Date().toISOString()}
${stats ? 'Statistics:\n' + JSON.stringify(stats, null, 2) : ''}
${'='.repeat(80)}
`;
        
        try {
            appendFileSync(transparentMode.logFile, footer);
            console.log(`📝 Transparent log finalized: ${transparentMode.logFile}`);
        } catch (err) {
            console.error('❌ Error finalizing transparent log:', err);
        }
    }
}
