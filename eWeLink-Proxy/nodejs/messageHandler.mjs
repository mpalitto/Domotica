/*
Author: Matteo Palitto
Date: January 9, 2024

Description: messageHandler.mjs
This module handles HTTP and WebSocket requests related to device dispatch.
It exports 2 functions: handleHttpRequest, and handleWebSocketConnection.

This code sets up a message handler (handleMessage) that manages WebSocket messages for devices. Here's a breakdown:

Initialization:

const sONOFF = {};: An empty object used for storing device-related data for later use.
export const handleMessage = { ... }: Declaration of an object named handleMessage containing methods to handle WebSocket messages and device actions.
Properties:

ws: WebSocket connection object.
device: Holds device-related information.
actions: Stores action handlers.
deviceid: Identifier for the device.
msg: Placeholder for received messages.

Methods:

setWebSocket: Sets the WebSocket connection.
on: Adds an action handler to the actions object.
handleAction: Executes an action handler based on the received action.
Message Handling:

msgInit: Parses incoming WebSocket messages, handles errors, extracts relevant data, and triggers appropriate actions based on the message action.
Event Handling:

on('register'): Handles a 'register' event by sending a registration reply, storing device data, and acknowledging the registration.
on('date'): Handles a 'date' event by storing date-related information, updating device state, and sending a response with the current date.
on('update'): Handles an 'update' event by updating device information based on received data and sending an acknowledgment response.
on('query'): Handles a 'query' event by logging the receipt of the query.

*/

import { sONOFF, proxyEvent, proxyAPIKey } from './sharedVARs.js'
import { appendFile } from 'fs';

export const handleMessage = {
    actions: {},
    connectionid: {},
    
  
    setWebSocket: function (webSocket, deviceIP) {
      this.connectionid[deviceIP] =  { ws: webSocket, msg: '' };
    },
  
    on: function (action, actionHandler) {
      this.actions[action] = actionHandler;
    },
  
    handleAction: function (action, ws) {
      const actionHandler = this.actions[action] || this.actions.defaultAction;
      // console.log('running: actionHandler');
      actionHandler(ws);
    },
  
    defaultAction: function () {
      console.log('Message was not expected');
      // Handle unexpected message logic here
      return 0;
    },
  
    msgInit: function (buffer, ws) {
      ws['msg'] = buffer.toString();
      console.log('\n\nWS message ' + ws['IP'] + ' | ' + ws['deviceid'] + '--> Proxy:', ws['msg']);

  
      try {
        let msgObj = JSON.parse(ws['msg']);
        if(msgObj['action'] == 'register') {
          ws['deviceid'] = msgObj['deviceid'];
          sONOFF[ws['deviceid']]["conn"] = {};
          sONOFF[ws['deviceid']]["conn"]['apikey'] = msgObj['apikey'];
          sONOFF[ws['deviceid']]["conn"]['ws'] = ws;
          sONOFF[ws['deviceid']]["state"] = 'Registering';
        }
        if (! sONOFF[ws['deviceid']]["isOnLine"]) sONOFF[ws['deviceid']]["isOnLine"] = false;
        console.log('device: ' + ws['deviceid'] + ' is now OnLine: ' + sONOFF[ws['deviceid']]["isOnLine"]);
        if (sONOFF[ws['deviceid']]["isOnLine"]) {
          console.log('\nemitting event pingReceived from device: ' + ws['deviceid']);
          proxyEvent.emit('messageFromDevice', ws['deviceid'], ws['msg']);
          proxyEvent.emit('pingReceived', ws['deviceid']);
          // proxyEvent.emit('pingReceived', ws['deviceid']);
          if(msgObj['action'] == 'update') {
            sONOFF[ws['deviceid']]['state'] = msgObj['params']['switch'];
          }
        }
        // handleMessage.connections.set(ws['deviceid'], ws);
        if (msgObj['error'] && msgObj['error'] !== '0') {
          console.log('PREV.CMD ERROR received');
          return 0;
        } else {
          console.log('PREV.CMD SUCCESSFULLY received');
        }
        if(msgObj.action) handleMessage.handleAction(msgObj.action, ws);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
      return ws['deviceid']; // return deviceID to be used as connectionId
    },
  };
  
  handleMessage.on('register', (ws) => {
    console.log('REGISTRATION request received... sending reply');
    const response = '{ "error": 0, "deviceid": "' + ws['deviceid'] + '", "apikey": "' + proxyAPIKey + '", "config": { "hb": 1, "hbInterval": 3 } }';
    // console.log('>>>: ' + response);
    console.log('WS message Proxy --> ' + ws['IP'] + ' | ' + ws['deviceid'] +  ': ', response);
    ws.send(response);
    // check if the registring device is one of known devices
    if (!sONOFF[ws['deviceid']]) { // 1st time we've seen this device
      sONOFF[ws['deviceid']] = {};
      sONOFF[ws['deviceid']]["alias"] = 'new-' + ws['deviceid']; // provide a new temporary alias
      console.log('device ' + ws['deviceid'] + ' is signing-in and is not on the known devices list. Check sONOFF.cmd file for new devices and replace its temporary given name: ' + sONOFF[ws['deviceid']]["alias"])
      appendFile('sONOFF.cmd', 'name ' + ws['deviceid'] + ' ' + sONOFF[ws['deviceid']]["alias"] + '\n', function (err) { // update sONOFF.cmd file with new device
        if (err) throw err;
        console.log('sONOFF.cmd file was updated!');
      });
    } else console.log('device ' + ws['deviceid'] + ' is signing-in and is known by the name: ' + sONOFF[ws['deviceid']]["alias"])
    sONOFF[ws['deviceid']]['registerSTR'] = ws['msg'];
    sONOFF[ws['deviceid']]["state"] = 'Registered';
  });
  
  handleMessage.on('date', (ws) => {
    sONOFF[ws['deviceid']]['dateSTR'] = ws['msg'];
    console.log('DATE request received');
    const response = '{ "error": 0, "deviceid": "' + ws['deviceid'] + '", "apikey": "' + proxyAPIKey + '", "date": "' + new Date().toISOString() + '" }';
    // console.log('>>>: ' + response);
    console.log('WS message Proxy --> ' + ws['IP'] + ' | ' + ws['deviceid'] +  ': ', response);
    ws.send(response);
  });
  
  handleMessage.on('update', (ws) => {
    sONOFF[ws['deviceid']]['updateSTR'] = ws['msg'];
    console.log('UPDATE received from device ' + ws['deviceid']);
    let msgObj = JSON.parse(ws['msg']);
    sONOFF[ws['deviceid']]['state'] = msgObj['params']['switch'];
    const response = '{ "error": 0, "deviceid": "' + ws['deviceid'] + '", "apikey": "' + proxyAPIKey + '" }';
    // console.log('>>>: ' + response);
    console.log('WS message Proxy --> ' + ws['IP'] + ' | ' + ws['deviceid'] +  ': ', response);
    ws.send(response);
  });
  
  handleMessage.on('query', (ws) => {
    sONOFF[ws['deviceid']]['querySTR'] = ws['msg'];
    console.log('QUERY received');
    sONOFF[ws['deviceid']]["isOnLine"] = true;
    console.log('device: ' + ws['deviceid'] + 'is now OnLine: ' + sONOFF[ws['deviceid']]["state"]);
    proxyEvent.emit('devConnEstablished', ws['deviceid'], 'date');
  });  