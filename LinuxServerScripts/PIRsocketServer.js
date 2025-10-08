// Import net module.
var net = require('net');
var fs = require('fs');
var sensorTimers = {};
// Create and return a net.Server object, the function will be invoked when client connect to this server.

var exec = require("child_process").exec;
function switchLight(code) {
exec("screen -S arduino433tx -X stuff \"s:"+code+"\"", function(error, stdout, stderr) {
	    if (error) {
		            console.log(`error: ${error.message}`);
		            return;
		        }
	    if (stderr) {
		            console.log(`stderr: ${stderr}`);
		            return;
		        }
	    console.log(`stdout: ${stdout}`);
});
}

var server = net.createServer(function(client) {

    console.log('Client connect. Client local address : ' + client.localAddress + ':' + client.localPort + '. client remote address : ' + client.remoteAddress + ':' + client.remotePort);

    client.setEncoding('utf-8');

    // client.setTimeout(1000);

    // When receive client data.
    client.on('data', function (data) {

        // Print received client data and length.
        //console.log('Received client data : ' + data + ', data size : ' + client.bytesRead);
      dataParts = data.split(" "); //s:DADBF1
      sensor = dataParts[0];
      if(sensorTimers[sensor] == null || sensorTimers[sensor] == 0) {
	      console.log("switching light ON");
	      switchLight("DADBF1");
      }
      sensorTimers[sensor] = 60;
	//console.log(now + ' N : S ' +startTime + ' : ' + firstTime + " F:T " + time);
	      
        // Server send data back to client use client net.Socket object.
        // client.end('Server received data : ' + data + ', send back to client data size : ' + client.bytesWritten);
    });

    // When client send data complete.
    client.on('end', function () {
        console.log('Client disconnect.');

        // Get current connections count.
        server.getConnections(function (err, count) {
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

// Make the server a TCP server listening on port 9999.
server.listen(1212, function () {

    // Get server address info.
    var serverInfo = server.address();

    var serverInfoJson = JSON.stringify(serverInfo);

    console.log('TCP server listen on address : ' + serverInfoJson);

    server.on('close', function () {
        console.log('TCP server socket is closed.');
    });

    server.on('error', function (error) {
        console.error(JSON.stringify(error));
    });

});


function doStuff() {
	//do Stuff here
	for (sensor in sensorTimers) {
	  console.log("sensor: " + sensor + " value: " + sensorTimers[sensor]);
	  if(sensorTimers[sensor] == 1) {
		console.log("Turning "+sensor+" OFF");
		switchLight("DADBF1");
	  } 
	  if(sensorTimers[sensor] > 0) {
	  	sensorTimers[sensor] -= 1
	  } 

        }
}
setInterval(doStuff, 1000); //time is in ms
