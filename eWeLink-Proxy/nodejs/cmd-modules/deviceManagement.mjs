/*
Author: Matteo Palitto
Date: January 9, 2024

Description: deviceManagement.mjs
Handles device naming and listing
*/

import { sONOFF, deviceDiagnostics, cmdFile } from '../sharedVARs.js';
import { updateDeviceInCmdFile } from './cmdFileManager.mjs';

export class DeviceManagement {
    /**
     * Assign alias to device
     */
    static nameDevice(deviceID, alias, deviceIDMap) {
        // Store in memory
        sONOFF[deviceID] = sONOFF[deviceID] || {};
        sONOFF[deviceID]['alias'] = alias;
        sONOFF[deviceID].state = sONOFF[deviceID].state || 'OFFLINE';
        sONOFF[deviceID]['isOnline'] = sONOFF[deviceID]['isOnline'] || false;
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
     * List devices with optional filter
     */
    static listDevices(filter = 'online', client) {
        const filterLower = filter.toLowerCase();
        
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
                    condition = sONOFF[devID].state === 'off';
                    break;
                case 'on':
                    condition = sONOFF[devID].state === 'on';
                    break;
                case 'all':
                    condition = true;
                    break;
                default:
                    throw new Error('ERROR: list command can be with the following filters ONLINE | OFFLINE | ON | OFF | ALL');
            }

            if (condition) {
                const id = 'ID: ' + devID;
                const alias = 'alias: ' + sONOFF[devID].alias;
                
                // Enhanced state display
                let stateDisplay = 'state: ';
                if (sONOFF[devID].isOnline) {
                    if (sONOFF[devID].cloudConnected) {
                        stateDisplay += (sONOFF[devID].state || 'unknown').toUpperCase();
                    } else {
                        stateDisplay += (sONOFF[devID].state || 'unknown').toUpperCase() + '-NO-CLOUD';
                    }
                } else {
                    stateDisplay += 'OFFLINE';
                }
                const state = stateDisplay;
                
                // Add MAC and IP if available
                let mac = 'MAC: N/A';
                let ip = 'IP: N/A';
                if (deviceDiagnostics[devID]) {
                    const macAddr = deviceDiagnostics[devID].lastWebSocketSuccessMAC || 
                                   deviceDiagnostics[devID].lastDispatchMAC;
                    const ipAddr = deviceDiagnostics[devID].lastWebSocketSuccessIP || 
                                  deviceDiagnostics[devID].lastDispatchIP;
                    if (macAddr) mac = 'MAC: ' + macAddr;
                    if (ipAddr) ip = 'IP: ' + ipAddr.replace('::ffff:', '');
                }
            
                const columnWidth = 25;
            
                const formattedID = id.padEnd(columnWidth, ' ');
                const formattedAlias = alias.padEnd(columnWidth, ' ');
                const formattedState = state.padEnd(columnWidth, ' ');
                const formattedMAC = mac.padEnd(columnWidth, ' ');
                const formattedIP = ip.padEnd(columnWidth, ' ');
            
                const line = formattedID + formattedAlias + formattedState + formattedMAC + formattedIP;
                console.log(line);
                if (client) client.write(line + '\r\n');
            }
        });
    }
}
