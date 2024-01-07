// proxy.js

// sONOFF-deviceID-1  -|
// sONOFF-deviceID-2  -|
// ...                 |<--> Proxy (local) <--> Cloud Server
// sONOFF-deviceID-N  -|

import { proxyEvent } from './sharedVARs.js';
import { sONOFFserver } from './sONOFFserver.mjs';
import { cloudHandler } from './cloudHandler.mjs';

// const proxy = {
//     actions: {},

//     on: function (action, actionHandler) {
//         this.actions[action] = actionHandler;
//     },
    
//     handleAction: function (action) {
//         const actionHandler = this.actions[action] || this.actions.defaultAction;
//         console.log('running: actionHandler');
//         actionHandler();
//     },
  
//     defaultAction: function (action) {
//         console.log(action + ' action is not managed');
//         // Handle unexpected message logic here
//         return 0;
//     },
      
// }

proxyEvent.on('devConnEstablished', (deviceID, message) => {
    // device has connected to the proxy
    // now is the proxy to connect to the cloud server
    console.log('device: ' + deviceID + ' successfully registered with Proxy... connecting to Cloud Server')
    cloudHandler.connect(deviceID)
});

proxyEvent.on('messageFromCMD', (deviceID, message) => {
    cloudHandler.forward2cloud(deviceID, message)
});

proxyEvent.on('messageFromDevice', (deviceID, message) => {
    cloudHandler.forward2cloud(deviceID, message)
});

proxyEvent.on('messageFromCloud', (deviceID, message) => {
    console.log('messageFromCloud for: ' + deviceID,)
    sONOFFserver.forward2device(deviceID, message)
});
