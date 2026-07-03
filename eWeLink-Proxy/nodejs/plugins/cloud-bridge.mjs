// plugins/cloud-bridge.mjs
// Final working version - only sequenced ack for cloud commands

import WebSocket from 'ws';
import https from 'https';

const CLOUD_CONFIG = {
  DISPATCH_HOSTNAME: 'eu-disp.coolkit.cc',
  HEARTBEAT_INTERVAL_MS: 120000,
  REGISTRATION_TIMEOUT_MS: 30000,
  HTTPS_TIMEOUT_MS: 10000,
  RECONNECT_BASE_DELAY_MS: 5000,
  RECONNECT_MAX_DELAY_MS: 60000,
  MAX_RECONNECT_ATTEMPTS: 5
};

const cloudConnections = new Map();
const heartbeatTimers = new Map();
const registrationTimeouts = new Map();
const pendingSequences = new Map(); // deviceID → original cloud sequence

function getCloudServer(deviceID, deviceApiKey, model, romVersion, onSuccess, onError) {
  const ts = Math.floor(Date.now() / 1000);
  const postData = JSON.stringify({
    accept: 'ws;2',
    version: 2,
    ts: ts,
    deviceid: deviceID,
    apikey: deviceApiKey,
    model: model || 'ITA-GZ1-GL',
    romVersion: romVersion || '1.5.5'
  });

  const options = {
    hostname: CLOUD_CONFIG.DISPATCH_HOSTNAME,
    port: 443,
    path: '/dispatch/device',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    },
    rejectUnauthorized: false
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(body);
        if (json.error === 0) {
          const url = `wss://${json.IP}:${json.port}/api/ws`;
          console.log(`[CLOUD] Dispatch → ${url}`);
          onSuccess(url);
        } else {
          onError(`Error ${json.error}`);
        }
      } catch (e) {
        onError('Parse error');
      }
    });
  });

  req.on('error', () => onError('Request failed'));
  req.on('timeout', () => { req.destroy(); onError('Timeout'); });
  req.setTimeout(CLOUD_CONFIG.HTTPS_TIMEOUT_MS);
  req.write(postData);
  req.end();
}

function connectToCloud(deviceID, deviceApiKey, model, romVersion) {
  getCloudServer(
    deviceID,
    deviceApiKey,
    model,
    romVersion,
    (url) => openWebSocket(deviceID, url, deviceApiKey),
    (err) => console.log(`[CLOUD] Dispatch failed: ${err}`)
  );
}

