/*
Author: Matteo Palitto
Date: January 9, 2024

Description: statsCommands.mjs
Handles statistics and diagnostics display commands
*/

import { sONOFF, deviceStats, deviceDiagnostics } from '../sharedVARs.js';

export class StatsCommands {
    /**
     * Show connection statistics
     */
    static showStats(filter, deviceIDMap, client) {
        const filterLower = filter.toLowerCase();
        let targetDevices = [];
        
        if (filterLower === 'all') {
            targetDevices = Object.keys(deviceStats);
        } else {
            // Check if it's a device ID or alias
            if (deviceIDMap[filterLower]) {
                targetDevices = [deviceIDMap[filterLower]];
            } else if (deviceStats[filterLower]) {
                targetDevices = [filterLower];
            } else {
                client.write('ERROR: Device not found: ' + filter + '\r\n');
                return;
            }
        }
        
        if (targetDevices.length === 0) {
            client.write('No statistics available yet.\r\n');
            return;
        }
        
        client.write('\r\n' + '='.repeat(120) + '\r\n');
        client.write('CONNECTION STATISTICS\r\n');
        client.write('='.repeat(120) + '\r\n');
        
        targetDevices.forEach(function(devID) {
            const stats = deviceStats[devID];
            const alias = sONOFF[devID] ? sONOFF[devID].alias || 'N/A' : 'N/A';
            const state = sONOFF[devID] ? sONOFF[devID].state || 'OFFLINE' : 'OFFLINE';
            
            client.write('\r\n');
            client.write('Device ID: ' + devID + '\r\n');
            client.write('Alias: ' + alias + '\r\n');
            client.write('Current State: ' + state + '\r\n');
            client.write('-'.repeat(120) + '\r\n');
            
            // Format statistics in columns
            client.write('DISPATCH:'.padEnd(20) + 'Requests: ' + String(stats.DISPATCH_REQ).padEnd(8) + 'Responses: ' + String(stats.DISPATCH_RES).padEnd(8) + '\r\n');
            client.write('WEBSOCKET:'.padEnd(20) + 'Connections: ' + String(stats.WEBSOCKET_CONN).padEnd(5) + 'Messages: ' + String(stats.WEBSOCKET_MSG).padEnd(8) + '\r\n');
            client.write('REGISTRATION:'.padEnd(20) + 'Requests: ' + String(stats.REGISTER_REQ).padEnd(8) + 'Acks: ' + String(stats.REGISTER_ACK).padEnd(8) + '\r\n');
            client.write('DATE:'.padEnd(20) + 'Requests: ' + String(stats.DATE_REQ).padEnd(8) + 'Responses: ' + String(stats.DATE_RES).padEnd(8) + '\r\n');
            client.write('UPDATE:'.padEnd(20) + 'Requests: ' + String(stats.UPDATE_REQ).padEnd(8) + 'Acks: ' + String(stats.UPDATE_ACK).padEnd(8) + '\r\n');
            client.write('QUERY:'.padEnd(20) + 'Requests: ' + String(stats.QUERY_REQ).padEnd(8) + 'Responses: ' + String(stats.QUERY_RES).padEnd(8) + '\r\n');
            client.write('COMMANDS:'.padEnd(20) + 'Sent: ' + String(stats.CMD_SENT).padEnd(8) + '\r\n');
            client.write('PING:'.padEnd(20) + 'Count: ' + String(stats.PING_COUNT).padEnd(8) + '\r\n');
            client.write('-'.repeat(120) + '\r\n');
            
            // Analysis to help identify issues - call without 'this'
            StatsCommands.analyzeStats(stats, client);
            
            client.write('\r\n');
        });
        
        client.write('='.repeat(120) + '\r\n\r\n');
    }

    /**
     * Analyze statistics for potential issues
     * Changed from private (#) to public static method
     */
    static analyzeStats(stats, client) {
        if (stats.DISPATCH_REQ > stats.DISPATCH_RES) {
            client.write('⚠ WARNING: Dispatch requests > responses (missing ' + (stats.DISPATCH_REQ - stats.DISPATCH_RES) + ')\r\n');
        }
        if (stats.DISPATCH_RES > 0 && stats.WEBSOCKET_CONN === 0) {
            client.write('⚠ WARNING: Dispatch completed but no WebSocket connection established!\r\n');
        }
        if (stats.WEBSOCKET_CONN > 0 && stats.REGISTER_REQ === 0) {
            client.write('⚠ WARNING: WebSocket connected but no registration request received!\r\n');
        }
        if (stats.REGISTER_REQ > stats.REGISTER_ACK) {
            client.write('⚠ WARNING: Registration requests > acks (missing ' + (stats.REGISTER_REQ - stats.REGISTER_ACK) + ')\r\n');
        }
        if (stats.DISPATCH_REQ > 1) {
            client.write('ℹ INFO: Device has attempted dispatch ' + stats.DISPATCH_REQ + ' times (may indicate reconnection issues)\r\n');
        }
    }

