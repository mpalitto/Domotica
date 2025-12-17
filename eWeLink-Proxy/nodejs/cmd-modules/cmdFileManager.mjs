/*
Author: Matteo Palitto
Date: January 9, 2024 (Updated)

Description: cmdFileManager.mjs
Manages the sONOFF.cmd file for device persistence
NOW STORES: DeviceID, Alias, MAC, IP, APIKey, LastSeen, FirstSeen
*/

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { cmdFile } from '../sharedVARs.js';

/**
 * Parse a command line from the cmd file
 * Returns device object or null
 */
export function parseCmdLine(line) {
    if (!line || line.trim() === '' || line.trim().startsWith('#')) {
        return null;
    }
    
    const parts = line.split('|').map(p => p.trim());
    
    if (parts.length < 2) {
        return null; // Invalid line
    }
    
    return {
        deviceID: parts[0] || null,
        alias: parts[1] || null,
        mac: parts[2] || null,
        ip: parts[3] || null,
        apikey: parts[4] || null,
        lastSeen: parts[5] || null,
        firstSeen: parts[6] || new Date().toISOString()
    };
}

/**
 * Load all devices from sONOFF.cmd file
 */
export function loadDevicesFromFile() {
    if (!existsSync(cmdFile)) {
        console.log('ℹ️  No cmd file found, will create on first device registration');
        return [];
    }
    
    try {
        const data = readFileSync(cmdFile, 'utf8');
        const lines = data.split('\n');
        
        const devices = [];
        for (const line of lines) {
            const device = parseCmdLine(line);
            if (device && device.deviceID) {
                devices.push(device);
            }
        }
        
        return devices;
    } catch (err) {
        console.error('❌ Error reading cmd file:', err.message);
        return [];
    }
}

/**
 * Save devices to sONOFF.cmd file
 */
export function saveDevicesToFile(devices) {
    try {
        // Sort by alias for easier reading
        devices.sort((a, b) => (a.alias || '').localeCompare(b.alias || ''));
        
        const header = `# Sonoff Device List
# Format: DeviceID | Alias | MAC | IP | APIKey | LastSeen | FirstSeen
# Lines starting with # are comments
#
`;
        
        const lines = devices.map(d => 
            `${d.deviceID}|${d.alias || ''}|${d.mac || ''}|${d.ip || ''}|${d.apikey || ''}|${d.lastSeen || ''}|${d.firstSeen || ''}`
        );
        
        writeFileSync(cmdFile, header + lines.join('\n') + '\n', 'utf8');
        
        if (process.env.VERBOSE_LOGGING === 'true') {
            console.log(`💾 Saved ${devices.length} devices to cmd file`);
        }
    } catch (err) {
        console.error('❌ Error writing cmd file:', err.message);
    }
}

/**
 * Get a specific device from cmd file
 */
export function getDeviceFromCmdFile(deviceID) {
    const devices = loadDevicesFromFile();
    return devices.find(d => d.deviceID === deviceID);
}

/**
 * Update device information in the sONOFF.cmd file
 * Now includes apikey storage
 */
export function updateDeviceInCmdFile(deviceID, alias, mac = null, ip = null, apikey = null) {
    const devices = loadDevicesFromFile();
    
    // Find existing device or create new entry
    let device = devices.find(d => d.deviceID === deviceID);
    
    if (!device) {
        // New device
        device = {
            deviceID: deviceID,
            alias: alias || `new-${deviceID}`,
            mac: mac || null,
            ip: ip || null,
            apikey: apikey || null,
            lastSeen: new Date().toISOString(),
            firstSeen: new Date().toISOString()
        };
        devices.push(device);
        console.log(`📝 Added new device to cmd file: ${deviceID} "${alias}"`);
    } else {
        // Update existing device
        let updated = false;
        
        if (alias && alias !== device.alias) {
            console.log(`📝 Updated alias: ${deviceID} "${device.alias}" → "${alias}"`);
            device.alias = alias;
            updated = true;
        }
        if (mac && mac !== device.mac) {
            console.log(`📝 Updated MAC: ${deviceID} ${device.mac || 'none'} → ${mac}`);
            device.mac = mac;
            updated = true;
        }
        if (ip && ip !== device.ip) {
            if (device.ip && device.ip !== ip) {
                console.log(`📝 Updated IP: ${deviceID} ${device.ip} → ${ip}`);
            }
            device.ip = ip;
            updated = true;
        }
        if (apikey && apikey !== device.apikey) {
            if (!device.apikey) {
                console.log(`📝 Stored apikey for ${deviceID} (${apikey.substring(0, 8)}...)`);
            } else if (device.apikey !== apikey) {
                console.log(`📝 Updated apikey for ${deviceID} (${apikey.substring(0, 8)}...)`);
            }
            device.apikey = apikey;
            updated = true;
        }
        
        device.lastSeen = new Date().toISOString();
    }
    
    saveDevicesToFile(devices);
}

