  const https = require('https');
  const postData = JSON.stringify({
    accept: 'ws;2',
    version: 2,
    ts: 119,
    deviceid: '1000024e09',
    apikey: 'fe8ce2c4-4359-4c2e-ae3f-5ed0c0b70272',
    model: 'ITA-GZ1-GL',
    romVersion: '1.2.0'
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
  
  const req = https.request(options, (res) => {
    console.log(`Status code: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers)}`);
  
    res.on('data', (chunk) => {
      console.log(`Response body: ${chunk}`);
      let cloudWS = JSON.parse(chunk); // i.e. {"port":443,"reason":"ok","error":0,"IP":"3.126.176.190"}
      connectCLOUD(cloudWS);
      // Handle the response data here
    });
  });
  
  req.on('error', (e) => {
    console.error(`Error: ${e.message}`);
  });
  
  // Send the POST data
  req.write(postData);
  req.end();

  const WebSocket = require('ws');

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
  
  ws.on('open', function open() {
    console.log('WebSocket connected');
    
    // You can send messages or handle incoming messages here
    // For example:
    // ws.send('Hello, server!');
  });
  
  ws.on('message', function incoming(data) {
    console.log('Received:', data);
  });
  
  ws.on('error', function error(err) {
    console.error('WebSocket error:', err);
  });
  
  ws.on('close', function close() {
    console.log('WebSocket connection closed');
  });
  
}