/*
Author: Matteo Palitto
Date: January 9, 2024

Description: cmdFileManager.mjs
Manages the sONOFF.cmd file with device information including MAC and IP addresses
*/

import { readFileSync, writeFileSync } from 'fs';
import { cmdFile } from '../sharedVARs.js';

// Parse a line from the cmd file
// Format: name <deviceID> <alias> # MAC: <mac> IP: <ip> Last-seen: <timestamp>
function parseCmdLine(line) {
    // Skip empty lines and pure comments
    if (!line.trim() || line.trim().startsWith('#')) {
        return null;
    }
    
    // Split on # to separate command from metadata
    const parts = line.split('#');
    const commandPart = parts[0].trim();
    const metadataPart = parts[1] ? parts[1].trim() : '';
    
    // Parse command part: name <deviceID> <alias>
    const commandTokens = commandPart.split(/\s+/);
    if (commandTokens[0] !== 'name' || commandTokens.length < 3) {
        return null; // Not a valid name command
    }
    
    const deviceID = commandTokens[1];
    const alias = commandTokens[2];
    
    // Parse metadata part
    let mac = null;
    let ip = null;
    let lastSeen = null;
    
    if (metadataPart) {
        const macMatch = metadataPart.match(/MAC:\s*([0-9a-f:]+)/i);
        const ipMatch = metadataPart.match(/IP:\s*(\d+\.\d+\.\d+\.\d+)/);
        const timeMatch = metadataPart.match(/Last-seen:\s*([^\s]+(?:\s+[^\s]+)?)/);
        
        if (macMatch) mac = macMatch[1].toLowerCase();
        if (ipMatch) ip = ipMatch[1];
        if (timeMatch) lastSeen = timeMatch[1];
    }
    
    return {
        deviceID,
        alias,
        mac,
        ip,
        lastSeen,
        originalLine: line
    };
}

// Format a cmd line with metadata
function formatCmdLine(deviceID, alias, mac = null, ip = null) {
    let line = `name ${deviceID} ${alias}`;
    
    const metadata = [];
    if (mac) metadata.push(`MAC: ${mac}`);
    if (ip) metadata.push(`IP: ${ip}`);
    metadata.push(`Last-seen: ${new Date().toISOString()}`);
    
    if (metadata.length > 0) {
        line += ' # ' + metadata.join(' ');
    }
    
    return line;
}

// Read all devices from cmd file
function readCmdFile() {
    const devices = new Map();
    
    try {
        const content = readFileSync(cmdFile, 'utf8');
        const lines = content.split('\n');
        
        lines.forEach(line => {
            const parsed = parseCmdLine(line);
            if (parsed) {
                devices.set(parsed.deviceID, parsed);
            }
        });
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error('Error reading cmd file:', err);
        }
        // If file doesn't exist, return empty map
    }
    
    return devices;
}

// Write all devices to cmd file
function writeCmdFile(devices) {
    const lines = [];
    
    // Add header comment
    lines.push('# Sonoff Device Configuration');
    lines.push('# Format: name <deviceID> <alias> # MAC: <mac> IP: <ip> Last-seen: <timestamp>');
    lines.push('# Edit the alias to give devices meaningful names');
    lines.push('');
    
    // Sort by alias for easier reading
    const sortedDevices = Array.from(devices.values()).sort((a, b) => {
        return a.alias.localeCompare(b.alias);
    });
    
    sortedDevices.forEach(device => {
        const line = formatCmdLine(device.deviceID, device.alias, device.mac, device.ip);
        lines.push(line);
    });
    
    try {
        writeFileSync(cmdFile, lines.join('\n') + '\n', 'utf8');
        console.log('✅ sONOFF.cmd file updated');
    } catch (err) {
        console.error('❌ Error writing cmd file:', err);
    }
}

// Add or update a device in the cmd file
function updateDeviceInCmdFile(deviceID, alias, mac = null, ip = null) {
    const devices = readCmdFile();
    
    // Check if device exists
    if (devices.has(deviceID)) {
        // Update existing device - PRESERVE existing values when new values are null
        const existing = devices.get(deviceID);
        
        // Only update alias if we have a better one (not "new-" prefix)
        if (alias && !alias.startsWith('new-')) {
            existing.alias = alias;
        }
        // If alias is null or starts with "new-", keep existing alias
        
        // Only update MAC if we have a new value (don't overwrite with null)
        if (mac) {
            existing.mac = mac;
        }
        // Otherwise keep existing MAC value
        
        // Only update IP if we have a new value (don't overwrite with null)
        if (ip) {
            existing.ip = ip;
        }
        // Otherwise keep existing IP value
        
        // Always update last seen timestamp
        existing.lastSeen = new Date().toISOString();
        
        console.log(`📝 Updating device ${deviceID} (${existing.alias}) in cmd file - preserving existing data`);
    } else {
        // Add new device
        devices.set(deviceID, {
            deviceID,
            alias: alias || `new-${deviceID}`,
            mac: mac || null,
            ip: ip || null,
            lastSeen: new Date().toISOString()
        });
        
        console.log(`📝 Adding NEW device ${deviceID} to cmd file`);
    }
    
    writeCmdFile(devices);
}

// Get device info from cmd file
function getDeviceFromCmdFile(deviceID) {
    const devices = readCmdFile();
    return devices.get(deviceID) || null;
}

export {
    parseCmdLine,
    formatCmdLine,
    readCmdFile,
    writeCmdFile,
    updateDeviceInCmdFile,
    getDeviceFromCmdFile
};