/**
 * Check if device has complete information in cmd file
 * Returns {complete: boolean, missing: string[], device: object}
 */
export function checkDeviceCompleteness(deviceID) {
    const device = getDeviceFromCmdFile(deviceID);
    
    if (!device) {
        return { 
            complete: false, 
            missing: ['all - device not in file'],
            device: null
        };
    }
    
    const missing = [];
    
    if (!device.apikey) missing.push('apikey');
    if (!device.mac) missing.push('MAC');
    if (!device.ip) missing.push('IP');
    
    return {
        complete: missing.length === 0,
        missing: missing,
        device: device
    };
}

/**
 * Remove a device from cmd file
 */
export function removeDeviceFromCmdFile(deviceID) {
    const devices = loadDevicesFromFile();
    const filteredDevices = devices.filter(d => d.deviceID !== deviceID);
    
    if (filteredDevices.length < devices.length) {
        saveDevicesToFile(filteredDevices);
        console.log(`🗑️  Removed ${deviceID} from cmd file`);
        return true;
    }
    
    return false;
}

/**
 * Rename a device in cmd file
 */
export function renameDeviceInCmdFile(deviceID, newAlias) {
    const devices = loadDevicesFromFile();
    const device = devices.find(d => d.deviceID === deviceID);
    
    if (device) {
        const oldAlias = device.alias;
        device.alias = newAlias;
        device.lastSeen = new Date().toISOString();
        saveDevicesToFile(devices);
        console.log(`✏️  Renamed ${deviceID}: "${oldAlias}" → "${newAlias}"`);
        return true;
    }
    
    console.log(`⚠️  Device ${deviceID} not found in cmd file`);
    return false;
}

/**
 * Get all devices from cmd file
 */
export function getAllDevicesFromCmdFile() {
    return loadDevicesFromFile();
}

/**
 * Get device count
 */
export function getDeviceCount() {
    return loadDevicesFromFile().length;
}

/**
 * Check if device exists in cmd file
 */
export function deviceExistsInCmdFile(deviceID) {
    const device = getDeviceFromCmdFile(deviceID);
    return device !== null && device !== undefined;
}

/**
 * Get devices by filter
 */
export function getDevicesByFilter(filterFn) {
    const devices = loadDevicesFromFile();
    return devices.filter(filterFn);
}

/**
 * Get devices missing apikey
 */
export function getDevicesMissingApiKey() {
    return getDevicesByFilter(d => !d.apikey);
}

/**
 * Get devices missing MAC address
 */
export function getDevicesMissingMAC() {
    return getDevicesByFilter(d => !d.mac);
}

/**
 * Print device summary
 */
export function printDeviceSummary() {
    const devices = loadDevicesFromFile();
    
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`📋 DEVICE SUMMARY FROM CMD FILE`);
    console.log(`${'═'.repeat(80)}`);
    console.log(`Total devices: ${devices.length}`);
    
    const missingApiKey = devices.filter(d => !d.apikey).length;
    const missingMAC = devices.filter(d => !d.mac).length;
    const complete = devices.filter(d => d.apikey && d.mac && d.ip).length;
    
    console.log(`Complete data: ${complete}`);
    console.log(`Missing APIKey: ${missingApiKey}`);
    console.log(`Missing MAC: ${missingMAC}`);
    
    if (devices.length > 0) {
        console.log(`\nDevices:`);
        devices.forEach(d => {
            const status = (d.apikey && d.mac && d.ip) ? '✅' : '⚠️';
            const missing = [];
            if (!d.apikey) missing.push('apikey');
            if (!d.mac) missing.push('MAC');
            if (!d.ip) missing.push('IP');
            
            console.log(`  ${status} ${d.deviceID} "${d.alias}"`);
            if (missing.length > 0) {
                console.log(`     Missing: ${missing.join(', ')}`);
            }
        });
    }
    
    console.log(`${'═'.repeat(80)}\n`);
}
