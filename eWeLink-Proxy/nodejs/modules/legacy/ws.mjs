// ./modules/legacy/ws.mjs
import http from 'http';
import { WebSocketServer } from 'ws';
import { setupWebSocketServer } from '../shared-code/websocket.mjs';

export function startWsServer(sONOFF, CONFIG, events) {
  const httpServer = http.createServer();

  httpServer.on('error', (err) => {
    console.error(`[LEGACY WS ERROR]`, err);
  });

  httpServer.listen(CONFIG.legacyWsPort, CONFIG.serverIp, () => {
    console.log(`✓ Legacy WS: ${CONFIG.serverIp}:${CONFIG.legacyWsPort}`);
  });

  // WebSocket server
  const wss = new WebSocketServer({ server: httpServer });
  setupWebSocketServer(
    wss,
    'legacy',
    sONOFF,
    events,
    CONFIG.localApiKey
  );

  return { httpServer, wss };
}
