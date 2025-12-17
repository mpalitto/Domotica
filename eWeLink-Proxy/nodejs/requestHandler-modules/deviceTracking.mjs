/*
Author: Matteo Palitto
Date: January 9, 2024

Description: deviceTracking.mjs
Handles device statistics and diagnostics tracking
*/

import { deviceStats, deviceDiagnostics, sONOFF, ConnectionState, SwitchState } from '../sharedVARs.js';
import { DIAGNOSTIC_CONFIG } from './config.mjs';

export class DeviceTracking {
    /**
     * Initialize device statistics
     */
    static initStats(deviceID) {
        if (!deviceStats[deviceID]) {
            deviceStats[deviceID] = {};
        }

        // Ensure ALL fields exist, even if object already exists
        const stats = deviceStats[deviceID];
        if (typeof stats.DISPATCH_REQ === 'undefined') stats.DISPATCH_REQ = 0;
        if (typeof stats.DISPATCH_RES === 'undefined') stats.DISPATCH_RES = 0;
        if (typeof stats.WEBSOCKET_CONN === 'undefined') stats.WEBSOCKET_CONN = 0;
        if (typeof stats.WEBSOCKET_MSG === 'undefined') stats.WEBSOCKET_MSG = 0;
        if (typeof stats.REGISTER_REQ === 'undefined') stats.REGISTER_REQ = 0;
        if (typeof stats.REGISTER_ACK === 'undefined') stats.REGISTER_ACK = 0;
        if (typeof stats.DATE_REQ === 'undefined') stats.DATE_REQ = 0;
        if (typeof stats.DATE_RES === 'undefined') stats.DATE_RES = 0;
        if (typeof stats.UPDATE_REQ === 'undefined') stats.UPDATE_REQ = 0;
        if (typeof stats.UPDATE_ACK === 'undefined') stats.UPDATE_ACK = 0;
        if (typeof stats.QUERY_REQ === 'undefined') stats.QUERY_REQ = 0;
        if (typeof stats.QUERY_RES === 'undefined') stats.QUERY_RES = 0;
        if (typeof stats.CMD_SENT === 'undefined') stats.CMD_SENT = 0;
        if (typeof stats.PING_COUNT === 'undefined') stats.PING_COUNT = 0;
        if (typeof stats.CLOUD_MSG === 'undefined') stats.CLOUD_MSG = 0;
    }

    /**
     * Initialize device diagnostics
     */
    static initDiagnostics(deviceID) {
        if (!deviceDiagnostics[deviceID]) {
            deviceDiagnostics[deviceID] = {
                lastDispatchTime: null,
                lastDispatchIP: null,
                lastDispatchMAC: null,
                lastWebSocketAttemptTime: null,
                lastWebSocketAttemptIP: null,
                lastWebSocketAttemptMAC: null,
                lastWebSocketSuccessTime: null,
                lastWebSocketSuccessIP: null,
                lastWebSocketSuccessMAC: null,
                lastRegistrationTime: null,
                lastOnlineTime: null,
                lastOfflineTime: null,
                dispatchToWSDelay: null,
                wsToRegisterDelay: null,
                connectionErrors: [],
                tlsErrors: [],
                allConnectionAttempts: [],
                usingSyntheticDispatch: false  // Track synthetic vs real dispatch
            };
        }
    }

    /**
     * Initialize device object with proper state variables
     */
    static initDeviceObject(deviceID, alias = null) {
        if (!sONOFF[deviceID]) {
            sONOFF[deviceID] = {};
        }
        
        const device = sONOFF[deviceID];
        
        // Initialize state variables if they don't exist
        if (typeof device.localConnectionState === 'undefined') {
            device.localConnectionState = ConnectionState.OFFLINE;
        }
        if (typeof device.cloudConnectionState === 'undefined') {
            device.cloudConnectionState = ConnectionState.OFFLINE;
        }
        if (typeof device.switchState === 'undefined') {
            device.switchState = SwitchState.UNKNOWN;
        }
        
        // Initialize legacy compatibility flags (computed from states)
        if (typeof device.isOnline === 'undefined') {
            device.isOnline = false;
        }
        if (typeof device.cloudConnected === 'undefined') {
            device.cloudConnected = false;
        }
        
        // Initialize alias if provided
        if (alias && !device.alias) {
            device.alias = alias;
        } else if (!device.alias) {
            device.alias = 'new-' + deviceID;
        }
        
        return device;
    }

    /**
     * Update local connection state
     */
    static setLocalConnectionState(deviceID, newState) {
        this.initDeviceObject(deviceID);
        const oldState = sONOFF[deviceID].localConnectionState;
        sONOFF[deviceID].localConnectionState = newState;
        
        console.log(`🔄 ${deviceID} local: ${oldState} → ${newState}`);
        
        // Update legacy isOnline flag based on BOTH states
        this.#updateOnlineStatus(deviceID);
    }

    /**
     * Update cloud connection state
     */
    static setCloudConnectionState(deviceID, newState) {
        this.initDeviceObject(deviceID);
        const oldState = sONOFF[deviceID].cloudConnectionState;
        sONOFF[deviceID].cloudConnectionState = newState;
        
        console.log(`☁️  ${deviceID} cloud: ${oldState} → ${newState}`);
        
        // Update legacy cloudConnected flag
        sONOFF[deviceID].cloudConnected = (newState === ConnectionState.ONLINE);
        
        // Update legacy isOnline flag based on BOTH states
        this.#updateOnlineStatus(deviceID);
    }

