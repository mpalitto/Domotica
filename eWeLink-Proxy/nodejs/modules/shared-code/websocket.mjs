// ./core/websocket.mjs
/**
 * Setup WebSocket server with device connection handling
 * @param {WebSocketServer} wss - WebSocket server instance
 * @param {string} type - Server type ('legacy' or 'modern')
 * @param {object} sONOFF - Shared device registry
 * @param {EventEmitter} events - Event emitter for cross-module communication
 * @param {string} localApiKey - Local API key for responses
 */
export function setupWebSocketServer(wss, type, sONOFF, events, localApiKey) {
  wss.on('connection', (ws, req) => {
    const clientIP = req.socket.remoteAddress?.replace('::ffff:', '') || 'unknown';
    const isSecure = !!req.socket.encrypted;
    
    console.log(
      `[${type.toUpperCase()} WS] ✓ New connection from ${clientIP} ` +
      `(secure: ${isSecure})`
    );

    let deviceID = null;
    let isFirstMessage = true;

    // Heartbeat ping
    const pingInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) ws.ping();
      else clearInterval(pingInterval);
    }, 20_000);

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        console.error(`[${type.toUpperCase()} WS] Invalid JSON received`);
        return;
      }

      // First message - identify device
      if (msg.deviceid && isFirstMessage) {
        deviceID = msg.deviceid;
        const device = sONOFF[deviceID] ??= {};
        
        device.ws = ws;
        device.online = true;
        device.lastSeen = Date.now();
        device.alias ??= `Sonoff-${deviceID.slice(-5)}`;
        device.params ??= { switch: 'off' };
        device.IP = clientIP;

        console.log(
          `[${type.toUpperCase()} WS] Device ${deviceID} → ONLINE ` +
          `(${device.alias})`
        );
        
        events.emit('device:connected', { deviceID, device });
        isFirstMessage = false;
      }

      const device = sONOFF[deviceID];
      if (!device) return;

      // Handle different actions
      if (msg.action === 'register') {
        handleRegister(ws, msg, device, deviceID, type, localApiKey, events);
      }
      else if (msg.action === 'update' && msg.params) {
        handleUpdate(ws, msg, device, deviceID, type, localApiKey, events);
      }
      else if (msg.action === 'query') {
        handleQuery(ws, device, deviceID, localApiKey);
      }
      else if (msg.action === 'date') {
        handleDate(ws, deviceID, localApiKey);
      }

      // Always update lastSeen
      device.lastSeen = Date.now();
    });

    ws.on('pong', () => {
      if (deviceID && sONOFF[deviceID]) {
        sONOFF[deviceID].lastSeen = Date.now();
      }
    });

    ws.on('close', () => {
      clearInterval(pingInterval);
      if (deviceID && sONOFF[deviceID]) {
        const device = sONOFF[deviceID];
        device.online = false;
        console.log(
          `[${type.toUpperCase()} WS] ✗ Disconnected: ${deviceID} ` +
          `(${device.alias})`
        );
        events.emit('device:disconnected', { deviceID, device });
      }
    });

    ws.on('error', err => {
      console.error(
        `[${type.toUpperCase()} WS ERROR] ${deviceID || 'unknown'}: ` +
        `${err.message}`
      );
    });
  });
}

/**
 * Handle device registration
 */
function handleRegister(ws, msg, device, deviceID, type, localApiKey, events) {
  device.apikey = msg.apikey || device.apikey || 'local';
  device.params ??= { switch: 'off' };
  device.state = 'REGISTERED';
  device.lastSeen = Date.now();

  // Update alias if provided
  if (msg.params?.deviceName && msg.params.deviceName !== device.alias) {
    device.alias = msg.params.deviceName;
    events.emit('device:alias-updated', { deviceID, alias: device.alias });
  }

  // Send registration response
  ws.send(JSON.stringify({
    error: 0,
    deviceid: deviceID,
    apikey: localApiKey,
    config: { hb: 1, hbInterval: 145 }
  }));

  console.log(
    `[${type.toUpperCase()} WS] ✓ Registered: ${deviceID} (${device.alias})`
  );
  events.emit('device:registered', { deviceID, device });
}

/**
 * Handle device update
 */
function handleUpdate(ws, msg, device, deviceID, type, localApiKey, events) {
  device.params = { ...device.params, ...msg.params };
  device.state = 'UPDATED';

  ws.send(JSON.stringify({
    error: 0,
    deviceid: deviceID,
    apikey: localApiKey
  }));

  console.log(
    `[${type.toUpperCase()} WS] Update from ${deviceID}:`,
    msg.params
  );
  events.emit('device:updated', { deviceID, params: msg.params });
}

/**
 * Handle device query
 */
function handleQuery(ws, device, deviceID, localApiKey) {
  ws.send(JSON.stringify({
    error: 0,
    deviceid: deviceID,
    apikey: localApiKey,
    params: device.params || {}
  }));
}

/**
 * Handle date request
 */
function handleDate(ws, deviceID, localApiKey) {
  ws.send(JSON.stringify({
    error: 0,
    deviceid: deviceID,
    apikey: localApiKey,
    date: new Date().toISOString()
  }));
}
