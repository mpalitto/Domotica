// The code interact with  sONOFF service (sONOFFserver) based on the received commands ('switch', 'name', 'list', etc.). 
// The commands control sONOFF switches, update their states, and manage aliases for these devices.

// The alises are entered by operator using the sONOFF.cmd file
// follow an example of cmd file
// name 100003ac56 powerSW-loudary # washing machine switch with power meter 
// name 1000024c89 dining # dining light in the living room
// name 1000024cfd master-bath # master bathroom light
// name 1000024e09 new-ae6be48c-ff69-4da9-875d-1f992631b3e9 # new switch with no alias assigned yet
//
// NOTE: in the future I would like to implement other commands:
// timers for automatic on and off
// lights turning on and off to simulate someone is home
// groups, define groups of light to turn on or off with a single command
// ...

// Import net module.
import net from 'net';
import readline from 'readline';
import { createReadStream, existsSync, writeFile } from 'fs';
import { sONOFF, cmdFile, proxyAPIKey, proxyEvent } from './sharedVARs.js';

export function cmdSocket() {
    var re = /\s*(?: |\n)\s*/;
    var deviceID = {}; // stores sONOFF deviceID given its alias 

    // parseCMD can be called to execute commands 
    // 1. from file in which case client will be null
    // 2. from client connecting to the cmd socket
    const parseCMD = function (client, str) {
        var args = str.split(re);    // convert the spaced words in an array
        var cmd = args.shift();      // the 1st word is the command name, which gets assigned and removed from array
        console.log('CMD: ' + cmd);
        console.log('ARGs: ' + args);
        let devID = args[0];
        if (deviceID[devID]) devID = deviceID[devID]; // In the case its an ALIAS get the device ID so that any of ID or alias can be used to refer to switch device
        // else if (! sONOFF[devID]) { console.log('ERROR: device: ' + devID + ' not Found'); return 0}

        if (cmd === '?') { // New block for handling the '?' command
            client.write('Available commands and their syntax:\r\n');
            client.write('switch <deviceID|alias> <on|off>: Switches the device on or off.\r\n');
            client.write('name <deviceID> <devAlias>: Assigns an alias to a device.\r\n');
            client.write('list [online|offline|on|off|all]: Lists devices based on status filters.\r\n');
            client.write('? : Lists all available commands and their syntax.\r\n');
            return; // End execution after displaying available commands
        } else if (cmd == 'switch') { // switch deviceID|alias on/off
            let toState = args[1].toLowerCase(); //either 'on' or 'off'
            const permittedSet = ['on', 'off'];
            if (!permittedSet.includes(toState)) { throw new Error('ERROR: switch device can handle only "on|off"'); return 0 }
            let now = new Date().getTime(); // is the time in secs and it is used as a sequence number
            let device = sONOFF[devID]; // get relay information
            if (device.conn && device.conn.ws) {
                let ONOFFmessage = '{"action":"update","deviceid":"' + devID + '","apikey":"' + proxyAPIKey + '","userAgent":"app","sequence":"' + now + '","ts":0,"params":{"switch":"' + toState + '"},"from":"app"}';
                device.state = toState;
                console.log('sending to device: ' + ONOFFmessage);
                device.conn.ws.send(ONOFFmessage); // send cmd to device
                ONOFFmessage = '{"action":"update","deviceid":"' + devID + '","apikey":"' + proxyAPIKey + '","userAgent":"device","sequence":"' + now + '","ts":0,"params":{"switch":"' + toState + '"},"from":"app"}';
                proxyEvent.emit('messageFromCMD', devID, ONOFFmessage); // send update message to Cloud
            } else { console.log('ERROR: device: ' + devID + ' is not online'); return 0 }

        } else if (cmd == 'name') { //cmd[0] = device ID, cmd[1] = device name (alias)
            let devAlias = args[1];
            // giving a name to a sONOFF device for human readability and easy of use
            // name will be given editing a file and inserting the cmd: 'name devID devName' on each line for each device
            // if a device is detected and does not have a name, a new line will be appended to the file with 'new- + devID' as a name
            // by editing the file and replacing the default name with a proper devName will allow to use its name instead of devID 4 the switch command
            sONOFF[devID] = sONOFF[devID] || {};    // if does not yet exist, create a new object for device 
            sONOFF[devID]['alias'] = devAlias;      // store assigned alias 
            sONOFF[devID].state = 'OFFLINE';        // device initially is OFFLINE
            sONOFF[devID]['isOnline'] = false;
            deviceID[devAlias] = devID; // store device ID given the name/alias for use with user commands
            // check if a new device hasnt been named yet
            const first4Chars = devAlias.slice(0, 4);
            if (first4Chars === 'new-') console.log('WARNING: device ' + devID + ' needs you to give a nice name. Please do it by edinting the file: ' + cmdFile)

        } else if (client && cmd == 'list') { // list command can be with the following filters ONLINE | OFFLINE | ON | OFF | ALL
            const filter = args[0].toLowerCase() || 'online';
            Object.keys(sONOFF).forEach(function (devID) {
                let condition = false;
                switch (filter) {
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
                        return 0;
                        break;
                }
                if (condition) {
                    const id = 'ID: ' + devID;
                    const alias = 'alias: ' + sONOFF[devID].alias;
                    const state = 'state: ' + (sONOFF[devID].state || 'OFFLINE');

                    const columnWidth = 25; // Adjust this value as needed for your layout

                    const formattedID = id.padEnd(columnWidth, ' ');
                    const formattedAlias = alias.padEnd(columnWidth, ' ');
                    const formattedState = state.padEnd(columnWidth, ' ');

                    console.log(formattedID + formattedAlias + formattedState);
                    client.write(formattedID + formattedAlias + formattedState + '\r\n');
                }
            });
        } else {
            console.log('WARNING: command not found: ' + cmd);
        }
    }

    // Create and return a net.Server object, the function will be invoked when client connect to this server.
    var cmdSocket = net.createServer(function (client) {

        console.log('Client connect. Client local address : ' + client.localAddress + ':' + client.localPort + '. client remote address : ' + client.remoteAddress + ':' + client.remotePort);

        client.setEncoding('utf-8');
        // client.write('Welcome! send a command\r\n');
        // client.write('Example sendig command: echo "switch dining OFF" | nc -w 1 localhost 9999\r\n');
        // client.write('Example sendig command: sonoff: switch dining OFF\r\n'); // should be implemented in the run.sh file

        // client.setTimeout(1000);

        // When receive client data.
        client.on('data', function (data) {

            // Print received client data and length.
            // console.log('Received client data : ' + data + ', data size : ' + client.bytesRead);

            // Server send data back to client use client net.Socket object.
            // client.end('Server received data : ' + data + ', send back to client data size : ' + client.bytesWritten);
            try {
                parseCMD(client, data);
            } catch (error) {
                client.write(error.message + '\r\n');
                // Handle the error here
            }
        });

        // When client send data complete.
        client.on('end', function () {
            console.log('Client disconnect.');

            // Get current connections count.
            cmdSocket.getConnections(function (err, count) {
                if (!err) {
                    // Print current connection count in server console.
                    console.log("There are %d connections now. ", count);
                } else {
                    console.error(JSON.stringify(err));
                }

            });
        });

        // When client timeout.
        client.on('timeout', function () {
            console.log('Client request time out. ');
        })
    });

    forEachLine(cmdFile, (lineFromFile) => parseCMD(null, lineFromFile));

    // Usage: Call forEachLine with the file path and the parseLine function
    function forEachLine(filePath, callback) {
        if (existsSync(filePath)) {
            let lineReader = readline.createInterface({
                input: createReadStream(filePath)
            });

            lineReader.on('line', function (line) {
                callback(line);
            });
        } else {
            // If the file doesn't exist, create a new file (for example, an empty file)
            writeFile(filePath, '', (err) => {
                if (err) {
                    console.error('Error creating file:', err);
                } else {
                    console.log('New file created:', filePath);
                    // Now you could create a new readline interface or perform other operations with the new file
                }
            });
        }
    }

    //Make the server a TCP server listening on port 9999.
    cmdSocket.listen(9999, function () {
        console.log('listening CMD on port 9999');

        // Get server address info.
        var serverInfo = cmdSocket.address();

        var serverInfoJson = JSON.stringify(serverInfo);

        console.log('TCP server listening on address : ' + serverInfoJson);

        cmdSocket.on('close', function () {
            console.log('TCP server socket is closed.');
        });

        cmdSocket.on('error', function (error) {
            console.error(JSON.stringify(error));
        });

    });
}