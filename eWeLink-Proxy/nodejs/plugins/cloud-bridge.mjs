// plugins/cloud-bridge.mjs
// Keeps a cloud (proxy↔eWeLink-AWS) connection impersonating each device.
//
// Key behaviour: the cloud connection is INDEPENDENT of the device's local
// WiFi/WebSocket. When the device's WiFi drops, the proxy keeps the cloud
// connection alive ("ghost device") so Alexa / the app still reach it, and
// forwards the command to managerLayer.sh (192.168.1.77) which fires the RF
// fallback. State coming back from managerLayer is pushed to the cloud.

import WebSocket from 'ws';
import https from 'https';
import net from 'net';
import { saveDeviceIdentities } from '../core/storage.mjs';

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
const reconnectState = new Map(); // deviceID → { count, deviceApiKey, model, romVersion, timer }

// ManagerLayer TCP link (192.168.1.77:7777) — used to trigger the RF fallback
// when the device is not reachable over WiFi.
const MANAGERLAYER_HOST = '192.168.1.77';
const MANAGERLAYER_PORT = 7777;

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
  if (!deviceApiKey) return;
  // Already connected or connecting — don't re-dispatch to the cloud.
  const existing = cloudConnections.get(deviceID);
  if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) return;
  getCloudServer(
    deviceID,
    deviceApiKey,
    model,
    romVersion,
    (url) => openWebSocket(deviceID, url, deviceApiKey, model, romVersion),
    (err) => {
      console.log(`[CLOUD] Dispatch failed: ${err}`);
      scheduleReconnect(deviceID);
    }
  );
}

