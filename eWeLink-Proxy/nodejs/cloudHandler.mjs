// /////////////////// ////
//                     ////
// PROXY functionality ////
//                     ////
// /////////////////// ////
// for each deviceID connects to the cloud server and pretends its the device that just connected
// to our local server...
let clientOptions = {};
clientOptions.rejectUnauthorized = false;
let cloudAPIKey;
// when a WS connection request comes from sONOFF device to our local server
// this clientHandler function is called
// 1. makes a DISPATCH request to the cloud server for the device
// 2. estabishes a WS connection to the cloud server for relaying the infos received from sONOFF device and viceversa
//
// it receives the sONOFF deviceID and the client connection to the could server
import { sONOFF, proxyEvent, reAPIkey } from './sharedVARs.js'
import { WebSocket } from 'ws'; // WebSocket client for connecting to the CLOUD server
import https from 'https';

export const cloudHandler = {};

const RECONNECT_INTERVAL = 5000; // 5 seconds

cloudHandler.connect = (deviceid) => {
  cloudHandler.deviceid = deviceid;
  
  // The Sonoff device sends a dispatch call as HTTPS POST request to eu-disp.coolkit.cc 
  // including some JSON encoded data about itself
  const postData = JSON.stringify({
    accept: 'ws;2',
    version: 2,
    ts: 119,
    deviceid: sONOFF['deviceid'],
    apikey: sONOFF['apikey'],
    model: 'ITA-GZ1-GL',
    romVersion: sONOFF['romVersion']
  });
  
  const options = {
    hostname: 'eu-disp.coolkit.cc',
    path: '/dispatch/device',
    method: 'POST',
    rejectUnauthorized: false, // Set to false to skip certificate verification
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': postData.length
    }
  };
  
  // execute the HTTPS POST request
  const req = https.request(options, (res) => {
    console.log(`Status code: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers)}`);
  
    // It expects an JSON encoded host as an answer
    // with IP and PORT for the WS CLOUD server
    res.on('data', (chunk) => {
      console.log(`Response body: ${chunk}`);
      let cloudWS = JSON.parse(chunk); // i.e. {"port":443,"reason":"ok","error":0,"IP":"3.126.176.190"}

      connectCLOUD(cloudWS); // make the connection to the WS CLOUD server
    });
  });
  
  req.on('error', (e) => {
    console.error(`Error: ${e.message}`);
  });
  
  // Send the POST data
  req.write(postData);
  req.end();

  // make the connection to the WS CLOUD server
  function connectCLOUD(cloudWS) {
    const cloudWSurl = 'wss://' + cloudWS['IP'] + ':' + cloudWS['port'] + '/api/ws';
    console.log(cloudWSurl);
    const ws = new WebSocket(cloudWSurl, {
      headers: {
        Host: 'iotgo.iteadstudio.com',
        Connection: 'upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': 'ITEADTmobiM0x1DaXXXXXX==',
        'Sec-WebSocket-Version': '13'
      },
      rejectUnauthorized: false // Try bypassing certificate verification
    });
  
    let pingInterval; // Variable to hold the interval reference

    ws.on('open', function open() {
      console.log('Connected to CLOUD WebSocket server for device: ' + deviceid);
      console.log(sONOFF[deviceid]['registerSTR']);
      ws.send(sONOFF[deviceid]['registerSTR']); // 1st step in the registration process
      sONOFF[deviceid]['cloud'] = 'register';   // we have sent the register request and are waiting for cloud server reply

      pingInterval = setInterval(() => {
        console.log('Sending ping to CLOUD server');
        ws.send('ping'); // Send ping
      }, 100000); // Change the interval as needed (100 seconds here)

      ws['pingInterval'] = pingInterval;
    });

    // when a message from cloud server is received
    ws.on('message', function incoming(message) { 
      message = message.toString();
      console.log('\n\nReceived message from CLOUD server: ' + message);
      if (message.toString() === 'pong') {
        console.log('Received pong from CLOUD server');
        // Handle pong response here if needed
      } else {
  
        let startTime = new Date();
        let swState = 'off';
        const client = ws;

        let res = JSON.parse(message); // from string into an object
        cloudAPIKey = res['apikey'];
        // for (var an in res) {
        //     console.log(an + ": " + res[an]);
        // }
        // deviceid = res['deviceid'];
        // sONOFF[deviceid]['WSres'] = res;

        // check if the message is a response from message sent previosly by proxy
        // in that case check if we are in the initial device registration process
        // in which case continue sending the next registration process step message 
        // NOTE: the reg. process is decoupled from the real device which is assumed to be already connected to the proxy
        if (res['error'] == 0 && sONOFF[deviceid]['cloud'] == 'register') { // we have received the OK response from our register request
            console.log('CLIENT sending CLOUD SERVER date request for: ' + deviceid);
            // replace apikey with cloud server one
            sONOFF[deviceid]['dateSTR'] = sONOFF[deviceid]['dateSTR'].replace(reAPIkey, 'apikey":"' + cloudAPIKey + '"');
            sONOFF[deviceid]['updateSTR'] = sONOFF[deviceid]['updateSTR'].replace(reAPIkey, 'apikey":"' + cloudAPIKey + '"');
            sONOFF[deviceid]['querySTR'] = sONOFF[deviceid]['querySTR'].replace(reAPIkey, 'apikey":"' + cloudAPIKey + '"');

            // send date request
            console.log(sONOFF[deviceid]['dateSTR']);
            client.send(sONOFF[deviceid]['dateSTR']); // 2nd step in the registration process
            sONOFF[deviceid]['cloud'] = 'date'; //we sent the register request and will wait for reply
        } else if (res['error'] == 0 && sONOFF[deviceid]['cloud'] == 'date') { // we have received the OK response from our date request
            console.log('CLIENT sending CLOUD SERVER update request for: ' + deviceid);
            console.log(sONOFF[deviceid]['updateSTR']);
            client.send(sONOFF[deviceid]['updateSTR']); // 3rd step in the registration process
            sONOFF[deviceid]['cloud'] = 'update'; //we should now be registered with the cloud server

            // sONOFF[deviceid]['cloud'] = 'registered';   // and now completed the registration process with the cloud server
            // sONOFF[deviceid]['cloudWS'] = ws;           // we are ready now to forward messages from cloud to device
        } else if (res['error'] == 0 && sONOFF[deviceid]['cloud'] == 'update') { // we have received the OK response from our update request
            console.log('CLIENT sending CLOUD SERVER timers query request for: ' + deviceid);
            console.log(sONOFF[deviceid]['querySTR']);
            client.send(sONOFF[deviceid]['querySTR']); // 4th step in the registration process
            sONOFF[deviceid]['cloud'] = 'query'; //we should now be registered with the cloud server
        } else if (res['error'] == 0 && sONOFF[deviceid]['cloud'] == 'query') { // we have received the OK response from our query request
            //client.send(sONOFF[deviceid]['dateSTR']); // final step in the registration process
            sONOFF[deviceid]['cloud'] = 'registered';   // and now completed the registration process with the cloud server
            sONOFF[deviceid]['cloudWS'] = ws;           // we are ready now to forward messages from cloud to device

        // // if message is an update from cloud server, the user is requesting a change of state for the sonoff switch device (on|off)
        // // this request needs to be forwarded to the physical sonoff device 
        // } else if (res['action'] == 'update' && res['from'] == 'app') {
        //     console.log('CLIENT command received from APP for device ' + deviceid + '/' + sONOFF[deviceid]['alias']);
        //     swState = res['params']['switch'];
        //     console.log('switch: ' + swState);
        //     // parseCMD('switch ' + deviceid + ' ' + swState);
        //     proxyEvent.emit('messageFromCloud', deviceid, message); // emit event that will cause the message be sent to the physical sonoff device
        //     // reply to cloud server to confirm command has been received
        //     client.send('{ "error":0, "userAgent":"device", "apikey":"' + res['apikey'] + '", "deviceid":"' + res['deviceid'] + '", "sequence":"' + res['sequence'] + '" }');
    
        // // if message is a config heartbeat request... (not sure)
        // } else if (res['config'] && res['config']['hbInterval']) { // this is the 1st response from CLOUD after registration request
        //     //request date to server
        //     console.log('REPLACING...apikey with: ' + res['apikey']);
        //     console.log(sONOFF[deviceid]['updateSTR']);
        //     console.log(sONOFF[deviceid]['updateSTR'].replace(reAPIkey, 'apikey":"' + res['apikey'] + '"'));
        //     sONOFF[deviceid]['updateSTR'] = sONOFF[deviceid]['updateSTR'].replace(reAPIkey, 'apikey":"' + res['apikey'] + '"');
        //     console.log(sONOFF[deviceid]['updateSTR']);
        //     client.send('{ "userAgent":  "device", "apikey":     "' + res['apikey'] + '", "deviceid":   "' + deviceid + '", "action"      :"date" }');
        //     //setInterval(function heartBeat() {console.log('sending UPDATE to CLOUD for devcie '+deviceid); client.send('{ "userAgent":"device", "apikey":"'+res['apikey']+'", "deviceid":"'+deviceid+'", "action":"update", "params":{ "switch":"'+swState+'", "fwVersion":"'+res['fwVersion']+'" } }')}, res['config']['hbInterval'] + '00'); 
    
        // // if message is a date request... (not sure)
        // } else if (res['date']) {
        //     //send initial staus (ON/OFF) to server
        //     client.send('{ "userAgent":      "device", "apikey":         "' + res['apikey'] + '", "deviceid":       "' + deviceid + '", "action":         "update", "params": { "switch":         "' + swState + '", "fwVersion":      "' + res['fwVersion'] + '", "rssi":           -41, "staMac":         "5C:CF:7F:F5:19:F8", "startup":        "' + swState + '" } }');
        //     //request timers settings to server
        //     client.send('{ "userAgent":  "device", "apikey":     "' + res['apikey'] + '", "deviceid":   "' + deviceid + '", "action":     "query", "params": [ "timers" ] }');
        } else if (sONOFF[deviceid]['cloud'] == 'registered') {
          proxyEvent.emit('messageFromCloud', deviceid, message)
        } else console.log('ERROR: message not expected')
      }
    });

    ws.on('error', function error(error) {
      console.error('WebSocket error:', error);
      // cloudHandler.connect(cloudHandler.deviceid);
    });

    ws.on('close', function close() {
      console.log('Disconnected from CLOUD WebSocket server');
      clearInterval(ws['pingInterval']);
      // cloudHandler.connect(cloudHandler.deviceid);
    });

    // function reconnect() {
    //   console.log(`Reconnecting in ${RECONNECT_INTERVAL / 1000} seconds...`);
    //   setTimeout(() => {
    //       cloudHandler.connect(cloudHandler.deviceid);
    //   }, RECONNECT_INTERVAL);
    // }
  }
}

cloudHandler.forward2cloud = (deviceID, message) => {
    console.log('forwarding to Cloud :' + message)
    sONOFF[deviceID]['cloudWS'] && sONOFF[deviceID]['cloudWS'].send(message.replace(reAPIkey, 'apikey":"' + cloudAPIKey + '"'));
  }

cloudHandler.closeConnection = (deviceID) => {
  console.log('closing connection to Cloud for: ' + deviceID)
  sONOFF[deviceID]['cloudWS'] && sONOFF[deviceID]['cloudWS'].terminate(); // Close the WebSocket connection
  sONOFF[deviceID]['cloudWS'] = null;
  sONOFF[deviceID]['conn'] = null;
  sONOFF[deviceID]['state'] = 'OFFLINE';
  sONOFF[deviceID]['isOnline'] = false;  
}