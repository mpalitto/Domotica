export function setupWebSocketServer(wss, type, sONOFF, events, localApiKey) {
  wss.on('connection', (ws, req) => {
    const clientIP = req.socket.remoteAddress?.replace('::ffff:', '') || 'unknown';
    // console.log(`[${type.toUpperCase()} WS] ✓ New connection from ${clientIP}`);
    console.log(`[${type.toUpperCase()} WS] ✓ New connection from ${clientIP} (secure: ${!!req.socket.encrypted})`);

    let deviceID = null;
    let isFirstMessage = true;

    const pingInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) ws.ping();
      else clearInterval(pingInterval);
    }, 20_000);

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }

      if (msg.deviceid && isFirstMessage) {
        deviceID = msg.deviceid;
        const device = sONOFF[deviceID] ??= {};
        device.ws = ws;
        device.online = true;
        device.lastSeen = Date.now();
        device.alias ??= `Sonoff-${deviceID.slice(-5)}`;
	device.params ??= { switch: 'off' };
        // Set IP here from the socket
        device.IP = clientIP;



        console.log(`[${type.toUpperCase()} WS] Device ${deviceID} → ONLINE (${device.alias})`);
        events.emit('device:connected', { deviceID, device });

        isFirstMessage = false;
      }

      const device = sONOFF[deviceID];
      if (!device) return;

      // Registration
      if (msg.action === 'register') {
        device.apikey = msg.apikey || device.apikey || 'local';
        device.params ??= { switch: 'off' };
        device.state = 'REGISTERED';
        device.lastSeen = Date.now();

        if (msg.params?.deviceName && msg.params.deviceName !== device.alias) {
          device.alias = msg.params.deviceName;
          events.emit('device:alias-updated', { deviceID, alias: device.alias });
        }

        ws.send(JSON.stringify({
          error: 0,
          deviceid: deviceID,
          apikey: localApiKey,
          config: { hb: 1, hbInterval: 145 }
        }));

        console.log(`[${type.toUpperCase()} WS] ✓ Registered: ${deviceID} (${device.alias})`);
        events.emit('device:registered', { deviceID, device });
      }

      // Update
      else if (msg.action === 'update' && msg.params) {
        device.params = { ...device.params, ...msg.params };
        device.state = 'UPDATED';

        ws.send(JSON.stringify({
          error: 0,
          deviceid: deviceID,
          apikey: localApiKey
        }));

        console.log(`[${type.toUpperCase()} WS] Update from ${deviceID}:`, msg.params);
        events.emit('device:updated', { deviceID, params: msg.params });
      }

      // Query
      else if (msg.action === 'query') {
        ws.send(JSON.stringify({
          error: 0,
          deviceid: deviceID,
          apikey: localApiKey,
          params: device.params || {}
        }));
      }

      // Date request
      else if (msg.action === 'date') {
        ws.send(JSON.stringify({
          error: 0,
          deviceid: deviceID,
          apikey: localApiKey,
          date: new Date().toISOString()
        }));
      }

      // Always update lastSeen
      device.lastSeen = Date.now();
    });

    ws.on('pong', () => {
      if (deviceID && sONOFF[deviceID]) sONOFF[deviceID].lastSeen = Date.now();
    });

    ws.on('close', () => {
      clearInterval(pingInterval);
      if (deviceID && sONOFF[deviceID]) {
        const device = sONOFF[deviceID];
        device.online = false;
        console.log(`[${type.toUpperCase()} WS] ✗ Disconnected: ${deviceID} (${device.alias})`);
        events.emit('device:disconnected', { deviceID, device });
      }
    });

    ws.on('error', err => console.error(`[${type.toUpperCase()} WS ERROR] ${deviceID}: ${err.message}`));
  });
}