function openWebSocket(deviceID, cloudUrl, deviceApiKey, model, romVersion) {
  if (cloudConnections.has(deviceID)) return;

  reconnectState.set(deviceID, { count: 0, deviceApiKey, model, romVersion });

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
      romVersion,
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
      if (!sONOFF[deviceID]) sONOFF[deviceID] = {};
      if (!sONOFF[deviceID].conn) sONOFF[deviceID].conn = {};
      if (cloudApiKey !== deviceApiKey) {
        sONOFF[deviceID].conn.cloudApiKey = cloudApiKey;
      }

      const rState = reconnectState.get(deviceID);
      if (rState) rState.count = 0;

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

    // Cloud command from app (Alexa / eWeLink app)
    if (msg.action === 'update' && msg.userAgent === 'app' && msg.params && msg.sequence) {
      console.log(`[CLOUD] ← App command: ${JSON.stringify(msg.params)} (seq: ${msg.sequence})`);

      const device = sONOFF[deviceID];
      const localOpen = !!(device?.ws && device.ws.readyState === WebSocket.OPEN);

      // Store original sequence for ack
      pendingSequences.set(deviceID, msg.sequence);

      // Immediate local state update (the source of truth for the proxy/UI)
      if (device) device.params = { ...device.params, ...msg.params };

      if (localOpen) {
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

        device.ws.send(commandMsg);
        console.log(`[CLOUD] → Forwarded command to device (WiFi)`);
      } else {
        // Device WiFi is down → fire the RF fallback via managerLayer on .77.
        sendRfToggle(deviceID, msg.params.switch);
        console.log(`[CLOUD] → Device offline, sent RF_TOGGLE fallback`);
      }

      // Emit for REST/button/WebUI sync
      events.emit('device:updated', { deviceID, params: msg.params });

      // Send ONLY sequenced ack (no params, no action) — exactly like a real
      // device. This is what stops Alexa from saying "device not responding".
      const ack = JSON.stringify({
        error: 0,
        deviceid: deviceID,
        apikey: sONOFF[deviceID]?.conn?.cloudApiKey || deviceApiKey,
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
    scheduleReconnect(deviceID);
  });

  ws.on('error', (err) => console.log(`[CLOUD] Error: ${err.message}`));
}


function scheduleReconnect(deviceID) {
  const state = reconnectState.get(deviceID);
  if (!state) return;
  if (state.count >= CLOUD_CONFIG.MAX_RECONNECT_ATTEMPTS) {
    console.log('[CLOUD] Max reconnect attempts reached for ' + deviceID);
    reconnectState.delete(deviceID);
    return;
  }
  state.count++;
  const delay = Math.min(
    CLOUD_CONFIG.RECONNECT_BASE_DELAY_MS * Math.pow(2, state.count - 1),
    CLOUD_CONFIG.RECONNECT_MAX_DELAY_MS
  );
  console.log('[CLOUD] Reconnecting ' + deviceID + ' in ' + delay + 'ms (attempt ' + state.count + ')');
  const timer = setTimeout(() => {
    connectToCloud(deviceID, state.deviceApiKey, state.model, state.romVersion);
  }, delay);
  reconnectState.set(deviceID, { ...state, timer });
}

function cancelReconnect(deviceID) {
  const state = reconnectState.get(deviceID);
  if (state && state.timer) {
    clearTimeout(state.timer);
  }
  reconnectState.delete(deviceID);
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
let managerSocket = null;
let managerConnected = false;

/**
 * Fire an RF toggle through managerLayer.sh on 192.168.1.77:7777.
 * managerLayer decides whether the device is RF-capable and falls back
 * accordingly; if it has no RF code for the device the command is a no-op.
 */
function sendRfToggle(deviceID, desired) {
  const state = (desired || '').toString().toLowerCase();
  if (state !== 'on' && state !== 'off') {
    console.log(`[CLOUD] RF_TOGGLE skipped for ${deviceID}: no valid switch in ${JSON.stringify(desired)}`);
    return;
  }
  if (!managerSocket || !managerConnected) {
    console.log(`[CLOUD] RF_TOGGLE ${deviceID} ${state.toUpperCase()} dropped: managerLayer link down`);
    return;
  }
  managerSocket.write(`RF_TOGGLE ${deviceID} ${state.toUpperCase()}\n`, (err) => {
    if (err) console.log(`[CLOUD] RF_TOGGLE write failed: ${err.message}`);
  });
  console.log(`[CLOUD] RF_TOGGLE ${deviceID} ${state.toUpperCase()}`);
}

export default {
  init: (_events, _devices, _config) => {
    events = _events;
    sONOFF = _devices;
    CONFIG = _config;

    console.log('[CloudBridge] Ghost-cloud version loaded');

    // ── ManagerLayer TCP link (used only to fire RF fallback toggles) ──
    function connectManager() {
      if (managerSocket && !managerSocket.destroyed) return;
      managerSocket = new net.Socket();
      managerSocket.setNoDelay(true);
      managerSocket.on('connect', () => {
        managerConnected = true;
        console.log(`[CLOUD] ManagerLayer link up (${MANAGERLAYER_HOST}:${MANAGERLAYER_PORT})`);
      });
      managerSocket.on('error', (err) => {
        managerConnected = false;
        console.log(`[CLOUD] ManagerLayer link error: ${err.message}`);
        const s = managerSocket; managerSocket = null; if (s) s.destroy();
        setTimeout(connectManager, 2500);
      });
      managerSocket.on('close', () => {
        if (!managerConnected) return;
        managerConnected = false;
        managerSocket = null;
        setTimeout(connectManager, 2500);
      });
      managerSocket.connect(MANAGERLAYER_PORT, MANAGERLAYER_HOST);
    }
    connectManager();

    // A device learning its real apikey (local registration) → connect to the
    // cloud and persist the identity so it survives restarts.
    events.on('device:registered', ({ deviceID, device }) => {
      const realApiKey = device.apikey;
      if (!realApiKey || realApiKey === CONFIG.localApiKey) return;

      if (!device.conn) device.conn = {};
      const isNewIdentity = device.conn.deviceApiKey !== realApiKey;
      device.conn.deviceApiKey = realApiKey;

      if (isNewIdentity) saveDeviceIdentities().catch(() => {});

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

      // Normal unsolicited state update (e.g. STATE_UPDATE fed back by .77
      // after an RF toggle) → keeps Alexa/app in sync.
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

    // IMPORTANT: a device going offline MUST NOT tear the cloud connection
    // down. That is the whole point — the proxy keeps impersonating the device
    // towards the cloud so Alexa/app commands still arrive, and they are then
    // served by the RF fallback. Only a genuine registration with a different
    // apikey replaces the connection.
    events.on('device:disconnected', ({ deviceID }) => {
      const device = sONOFF[deviceID];
      const hasIdentity = !!device?.conn?.deviceApiKey;
      const ws = cloudConnections.get(deviceID);
      if (hasIdentity && (!ws || ws.readyState !== WebSocket.OPEN)) {
        console.log(`[CLOUD] ${deviceID} local offline → keeping ghost cloud link`);
        connectToCloud(deviceID, device.conn.deviceApiKey, device.model, device.romVersion);
      }
    });

    // Startup: open a ghost cloud link for every device whose identity we
    // restored from disk, even if it has not connected locally this boot. This
    // is what makes the proxy resistant to a restart while a device's WiFi is
    // down — the cloud never sees it drop.
    let booted = 0;
    for (const [deviceID, device] of Object.entries(sONOFF)) {
      const apikey = device.conn?.deviceApiKey;
      if (!apikey) continue;
      if (cloudConnections.has(deviceID)) continue;
      connectToCloud(deviceID, apikey, device.model, device.romVersion);
      booted++;
    }
    if (booted) console.log(`[CLOUD] Bootstrapped ${booted} ghost cloud link(s) from persisted identities`);
  }
};
