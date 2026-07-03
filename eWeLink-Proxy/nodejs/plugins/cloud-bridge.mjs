// plugins/cloud-bridge.mjs
// Final working version - health-checked heartbeats + sequenced ack for cloud commands

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
        const data = JSON.parse(body);
        if (data.action === 'dispatch' && data.server) {
          onSuccess(data.server, data.port || 8080);
        } else {
          onError(new Error('Invalid dispatch response'));
        }
      } catch (err) {
        onError(err);
      }
    });
  });

  req.on('error', onError);
  req.setTimeout(CLOUD_CONFIG.HTTPS_TIMEOUT_MS, () => {
    req.destroy();
    onError(new Error('HTTPS timeout'));
  });
  req.end();
}

function startCloudBridge(deviceID, deviceApiKey, model, romVersion, sONOFF, events) {
  const device = sONOFF[deviceID];
  if (!device) return;

  console.log(`[CLOUD] Starting bridge for ${deviceID} (${device.alias || 'unknown'})`);

  getCloudServer(
    deviceID,
    deviceApiKey,
    model,
    romVersion,
    (server, port) => {
      console.log(`[CLOUD] Connected to ${server}:${port} for ${deviceID}`);

      const ws = new WebSocket(`ws://${server}:${port}`, {
        headers: {
          'User-Agent': 'US-IT-GZ1-GL/1.5.5',
          'Origin': 'https://app.govee.com'
        }
      });

      ws._heartbeatTimeouts = new Map();
      cloudConnections.set(deviceID, ws);

      // Send registration
      ws.send(JSON.stringify({
        action: 'registration',
        deviceid: deviceID,
        apikey: deviceApiKey,
        model: model || 'ITA-GZ1-GL',
        romVersion: romVersion || '1.5.5'
      }));

      let missedHeartbeats = 0;

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());

          // Heartbeat response — check if we sent a heartbeat for this sequence
          if (msg.action === 'heartbeat' && msg.seq) {
            const t = ws._heartbeatTimeouts.get(msg.seq);
            if (t) {
              clearTimeout(t);
              ws._heartbeatTimeouts.delete(msg.seq);
              missedHeartbeats = 0;
            }
          }

          // Registration success
          if (msg.action === 'registration' && msg.status === 'ok') {
            console.log(`[CLOUD] Registration successful for ${deviceID}`);
            // Start heartbeat
            const startHeartbeat = () => {
              let seq = Date.now();
              const timer = setInterval(() => {
                // Check if previous heartbeat got a response
                if (missedHeartbeats > 2) {
                  console.log(`[CLOUD] Heartbeat missed for ${deviceID}, reconnecting...`);
                  missedHeartbeats = 0;
                  ws.close();
                  return;
                }
                seq = (seq + 1) % 1000000;
                ws.send(JSON.stringify({ action: 'date', seq }));
                const t = setTimeout(() => {
                  missedHeartbeats++;
                  ws._heartbeatTimeouts.delete(seq);
                }, 10000);
                ws._heartbeatTimeouts.set(seq, t);
              }, CLOUD_CONFIG.HEARTBEAT_INTERVAL_MS);
              heartbeatTimers.set(deviceID, timer);
            };
            startHeartbeat();
          }

          // Handle cloud commands
          if (msg.action === 'update' && msg.userAgent === 'app' && msg.params && msg.sequence) {
            pendingSequences.set(deviceID, msg.sequence);
            const target = sONOFF[msg.deviceid];
            if (target && target.ws && target.ws.readyState === 1) {
              target.ws.send(JSON.stringify({
                action: 'update',
                deviceid: msg.deviceid,
                apikey: deviceApiKey,
                userAgent: 'app',
                sequence: msg.sequence,
                params: msg.params,
                from: 'cloud'
              }));
            }
          }
        } catch (err) {
          console.error(`[CLOUD] Parse error for ${deviceID}:`, err.message);
        }
      });

      ws.on('close', () => {
        console.log(`[CLOUD] Connection closed for ${deviceID}`);
        const timer = heartbeatTimers.get(deviceID);
        if (timer) {
          clearInterval(timer);
          heartbeatTimers.delete(deviceID);
        }
        // Clear any pending heartbeat timeouts
        const wsConn = cloudConnections.get(deviceID);
        if (wsConn?._heartbeatTimeouts) {
          for (const t of wsConn._heartbeatTimeouts.values()) clearTimeout(t);
          wsConn._heartbeatTimeouts.clear();
        }
        cloudConnections.delete(deviceID);
        pendingSequences.delete(deviceID);

        // Reconnect after delay
        let delay = CLOUD_CONFIG.RECONNECT_BASE_DELAY_MS;
        let attempts = 0;
        const reconnect = () => {
          if (attempts >= CLOUD_CONFIG.MAX_RECONNECT_ATTEMPTS) {
            console.log(`[CLOUD] Max reconnect attempts reached for ${deviceID}`);
            return;
          }
          attempts++;
          console.log(`[CLOUD] Reconnecting ${deviceID} in ${delay}ms (attempt ${attempts})`);
          setTimeout(() => startCloudBridge(deviceID, deviceApiKey, model, romVersion, sONOFF, events), delay);
          delay = Math.min(delay * 2, CLOUD_CONFIG.RECONNECT_MAX_DELAY_MS);
        };
        reconnect();
      });

      ws.on('error', (err) => {
        console.error(`[CLOUD] Error for ${deviceID}:`, err.message);
      });
    },
    (err) => {
      console.error(`[CLOUD] Failed to start bridge for ${deviceID}:`, err.message);
      // Reconnect after delay
      setTimeout(() => startCloudBridge(deviceID, deviceApiKey, model, romVersion, sONOFF, events), CLOUD_CONFIG.RECONNECT_BASE_DELAY_MS);
    }
  );

  // Registration timeout
  const regTimeout = setTimeout(() => {
    console.error(`[CLOUD] Registration timeout for ${deviceID}`);
    const ws = cloudConnections.get(deviceID);
    if (ws) ws.close();
  }, CLOUD_CONFIG.REGISTRATION_TIMEOUT_MS);
  registrationTimeouts.set(deviceID, regTimeout);
}

// Event handlers
events.on('device:registered', ({ deviceID, deviceApiKey, model, romVersion }) => {
  startCloudBridge(deviceID, deviceApiKey, model, romVersion, sONOFF, events);
});

events.on('device:unregistered', ({ deviceID }) => {
  const ws = cloudConnections.get(deviceID);
  if (ws) {
    ws.close();
    cloudConnections.delete(deviceID);
  }
  const timer = heartbeatTimers.get(deviceID);
  if (timer) {
    clearInterval(timer);
    heartbeatTimers.delete(deviceID);
  }
  const t = registrationTimeouts.get(deviceID);
  if (t) {
    clearTimeout(t);
    registrationTimeouts.delete(deviceID);
  }
  const wsConn = cloudConnections.get(deviceID);
  if (wsConn?._heartbeatTimeouts) {
    for (const t of wsConn._heartbeatTimeouts.values()) clearTimeout(t);
    wsConn._heartbeatTimeouts.clear();
  }
  cloudConnections.delete(deviceID);
  pendingSequences.delete(deviceID);
  console.log(`[CLOUD] Removed bridge for ${deviceID}`);
});

export { startCloudBridge };
