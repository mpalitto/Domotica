var dns = require('dns');
var https = require('https');
var http = require('http');
var fs = require('fs');
var url  = require('url');
var util = require('util');
const { parse } = require('querystring');

var sONOFF = {};
var options = {
        secure: true,
        key: fs.readFileSync("/root/WS/tls/matteo-key.pem"),
        cert: fs.readFileSync("/root/WS/tls/matteo-cert.pem")
}

// ///////////////////// ////
//                       ////
// HTTP and HTTPS SERVER ////
//                       ////
// ///////////////////// ////
// we are going to replace the cloud server with the local server...
// The local server will receive the packets from the sONOFF devices
// which have been redirected to the local server using IPTABLES rules
// We respond to the DISPATCH request from sONOFF devices telling them
// to connect to our local IP address on port 8888 on wich our WS server
// will be listening for connections...
//
//var response = '{"port":443,"reason":"ok","IP":"35.157.208.224","error":0}';
//var response = '{"port":8443,"reason":"ok","IP":"192.168.1.11","error":0}';
var response = '{"port":8888,"reason":"ok","IP":"192.168.1.11","error":0}';
var len = ""+response.length
// console.log(len);
var dispatch = {};
var secure;
var httpHandler = function (req, res) {
	secure = false;
	handler(req, res);
}
var httpsHandler = function (req, res) {
	secure = true;
	handler(req, res);
}

// this is dispatch server handler, dipatch message is a POST request sent by sONOFF device that wants to connect to cloud server
// the POST request gets redirected to this local server to which the device will make a connection
// Later on the local PROXY server should make a POST request to the cloud server to get the address for establishing the cloud WS server
// this is still to be implemented, for now we know the WS cloud IP address and we use that
var handler = function (req, res) {
  console.log('REQUEST RECEIVED');
  console.log('URL:' + req.url); // it should be empty...
  console.log('METHOD: ' + req.method);
  console.log('HEADERS: ' + JSON.stringify(req.headers));
  console.log('HOST: ' + req.headers['host']); // this should be the address to which sONOFF device is sending the POST request 
  // dns.resolve4(req.headers['host'], function(err, hostIP) { console.log('HostIP: ' + JSON.stringify(hostIP))});
  if (req.method === 'POST' && req.url === '/dispatch/device') {
  //if (true) {
    console.log('DISPATCH DEVICE received...');
    let body = [];
    req.on('error', (err) => {
      console.error(err);
    }).on('data', (chunk) => {
      console.log('DATA has been received');
      body.push(chunk);
    }).on('end', () => {
      console.log('END DATA has been received');
      // body = JSON.stringify(Buffer.concat(body).toString());
      body = Buffer.concat(body).toString();
      console.log(body);
      var device = JSON.parse(body);
      var deviceid = device['deviceid'];
      dispatch[ deviceid ] =  body.toString();
      // At this point, we have the headers, method, url and body, and can now
      // do whatever we need to in order to respond to this request.
      //sONOFF[deviceid] = sONOFF[deviceid] || {};
      if (sONOFF[deviceid] === undefined) { // 1st time we've seen this device
      	console.log('WARNING: 1st time we have seen this device!!!');
      	sONOFF[deviceid] = {};
      	sONOFF[deviceid]["alias"] = 'new-' + uuid;
      	sONOFF[deviceid]["state"] = 'Unregistered';
      	//provide a clue in the sONOFF.cmd file by indicating with a comment
      	fs.appendFile('sONOFF.cmd', 'name '+deviceid+' '+'new-' + uuid, function (err) {
      		  if (err) throw err;
      		  console.log('Saved!');
      	});
      }
      sONOFF[deviceid]["secure"] = secure;
      sONOFF[deviceid]["WSserver"] = '3.122.122.135'; // should be the result of DISPATCH request sent to req.headers['host']; however this is not yet implemented and for now we use the cloud WS server IP address; it might not work in the future if they change this address...
      fs.writeFile('.'+deviceid+'.lastConnection', 'secure: '+secure.toString()+' '+'host: ' + req.headers['host'], function (err) {
      	  if (err) throw err;
      	  console.log('Saved!');
      });
      console.log('DEVICES:');
      console.log(JSON.stringify(dispatch));
    });
//      console.log(req);
    console.log('SENDING reply');
    res.writeHead(200, 'OK', {
	    'server': 'openresty',
	    'date': 'today',
	    'Content-Type': 'application/json',
	    'content-length': len,
	    'connection': 'close'
    });
    res.end(response, 'utf8');
  } else {
    res.statusCode = 404;
    res.end();
  }
};

