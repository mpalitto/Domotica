// ./modules/legacy/index.mjs
import http from 'http';
import { WebSocketServer } from 'ws';
import { createDispatchHandler } from '../shared-code/dispatch.mjs';
import { setupWebSocketServer }  from '../shared-code/websocket.mjs';

export class LegacyModule {
  constructor({ sONOFF, CONFIG, events }) {
    this.sONOFF = sONOFF;
    this.CONFIG = CONFIG;
    this.events = events;
    this.httpServer = null;
    this.wss = null;
  }

  async start() {
    // HTTP server with dispatch handler
    this.httpServer = http.createServer(
      createDispatchHandler(this.sONOFF, this.CONFIG, this.events)
    );

    this.httpServer.listen(this.CONFIG.legacyPort, this.CONFIG.serverIp, () => {
      console.log(`✓ Legacy HTTP+WS: ${this.CONFIG.serverIp}:${this.CONFIG.legacyPort}`);
    });

    // WebSocket server
    this.wss = new WebSocketServer({ server: this.httpServer });
    setupWebSocketServer(
      this.wss,
      'legacy',
      this.sONOFF,
      this.events,
      this.CONFIG.localApiKey
    );
  }

  stop() {
    if (this.httpServer) {
      this.httpServer.close();
      console.log('[LEGACY] Server stopped');
    }
  }
}
