/*
Author: Matteo Palitto
Date: January 9, 2024

Description: deviceCommands.mjs
Handles device-specific commands (switch, kick, debug)
*/

import { sONOFF, proxyAPIKey, proxyEvent, deviceStats } from '../sharedVARs.js';

export class DeviceCommands {
    /**
     * Switch device on/off
     */
    static switchDevice(deviceID, state, client = null) {
        const toState = state.toLowerCase();
        const permittedSet = ['on', 'off'];
        
        if (!permittedSet.includes(toState)) {
            throw new Error('ERROR: switch device can handle only "on|off"');
        }

        const device = sONOFF[deviceID];
        if (!device) {
            throw new Error(`ERROR: device ${deviceID} not found`);
        }

        if (!device.conn || !device.conn.ws) {
            throw new Error(`ERROR: device ${deviceID} is not online`);
        }

        const now = new Date().getTime();
        const ONOFFmessage = JSON.stringify({
            action: "update",
            deviceid: deviceID,
            apikey: proxyAPIKey,
            userAgent: "app",
            sequence: String(now),
            ts: 0,
            params: { switch: toState },
            from: "app"
        });

        device.state = toState;
        console.log('sending to device: ' + ONOFFmessage);
        
        // Increment CMD sent counter
        if (deviceStats[deviceID]) {
            deviceStats[deviceID].CMD_SENT++;
        }
        
        device.conn.ws.send(ONOFFmessage);
        
        // Send update message to Cloud
        const cloudMessage = JSON.stringify({
            action: "update",
            deviceid: deviceID,
            apikey: proxyAPIKey,
            userAgent: "device",
            sequence: String(now),
            ts: 0,
            params: { switch: toState },
            from: "app"
        });
        
        proxyEvent.emit('messageFromCMD', deviceID, cloudMessage);
        
        if (client) {
            client.write(`Device ${deviceID} switched ${toState}\r\n`);
        }
    }

    /**
     * Kick device (force reconnection)
     */
    static kickDevice(deviceID, client = null) {
        if (!sONOFF[deviceID]) {
            const error = `ERROR: device ${deviceID} not found`;
            console.log(error);
            if (client) client.write(error + '\r\n');
            return;
        }
        
        console.log(`Kicking device: ${deviceID} (${sONOFF[deviceID].alias})`);
        
        // Close device connection
        if (sONOFF[deviceID].conn && sONOFF[deviceID].conn.ws) {
            console.log('Closing WebSocket connection...');
            sONOFF[deviceID].conn.ws.terminate();
            if (client) client.write('Device connection terminated\r\n');
        } else {
            console.log('No active connection to close');
            if (client) client.write('No active connection\r\n');
        }
        
        // Close cloud connection
        proxyEvent.emit('proxy2deviceConnectionClosed', deviceID);
        
        console.log('Device kicked. It should reconnect automatically.');
        if (client) client.write('Device will reconnect shortly\r\n');
    }

    /**
     * Show debug information for device
     */
    static debugDevice(deviceID, client = null) {
        if (!sONOFF[deviceID]) {
            const error = `ERROR: device ${deviceID} not in sONOFF object`;
            console.log(error);
            if (client) client.write(error + '\r\n');
            return;
        }
        
        console.log('DEBUG INFO for device:', deviceID);
        console.log(JSON.stringify(sONOFF[deviceID], null, 2));
        
        if (client) {
            client.write(`Device: ${deviceID}\r\n`);
            client.write(JSON.stringify(sONOFF[deviceID], null, 2) + '\r\n');
        }
    }
}
