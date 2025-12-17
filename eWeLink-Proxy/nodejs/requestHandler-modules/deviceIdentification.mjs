/*
Author: Matteo Palitto
Date: January 9, 2024

Description: deviceIdentification.mjs
Handles device identification, MAC address resolution, and validation
*/

import { exec } from 'child_process';
import { promisify } from 'util';
import { sONOFF, deviceDiagnostics } from '../sharedVARs.js';
import { DIAGNOSTIC_CONFIG } from './config.mjs';

const execPromise = promisify(exec);

export class DeviceIdentification {
    /**
     * Get MAC address from IP using system commands
     */
    static async getMACfromIP(ipAddress) {
        // Clean IPv6 prefix if present
        const cleanIP = ipAddress.replace('::ffff:', '');

        try {
            // Try ip neigh first (modern)
            const { stdout: neighOutput } = await execPromise(`ip neigh show ${cleanIP} 2>/dev/null`);
            if (neighOutput.trim()) {
                const macMatch = neighOutput.match(/([0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2})/i);
                if (macMatch) {
                    return macMatch[1].toLowerCase();
                }
            }
        } catch (err) {
            // Try next method
        }

        try {
            // Try arp command (older systems)
            const { stdout: arpOutput } = await execPromise(`arp -n ${cleanIP} 2>/dev/null || arp ${cleanIP} 2>/dev/null`);
            if (arpOutput.trim()) {
                const macMatch = arpOutput.match(/([0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2})/i);
                if (macMatch) {
                    return macMatch[1].toLowerCase();
                }
            }
        } catch (err) {
            // Couldn't get MAC
        }

        return null;
    }

    /**
     * Find likely deviceID based on IP/MAC before device identifies itself
     */
    static findDeviceByNetworkInfo(ip, mac) {
        const cleanIP = ip ? ip.replace('::ffff:', '') : null;

        if (!cleanIP && !mac) return null;

        // Strategy 1: Check recent diagnostics for exact IP/MAC match
        for (const [devID, diag] of Object.entries(deviceDiagnostics)) {
            // Check dispatch IP (most recent interaction)
            if (cleanIP && (diag.lastDispatchIP === cleanIP || diag.lastDispatchIP === ip)) {
                // Check how recent
                if (diag.lastDispatchTime) {
                    const dispatchAge = (new Date() - new Date(diag.lastDispatchTime)) / 1000;
                    if (dispatchAge < DIAGNOSTIC_CONFIG.DISPATCH_IP_MATCH_WINDOW) {
                        return {
                            deviceID: devID,
                            confidence: 'very high',
                            method: `dispatch ${dispatchAge.toFixed(0)}s ago`,
                            alias: sONOFF[devID]?.alias || 'unknown'
                        };
                    }
                }
            }

            // Check MAC address (most reliable)
            if (mac && (diag.lastDispatchMAC === mac || diag.lastWebSocketSuccessMAC === mac)) {
                return {
                    deviceID: devID,
                    confidence: 'high',
                    method: 'MAC address match',
                    alias: sONOFF[devID]?.alias || 'unknown'
                };
            }

            // Check previous WebSocket IP
            if (cleanIP && (diag.lastWebSocketSuccessIP === cleanIP || diag.lastWebSocketSuccessIP === ip)) {
                return {
                    deviceID: devID,
                    confidence: 'medium',
                    method: 'previous WebSocket IP',
                    alias: sONOFF[devID]?.alias || 'unknown'
                };
            }
        }

        // Strategy 2: Check currently online devices (might be reconnecting)
        for (const [devID, device] of Object.entries(sONOFF)) {
            if (device.conn && device.conn.ws) {
                if (device.conn.ws.IP === ip || device.conn.ws.IP === cleanIP) {
                    return {
                        deviceID: devID,
                        confidence: 'low',
                        method: 'same IP as online device (possible reconnect)',
                        alias: device.alias || 'unknown'
                    };
                }
            }
        }

        return null;
    }

    /**
     * Validate device ID format
     */
    static isValidDeviceID(deviceID) {
        // Device ID should be alphanumeric string, typically 10 characters
        return typeof deviceID === 'string' && 
               deviceID.length > 0 && 
               deviceID.length < 100 && 
               /^[a-zA-Z0-9]+$/.test(deviceID);
    }
}
