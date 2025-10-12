#!/usr/bin/env node
// Import net module.
var net = require('net');
var fs = require('fs');
const EventEmitter = require('events');

// ============================================================================
// TCP SERVER WITH STDIN-TO-CLIENT RELAY
// ============================================================================
// This script creates a TCP server that:
// 1. Listens for incoming TCP client connections (e.g., display devices)
// 2. Receives data from STDIN (piped from other scripts/processes)
// 3. Forwards STDIN data to connected TCP clients
//
// The script is meant to run inside a detached screen session (e.g., "displayServer")
// Data to be displayed can be sent to the STDIN of the screen session from 
// command line or from another script
//
// Example usage from external script:
//   screen -S displayServer -X stuff "$data\n"
//
// or by re-attaching to the screen session "screen -r displayServer" and entering
// text manually. Once pressed Return the message get sent to the display
// ============================================================================

function stdinLineByLine() {
	  const stdin = new EventEmitter();
	  var buff = "";

	  process.stdin  //this is the object for connecting to the STDIN
	    .on('data', data => {
		          buff += data;
		          lines = buff.split(/[\r\n|\n]/);
		          buff = lines.pop();
		          lines.forEach(line => stdin.emit('line', line));
		        })
	    .on('end', () => {
		          if (buff.length > 0) stdin.emit('line', buff);
		        })
	    .on('error', () => {
		    console.log("STDIN error event");
		    buff = "";
		        });

	  return stdin;
}

const stdin = stdinLineByLine();
//--------------------------------------------------------------------------------------------

// Create and return a net.Server object, the function will be invoked when client connect to this server.
var server = net.createServer(function(client) {

    console.log('Client connect. Client local address : ' + client.localAddress + ':' + client.localPort + '. client remote address : ' + client.remoteAddress + ':' + client.remotePort);

    client.setEncoding('utf-8');
    var clientEnding = false;


    // When receive client data.
    client.on('data', function (data) {
      	var dateTime = new Date();
      	// current hours and minutes
	var hours = dateTime.getHours();
	var minutes = dateTime.getMinutes();
      
      // Print received client data and length.
      //console.log('Received client data : ' + data + ', data size : ' + client.bytesRead);
      console.log(hours + ":" + minutes + " " + data);
        // Server send data back to client use client net.Socket object.
        // client.end('Server received data : ' + data + ', send back to client data size : ' + client.bytesWritten);
	client.write('^_^\n');
    });

    // When client send data complete.
    client.on('end', function () {
        console.log('Client disconnect.');
	client.destroy();

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

    // set timout to 4000 ms
    client.setTimeout(4000);
    // When client timeout or error end client connection end destroy connection
    client.on('timeout', function () {
        console.log('Client request time out');
        //client.end("bye\n");
        //client.destroy();
    });

    client.on('error', function () {
        console.log('Client ERROR event');
    //    client.end("bye\n");
    //    client.destroy();
    });

    // when a new line is received from STDIN send corresponding text to display
    stdin.on('line', function(text) {
	    switch (text) {
		case 'exit':
		  console.log('Exiting the connection');
		  clientEnding = true;
		  setTimeout(function() {
        	    client.end("bye\n");
		    client.destroy();
		  }, 2000);
		  break;
		default:
		 if( clientEnding == false ) {
	    	  console.log('--> ' + text); 
	    	  //client.write(text+'\n', function(err) { client.end(); });
	    	  client.write(text+'\n');
		 }
	     }
    });

//--------------------------------------------------------------------------------------------
});

// Make the server a TCP server listening on port 9999.
server.listen(12346, '0.0.0.0', function () {

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
