/*
Author: Matteo Palitto
Date: January 9, 2024 (Updated)

Description: deviceManagement.mjs
Handles device naming and listing
Updated to show three-state system in table format
*/

import { sONOFF, deviceDiagnostics, cmdFile, ConnectionState, SwitchState } from '../sharedVARs.js';
import { updateDeviceInCmdFile } from './cmdFileManager.mjs';

export class DeviceManagement {
    /**
     * Assign alias to device
     */
    static nameDevice(deviceID, alias, deviceIDMap) {
        // Store in memory
        sONOFF[deviceID] = sONOFF[deviceID] || {};
        sONOFF[deviceID]['alias'] = alias;
        
        // Initialize states if not present
        if (typeof sONOFF[deviceID].localConnectionState === 'undefined') {
            sONOFF[deviceID].localConnectionState = ConnectionState.OFFLINE;
        }
        if (typeof sONOFF[deviceID].cloudConnectionState === 'undefined') {
            sONOFF[deviceID].cloudConnectionState = ConnectionState.OFFLINE;
        }
        if (typeof sONOFF[deviceID].switchState === 'undefined') {
            sONOFF[deviceID].switchState = SwitchState.UNKNOWN;
        }
        if (typeof sONOFF[deviceID].isOnline === 'undefined') {
            sONOFF[deviceID].isOnline = false;
        }
        
        deviceIDMap[alias] = deviceID;
        
        // Get current MAC and IP if device has connected
        let mac = null;
        let ip = null;
        if (deviceDiagnostics[deviceID]) {
            mac = deviceDiagnostics[deviceID].lastWebSocketSuccessMAC || 
                  deviceDiagnostics[deviceID].lastDispatchMAC;
            ip = deviceDiagnostics[deviceID].lastWebSocketSuccessIP || 
                 deviceDiagnostics[deviceID].lastDispatchIP;
            if (ip) ip = ip.replace('::ffff:', '');
        }
        
        // Update cmd file
        updateDeviceInCmdFile(deviceID, alias, mac, ip);
        
        // Check if device needs a proper name
        const first4Chars = alias.slice(0, 4);
        if (first4Chars === 'new-') {
            console.log(`WARNING: device ${deviceID} needs you to give a nice name. Please edit the file: ${cmdFile}`);
        }
    }

    /**
     * List devices with optional filter in table format
     */
    static listDevices(filter = 'online', client) {
        const filterLower = filter.toLowerCase();
        
        // Collect devices that match filter
        const matchingDevices = [];
        
        Object.keys(sONOFF).forEach(function (devID) {
            let condition = false;
            
            switch (filterLower) {
                case 'online':
                    condition = sONOFF[devID]['isOnline'];
                    break;
                case 'offline':
                    condition = !sONOFF[devID]['isOnline'];
                    break;
                case 'off':
                    condition = sONOFF[devID].switchState === SwitchState.OFF || 
                               sONOFF[devID].switchState === 'OFF' ||
                               sONOFF[devID].state === 'off'; // Fallback
                    break;
                case 'on':
                    condition = sONOFF[devID].switchState === SwitchState.ON || 
                               sONOFF[devID].switchState === 'ON' ||
                               sONOFF[devID].state === 'on'; // Fallback
                    break;
                case 'all':
                    condition = true;
                    break;
                default:
                    throw new Error('ERROR: list command can be with the following filters ONLINE | OFFLINE | ON | OFF | ALL');
            }

            if (condition) {
                matchingDevices.push(devID);
            }
        });
        
        if (matchingDevices.length === 0) {
            const message = `No devices match filter: ${filter}\r\n`;
            console.log(message);
            if (client) client.write(message);
            return;
        }
        
        // Define column widths
        const COL_ID = 12;
        const COL_ALIAS = 16;
        const COL_LOCAL = 13;
        const COL_CLOUD = 13;
        const COL_SWITCH = 8;
        const COL_MAC = 18;
        const COL_IP = 16;
        
        // Build header
        const header = 
            'ID'.padEnd(COL_ID) +
            'Alias'.padEnd(COL_ALIAS) +
            'Local State'.padEnd(COL_LOCAL) +
            'Cloud State'.padEnd(COL_CLOUD) +
            'Switch'.padEnd(COL_SWITCH) +
            'MAC'.padEnd(COL_MAC) +
            'IP'.padEnd(COL_IP);
        
        // Build separator
        const separator = 
            '-'.repeat(COL_ID - 1) + ' ' +
            '-'.repeat(COL_ALIAS - 1) + ' ' +
            '-'.repeat(COL_LOCAL - 1) + ' ' +
            '-'.repeat(COL_CLOUD - 1) + ' ' +
            '-'.repeat(COL_SWITCH - 1) + ' ' +
            '-'.repeat(COL_MAC - 1) + ' ' +
            '-'.repeat(COL_IP - 1);
        
        // Print header
        console.log('\r\n' + header);
        console.log(separator);
        if (client) {
            client.write('\r\n' + header + '\r\n');
            client.write(separator + '\r\n');
        }
        
        // Print each device
        matchingDevices.forEach(function (devID) {
            const device = sONOFF[devID];
            
            // Get device data
            const id = devID.substring(0, COL_ID - 1);
            const alias = (device.alias || 'N/A').substring(0, COL_ALIAS - 1);
            
            // Get connection states (with fallback for legacy devices)
            const localState = (device.localConnectionState || ConnectionState.OFFLINE).substring(0, COL_LOCAL - 1);
            const cloudState = (device.cloudConnectionState || ConnectionState.OFFLINE).substring(0, COL_CLOUD - 1);
            const switchState = (device.switchState || SwitchState.UNKNOWN).substring(0, COL_SWITCH - 1);
            
            // Get MAC and IP if available
            let mac = 'N/A';
            let ip = 'N/A';
            if (deviceDiagnostics[devID]) {
                const macAddr = deviceDiagnostics[devID].lastWebSocketSuccessMAC || 
                               deviceDiagnostics[devID].lastDispatchMAC;
                const ipAddr = deviceDiagnostics[devID].lastWebSocketSuccessIP || 
                              deviceDiagnostics[devID].lastDispatchIP;
                if (macAddr) mac = macAddr.substring(0, COL_MAC - 1);
                if (ipAddr) ip = ipAddr.replace('::ffff:', '').substring(0, COL_IP - 1);
            }
            
            // Build row with proper padding
            const row = 
                id.padEnd(COL_ID) +
                alias.padEnd(COL_ALIAS) +
                localState.padEnd(COL_LOCAL) +
                cloudState.padEnd(COL_CLOUD) +
                switchState.padEnd(COL_SWITCH) +
                mac.padEnd(COL_MAC) +
                ip.padEnd(COL_IP);
            
            console.log(row);
            if (client) client.write(row + '\r\n');
        });
        
        // Print footer with count
        const footer = `\r\nTotal: ${matchingDevices.length} device(s)\r\n`;
        console.log(footer);
        if (client) client.write(footer);
    }
}
