// This code sets up a message handler (handleMessage) that manages WebSocket messages for devices. Here's a breakdown:

// Initialization:

// const sONOFF = {};: An empty object used for storing device-related data for later use.
// export const handleMessage = { ... }: Declaration of an object named handleMessage containing methods to handle WebSocket messages and device actions.
// Properties:

// ws: WebSocket connection object.
// device: Holds device-related information.
// actions: Stores action handlers.
// deviceid: Identifier for the device.
// msg: Placeholder for received messages.
// uuid: A default UUID for identification purposes.
// Methods:

// setWebSocket: Sets the WebSocket connection.
// on: Adds an action handler to the actions object.
// handleAction: Executes an action handler based on the received action.
// Message Handling:

// msgInit: Parses incoming WebSocket messages, handles errors, extracts relevant data, and triggers appropriate actions based on the message action.
// Event Handling:

// on('register'): Handles a 'register' event by sending a registration reply, storing device data, and acknowledging the registration.
// on('date'): Handles a 'date' event by storing date-related information, updating device state, and sending a response with the current date.
// on('update'): Handles an 'update' event by updating device information based on received data and sending an acknowledgment response.
// on('query'): Handles a 'query' event by logging the receipt of the query.


// const sONOFF = {};
import { sONOFF } from './sharedVARs.js'
import { appendFile } from 'fs';

export const handleMessage = {
    ws: null,
    actions: {},
    deviceid: '',
    msg: '',
    uuid: 'fe8ce2c4-4359-4c2e-ae3f-5ed0c0b70272',
  
    setWebSocket: function (webSocket) {
      this.ws = webSocket;
    },
  
    on: function (action, actionHandler) {
      this.actions[action] = actionHandler;
    },
  
    handleAction: function (action) {
      const actionHandler = this.actions[action] || this.actions.defaultAction;
      console.log('running: actionHandler');
      actionHandler();
    },
  
    defaultAction: function () {
      console.log('Message was not expected');
      // Handle unexpected message logic here
      return 0;
    },
  
    msgInit: function (buffer, ws) {
      this.ws = ws;
      handleMessage.msg = buffer.toString();
      console.log('Received WebSocket message:', handleMessage.msg);
  
      try {
        handleMessage.msg = JSON.parse(handleMessage.msg);
        handleMessage.deviceid = handleMessage.msg['deviceid'];
        // handleMessage.connections.set(handleMessage.deviceid, ws);
        if (handleMessage.msg['error'] && handleMessage.msg['error'] !== '0') {
          console.log('PREV.CMD ERROR received');
          return 0;
        } else {
          console.log('PREV.CMD SUCCESSFULLY received');
        }
        if(handleMessage.msg.action) handleMessage.handleAction(handleMessage.msg.action);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
      return handleMessage.deviceid; // return deviceID to be used as connectionId
    },
  };
  
  handleMessage.on('register', () => {
    console.log('REGISTRATION request received... sending reply');
    const response = '{ "error": 0, "deviceid": "' + handleMessage.deviceid + '", "apikey": "' + handleMessage.uuid + '", "config": { "hb": 1, "hbInterval": 145 } }';
    console.log('>>>: ' + response);
    handleMessage.ws.send(response);
    // check if the registring device is one of known devices
    if (!sONOFF[handleMessage.deviceid]) { // 1st time we've seen this device
      sONOFF[handleMessage.deviceid] = {};
      sONOFF[handleMessage.deviceid]["alias"] = 'new-' + handleMessage.deviceid; // provide a new temporary alias
      console.log('device ' + handleMessage.deviceid + ' is signing-in and is not on the known devices list. Check sONOFF.cmd file for new devices and replace its temporary given name: ' + sONOFF[handleMessage.deviceid]["alias"])
      appendFile('sONOFF.cmd', 'name ' + handleMessage.deviceid + ' ' + sONOFF[handleMessage.deviceid]["alias"] + '\n', function (err) { // update sONOFF.cmd file with new device
        if (err) throw err;
        console.log('sONOFF.cmd file was updated!');
      });
    } else console.log('device ' + handleMessage.deviceid + ' is signing-in and is known by the name: ' + sONOFF[handleMessage.deviceid]["alias"])
    sONOFF[handleMessage.deviceid]['registerSTR'] = handleMessage.msg;
    sONOFF[handleMessage.deviceid]['isOnline'] = true;
    const device = {};  //create a new obj that will store connection infos
    device["ws"] = handleMessage.ws;
    device["apikey"] = handleMessage.uuid;
    sONOFF[handleMessage.deviceid]["state"] = 'Registered';
    sONOFF[handleMessage.deviceid]["conn"] = device;
  });
  
  handleMessage.on('date', () => {
    sONOFF[handleMessage.deviceid]['dateSTR'] = handleMessage.msg;
    console.log('DATE request received');
    const response = '{ "error": 0, "deviceid": "' + handleMessage.deviceid + '", "apikey": "' + handleMessage.uuid + '", "date": "' + new Date().toISOString() + '" }';
    console.log('>>>: ' + response);
    handleMessage.ws.send(response);
  });
  
  handleMessage.on('update', () => {
    sONOFF[handleMessage.deviceid]['updateSTR'] = handleMessage.msg;
    console.log('UPDATE received from device ' + handleMessage.deviceid);
    sONOFF[handleMessage.deviceid]['state'] = handleMessage.msg['params']['switch'];
    const response = '{ "error": 0, "deviceid": "' + handleMessage.deviceid + '", "apikey": "' + handleMessage.uuid + '" }';
    console.log('>>>: ' + response);
    handleMessage.ws.send(response);
  });
  
  handleMessage.on('query', () => {
    sONOFF[handleMessage.deviceid]['querySTR'] = handleMessage.msg;
    console.log('QUERY received');
  });
  
  // export default handleMessage;
  