/*
Author: Matteo Palitto
Date: January 9, 2024

Description: sharedVARs.js
This module exports the global variables
*/

// Object to store sONOFF device information
const sONOFF = {};
const cmdFile = './sONOFF.cmd' // Initial device configuration file

// events used for communication between modules
const events = require('events');  
const proxyEvent = new events.EventEmitter();

const reAPIkey = /apikey[^,]+/; //regular expression for the apikey...

const proxyAPIKey = '941c6e45-1111-4660-aa88-c9bd422f909d' // identifier for the Proxy 

module.exports = {
  dispatch,
  sONOFF,
  cmdFile,
  proxyEvent,
  reAPIkey,
  proxyAPIKey
};

