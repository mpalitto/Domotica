// ---------------- config.mjs ----------------
// ./core/config.mjs
import fs from 'fs';

export const CONFIG = {
  serverIp: '192.168.1.11',
  legacyPort: 8081,
  dispatchPort: 443,
  modernWsPort: 8082,
  apiPort: 3000,
  localApiKey: '941c6e45-1111-4660-aa88-c9bd422f909d',
  aliasesFile: './core/aliases.json'
};

export const tlsOptions = {
  key:  fs.readFileSync('./core/sonoff-key.pem'),
  cert: fs.readFileSync('./core/sonoff-cert.pem'),
  minVersion: 'TLSv1',
  ciphers: 'DEFAULT:@SECLEVEL=0',
};
