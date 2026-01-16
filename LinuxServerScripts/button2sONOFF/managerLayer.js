#!/root/.nvm/versions/node/v22.20.0/bin/node
'use strict';

/*
 * managerLayer.js
 * Node.js v22 port of managerLayer.sh
 */

const fs = require('fs');
const net = require('net');
const { spawn, exec } = require('child_process');
const http = require('http');
const readline = require('readline');
const path = require('path');

/* ================= CONFIG ================= */

const BASE_DIR = '/root/Domotica/LinuxServerScripts/button2sONOFF';
const SONOFF_CONFIG = path.join(BASE_DIR, 'config/sONOFF.config');
const BUTTONS_CONFIG = path.join(BASE_DIR, 'config/buttons.config');
const FIFO_PATH = path.join(BASE_DIR, 'logs/button_fifo');

const EWELINK_PROXY_URL = 'http://192.168.1.11:3000';
const EVENT_PORT = 7777;
const ARDUINO_SCREEN_NAME = 'arduino433tx';

/* ================= STATE (shared!) ================= */

const buttonState = Object.create(null);       // buttonID -> ON/OFF
const buttonDevices = Object.create(null);     // buttonID -> [alias...]
const deviceState = Object.create(null);       // alias -> ON/OFF
const deviceConnected = Object.create(null);   // alias -> yes/no
const deviceRfCode = Object.create(null);      // alias -> rfCODE
const deviceAlias = Object.create(null);       // deviceID -> alias
const deviceID = Object.create(null);          // alias -> deviceID

/* ================= HELPERS ================= */

function sendRfToggle(rfCode) {
  rfCode = rfCode.replace(/["\s]/g, '');
  const cmd = `screen -S "${ARDUINO_SCREEN_NAME}" -X stuff "s:${rfCode}"`;
  console.log(cmd);

  exec(cmd, err => {
    if (err) console.error('RF send failed:', err.message);
  });
}

function sendWifiSet(devID, desired) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ switch: desired.toLowerCase() });
    const url = new URL(`/device/${devID}`, EWELINK_PROXY_URL);

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      res => {
        res.resume();
        res.statusCode === 200 ? resolve() : reject();
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/* ================= CORE LOGIC ================= */

async function syncDevice(alias, desired) {
  console.log(`switching ${alias}: ${deviceState[alias]} → ${desired}`);

  if (deviceState[alias] === desired) {
    console.log('device already in sync... skipping');
    return;
  }

  const devID = deviceID[alias];
  console.log(`device ${alias} is ${deviceConnected[alias]} WiFi connected (${devID})`);

  if (deviceConnected[alias] === 'yes' && devID) {
    try {
      console.log(`send_wifi_set ${devID} ${desired}`);
      await sendWifiSet(devID, desired);
      deviceState[devID] = desired;
      return;
    } catch {
      console.log('WiFi failed, falling back to RF');
    }
  }

  if (deviceRfCode[alias]) {
    sendRfToggle(deviceRfCode[alias]);
    deviceState[alias] = desired;
  }
}

async function handleButtonPress(remoteID, buttonN) {
  const buttonID = `${remoteID}${buttonN}`;
  console.log(`dealing button: ${buttonID}`);

  buttonState[buttonID] = buttonState[buttonID] === 'ON' ? 'OFF' : 'ON';

  const devices = buttonDevices[buttonID] || [];
  console.log('devices -->', devices.join(' '));

  for (const alias of devices) {
      await syncDevice(alias, buttonState[buttonID]);
  }
}

/* ================= CONFIG LOADING ================= */

function stripButtonComments(line) {
  return line.replace(/#.*/, '').trim();
}

function loadConfigs() {
  /* ---- buttons.config ---- */
  let currentRemote = '';

  fs.readFileSync(BUTTONS_CONFIG, 'utf8')
    .split('\n')
    .map(stripButtonComments)
    .filter(Boolean)
    .forEach(line => {
      const [left, right] = line.split(':').map(s => s.trim());

      if (!right) {
        currentRemote = left.replace(/\s+/g, '');
      } else {
        const buttonN = left.split(/\s+/).pop();
        const buttonID = `${currentRemote}${buttonN}`;

        buttonDevices[buttonID] = right.split(/\s+/);
        buttonState[buttonID] = 'OFF';
      }
    });

  /* ---- sONOFF.config ---- */
  function stripComments(line) {
    // Remove // comments and trim whitespace
    return line.replace(/\/\/.*$/, '').trim();
  }
  
  fs.readFileSync(SONOFF_CONFIG, 'utf8')
    .split('\n')
    .map(stripComments)
    .filter(line => line.length > 0)   // remove empty lines
    .forEach(line => {
      // line = line.replace(/["\s]/g, ''); //remove double quotes
      console.log('RAW:', line);
  
      let [devID, alias, rfCode, desc] = line.split(':').map(s => s.trim());
      if (!desc) return;
  
      console.log(`PARSED → ${devID}, ${alias}, ${rfCode}, ${desc}`);
  
      deviceAlias[devID]       = alias;
      deviceRfCode[alias]      = rfCode;
      deviceState[alias]       = 'OFF';
      deviceConnected[alias]   = 'no';
      deviceID[alias]          = devID;
    });
}

/* ================= EVENT SERVER ================= */

function startEventServer() {
  const server = net.createServer(socket => {
    const rl = readline.createInterface({ input: socket });

    rl.on('line', line => {
      const [type, devID, value] = line.split(/\s+/);
      const alias = deviceAlias[devID]
      console.log('[EVENT]',`${alias}: `, line);

      switch (type) {
        case 'STATE_UPDATE':
          deviceState[alias] = value;
          break;
        case 'CONNECTED':
          deviceConnected[alias] = 'yes';
          break;
        case 'DISCONNECTED':
          deviceConnected[alias] = 'no';
          break;
        case 'ALIAS_UPDATE':
          // deviceAlias[devID] = value;
	  console.log("WARNING: This should no be allowed!!!");
          break;
      }
    });
  });

  server.listen(EVENT_PORT, '0.0.0.0', () =>
    console.log(`listening to EVENTS from ewelink-proxy on port ${EVENT_PORT}`)
  );

  server.on('connection', socket => {
    console.log(`Incoming connection from ${socket.remoteAddress}:${socket.remotePort}`);
  });


}

/* ================= FIFO LISTENER ================= */

function startFifoReader() {
  console.log('waiting for button presses');

  // Open FIFO in read+write mode so it never closes on writer exit
  const fd = fs.openSync(FIFO_PATH, 'r+');
  const stream = fs.createReadStream('', { fd, encoding: 'utf8', autoClose: true });
  const rl = readline.createInterface({ input: stream });

  rl.on('line', line => {
    if (!line.trim()) return;
    console.log('received button press:', line);
    const [remoteID, buttonN] = line.trim().split(/\s+/);
    handleButtonPress(remoteID, buttonN);
  });
}

/* ================= MAIN ================= */

loadConfigs();
startEventServer();
startFifoReader();

