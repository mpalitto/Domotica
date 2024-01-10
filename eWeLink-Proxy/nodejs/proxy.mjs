/*
Author: Matteo Palitto
Date: January 9, 2024

Description: proxy.mjs
This module stiches together the sONOFF Server (that could be used stand-alone).
and the Proxy-Cloud Client

sONOFF-deviceID-1  -|
sONOFF-deviceID-2  -|
...                 |<--> sONOFF Server + Proxy [local] <--> Cloud Server
sONOFF-deviceID-N  -|

*/


import { proxyEvent } from './sharedVARs.js';
import { sONOFFserver } from './sONOFFserver.mjs';
import { cloudHandler } from './cloudHandler.mjs';


proxyEvent.on('devConnEstablished', (deviceID) => {
    // device has connected to the proxy
    // now is the proxy to connect to the cloud server impersonificating the device
    console.log('device: ' + deviceID + ' successfully registered with Proxy... connecting to Cloud Server')
    cloudHandler.connect(deviceID)
});

// this is the ping-pong for connectivity checking
// the device sends a PING every 10secs
// after 30 seconds from last PING received the connection to the device is considered lost
// and the connection will officialy be closed
proxyEvent.on('pingReceived', (deviceID) => {
    console.log('\n\nping received by: ' + deviceID);
    sONOFFserver.checkinDeviceOnLine(deviceID)
});

// when the connection between Proxy and device is closed
// also the Proxy-Cloud connection relative to the device will be closed
proxyEvent.on('proxy2deviceConnectionClosed', (deviceID) => {
    console.log('Closed connection detected for: ' + deviceID,)
    cloudHandler.closeConnection(deviceID)
});

// Message(command) from command line (command socket) has been received
// we need to inform the cloud of the switch device state change
proxyEvent.on('messageFromCMD', (deviceID, message) => {
    cloudHandler.forward2cloud(deviceID, message);
});

// a message has been received from the device and needs to be proxyed to the Cloud server
proxyEvent.on('messageFromDevice', (deviceID, message) => {
    console.log('\n\nmessageFromDevice:')
    sONOFFserver.checkinDeviceOnLine(deviceID);
    cloudHandler.forward2cloud(deviceID, message);
});

// a message has been received from the Cloud server and needs to be proxyed to the device
proxyEvent.on('messageFromCloud', (deviceID, message) => {
    console.log('messageFromCloud for: ' + deviceID,)
    sONOFFserver.forward2device(deviceID, message)
});
