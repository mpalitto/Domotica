/*
Author: Matteo Palitto
Date: January 9, 2024

Description: requestHandler.mjs
This module handles HTTP and WebSocket requests.
It exports 2 functions: handleHttpRequest, and handleWebSocketConnection.
1. handleHttpRequest replies to the device request for where to find WS Server (DISPATCH request)
   by providing WS Server and Port
2. handleWebSocketConnection handles the device registration process.

all the device informations including connection are stored within the sONOFF object
*/

// Importing the handleMessage function from the messageHandler module
import { handleMessage } from './messageHandler.mjs';
import { PROXY_PORT, PROXY_IP, proxyEvent, sONOFF, dispatch } from './sharedVARs.js'

// Function to handle HTTP requests
export function handleHttpRequest(req, res) {
    console.log('HTTPS request received:', req.method, req.url);

    // Checking if the request is a POST request to '/dispatch/device'
    if (req.method === 'POST' && req.url === '/dispatch/device') {
        console.log('DISPATCH DEVICE request received...');
        // Handling the dispatch request
        handleDispatchRequest(req, res, true);
    } else {
        // Responding with a 404 status code for other requests
        res.statusCode = 404;
        res.end('HTTPS request processed');
    }
}

// Function to handle the dispatch request
function handleDispatchRequest(req, res, secure) {
    // Variables to store request data
    let bodyChunks = [];
    let msg = '';
    let deviceID = '';

    // Handling request events
    req.on('error', console.error)
        .on('data', (chunk) => bodyChunks.push(chunk))
        .on('end', () => {
            console.log('DATA has been received');
            // Concatenating received chunks and converting to a string
            msg = Buffer.concat(bodyChunks).toString();
            console.log(msg);

            try {
                // Parsing the received JSON message
                const device = JSON.parse(msg);
                deviceID = device['deviceid'];
                // Storing dispatch information using the device ID as the key
                dispatch[deviceID] = msg;
                // Sending a reply to the client
                sendReply(res);
            } catch (error) {
                // Handling JSON parse errors
                console.error(error);
                res.statusCode = 400;
                res.end();
            }
        });

    // A predefined response message
    // const response = '{"port":8888,"reason":"ok","IP":"192.168.1.11","error":0}';
   const response = JSON.stringify({
     port: PROXY_PORT,
     reason: "ok",
     IP: PROXY_IP,
     error: 0
   });


    // Function to send a reply to the client
    function sendReply(res) {
        console.log('SENDING reply');
        res.writeHead(200, 'OK', {
            'server': 'openresty',
            'date': 'today',
            'Content-Type': 'application/json',
            'content-length': Buffer.byteLength(response, 'utf8'),
            'connection': 'close',
        });
        res.end(response, 'utf8');
    }
}

// Function to handle WebSocket connections
export function handleWebSocketConnection(ws, req) {
    let deviceIP = req.connection.remoteAddress;
    ws['IP'] = deviceIP;
    console.log('New WebSocket connection from:', ws['IP']);

    // this section implements ping-pong between server and client 
    // client sends PING every < 140s
    // WS automatically sends PONG as response

    let prevPingTime = Date.now();
    let wsTimeout = null;

    ws.on('ping', () => { // we've received a PING request
        const currentTime = Date.now();
        const timeDifference = (currentTime - prevPingTime) / 1000; // Convert milliseconds to seconds
        //console.log(`PING received from ${connectionId}: Time between pings: ${timeDifference} secs`);
        prevPingTime = currentTime;
        //console.log('\nemitting event pingReceived from device: ' + ws['deviceid']);
        proxyEvent.emit('pingReceived',ws['deviceid'])
    });

    // this section handels other regular socket's events
      
    // Setting up the WebSocket for message handling
    handleMessage.setWebSocket(ws, deviceIP);

    // Handling WebSocket errors
    ws.on('error', () => {
        console.log('device WS ERROR');
        console.error('WS ERROR for: ' + ws['deviceid']);
        proxyEvent.emit('proxy2deviceConnectionClosed', ws['deviceid'])
        ws.terminate();
    });

    // Handling incoming WebSocket messages using the handleMessage.msgInit function
    let connectionId = null;
    ws.on('message', (buffer) => {connectionId = handleMessage.msgInit(buffer, ws);});

    ws.on('close', ()=>{
        // Find the corresponding ID for the closing WebSocket connection
        //const connectionId = Object.keys(sONOFF).find(key => sONOFF[key].conn && sONOFF[key].conn.ws === ws);

        if (connectionId) {
            console.log('Connection closed for ID:', connectionId, ' device is now OFFLINE');
            delete sONOFF[connectionId].conn; // Remove the closed connection
            sONOFF[connectionId].state = 'OFFLINE';
            sONOFF[connectionId]['isOnline'] = false;
        } else {
            console.log('Connection closed, but no matching connectionId found.');
        }

        proxyEvent.emit('proxy2deviceConnectionClosed', ws['deviceid'])
     });

}