https.createServer(options, httpsHandler).listen(8181, "0.0.0.0");
console.log('listening HTTPS on port 8181');
http.createServer(httpHandler).listen(8000, "0.0.0.0");
console.log('listening HTTP on port 8000');

// /////////////////// ////
//                     ////
// PROXY functionality ////
//                     ////
// /////////////////// ////
// we connect to the cloud server and pretend we are the device that just connected
// to our local server...
var reAPIkey = /apikey[^,]+/; //regular expression for the apikey...
var clientOptions = {};
var clientConn;
clientOptions.rejectUnauthorized = false;
// when a WS connection request comes from sONOFF device to our local server
// this clientHandler function is called
// 1. makes a DISPATCH request to the cloud server for the device
// 2. estabishes a WS connection to the cloud server for relaying the infos received from sONOFF device and viceversa
//
// it receives the sONOFF deviceID and the client connection to the could server
var clientHandler = function (deviceid) {
    console.log('CLIENT Connected');
    startTime = new Date();
    var swState = 'off';
    var client = this;
    
    sONOFF[deviceid]["client"] = client;
    //register device with server
    console.log('CLIENT sending CLOUD SERVER registration request for: ' + deviceid);
    console.log('CLIENT: '+sONOFF[deviceid]['registerSTR']);
    client.sendText(sONOFF[deviceid]['registerSTR']);

    client.on('text', function(message) {
        console.log('CLIENT Received message: ' + message);
	var res = JSON.parse(message);
	for(var an in res) {
		console.log(an + ": " + res[an]);
	}
	deviceid = res['deviceid'];
	//sONOFF[deviceid]['WSres'] = res;
	if(res['action'] == 'update' && res['from'] == 'app') {
	    console.log('CLIENT command received from APP for device '+deviceid+'/'+sONOFF[deviceid]['alias']);
	    swState = res['params']['switch'];
	    console.log('switch: ' + swState);
	    parseCMD('switch '+deviceid+' '+swState);
	    client.sendText('{ "error":0, "userAgent":"device", "apikey":"'+res['apikey']+'", "deviceid":"'+res['deviceid']+'", "sequence":"' + res['sequence'] + '" }');
	} else if(res['config'] && res['config']['hbInterval']) { // this is the 1st response from CLOUD after registration request
      	    //request date to server
	    console.log('REPLACING...apikey with: '+res['apikey']);
  	    console.log(sONOFF[deviceid]['updateSTR']);
	    console.log(sONOFF[deviceid]['updateSTR'].replace(reAPIkey,'apikey":"'+res['apikey']+'"'));
	    sONOFF[deviceid]['updateSTR'] = sONOFF[deviceid]['updateSTR'].replace(reAPIkey,'apikey":"'+res['apikey']+'"');
  	    console.log(sONOFF[deviceid]['updateSTR']);
    	    client.sendText('{ "userAgent":  "device", "apikey":     "'+res['apikey']+'", "deviceid":   "'+deviceid+'", "action"      :"date" }');    
	    //setInterval(function heartBeat() {console.log('sending UPDATE to CLOUD for devcie '+deviceid); client.sendText('{ "userAgent":"device", "apikey":"'+res['apikey']+'", "deviceid":"'+deviceid+'", "action":"update", "params":{ "switch":"'+swState+'", "fwVersion":"'+res['fwVersion']+'" } }')}, res['config']['hbInterval'] + '00'); 
	} else if(res['date']) {
            //send initial staus (ON/OFF) to server
            client.sendText('{ "userAgent":      "device", "apikey":         "'+res['apikey']+'", "deviceid":       "'+deviceid+'", "action":         "update", "params": { "switch":         "'+swState+'", "fwVersion":      "'+res['fwVersion']+'", "rssi":           -41, "staMac":         "5C:CF:7F:F5:19:F8", "startup":        "'+swState+'" } }');
            //request timers settings to server
            client.sendText('{ "userAgent":  "device", "apikey":     "'+res['apikey']+'", "deviceid":   "'+deviceid+'", "action":     "query", "params": [ "timers" ] }');
	}
    });
};


