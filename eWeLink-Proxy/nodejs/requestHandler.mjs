/*
  This module handles HTTP and WebSocket requests related to device dispatch.
  It exports 2 functions: handleHttpRequest, and handleWebSocketConnection.
*/

// Importing the handleMessage function from the messageHandler module
import { handleMessage } from './messageHandler.mjs';
import { sONOFF } from './sharedVARs.js'

// A dictionary to store dispatch information using device IDs as keys
const dispatch = {};

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
    const response = '{"port":8888,"reason":"ok","IP":"192.168.200.1","error":0}';

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
    console.log('New WebSocket connection from:', req.connection.remoteAddress);

    // this section implements ping-pong between server and client 
    // client sends PING every < 140s
    // WS automatically sends PONG as response

    let prevPingTime = Date.now();
    let wsTimeout = null;

    ws.on('ping', () => { // we've received a PING request
      const currentTime = Date.now();
      const timeDifference = (currentTime - prevPingTime) / 1000; // Convert milliseconds to seconds
      console.log(`PING received from ${connectionId}: Time between pings: ${timeDifference} secs`);
      prevPingTime = currentTime;
    
      // Close connection if more than 180 secs from last PING
      // Clear existing timeout if it exists
        if (wsTimeout) {
            clearTimeout(wsTimeout);
        }

        // Set a new timeout for 180 seconds
        wsTimeout = setTimeout(() => {
            console.log('WebSocket connection closed due to inactivity.');
            ws.terminate(); // Close the WebSocket connection
        }, 180000); // 180 seconds in milliseconds
    });

    // in order to verify if connection is still alive
    // let consecutiveMissedPongs = 0;
    // ws.on('pong', () => {
    //     // Handle received pong frames
    //     console.log('Received pong frame');
    //     consecutiveMissedPongs = 0;
    // });
    
    // const pingInterval = setInterval(() => {
    //     ws.ping(); // Send ping frames at regular intervals
    //     consecutiveMissedPongs++;
    //     if (consecutiveMissedPongs >= 3) {
    //         clearInterval(pingInterval);
    //         console.log('Closing connection due to consecutive missed pongs');
    //         ws.terminate();
    //     }
    // }, 1000); // Ping interval: every 1 seconds

    // this section handels other regular socket's events
      
    // Setting up the WebSocket for message handling
    handleMessage.setWebSocket(ws);

    // Handling WebSocket errors
    ws.on('error', console.error);

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
     });

}