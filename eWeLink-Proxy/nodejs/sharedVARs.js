// A dictionary to store dispatch information using device IDs as keys
const dispatch = {};

// Object to store sONOFF device information
const sONOFF = {};
const cmdFile = './sONOFF.cmd'

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

