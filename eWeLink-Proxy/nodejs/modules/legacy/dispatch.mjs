// ./modules/legacy/dispatch.mjs
export function sendDispatchResponse(res, deviceID, clientIP, targetPort) {
  const response = JSON.stringify({
    error: 0,
    reason: 'ok',
    IP: '192.168.1.11',
    port: targetPort
  });
  res.writeHead(200, {
    'Server': 'openresty',
    'Date': new Date().toUTCString(),
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(response, 'utf8'),
    'Connection': 'keep-alive'
  });
  res.end(response);
  console.log(`[DISPATCH] ${deviceID} → port ${targetPort} (IP: ${clientIP})`);
}

export function createDispatchHandler(sONOFF, CONFIG, events) {
  return (req, res) => {
    if (req.method !== 'POST' || req.url !== '/dispatch/device') {
      res.writeHead(404).end();
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let device;
      try {
        device = JSON.parse(body);
      } catch {
        res.writeHead(400).end();
        return;
      }

      const deviceID = device.deviceid;
      if (!deviceID) {
        res.writeHead(400).end();
        return;
      }

      const clientIP = req.socket.remoteAddress?.replace('::ffff:', '') || 'unknown';
      const isSecure = !!req.socket.encrypted;  // ✅ Check if HTTPS
      
      // ✅ Route to correct port based on security
      const targetPort = isSecure ? CONFIG.modernWsPort : CONFIG.legacyPort;

      sONOFF[deviceID] ??= {};
      Object.assign(sONOFF[deviceID], {
        apikey: device.apikey,
        romVersion: device.romVersion,
        model: device.model,
        IP: clientIP,
        isSecure: isSecure,
        state: 'DISPATCH',
        lastSeen: Date.now()
      });

      sendDispatchResponse(res, deviceID, clientIP, targetPort);  // ✅ Use calculated port

      console.log(
        `[DISPATCH] Device: ${deviceID} (${device.model || '?'}) ` +
        `from ${clientIP} (secure: ${isSecure}) → port ${targetPort}`
      );
    });
  };
}
