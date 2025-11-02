/*
Author: Matteo Palitto
Date: January 9, 2024

Description: proxy.mjs
This module stiches together the sONOFF Server (that could be used stand-alone).
and the Proxy-Cloud Client

sONOFF-deviceID-1  -|
sONOFF-deviceID-2  -|
...                |<--> sONOFF Server + Proxy [local] <--> Cloud Server
sONOFF-deviceID-N  -|

*/

// **MODIFIED: Import protocolCapture**
import { proxyEvent, debugMode, cloudDebugMode, protocolCapture, transparentMode, LOGS_DIR } from './sharedVARs.js';
import { sONOFFserver } from './sONOFFserver.mjs';
import { cloudHandler } from './cloudHandler-modules/cloudHandler.mjs';
// **NEW: Import fs for logging and directory creation**
import { appendFileSync, mkdirSync, existsSync } from 'fs';

// **NEW: Create logs directory if it doesn't exist**
if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
    console.log(`📁 Created logs directory: ${LOGS_DIR}`);
}

// Parse command-line arguments
const args = process.argv.slice(2);

// Process all command-line arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '-debug' && i + 1 < args.length) {
    // Device-specific debug mode
    debugMode.enabled = true;
    debugMode.deviceId = args[i + 1];
    console.log(`\n========================================`);
    console.log(`DEBUG MODE ENABLED for device: ${debugMode.deviceId}`);
    console.log(`Logs will be written to: logs/${debugMode.deviceId}.debug`);
    console.log(`========================================\n`);
    i++; // Skip next argument (deviceId)
  }
  else if (arg === '-test-cloud-protocol') {
    // Cloud protocol debug mode
    cloudDebugMode.enabled = true;
    console.log(`\n========================================`);
    console.log(`CLOUD PROTOCOL DEBUG MODE ENABLED`);
    console.log(`Logs will be written to: ${cloudDebugMode.logFile}`);
    console.log(`========================================\n`);
  }
  else if (arg === '-prot-capture' && i + 1 < args.length) {
    protocolCapture.enabled = true;
    // Store the IP, cleaning any potential IPv6 prefix
    protocolCapture.ip = args[i + 1].replace('::ffff:', '');
    console.log(`\n========================================`);
    console.log(`PROTOCOL CAPTURE MODE ENABLED for IP: ${protocolCapture.ip}`);
    console.log(`Logs will be written to ${LOGS_DIR} once deviceID is known.`);
    console.log(`========================================\n`);
    i++; // Skip next argument (deviceIP)
  }
  // **NEW: Transparent capture mode**
  else if (arg === '-transparent-capture' && i + 1 < args.length) {
      transparentMode.enabled = true;
      const target = args[i + 1];
      
      // Check if target is an IP address or device ID
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(target)) {
          // It's an IP address
          transparentMode.deviceIp = target;
          transparentMode.matchedByIp = true;
          
          console.log(`\n${'🔍'.repeat(40)}`);
          console.log(`🔍 TRANSPARENT CAPTURE MODE ENABLED`);
          console.log(`   Matching by IP: ${transparentMode.deviceIp}`);
          console.log(`   All traffic from this IP will be logged WITHOUT processing`);
          console.log(`   Device ID will be determined from messages`);
          console.log(`   Logs will be written to: ${LOGS_DIR}/`);
          console.log(`${'🔍'.repeat(40)}\n`);
      } else {
          // It's a device ID
          transparentMode.deviceId = target;
          
          // Import transparent logger
          import('./transparentMode-modules/transparentLogger.mjs').then(({ TransparentLogger }) => {
              TransparentLogger.initialize(transparentMode.deviceId);
          });
          
          console.log(`\n${'🔍'.repeat(40)}`);
          console.log(`🔍 TRANSPARENT CAPTURE MODE ENABLED`);
          console.log(`   Device ID: ${transparentMode.deviceId}`);
          console.log(`   All traffic will be logged WITHOUT processing`);
          console.log(`   Log file: ${LOGS_DIR}/${transparentMode.deviceId}-transparent.log`);
          console.log(`${'🔍'.repeat(40)}\n`);
      }
      i++; // Skip next argument
  } else if (arg === '-h' || arg === '--help' || arg === '?') {
    console.log(`
Usage: node proxy.mjs [OPTIONS]

Options:
  -debug <deviceID>              Enable debug mode for specific device
                                 Logs written to: ${LOGS_DIR}/<deviceID>.debug

  -test-cloud-protocol           Enable cloud protocol debug mode
                                 Logs written to: ${LOGS_DIR}/test-cloud-protocol.log

  -prot-capture <deviceIP>       Enable full protocol capture for a specific IP
                                 Logs written to: ${LOGS_DIR}/<deviceID>.log

  -transparent-capture <deviceID|IP>  Enable transparent capture mode
                                      Forwards messages without processing
                                      Can use device ID or IP address
                                      Logs written to: ${LOGS_DIR}/<deviceID>-transparent.log

  -h, --help, ?                  Show this help message

Examples:
  node proxy.mjs
  node proxy.mjs ?
  node proxy.mjs -debug 1000015719
  node proxy.mjs -test-cloud-protocol
  node proxy.mjs -prot-capture 192.168.1.50
  node proxy.mjs -transparent-capture 1000015746

Note: All log files are stored in the ${LOGS_DIR}/ directory
    `);
    process.exit(0);
  }
}

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
    //console.log('\n\nping received by: ' + deviceID);
    sONOFFserver.checkinDeviceOnLine(deviceID)
});

// when the connection between Proxy and device is closed
// also the Proxy-Cloud connection relative to the device will be closed
proxyEvent.on('proxy2deviceConnectionClosed', (deviceID) => {
    if (!deviceID) {
        console.log('⚠️  proxy2deviceConnectionClosed event with undefined deviceID - ignoring');
        return;
    }
    

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

    // **NEW: Log incoming WSS message if capture is enabled**
    if (protocolCapture.enabled && deviceID === protocolCapture.deviceId && protocolCapture.logFile) {
        const timestamp = new Date().toISOString();
        const logEntry = `\n${'='.repeat(80)}\n[${timestamp}] DEVICE -> PROXY (WSS MSG)\n${'-'.repeat(80)}\n${message}\n${'='.repeat(80)}\n`;
        try {
            appendFileSync(protocolCapture.logFile, logEntry);
        } catch (err) {
            console.error('Error writing to capture file:', err);
        }
    }

    sONOFFserver.checkinDeviceOnLine(deviceID);
    cloudHandler.forward2cloud(deviceID, message);
});

// a message has been received from the Cloud server and needs to be proxyed to the device
proxyEvent.on('messageFromCloud', (deviceID, message) => {
    console.log('messageFromCloud for: ' + deviceID,)
    sONOFFserver.forward2device(deviceID, message)
});