//////////////////////////////////////////
//					//
//  		WEB SOCKET SERVER	//
//					//
//////////////////////////////////////////
// web socket server for connection with sONOFF devices
// However embedded in here there is the proxy code
// which in turn will connect to the cloud server
// for each sONOFF device there will be a device local WS connection and one WS cloud connection
	
var reSWstate = /switch[^,]+/;
var ws = require("nodejs-websocket");
//var WebSocketClient = require('nodejs-websocket');
var pathToModule = require('module')._resolveLookupPaths('tls');
const uuidv4 = require('uuid/v4');
// create web socket server
// when a new connection is created it will be accessible throu the conn variable
// it will be stored into an object containg all details about the sONOFF device which connected
// i.e. device["ws"] = conn;
// which in turn be stored into the object with the list of each device connected
// i.e. sONOFF[deviceid]["conn"] = device;
var server = ws.createServer(options, function (conn) {
	console.log("New connection")
	uuid = uuidv4();
	var response = '';
	var device = {};
	conn.on("text", function (str) {
		console.log("Received "+str)
		var message = JSON.parse(str);
		var deviceid = message['deviceid'];
		if(message['action'] == 'register') { // sONOFF device has requested a WS connection and connection was accepted, we then need to reply a welcome message
			console.log('REGISTRATION request received... sending reply');
			response = '{ "error": 0, "deviceid": "'+deviceid+'", "apikey": "'+uuid+'", "config": { "hb": 1, "hbInterval": 145 } }';
			console.log('>>>: ' + response);
			conn.sendText(response);
			sONOFF[deviceid]['registerSTR'] = str;
		} else if(message['action'] == 'date') { //this is the handshake 2nd step, thus we assume the WS is fully working.
			console.log('DATE request received');
			response = '{ "error": 0, "deviceid": "'+deviceid+'", "apikey": "'+uuid+'", "date": "'+new Date().toISOString()+'" }';
			console.log('>>>: ' + response);
			// The connection handshaking is on its 2nd step now, I will store the connection info in the sONOFF Object for later use
			device["ws"] = conn;
			device["apikey"] = uuid;
			sONOFF[deviceid]["state"] = 'Registered';
			sONOFF[deviceid]["conn"] = device; // store connection and apikey for later use with commands
			conn.sendText(response);

			// /////////////////// ////
			//                     ////
			// PROXY functionality ////
			//                     ////
			// /////////////////// ////
			// in order to keep using the cellphone APP we establish a cloud server WS connection and pass info to and from
			// thus we get a WS connection from the local sONOFF server to the cloud server
			if(sONOFF[deviceid]['secure']) {
				//sONOFF[deviceid]["client"] = ws.connect("wss://3.122.122.135:443/api/ws", clientOptions, clientHandler);
				var url = "wss://"+sONOFF[deviceid]['WSserver']+":443/api/ws";
			} else {
				var url = "ws://"+sONOFF[deviceid]['WSserver']+":8080/api/ws";
			}
			console.log('conncting to CLOUD server as: '+deviceid);
			console.log(url);
			//client = ws.connect("wss://3.122.122.135:443/api/ws", clientOptions, clientHandler);
			
			// clientConn is an object which will contain functions which will use the "this" keywork in their code
			// we will store the clientConn object in a global variable part of the sONOFF object, thus to assure that, when the object will be used
			// outside this scope..., it will inherit "this" wich comes from the context in which is created.
			// each function has a bind method which allow to pass an object that will be used as the "this" inside the function itself
			// In this case we are binding the correct "this" for when it will be called out in another context
			// this is the connection been establisched
			clientConn = ws.connect(url, clientOptions, clientHandler.bind(this, deviceid)); // actual connection to WS cloud server

			//console.log(util.inspect(client));
		} else if(message['action'] == 'update') { //device is updating its state, this might come periodically or after switching sONOFF ON or OFF
			console.log('UPDATE received from device '+deviceid);
			sONOFF[deviceid]['state'] = message['params']['switch'];
			response = '{ "error": 0, "deviceid": "'+deviceid+'", "apikey": "'+uuid+'" }';
			console.log('>>>: ' + response);
			conn.sendText(response);
			//sONOFF[deviceid]["client"].sendText('{ "userAgent":      "device", "apikey":         "'+res['apikey']+'", "deviceid":       "'+deviceid+'", "action": "update", "params": { "switch":         "'+message['params']['switch']+'", "fwVersion": "'+res['fwVersion']+'", "rssi": -41, "staMac":  "5C:CF:7F:F5:19:F8", "startup":  "off" } }');
			if(sONOFF[deviceid]["client"]) { // previous connection was established
				console.log(util.inspect(sONOFF[deviceid]["client"]));
				console.log('readyState for '+deviceid+' is '+sONOFF[deviceid]["client"].readyState);
				if(sONOFF[deviceid]["client"].readyState == 1 ) { // send UPDATE if connection is still UP
					console.log('CLIENT sending UPDATE to CLOUD received from device '+deviceid+'/'+sONOFF[deviceid]["alias"]); 
					console.log(sONOFF[deviceid]['updateSTR'].replace(reSWstate, 'switch":"'+message['params']['switch']+'"'));
					sONOFF[deviceid]["client"].sendText(sONOFF[deviceid]['updateSTR'].replace(reSWstate, 'switch":"'+message['params']['switch']+'"'));
				} else {  // connection with CLOUD server no longer UP nd RUNNING thus a new one needs to be established
					// in order to keep using the cellphone APP we start cloud server connection and pass info to it and viceversa
					console.log('ESTABLISHING connection to CLOUD once AGAIN for device '+deviceid);
					if(sONOFF[deviceid]['secure']) {
						//sONOFF[deviceid]["client"] = ws.connect("wss://3.122.122.135:443/api/ws", clientOptions, clientHandler);
						var url = "wss://"+sONOFF[deviceid]['WSserver']+":443/api/ws";
					} else {
						var url = "ws://"+sONOFF[deviceid]['WSserver']+":8080/api/ws";
					}
					console.log('conncting to CLOUD server as: '+deviceid);
					console.log(url);
					//client = ws.connect("wss://3.122.122.135:443/api/ws", clientOptions, clientHandler);
					clientConn = ws.connect(url, clientOptions, clientHandler.bind(this, deviceid));
					//sONOFF[deviceid]['updateSTR'] = str;
				}
			} else { 
				sONOFF[deviceid]['updateSTR'] = str;
			}
		} else if(message['action'] == 'query') {
			console.log('QUERY received');
			response = '{ "error": 0, "deviceid": "'+deviceid+'", "apikey": "'+uuid+'", "params": 0 }';
			console.log('>>>: ' + response);
			conn.sendText(response);
		} else if(message['error'] == '0') {
			console.log('CMD SUCESS received');
		} else {
			console.log('message was not expected')
		}
	})
	conn.on("close", function (code, reason) {
		console.log("Connection closed")
	})
}).listen(8888, "0.0.0.0")
console.log('listening WS on port 8888');