    /**
     * Show detailed diagnostics
     */
    static showDiagnostics(filter, deviceIDMap, client) {
        const filterLower = filter.toLowerCase();
        let targetDevices = [];
        
        if (filterLower === 'all') {
            targetDevices = Object.keys(deviceDiagnostics);
        } else {
            // Check if it's a device ID or alias
            if (deviceIDMap[filterLower]) {
                targetDevices = [deviceIDMap[filterLower]];
            } else if (deviceDiagnostics[filterLower]) {
                targetDevices = [filterLower];
            } else {
                client.write('ERROR: Device not found: ' + filter + '\r\n');
                return;
            }
        }
        
        if (targetDevices.length === 0) {
            client.write('No diagnostic data available yet.\r\n');
            return;
        }
        
        client.write('\r\n' + '='.repeat(120) + '\r\n');
        client.write('DETAILED CONNECTION DIAGNOSTICS\r\n');
        client.write('='.repeat(120) + '\r\n');
        
        targetDevices.forEach((devID) => {
            StatsCommands.displayDeviceDiagnostics(devID, client);
        });
        
        client.write('='.repeat(120) + '\r\n\r\n');
    }

    /**
     * Display diagnostics for a single device
     * Changed from private (#) to public static method
     */
    static displayDeviceDiagnostics(devID, client) {
        const diag = deviceDiagnostics[devID];
        const alias = sONOFF[devID] ? sONOFF[devID].alias || 'N/A' : 'N/A';
        const state = sONOFF[devID] ? sONOFF[devID].state || 'OFFLINE' : 'OFFLINE';
        
        client.write('\r\n');
        client.write('╔' + '═'.repeat(118) + '╗\r\n');
        client.write('║ Device ID: ' + devID.padEnd(105) + '║\r\n');
        client.write('║ Alias: ' + alias.padEnd(109) + '║\r\n');
        client.write('║ Current State: ' + state.padEnd(101) + '║\r\n');
        client.write('╠' + '═'.repeat(118) + '╣\r\n');
        
        // Timing Information
        StatsCommands.displayTimingInfo(diag, client);
        
        // IP Information
        StatsCommands.displayIPInfo(diag, client);
        
        // MAC Information
        StatsCommands.displayMACInfo(diag, client);
        
        // Recent Connection Attempts
        StatsCommands.displayConnectionAttempts(diag, client);
        
        // Errors
        StatsCommands.displayErrors(diag, client);
        
        // Diagnostic Analysis
        StatsCommands.displayDiagnosticAnalysis(diag, client);
        
        client.write('╚' + '═'.repeat(118) + '╝\r\n');
        client.write('\r\n');
    }

    /**
     * Display timing information
     * Changed from private (#) to public static method
     */
    static displayTimingInfo(diag, client) {
        client.write('║ TIMING INFORMATION:'.padEnd(119) + '║\r\n');
        client.write('║ ' + '-'.repeat(117) + '║\r\n');
        client.write('║   Last Dispatch Time:        ' + (diag.lastDispatchTime || 'Never').padEnd(87) + '║\r\n');
        client.write('║   Last WebSocket Attempt:    ' + (diag.lastWebSocketAttemptTime || 'Never').padEnd(87) + '║\r\n');
        client.write('║   Last WebSocket Success:    ' + (diag.lastWebSocketSuccessTime || 'Never').padEnd(87) + '║\r\n');
        client.write('║   Last Registration:         ' + (diag.lastRegistrationTime || 'Never').padEnd(87) + '║\r\n');
        client.write('║   Last Online:               ' + (diag.lastOnlineTime || 'Never').padEnd(87) + '║\r\n');
        client.write('║   Last Offline:              ' + (diag.lastOfflineTime || 'Never').padEnd(87) + '║\r\n');
        client.write('║ ' + '-'.repeat(117) + '║\r\n');
        client.write('║   Dispatch → WebSocket:      ' + (diag.dispatchToWSDelay || 'N/A').padEnd(87) + '║\r\n');
        client.write('║   WebSocket → Registration:  ' + (diag.wsToRegisterDelay || 'N/A').padEnd(87) + '║\r\n');
        client.write('╠' + '═'.repeat(118) + '╣\r\n');
    }

