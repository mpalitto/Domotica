import events from './events.mjs';
import { loadAliases, saveAliases, loadDeviceIdentities, sONOFF } from './storage.mjs';
import { CONFIG } from './config.mjs';
import { loadPlugins } from './plugins.mjs';
import { startDeviceMonitor } from './device-monitor.mjs';
import { LegacyModule } from '../modules/legacy/index.mjs';
import { ModernModule } from '../modules/modern/index.mjs';  // ← ADD THIS
import http from 'http';
import { createApiHandler } from './api.mjs';

(async () => {
  console.log('===========================================');
  console.log('  eWeLink Local Proxy (Modular)');
  console.log('===========================================\n');

  await loadAliases();
  // Restore the per-device cloud identity (real apikey/model/romVersion) so the
  // cloud bridge can impersonate RF-fallback devices even before/without them
  // connecting locally.
  await loadDeviceIdentities();

  // Load all plugins (they will subscribe to events)
  await loadPlugins(events, sONOFF, CONFIG);

  // Start device monitor (emits device:offline)
  // startDeviceMonitor({ sONOFF, events });

  // Start legacy module (HTTP + WS on port 8081)
  const legacy = new LegacyModule({ sONOFF, CONFIG, events });
  await legacy.start();

  // ✅ ADD THIS: Start modern module (HTTPS dispatch on 443 + WSS on 8082)
  const modern = new ModernModule({ sONOFF, CONFIG, events });
  await modern.start();

  // Start REST API server
  const apiServer = http.createServer(createApiHandler(saveAliases));
  apiServer.listen(CONFIG.apiPort, '0.0.0.0', () => {
    console.log(`✓ REST API running: http://0.0.0.0:${CONFIG.apiPort}`);
  });

  console.log('\n✓ eWeLink Local Proxy started successfully!\n');
})();
