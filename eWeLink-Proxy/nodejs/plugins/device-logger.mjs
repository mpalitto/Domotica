/* What the plugin does

Listens only to: device:connected, device:disconnected
Creates a logs/ sub-directory (if missing)
Writes one log file per device, named: [device alias].log
Appends entries in this format:
DD-MM hh:mm connected
DD-MM hh:mm disconnected

Keeps only the last 30 days of entries (older lines are automatically pruned)
Handles alias safely (filesystem-friendly)
*/
import fs from 'fs';
import path from 'path';

const LOG_DIR = path.resolve('./logs');
const MAX_DAYS = 30;

/* Ensure logs directory exists */
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/* Sanitize alias for filesystem usage */
function safeAlias(alias) {
  return alias.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
}

/* Format timestamp: DD-MM hh:mm */
function formatTimestamp(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}-${mm} ${hh}:${min}`;
}

/* Remove log lines older than MAX_DAYS */
function pruneOldEntries(filePath) {
  if (!fs.existsSync(filePath)) return;

  const now = Date.now();
  const maxAgeMs = MAX_DAYS * 24 * 60 * 60 * 1000;

  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);

  const filtered = lines.filter(line => {
    // Expected format: DD-MM hh:mm status
    const match = line.match(/^(\d{2})-(\d{2}) (\d{2}):(\d{2})/);
    if (!match) return false;

    const [, d, m, h, min] = match.map(Number);
    const entryDate = new Date();
    entryDate.setMonth(m - 1);
    entryDate.setDate(d);
    entryDate.setHours(h, min, 0, 0);

    return (now - entryDate.getTime()) <= maxAgeMs;
  });

  fs.writeFileSync(filePath, filtered.join('\n') + (filtered.length ? '\n' : ''));
}

/* Append log entry */
function logEvent(alias, status) {
  ensureLogDir();

  const fileName = `${safeAlias(alias)}.log`;
  const filePath = path.join(LOG_DIR, fileName);

  pruneOldEntries(filePath);

  const entry = `${formatTimestamp()} ${status}\n`;
  fs.appendFileSync(filePath, entry);
}

export default {
  init: (events, sONOFF, CONFIG) => {

    events.on('device:connected', ({ deviceID }) => {
      const alias =
        sONOFF[deviceID]?.alias ||
        `Sonoff-${deviceID.slice(-5)}`;

      logEvent(alias, 'connected');
    });

    events.on('device:disconnected', ({ deviceID }) => {
      const alias =
        sONOFF[deviceID]?.alias ||
        `Sonoff-${deviceID.slice(-5)}`;

      logEvent(alias, 'disconnected');
    });

    console.log('[DeviceConnectionLogger] Plugin loaded');
  }
};