    /**
     * Display IP information
     * Changed from private (#) to public static method
     */
    static displayIPInfo(diag, client) {
        client.write('║ IP ADDRESS INFORMATION:'.padEnd(119) + '║\r\n');
        client.write('║ ' + '-'.repeat(117) + '║\r\n');
        client.write('║   Dispatch from IP:          ' + (diag.lastDispatchIP || 'N/A').padEnd(87) + '║\r\n');
        client.write('║   WebSocket attempt from IP: ' + (diag.lastWebSocketAttemptIP || 'N/A').padEnd(87) + '║\r\n');
        client.write('║   WebSocket success from IP: ' + (diag.lastWebSocketSuccessIP || 'N/A').padEnd(87) + '║\r\n');
        client.write('╠' + '═'.repeat(118) + '╣\r\n');
    }

    /**
     * Display MAC information
     * Changed from private (#) to public static method
     */
    static displayMACInfo(diag, client) {
        client.write('║ MAC ADDRESS INFORMATION:'.padEnd(119) + '║\r\n');
        client.write('║ ' + '-'.repeat(117) + '║\r\n');
        client.write('║   Dispatch from MAC:         ' + (diag.lastDispatchMAC || 'N/A').padEnd(87) + '║\r\n');
        client.write('║   WebSocket attempt from MAC:' + (diag.lastWebSocketAttemptMAC || 'N/A').padEnd(87) + '║\r\n');
        client.write('║   WebSocket success from MAC:' + (diag.lastWebSocketSuccessMAC || 'N/A').padEnd(87) + '║\r\n');
        
        // Check for IP mismatch
        if (diag.lastDispatchIP && diag.lastWebSocketSuccessIP && 
            diag.lastDispatchIP !== diag.lastWebSocketSuccessIP) {
            client.write('║ ' + '-'.repeat(117) + '║\r\n');
            client.write('║   ⚠️  WARNING: IP MISMATCH DETECTED!'.padEnd(119) + '║\r\n');
            client.write('║      Dispatch and WebSocket from different IPs'.padEnd(119) + '║\r\n');
        }
        client.write('╠' + '═'.repeat(118) + '╣\r\n');
    }

    /**
     * Display connection attempts
     * Changed from private (#) to public static method
     */
    static displayConnectionAttempts(diag, client) {
        client.write('║ RECENT CONNECTION ATTEMPTS (Last 10):'.padEnd(119) + '║\r\n');
        client.write('║ ' + '-'.repeat(117) + '║\r\n');
        
        if (diag.allConnectionAttempts && diag.allConnectionAttempts.length > 0) {
            const recentAttempts = diag.allConnectionAttempts.slice(-10);
            recentAttempts.forEach((attempt) => {
                const status = attempt.success ? '✓' : '✗';
                const line = `   ${status} ${attempt.timestamp} | ${attempt.type.padEnd(15)} | IP: ${attempt.ip}`;
                client.write('║ ' + line.padEnd(117) + '║\r\n');
                if (attempt.error) {
                    const errorLine = `     Error: ${attempt.error}`;
                    client.write('║ ' + errorLine.padEnd(117) + '║\r\n');
                }
            });
        } else {
            client.write('║   No connection attempts recorded'.padEnd(119) + '║\r\n');
        }
        
        client.write('╠' + '═'.repeat(118) + '╣\r\n');
    }

    /**
     * Display errors
     * Changed from private (#) to public static method
     */
    static displayErrors(diag, client) {
        // Connection Errors
        if (diag.connectionErrors && diag.connectionErrors.length > 0) {
            client.write('║ RECENT ERRORS:'.padEnd(119) + '║\r\n');
            client.write('║ ' + '-'.repeat(117) + '║\r\n');
            diag.connectionErrors.slice(-5).forEach(err => {
                client.write('║   ' + err.timestamp.padEnd(115) + '║\r\n');
                client.write('║   Type: ' + err.type.padEnd(108) + '║\r\n');
                client.write('║   Error: ' + (err.error || 'Unknown').substring(0, 106).padEnd(107) + '║\r\n');
                client.write('║ ' + '-'.repeat(117) + '║\r\n');
            });
        }
        
        // TLS Errors
        if (diag.tlsErrors && diag.tlsErrors.length > 0) {
            client.write('║ TLS/SSL ERRORS:'.padEnd(119) + '║\r\n');
            client.write('║ ' + '-'.repeat(117) + '║\r\n');
            diag.tlsErrors.slice(-5).forEach(err => {
                client.write('║   ' + err.timestamp.padEnd(115) + '║\r\n');
                client.write('║   Error: ' + (err.error || 'Unknown').substring(0, 106).padEnd(107) + '║\r\n');
                if (err.code) {
                    client.write('║   Code: ' + err.code.padEnd(108) + '║\r\n');
                }
                client.write('║ ' + '-'.repeat(117) + '║\r\n');
            });
        }
    }