function openWebSocket(deviceID, cloudUrl, deviceApiKey) {
  if (cloudConnections.has(deviceID)) return;

  const ws = new WebSocket(cloudUrl, { rejectUnauthorized: false });
  ws.registrationComplete = false;

  ws.on('open', () => {
    console.log(`[CLOUD] Connected - registering ${deviceID}`);
    registrationTimeouts.set(deviceID, setTimeout(() => {
      if (!ws.registrationComplete) ws.close();
    }, CLOUD_CONFIG.REGISTRATION_TIMEOUT_MS));

    ws.send(JSON.stringify({
      userAgent: 'device',
      apikey: deviceApiKey,
      deviceid: deviceID,
      action: 'register',
      version: 2,
      romVersion: sONOFF[deviceID]?.romVersion || '1.5.5',
      model: sONOFF[deviceID]?.model || 'ITA-GZ1-GL',
      ts: Math.floor(Date.now() / 1000)
    }));
  });

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    // Registration success
    if (msg.error === 0 && msg.apikey && !ws.registrationComplete) {
      ws.registrationComplete = true;
      clearTimeout(registrationTimeouts.get(deviceID));

      const cloudApiKey = msg.apikey;
      if (!sONOFF[deviceID].conn) sONOFF[deviceID].conn = {};
      if (cloudApiKey !== deviceApiKey) {
        sONOFF[deviceID].conn.cloudApiKey = cloudApiKey;
      }

      console.log(`[CLOUD] ✓ Registered ${deviceID}`);

      const timer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            userAgent: 'device',
            apikey: cloudApiKey,
            deviceid: deviceID,
            action: 'date'
          }));
        }
      }, CLOUD_CONFIG.HEARTBEAT_INTERVAL_MS);
      heartbeatTimers.set(deviceID, timer);

      cloudConnections.set(deviceID, ws);
      return;
    }

    // Cloud command from app
    if (msg.action === 'update' && msg.userAgent === 'app' && msg.params && msg.sequence) {
      console.log(`[CLOUD] ← App command: ${JSON.stringify(msg.params)} (seq: ${msg.sequence})`);

      const device = sONOFF[deviceID];
      if (!device?.ws || device.ws.readyState !== WebSocket.OPEN) {
        console.log(`[CLOUD] Device not locally connected`);
        return;
      }

      // Store original sequence for ack
      pendingSequences.set(deviceID, msg.sequence);

      // Rebuild command exactly like REST API
      const commandMsg = JSON.stringify({
        action: 'update',
        deviceid: deviceID,
        apikey: CONFIG.localApiKey,
        userAgent: 'app',
        sequence: Date.now().toString(),
        params: msg.params,
        from: 'app'
      });

      // Immediate local state update
      device.params = { ...device.params, ...msg.params };

      // Send to device
      device.ws.send(commandMsg);
      console.log(`[CLOUD] → Forwarded command to device`);

      // Emit for REST/button sync
      events.emit('device:updated', { deviceID, params: msg.params });

      // Send ONLY sequenced ack (no params, no action)
      const ack = JSON.stringify({
        error: 0,
        deviceid: deviceID,
        apikey: sONOFF[deviceID].conn?.cloudApiKey || deviceApiKey,
        userAgent: 'device',
        sequence: msg.sequence
      });
      ws.send(ack);
      console.log(`[CLOUD] → Sent sequenced ack (exact match to real device)`);
    }
  });

  ws.on('close', () => {
    console.log(`[CLOUD] Connection closed ${deviceID}`);
    cleanup(deviceID);
  });

  ws.on('error', (err) => console.log(`[CLOUD] Error: ${err.message}`));
}

function cleanup(deviceID) {
  clearTimeout(registrationTimeouts.get(deviceID));
  registrationTimeouts.delete(deviceID);
  clearInterval(heartbeatTimers.get(deviceID));
  heartbeatTimers.delete(deviceID);
  cloudConnections.delete(deviceID);
  pendingSequences.delete(deviceID);
}

// === PLUGIN ===
let sONOFF, events, CONFIG;

export default {
  init: (_events, _devices, _config) => {
    events = _events;
    sONOFF = _devices;
    CONFIG = _config;

    console.log('[CloudBridge] Final working version loaded');

    events.on('device:registered', ({ deviceID, device }) => {
      const realApiKey = device.apikey;
      if (!realApiKey || realApiKey === CONFIG.localApiKey) return;

      if (!device.conn) device.conn = {};
      device.conn.deviceApiKey = realApiKey;

      connectToCloud(deviceID, realApiKey, device.model, device.romVersion);
    });

    // Only send full update for non-cloud-origin changes (REST API, button press)
    events.on('device:updated', ({ deviceID, params }) => {
      const conn = sONOFF[deviceID]?.conn;
      if (!conn?.deviceApiKey) return;

      const ws = cloudConnections.get(deviceID);
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      // If this was from a cloud command, we already sent the sequenced ack — skip full update
      if (pendingSequences.has(deviceID)) {
        pendingSequences.delete(deviceID);
        return;
      }

      // Normal unsolicited state update
      const updateMsg = JSON.stringify({
        userAgent: 'device',
        apikey: conn.cloudApiKey || conn.deviceApiKey,
        deviceid: deviceID,
        action: 'update',
        params: params
      });

      ws.send(updateMsg);
      console.log(`[CLOUD] → Sent unsolicited update: ${JSON.stringify(params)}`);
    });

    events.on('device:disconnected', ({ deviceID }) => {
      const ws = cloudConnections.get(deviceID);
      if (ws) ws.close();
      cleanup(deviceID);
    });
  }
};
