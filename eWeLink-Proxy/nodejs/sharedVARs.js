/*
Author: Matteo Palitto
Date: January 9, 2024

Description: sharedVARs.js
This module exports the global variables
*/

// Object to store sONOFF device information
const sONOFF = {};
const cmdFile = './sONOFF.cmd' // Initial device configuration file
const PROXY_IP = process.env.PROXY_IP || '192.168.1.11';
const PROXY_PORT = process.env.PROXY_PORT || 8888; //parseInt(process.env.PROXY_PORT)
const TLS_KEY_PATH = process.env.TLS_KEY_PATH || '/root/WS/tls/matteo-key.pem';
const TLS_CERT_PATH = process.env.TLS_CERT_PATH || '/root/WS/tls/matteo-cert.pem';


// events used for communication between modules
const events = require('events');  
const proxyEvent = new events.EventEmitter();

const reAPIkey = /apikey[^,]+/; //regular expression for the apikey...

const proxyAPIKey = '941c6e45-1111-4660-aa88-c9bd422f909d' // identifier for the Proxy 

// A dictionary to store dispatch information using device IDs as keys
const dispatch = {};

module.exports = {
  dispatch,
  sONOFF,
  cmdFile,
  proxyEvent,
  reAPIkey,
  proxyAPIKey,
  PROXY_IP,
  PROXY_PORT,
  TLS_KEY_PATH,
  TLS_CERT_PATH
};

