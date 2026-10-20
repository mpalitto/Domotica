// ---------------- storage.mjs ----------------
import fs from 'fs/promises';
import { CONFIG } from './config.mjs';
export const sONOFF = {};

export async function loadAliases() {
try {
const data = await fs.readFile(CONFIG.aliasesFile, 'utf8');
const aliases = JSON.parse(data);
Object.entries(aliases).forEach(([id, alias]) => {
if (!sONOFF[id]) sONOFF[id] = {};
sONOFF[id].alias = alias;
});
console.log('Loaded aliases from file');
} catch (err) {
if (err.code === 'ENOENT') console.log('No aliases file found – using defaults');
else console.error('Aliases load error:', err);
}
}

export async function saveAliases() {
const aliases = {};
Object.entries(sONOFF).forEach(([id, dev]) => {
if (dev.alias) aliases[id] = dev.alias;
});
try {
await fs.writeFile(CONFIG.aliasesFile, JSON.stringify(aliases, null, 2));
console.log('Saved aliases to file');
} catch (err) {
console.error('Aliases save error:', err);
}
}

/**
 * Persisted per-device identity needed to impersonate the device towards the
 * eWeLink cloud even when its WiFi is down (see cloud-bridge).
 *
 * The real cloud apikey is only ever observed the first time a device
 * registers over its local WebSocket, so it must survive proxy restarts.
 * Format:  { "<deviceID>": { apikey, model, romVersion, alias } }
 */
export async function loadDeviceIdentities() {
  try {
    const data = await fs.readFile(CONFIG.devicesFile, 'utf8');
    const devices = JSON.parse(data);
    Object.entries(devices).forEach(([id, info]) => {
      if (!sONOFF[id]) sONOFF[id] = {};
      // Never overwrite an identity already learned live in this process.
      sONOFF[id].conn ??= {};
      if (info.apikey && !sONOFF[id].conn.deviceApiKey) {
        sONOFF[id].conn.deviceApiKey = info.apikey;
      }
      if (info.model && !sONOFF[id].model) sONOFF[id].model = info.model;
      if (info.romVersion && !sONOFF[id].romVersion) sONOFF[id].romVersion = info.romVersion;
      if (info.alias && !sONOFF[id].alias) sONOFF[id].alias = info.alias;
    });
    console.log(`Loaded ${Object.keys(devices).length} device identities from file`);
  } catch (err) {
    if (err.code === 'ENOENT') console.log('No devices file found – identities will be learned as devices register');
    else console.error('Device identities load error:', err);
  }
}

export async function saveDeviceIdentities() {
  const devices = {};
  Object.entries(sONOFF).forEach(([id, dev]) => {
    const apikey = dev.conn?.deviceApiKey;
    if (!apikey) return;
    devices[id] = {
      apikey,
      model: dev.model || null,
      romVersion: dev.romVersion || null,
      alias: dev.alias || null
    };
  });
  try {
    await fs.writeFile(CONFIG.devicesFile, JSON.stringify(devices, null, 2));
    console.log(`Saved ${Object.keys(devices).length} device identities to file`);
  } catch (err) {
    console.error('Device identities save error:', err);
  }
}
