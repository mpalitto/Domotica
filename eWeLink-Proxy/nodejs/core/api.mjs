// api.mjs
import { sONOFF } from './storage.mjs';
import { CONFIG } from './config.mjs';

/**
 * Returns an HTTP request handler for the REST API
 * @param {Function} saveAliases - function to persist aliases
 */
export function createApiHandler(saveAliases) {
  return (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.end();
      return;
    }

    // GET /devices → list all devices
    if (req.method === 'GET' && req.url === '/devices') {
      // api.mjs → inside GET /devices
      const list = Object.entries(sONOFF).map(([id, dev]) => ({
        deviceid: id,
        alias: dev.alias || `Sonoff-${id.slice(-5)}`,
        online: !!dev.online,
        state: dev.state || 'UNKNOWN',
        params: dev.params || { switch: 'off', fwVersion: '—' },
        fwVersion: dev.params?.fwVersion || '—',   // add this
        IP: dev.IP || '0.0.0.0'                   // add this
      }));

      res.end(JSON.stringify(list));
      return;
    }

    // POST /device/<id> → send command
    if (req.method === 'POST' && req.url.startsWith('/device/')) {
      const deviceID = req.url.split('/')[2];
      const device = sONOFF[deviceID];

      if (!device || !device.ws || device.ws.readyState !== device.ws.OPEN) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Device not online' }));
        return;
      }

      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        let cmd = {};
        try { cmd = JSON.parse(body); } 
        catch { res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }

        let aliasUpdated = false;
        if (cmd.alias) { device.alias = cmd.alias; aliasUpdated = true; delete cmd.alias; }

        if (Object.keys(cmd).length === 0 && !aliasUpdated) {
          res.statusCode = 400; res.end(JSON.stringify({ error: 'Empty command' }));
          return;
        }

        if (Object.keys(cmd).length > 0) {
          device.params = { ...device.params, ...cmd };
          device.ws.send(JSON.stringify({
            action: 'update',
            deviceid: deviceID,
            apikey: CONFIG.localApiKey,
            userAgent: 'app',
            sequence: Date.now().toString(),
            params: cmd,
            from: 'app'
          }));
          console.log(`[API] → ${deviceID} (${device.alias}):`, cmd);
        }

        if (aliasUpdated) saveAliases();
        res.end(JSON.stringify({ success: true, params: cmd }));
      });
      return;
    }

    // POST /set-alias/<id>
    if (req.method === 'POST' && req.url.startsWith('/set-alias/')) {
      const deviceID = req.url.split('/')[2];
      const device = sONOFF[deviceID];

      if (!device) { res.statusCode = 404; res.end(JSON.stringify({ error: 'Device not found' })); return; }

      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        let data = {};
        try { data = JSON.parse(body); } 
        catch { res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }

        if (!data.alias) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Missing alias' })); return; }

        device.alias = data.alias;
        saveAliases();
        console.log(`[API] Alias updated for ${deviceID}: ${data.alias}`);
        res.end(JSON.stringify({ success: true, alias: data.alias }));
      });
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  };
}