// Import net module.
var net = require('net');
var re = /\s*(?: |\n)\s*/;
parseCMD = function(str) {
	var cmd = str.split(re);
	var cmd0 = cmd.shift();
	console.log('CMD: ' + cmd0);
	console.log('ARGs: ' + cmd);
	if(cmd0 == 'switch') { // switch deviceID/alias on/off
		var devID = cmd[0]; // the relay coudl be addressed by its ID or by its ALIAS
		if (deviceID[cmd[0]]) devID = deviceID[cmd[0]]; // I the case its an ALIAS get the device ID
		var toState = cmd[1]; //either 'on' or 'off'
		var now = new Date().getTime();
		var device = sONOFF[devID]; // get realy information
		var ONOFFmessage = '{"action":"update","deviceid":"' + devID + '","apikey":"' + device.conn.apikey + '","userAgent":"app","sequence":"' + now + '","ts":0,"params":{"switch":"' + toState + '"},"from":"app"}';
		device.state = toState;
		console.log(ONOFFmessage);
		device.conn.ws.sendText(ONOFFmessage);
	} else if (cmd0 == 'name') { //cmd[0] = device ID, cmd[1] = device name
		var devID = cmd[0]; // the relay coudl be addressed by its ID or by its ALIAS
		// giving a name to a sONOFF device for human readability and easy of use
		// name will be given editing a file and inserting the cmd: 'name devID devName' on each line for each device
		// if a device is detected and does not have a name, a new line will be appended to the file with '???' as a name
		// by editing the file and replacing the '???' with devName will allow to use its name instead of devID
		sONOFF[devID] = sONOFF[devID] || {}; //if does not yet exist, create a new object for device 
		sONOFF[devID]['alias'] = cmd[1]; // store name read from file
		if (cmd[2] == 'fromFile') {
			sONOFF[devID]['state'] = 'Unregistered';
			var lastConn = require('readline').createInterface({
			  input: require('fs').createReadStream('.'+devID+'.lastConnection')
			});
			
			lastConn.on('line', function (line) {
			  console.log('LAST CONN from file:', line);
			  var conn = line.split(re);
			  sONOFF[devID]['secure'] = ( conn[1] == 'true' );
			  sONOFF[devID]['WSserver'] = '3.122.122.135'; // should be conn[3]; but this is the only server that WS handshaking works
			});
		}	
		// deviceID[cmd[1]]['alias'] = cmd[0]; // store device ID given the name/alias for use with user commands
		deviceID[cmd[1]] = devID; // store device ID given the name/alias for use with user commands
	} else if (cmd0 == 'list') {
		Object.keys(sONOFF).forEach( function(devID) {
			console.log(devID+': (alias): '+sONOFF[devID].alias+' : state: '+sONOFF[devID].state);
		});
	} else {
		console.log('WARNING: command not found: ' + cmd0);
	}
}