    /**
     * Update switch state
     */
    static setSwitchState(deviceID, newState) {
        this.initDeviceObject(deviceID);
        
        // Normalize state to uppercase enum value
        const normalizedState = newState.toUpperCase();
        
        if (!Object.values(SwitchState).includes(normalizedState)) {
            console.warn(`⚠️  Invalid switch state: ${newState} for ${deviceID}`);
            return;
        }
        
        const oldState = sONOFF[deviceID].switchState;
        if (oldState !== normalizedState) {
            sONOFF[deviceID].switchState = normalizedState;
            console.log(`💡 ${deviceID} "${sONOFF[deviceID].alias}": ${oldState} → ${normalizedState}`);
        }
    }

    /**
     * Private: Update legacy isOnline status based on both connection states
     */
    static #updateOnlineStatus(deviceID) {
        const device = sONOFF[deviceID];
        
        // Device is "online" if BOTH local and cloud are ONLINE
        const fullyOnline = (
            device.localConnectionState === ConnectionState.ONLINE &&
            device.cloudConnectionState === ConnectionState.ONLINE
        );
        
        // Update legacy flag
        const wasOnline = device.isOnline;
        device.isOnline = fullyOnline;
        
        // Log status changes
        if (wasOnline !== fullyOnline) {
            if (fullyOnline) {
                console.log(`✅ ${deviceID} "${device.alias}" FULLY ONLINE`);
                this.initDiagnostics(deviceID);
                deviceDiagnostics[deviceID].lastOnlineTime = new Date().toISOString();
            } else {
                console.log(`⚠️  ${deviceID} "${device.alias}" not fully online (local: ${device.localConnectionState}, cloud: ${device.cloudConnectionState})`);
            }
        }
    }

    /**
     * Get human-readable status summary for a device
     */
    static getDeviceStatus(deviceID) {
        const device = sONOFF[deviceID];
        if (!device) return 'UNKNOWN';
        
        return {
            deviceID,
            alias: device.alias || 'unknown',
            localState: device.localConnectionState || ConnectionState.OFFLINE,
            cloudState: device.cloudConnectionState || ConnectionState.OFFLINE,
            switchState: device.switchState || SwitchState.UNKNOWN,
            isOnline: device.isOnline || false,
            cloudConnected: device.cloudConnected || false
        };
    }

    /**
     * Log a connection attempt
     */
    static logConnectionAttempt(deviceID, ip, type, success, error = null) {
        this.initDiagnostics(deviceID);
        const attempt = {
            timestamp: new Date().toISOString(),
            ip: ip,
            type: type,
            success: success,
            error: error
        };
        deviceDiagnostics[deviceID].allConnectionAttempts.push(attempt);

        // Keep only last N attempts
        if (deviceDiagnostics[deviceID].allConnectionAttempts.length > DIAGNOSTIC_CONFIG.MAX_ENTRIES) {
            deviceDiagnostics[deviceID].allConnectionAttempts.shift();
        }

        // Log errors separately
        if (error) {
            deviceDiagnostics[deviceID].connectionErrors.push(attempt);
            if (deviceDiagnostics[deviceID].connectionErrors.length > DIAGNOSTIC_CONFIG.MAX_ERROR_ENTRIES) {
                deviceDiagnostics[deviceID].connectionErrors.shift();
            }
        }
    }

    /**
     * Mark WebSocket connection success
     */
    static markWebSocketSuccess(deviceID, ws) {
        const now = new Date();
        const ip = ws.IP;
        const mac = ws.MAC;
        
        this.initStats(deviceID);
        this.initDiagnostics(deviceID);
        
        // Increment WebSocket connection counter
        deviceStats[deviceID].WEBSOCKET_CONN++;
        
        // Update success timestamps
        deviceDiagnostics[deviceID].lastWebSocketSuccessTime = now.toISOString();
        deviceDiagnostics[deviceID].lastWebSocketSuccessIP = ip;
        deviceDiagnostics[deviceID].lastWebSocketSuccessMAC = mac || null;
        
        // Calculate timing delays
        if (deviceDiagnostics[deviceID].lastDispatchTime) {
            const dispatchTime = new Date(deviceDiagnostics[deviceID].lastDispatchTime);
            const delay = (now - dispatchTime) / 1000;
            deviceDiagnostics[deviceID].dispatchToWSDelay = delay.toFixed(2) + 's';
            console.log(`⏱️  Dispatch → WebSocket: ${delay.toFixed(2)}s for device ${deviceID}`);
        }
        
        if (deviceDiagnostics[deviceID].lastWebSocketAttemptTime) {
            const wsAttemptTime = new Date(deviceDiagnostics[deviceID].lastWebSocketAttemptTime);
            const delay = (now - wsAttemptTime) / 1000;
            deviceDiagnostics[deviceID].wsToRegisterDelay = delay.toFixed(2) + 's';
        }
        
        // Log successful connection attempt
        this.logConnectionAttempt(deviceID, ip, 'WEBSOCKET', true);
        
        console.log(`✅ WebSocket connection SUCCESS for ${deviceID} (Total: ${deviceStats[deviceID].WEBSOCKET_CONN})`);
    }
}
