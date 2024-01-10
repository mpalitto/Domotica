/*
Author: Matteo Palitto
Date: January 9, 2024
Description: sONOFFserver.mjs
*/
 
// This code constructs a server tailored for the sONOFF devices, 
// replicating the functionality of the eWeLink Cloud server it aims to supplant. 
// The sONOFF devices operate unaware of their disconnection from the original Cloud server, 
// eliminating the need for firmware updates that other solution require.
// This solution facilitates local management of the sONOFF switches, enabling direct command transmission 
// without relying on the Cloud Server or the eWeLink phone APP.

// This Local Server operates independently or in tandem with the Cloud Proxy module. 
// When used alongside the Cloud Proxy, it ensures continuous connectivity to the Cloud eWeLink Server and APP, 
// provided an internet connection is available.

// The code establishes an HTTPS server integrated with SSL/TLS configuration, manages incoming HTTPS requests, 
// and initializes a WebSocket server to handle connections specifically with the sONOFF devices.

// It exports an object named sONOFFserver containing functions responsible for relaying messages to the devices 
// and monitoring their online status via WebSocket connections.

// This code facilitates seamless communication with the devices, dynamically updating their status based on incoming messages, 
// and implements mechanisms to monitor device activity, ensuring their online presence through WebSocket timeouts.

// Prerequisites:
// 1. Each sONOFF device must be pre-configured to connect to the cloud server.
// 2. Each sONOFF device should be linked to an access point, 
//    allowing the redirection of packets originating from the WiFi interface to a designated local IP address and port. 
//    This code will listen for these redirected packets at that specific IP address and port.

// When a sONOFF device is powered on it starts a 4 phases registration process:

// 1. DISPATCH
// 2. WEBSOCKET
// 3. REGISTRATION
// 4. COMMANDS

// PHASE 1: DISPATCH sONOFF send a POST HTTPS request to eu-disp.coolkit.cc 
//          from which receives the IP and PORT for the WebSocket (WS) server.

// PHASE 2: Establish WS connection according to the websocket standard.

// PHASE 3: REGISTRATION Once the WS is established, a sequence of WS messages are exchanged to register the sONOFF device 
//          with the server (see above link for details)

// PHASE 4: COMMANDS in this state the sONOFF device is waiting for commands from server, and sending periodic state updates.


// imports from thrid party libraries
import { createServer } from 'https';
import { readFileSync } from 'fs';
import { WebSocketServer } from 'ws';

// imports from sub-modules
import { handleHttpRequest, handleWebSocketConnection } from './requestHandler.mjs';
import { sONOFF, reAPIkey, proxyAPIKey } from './sharedVARs.js';

// Disabling TLS rejection for testing purposes
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

// SSL/TLS configuration
const options = {
  secureProtocol: "TLS_method",
  ciphers: "DEFAULT:@SECLEVEL=0",
  key: readFileSync('/root/WS/tls/matteo-key.pem'),
  cert: readFileSync('/root/WS/tls/matteo-cert.pem'),
};

// Create HTTPS server
const server = createServer(options);
// Handling HTTPS requests
server.on('request', handleHttpRequest);

// Web Socket Server
const wss = new WebSocketServer({ server });
function heartbeat() {
  this.isAlive = true;
}

// Handling WebSocket connections
wss.on('connection', (ws, req) => handleWebSocketConnection(ws, req));

// Start the server
server.listen(8888, '192.168.200.1', () => {
  console.log('HTTPS server listening on port 8888');
});

import { cmdSocket } from './cmd.mjs';
cmdSocket();

export const sONOFFserver = {
  forward2device: (devID, message) => {
    let device = sONOFF[devID]; // get relay information

    if (device.conn && device.conn.ws) {
      console.log('forwarding to device: ' + message);
      let msgObj = JSON.parse(message);
      if(msgObj['action'] == 'update') {
        sONOFF[msgObj['deviceid']]['state'] = msgObj['params']['switch'];
      }
      device.conn.ws.send(message.replace(reAPIkey, 'apikey":"' + proxyAPIKey + '"'));
    }
  },

  checkinDeviceOnLine: (deviceid) => {
    
    let ws = sONOFF[deviceid]['conn']['ws'];
    // Close connection if more than 30 secs from last PING
    // Clear existing timeout if it exists
    if (ws['wsTimeout']) {
      clearTimeout(ws['wsTimeout']);
    }

    // Set a new timeout for 30 seconds
    ws['wsTimeout'] = setTimeout(() => {
      console.log('\n\n----------------------------------------------------');
      console.log('-- WebSocket connection closed due to inactivity. --');
      console.log('-----------         for: ' + ws['deviceid'] + '      -----------');
      console.log('----------------------------------------------------\n\n');
      ws.terminate(); // Close the WebSocket connection
    }, 30000); // 30 seconds in milliseconds

    console.log('\n\nwsTimeout started for device: ' + ws['deviceid'])

  }
};