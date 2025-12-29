/*
Author: Matteo Palitto
Date: January 9, 2024

Description: sharedVARs.js
This module exports the global variables
*/

// Object to store sONOFF device information
const sONOFF = {};
const cmdFile = './config/sONOFF.cmd' // Initial device configuration file
// NOTE environment variables: /root/Domotica/eWeLink-Proxy/nodejs/config/proxy.env
const PROXY_IP = process.env.PROXY_IP || '192.168.1.11';
// const PROXY_PORT = parseInt(process.env.PROXY_PORT) || 8081;
const PROXY_PORT = parseInt(process.env.PROXY_PORT) || 443;
const TLS_KEY_PATH = process.env.TLS_KEY_PATH || '/root/WS/tls/matteo-key.pem';
const TLS_CERT_PATH = process.env.TLS_CERT_PATH || '/root/WS/tls/matteo-cert.pem';
const LOGS_DIR = './logs';

// events used for communication between modules
const events = require('events');  
const proxyEvent = new events.EventEmitter();

const reAPIkey = /apikey[^,]+/; //regular expression for the apikey...

const proxyAPIKey = '941c6e45-1111-4660-aa88-c9bd422f909d' // identifier for the Proxy  

// A dictionary to store dispatch information using device IDs as keys
const dispatch = {};

// Object to store connection statistics for each device
const deviceStats = {};

// Object to store connection diagnostics and timestamps
const deviceDiagnostics = {};

// **NEW: Connection state enums**
const ConnectionState = {
  OFFLINE: 'OFFLINE',
  DISPATCH: 'DISPATCH',
  WS_CONNECTED: 'WS-CONNECTED',
  REGISTERED: 'REGISTERED',
  ONLINE: 'ONLINE'
};

const SwitchState = {
  UNKNOWN: 'UNKNOWN',
  ON: 'ON',
  OFF: 'OFF'
};

// Debug mode configuration
const debugMode = {
  enabled: false,
  deviceId: null,
  autoEnabled: false  // Track if debug was auto-enabled vs manual
};

// Cloud protocol debug mode configuration
const cloudDebugMode = {
  enabled: false,
  logFile: LOGS_DIR + '/test-cloud-protocol.log'
};

// Protocol capture mode configuration
const protocolCapture = {
  enabled: false,
  ip: null,
  deviceId: null,
  logFile: null
};

// Transparent capture mode
const transparentMode = {
    enabled: false,
    deviceId: null,
    deviceIp: null,
    logFile: null,
    cloudWS: null,
    matchedByIp: false
};

const ipProtocolMap = new Map(); // Key: IP, Value: 'WSS' or 'WS'

module.exports = {
  dispatch,
  sONOFF,
  cmdFile,
  LOGS_DIR,
  proxyEvent,
  reAPIkey,
  proxyAPIKey,
  PROXY_IP,
  PROXY_PORT,
  TLS_KEY_PATH,
  TLS_CERT_PATH,
  deviceStats,
  deviceDiagnostics,
  debugMode,
  cloudDebugMode,
  protocolCapture,
  transparentMode,
  ConnectionState,  // Export enums
  SwitchState,
  ipProtocolMap
};
