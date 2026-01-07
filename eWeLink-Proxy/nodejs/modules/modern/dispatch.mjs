// ./modules/modern/dispatch.mjs
import https from 'https';
import { createDispatchHandler } from '../shared-code/dispatch.mjs';
import { tlsOptions } from '../../core/config.mjs';

export function startDispatchServer(sONOFF, CONFIG, events) {
  const dispatchHandler = createDispatchHandler(sONOFF, CONFIG, events);
  const httpsServer = https.createServer(tlsOptions, dispatchHandler);

  httpsServer.on('error', (err) => {
    console.error(`[DISPATCH ERROR]`, err);
  });

  httpsServer.on('tlsClientError', (err, tlsSocket) => {
    const ip = tlsSocket?.remoteAddress || 'unknown';
    console.error(`[DISPATCH TLS ERROR] From ${ip}: ${err.message}`);
    if (err.code) console.error(`[DISPATCH TLS ERROR] Code: ${err.code}`);
  });

  httpsServer.on('secureConnection', (tlsSocket) => {
    console.log(
      `[DISPATCH TLS] ✓ Secure connection: ${tlsSocket.getProtocol()} / ` +
      `${tlsSocket.getCipher()?.name} from ${tlsSocket.remoteAddress}`
    );
  });

  httpsServer.listen(CONFIG.dispatchPort, CONFIG.serverIp, () => {
    console.log(`✓ Modern HTTPS Dispatch: ${CONFIG.serverIp}:${CONFIG.dispatchPort}`);
  });

  return httpsServer;
}
