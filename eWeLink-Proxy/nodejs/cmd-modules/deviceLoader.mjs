/*
Author: Matteo Palitto
Date: January 9, 2024

Description: deviceLoader.mjs
Loads devices from the cmd file on startup
*/

import readline from 'readline';
import { createReadStream, existsSync } from 'fs';
import { sONOFF, deviceDiagnostics, cmdFile } from '../sharedVARs.js';
import { parseCmdLine } from './cmdFileManager.mjs';
import { initDeviceDiagnostics } from '../requestHandler-modules/requestHandler.mjs';

export class DeviceLoader {
    /**
     * Load devices from cmd file
     */
    static loadDevices(deviceIDMap) {
        this.#forEachLine(cmdFile, (lineFromFile) => {
            const parsed = parseCmdLine(lineFromFile);
            if (parsed) {
                // Initialize device in memory
                sONOFF[parsed.deviceID] = sONOFF[parsed.deviceID] || {};
                sONOFF[parsed.deviceID]['alias'] = parsed.alias;
                sONOFF[parsed.deviceID].state = sONOFF[parsed.deviceID].state || 'OFFLINE';
                sONOFF[parsed.deviceID]['isOnline'] = false;
                deviceIDMap[parsed.alias] = parsed.deviceID;
                
                // Initialize diagnostics if we have MAC/IP from file
                if (parsed.mac || parsed.ip) {
                    initDeviceDiagnostics(parsed.deviceID);
                    
                    // Store historical MAC/IP from file
                    if (parsed.mac && !deviceDiagnostics[parsed.deviceID].lastDispatchMAC) {
                        deviceDiagnostics[parsed.deviceID].lastDispatchMAC = parsed.mac;
                    }
                    if (parsed.ip && !deviceDiagnostics[parsed.deviceID].lastDispatchIP) {
                        deviceDiagnostics[parsed.deviceID].lastDispatchIP = parsed.ip;
                    }
                }
                
                const first4Chars = parsed.alias.slice(0, 4);
                if (first4Chars === 'new-') {
                    console.log('WARNING: device ' + parsed.deviceID + ' needs a proper name. Edit: ' + cmdFile);
                }
            }
        });
    }

    /**
     * Process each line of a file
     */
    static #forEachLine(filePath, callback) {
        if (existsSync(filePath)) {
            let lineReader = readline.createInterface({
                input: createReadStream(filePath)
            });

            lineReader.on('line', function (line) {
                callback(line);
            });
        } else {
            console.log('sONOFF.cmd file not found - will be created when devices connect');
        }
    }
}
