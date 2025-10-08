// Import net module.
var net = require('net');
var fs = require('fs');

// const serverIP = '192.168.1.77';
const serverIP = '0.0.0.0';
// Create and return a net.Server object, the function will be invoked when client connect to this server.
var startTime = Date.now();
var codeLastTime = {};
var stats = {};
var alpha = 0.8;
var allowedButtons = {'100': true, '101': true, '002': true, '003': true, '004': true, '005': true };
var offset = {}; // offset for syncing each RF receiver

const storeData = (data, path) => {
  try {
      console.log('updating file...');
      fs.writeFile(path, JSON.stringify(data))
  } catch (err) {
      console.error(err)
  }
}

setInterval(function() {storeData(offset, '/root/RFreceiver.offset')}, 600000); //every 10min
//setInterval(console.log('Updateing /root/RFreceiver.offset'), 6000); //every 10min

const loadData = (path) => {
  try {
      return fs.readFileSync(path, 'utf8')
  } catch (err) {
      console.error(err)
      return false
  }
}

var offsetSTR = loadData('/root/RFreceiver.offset');
if(offsetSTR) {
	offset = JSON.parse(offsetSTR);
}

var server = net.createServer(function(client) {

    console.log('Client connect. Client local address : ' + client.localAddress + ':' + client.localPort + '. client remote address : ' + client.remoteAddress + ':' + client.remotePort);

    client.setEncoding('utf-8');

    // client.setTimeout(1000);

    // When receive client data.
    var firstTime = 0;
    var timePressed = 0;
    var now = 0;
    var timeDffFromFT = 0;
    client.on('data', function (data) {

        // Print received client data and length.
        //console.log('Received client data : ' + data + ', data size : ' + client.bytesRead);
      dataParts = data.split(" "); //hexID code time ID
      if(dataParts[2]) {	
	var time = Number(dataParts[2]);
	//var code = dataParts[1].substr(0,6); //the switch id only... will leave the button id out
	var button = dataParts[1].substr(7,3); //verify the code is valid
	if(!allowedButtons[button]) return; //ignore not valid codes
	var code = dataParts[1]; //the switch id only... will leave the button id out
	var RecID = dataParts[3];
	var timeDiff;
	if(!offset[RecID]) { //fisrts time this RF receiver is sending updates
	  offset[RecID] = {};
	  now = Date.now();
	  firstTime = now - startTime - time;
	}
	
	if(!offset[RecID][code]){ //first time this RF receiver is receiving a code from the switch
	  //stats[code] = stats[code] || {};
	  //stats[code]['N'] = stats[code]['N'] || 0;
	  offset[RecID][code] = {};
	  offset[RecID][code]['PREVdiff'] = 0; // previous fileted diff
	  offset[RecID][code]['compensationN'] = 0; 
	  offset[RecID][code]['value'] = firstTime;
	  offset[RecID][code]['FT'] = firstTime;
	}
	timePressed = time + offset[RecID][code]['value'];
	if(codeLastTime[code]) { //button was already pressed before
	  timeDffFromFT = (offset[RecID][code]['FT'] + time - codeLastTime[code]['lastTime']);
	  timeDiff = timePressed - codeLastTime[code]['lastTime'];
	  if(Math.abs(timeDiff) > Math.abs(timeDffFromFT)) {
		  timeDiff = timeDffFromFT;
		  offset[RecID][code]['PREVdiff'] = timeDffFromFT;
	  }
  	  //console.log("previous same code found! time diff: "+timeDiff);
	
	  if((timeDiff < 2000) && (timeDiff > -2000) && (RecID != codeLastTime[code]['byRecID'])) {
	    FIRtimeDiff = Math.trunc(alpha*offset[RecID][code]['PREVdiff']+(1-alpha)*timeDiff); //low pass filter for removing fast changes but considering the slow changes
	    offset[RecID][code]['compensationN']++;
	    console.log('appling time compensation:' + FIRtimeDiff + ' compensationN: ' + offset[RecID][code]['compensationN']);
	    offset[RecID][code]['PREVdiff'] = FIRtimeDiff; //trying to calibrate receivers
	    offset[RecID][code]['value'] -= FIRtimeDiff; //trying to calibrate receivers
	    timePressed = timePressed - timeDiff;
	  } else { //I am assuming that if signals are coming 2 secs apart or more, actually were 2 button press
	    //stats[code]['N']++; //counting times button got pressed
            //console.log(data + ' N: ' + stats[code]['N']);
            console.log(data);
	    codeLastTime[code]['lastTime'] = timePressed;
	    codeLastTime[code]['byRecID'] = RecID; //in case the same receiver gives the code multiple times
	    //stats[code]['N']++; //counting times button got pressed
	  }
	} else { //this is the first time the button got pressed
	  //stats[code]['N']++; //counting times button got pressed
          //console.log(data + ' N: ' + stats[code]['N']);
          console.log(data);
	  codeLastTime[code] = {};
	  codeLastTime[code]['lastTime'] = timePressed;
	  codeLastTime[code]['byRecID'] = RecID; //in case the same receiver gives the code multiple times
	}
	//console.log(now + ' N : S ' +startTime + ' : ' + firstTime + " F:T " + time);
	console.log(timePressed + ' : ' + code + " Rec: " + RecID + " diff: " + timeDiff + " vs " + timeDffFromFT + " N: " + offset[RecID][code]['compensationN']);
	      
      }
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
server.listen(1234, serverIP, function () {

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