    /**
     * Display diagnostic analysis
     * Changed from private (#) to public static method
     */
    static displayDiagnosticAnalysis(diag, client) {
        client.write('║ DIAGNOSTIC ANALYSIS:'.padEnd(119) + '║\r\n');
        client.write('║ ' + '-'.repeat(117) + '║\r\n');
        
        if (diag.lastDispatchTime && !diag.lastWebSocketAttemptTime) {
            client.write('║   ❌ ISSUE: Device sent DISPATCH but never attempted WebSocket connection'.padEnd(119) + '║\r\n');
            client.write('║      Possible causes:'.padEnd(119) + '║\r\n');
            client.write('║      - Device cannot reach proxy IP/port'.padEnd(119) + '║\r\n');
            client.write('║      - Firewall blocking WebSocket port'.padEnd(119) + '║\r\n');
            client.write('║      - DNS/routing issue on device'.padEnd(119) + '║\r\n');
        } else if (diag.lastWebSocketAttemptTime && !diag.lastWebSocketSuccessTime) {
            client.write('║   ❌ ISSUE: WebSocket connection attempted but failed'.padEnd(119) + '║\r\n');
            client.write('║      Possible causes:'.padEnd(119) + '║\r\n');
            client.write('║      - TLS/SSL certificate issues'.padEnd(119) + '║\r\n');
            client.write('║      - Protocol mismatch'.padEnd(119) + '║\r\n');
            client.write('║      - Connection timeout'.padEnd(119) + '║\r\n');
        } else if (diag.lastWebSocketSuccessTime && !diag.lastRegistrationTime) {
            client.write('║   ❌ ISSUE: WebSocket connected but no registration received'.padEnd(119) + '║\r\n');
            client.write('║      Possible causes:'.padEnd(119) + '║\r\n');
            client.write('║      - Protocol/message format issues'.padEnd(119) + '║\r\n');
            client.write('║      - Device firmware incompatibility'.padEnd(119) + '║\r\n');
        } else if (diag.lastOnlineTime) {
            client.write('║   ✅ Device appears to be functioning normally'.padEnd(119) + '║\r\n');
        } else {
            client.write('║   ℹ️  No issues detected, but device not yet online'.padEnd(119) + '║\r\n');
        }
        
        if (diag.dispatchToWSDelay) {
            const delay = parseFloat(diag.dispatchToWSDelay);
            if (delay > 5) {
                client.write('║   ⚠️  WARNING: Long delay between Dispatch and WebSocket (' + diag.dispatchToWSDelay + ')'.padEnd(118) + '║\r\n');
                client.write('║      This may indicate network connectivity issues'.padEnd(119) + '║\r\n');
            } else if (delay < 1) {
                client.write('║   ✅ Good: Quick response time between Dispatch and WebSocket (' + diag.dispatchToWSDelay + ')'.padEnd(118) + '║\r\n');
            }
        }
    }

    /**
     * Verify stats (debugging command)
     */
    static verifyStats(filter, deviceIDMap, client) {
        client.write('\r\n' + '='.repeat(80) + '\r\n');
        client.write('STATS VERIFICATION\r\n');
        client.write('='.repeat(80) + '\r\n\r\n');
        
        Object.keys(sONOFF).forEach(function (devID) {
            if (filter !== 'all' && devID !== filter && sONOFF[devID].alias !== filter) {
                return;
            }
            
            client.write(`Device: ${devID} "${sONOFF[devID].alias}"\r\n`);
            client.write(`  isOnline: ${sONOFF[devID].isOnline}\r\n`);
            client.write(`  cloudConnected: ${sONOFF[devID].cloudConnected}\r\n`);
            client.write(`  state: ${sONOFF[devID].state}\r\n`);
            
            if (deviceStats[devID]) {
                client.write(`  Stats object exists: YES\r\n`);
                Object.keys(deviceStats[devID]).forEach(key => {
                    client.write(`    ${key}: ${deviceStats[devID][key]}\r\n`);
                });
            } else {
                client.write(`  Stats object exists: NO ❌\r\n`);
            }
            
            client.write('\r\n');
        });
        
        client.write('='.repeat(80) + '\r\n\r\n');
    }
}
