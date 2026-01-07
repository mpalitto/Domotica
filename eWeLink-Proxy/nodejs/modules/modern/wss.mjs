// ./modules/modern/wss.mjs
import https from 'https';
import { WebSocketServer } from 'ws';
import { setupWebSocketServer } from '../shared-code/websocket.mjs';
import { tlsOptions } from '../../core/config.mjs';

export function startWssServer(sONOFF, CONFIG, events) {
  const httpsServer = https.createServer(tlsOptions);

  httpsServer.on('error', (err) => {
    console.error(`[MODERN WSS ERROR]`, err);
  });

  httpsServer.on('tlsClientError', (err, tlsSocket) => {
    const ip = tlsSocket?.remoteAddress || 'unknown';
    console.error(`[MODERN WSS TLS ERROR] From ${ip}: ${err.message}`);
  });

  httpsServer.on('secureConnection', (tlsSocket) => {
    console.log(
      `[MODERN WSS TLS] ✓ Secure connection: ${tlsSocket.getProtocol()} / ` +
      `${tlsSocket.getCipher()?.name} from ${tlsSocket.remoteAddress}`
    );
  });

  httpsServer.listen(CONFIG.modernWsPort, CONFIG.serverIp, () => {
    console.log(`✓ Modern WSS: ${CONFIG.serverIp}:${CONFIG.modernWsPort}`);
  });

  // WebSocket server
  const wss = new WebSocketServer({ server: httpsServer });
  setupWebSocketServer(
    wss,
    'modern',
    sONOFF,
    events,
    CONFIG.localApiKey
  );

  return { httpsServer, wss };
}
