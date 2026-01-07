// ./modules/modern/index.mjs
import https from 'https';
import { WebSocketServer } from 'ws';
import { createDispatchHandler } from '../shared-code/dispatch.mjs';
import { setupWebSocketServer } from '../shared-code/websocket.mjs';
import { tlsOptions } from '../../core/config.mjs';

export class ModernModule {
  constructor({ sONOFF, CONFIG, events }) {
    this.sONOFF = sONOFF;
    this.CONFIG = CONFIG;
    this.events = events;
    this.dispatchServer = null;
    this.wssServer = null;
    this.wss = null;
  }

  async start() {
    // ============ 1. HTTPS Dispatch Server (port 443) ============
    this.dispatchServer = https.createServer(
      tlsOptions,
      createDispatchHandler(this.sONOFF, this.CONFIG, this.events)
    );

    this.dispatchServer.on('error', (err) => {
      console.error(`[DISPATCH ERROR]`, err);
    });

    this.dispatchServer.on('tlsClientError', (err, tlsSocket) => {
      const ip = tlsSocket?.remoteAddress || 'unknown';
      console.error(`[DISPATCH TLS ERROR] From ${ip}: ${err.message}`);
      if (err.code) console.error(`[DISPATCH TLS ERROR] Code: ${err.code}`);
    });

    this.dispatchServer.on('secureConnection', (tlsSocket) => {
      console.log(
        `[DISPATCH TLS] ✓ Secure connection: ${tlsSocket.getProtocol()} / ` +
        `${tlsSocket.getCipher()?.name} from ${tlsSocket.remoteAddress}`
      );
    });

    this.dispatchServer.listen(this.CONFIG.dispatchPort, this.CONFIG.serverIp, () => {
      console.log(`✓ Modern HTTPS Dispatch: ${this.CONFIG.serverIp}:${this.CONFIG.dispatchPort}`);
    });

    // ============ 2. HTTPS WSS Server (port 8082) ============
    this.wssServer = https.createServer(tlsOptions);

    this.wssServer.on('error', (err) => {
      console.error(`[MODERN WSS ERROR]`, err);
    });

    this.wssServer.on('tlsClientError', (err, tlsSocket) => {
      const ip = tlsSocket?.remoteAddress || 'unknown';
      console.error(`[MODERN WSS TLS ERROR] From ${ip}: ${err.message}`);
    });

    this.wssServer.on('secureConnection', (tlsSocket) => {
      console.log(
        `[MODERN WSS TLS] ✓ Secure connection: ${tlsSocket.getProtocol()} / ` +
        `${tlsSocket.getCipher()?.name} from ${tlsSocket.remoteAddress}`
      );
    });

    this.wssServer.listen(this.CONFIG.modernWsPort, this.CONFIG.serverIp, () => {
      console.log(`✓ Modern WSS: ${this.CONFIG.serverIp}:${this.CONFIG.modernWsPort}`);
    });

    // WebSocket server
    this.wss = new WebSocketServer({ server: this.wssServer });
    setupWebSocketServer(
      this.wss,
      'modern',
      this.sONOFF,
      this.events,
      this.CONFIG.localApiKey
    );
  }

  stop() {
    if (this.dispatchServer) {
      this.dispatchServer.close();
      console.log('[MODERN] Dispatch server stopped');
    }
    if (this.wssServer) {
      this.wssServer.close();
      console.log('[MODERN] WSS server stopped');
    }
  }
}
