import { createServer } from 'https';
import { readFileSync } from 'fs';
import { WebSocketServer } from 'ws';
import { handleHttpRequest, handleWebSocketConnection } from './requestHandler.mjs';
import { sONOFF, reAPIkey, proxyEvent, proxyAPIKey } from './sharedVARs.js';

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