// Create and return a net.Server object, the function will be invoked when client connect to this server.
var cmdSocket = net.createServer(function(client) {

    console.log('Client connect. Client local address : ' + client.localAddress + ':' + client.localPort + '. client remote address : ' + client.remoteAddress + ':' + client.remotePort);

    client.setEncoding('utf-8');
    client.write('Welcome! send a command\r\n');

    // client.setTimeout(1000);

    // When receive client data.
    client.on('data', function (data) {

        // Print received client data and length.
        // console.log('Received client data : ' + data + ', data size : ' + client.bytesRead);

        // Server send data back to client use client net.Socket object.
        // client.end('Server received data : ' + data + ', send back to client data size : ' + client.bytesWritten);
	parseCMD(data);
    });

    // When client send data complete.
    client.on('end', function () {
        console.log('Client disconnect.');

        // Get current connections count.
        cmdSocket.getConnections(function (err, count) {
            if(!err)
            {
                // Print current connection count in server console.
                console.log("There are %d connections now. ", count);
            }else
            {
                console.error(JSON.stringify(err));
            }

        });
    });

    // When client timeout.
    client.on('timeout', function () {
        console.log('Client request time out. ');
    })
});

var deviceID = {}; // sONOFF device ID given its alias 
var lineReader = require('readline').createInterface({
  input: require('fs').createReadStream('sONOFF.cmd')
});

lineReader.on('line', function (line) {
  console.log('CMD from file:', line);
  parseCMD(line + ' fromFile');
});

//Make the server a TCP server listening on port 9999.
cmdSocket.listen(9999, function () {
console.log('listening CMD on port 9999');

    // Get server address info.
    var serverInfo = cmdSocket.address();

    var serverInfoJson = JSON.stringify(serverInfo);

    console.log('TCP server listen on address : ' + serverInfoJson);

    cmdSocket.on('close', function () {
        console.log('TCP server socket is closed.');
    });

    cmdSocket.on('error', function (error) {
        console.error(JSON.stringify(error));
    });

});
