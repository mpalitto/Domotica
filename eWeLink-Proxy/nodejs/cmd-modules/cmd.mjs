/*
Author: Matteo Palitto
Date: January 9, 2024

Description: cmd.mjs
Simplified command socket orchestration layer

commandParser.mjs    - Parse command strings
deviceCommands.mjs   - Device control (switch, kick, debug)
deviceManagement.mjs - Device naming and listing
statsCommands.mjs    - Statistics and diagnostics display
deviceLoader.mjs     - Load devices from file
commandRouter.mjs    - Route commands to handlers
*/

import net from 'net';
import { DeviceLoader } from './deviceLoader.mjs';
import { CommandRouter } from './commandRouter.mjs';

export function cmdSocket() {
    // Store device ID by alias mapping
    const deviceIDMap = {};

    // Load devices from file
    DeviceLoader.loadDevices(deviceIDMap);

    // Create TCP server
    const cmdSocketServer = net.createServer(function (client) {
        console.log('Client connect. Client local address : ' + 
                    client.localAddress + ':' + client.localPort + 
                    '. client remote address : ' + 
                    client.remoteAddress + ':' + client.remotePort);
        
        client.setEncoding('utf-8');

        // When receive client data
        client.on('data', function (data) {
            CommandRouter.execute(data, deviceIDMap, client);
        });

        // When client disconnects
        client.on('end', function () {
            console.log('Client disconnect.');
            cmdSocketServer.getConnections(function (err, count) {
                if (!err) {
                    console.log("There are %d connections now. ", count);
                } else {
                    console.error(JSON.stringify(err));
                }
            });
        });

        // When client timeout
        client.on('timeout', function () {
            console.log('Client request time out.');
        });
    });

    // Listen on port 9999
    cmdSocketServer.listen(9999, function () {
        console.log('listening CMD on port 9999');

        const serverInfo = cmdSocketServer.address();
        const serverInfoJson = JSON.stringify(serverInfo);
        console.log('TCP server listening on address : ' + serverInfoJson);

        cmdSocketServer.on('close', function () {
            console.log('TCP server socket is closed.');
        });

        cmdSocketServer.on('error', function (error) {
            console.error(JSON.stringify(error));
        });
    });
}
