/**
 * Periodically checks devices for inactivity and emits `device:offline`
 */

export function startDeviceMonitor({ sONOFF, events, offlineTimeout = 120_000, checkInterval = 30_000 }) {
  setInterval(() => {
    const now = Date.now();
    for (const [deviceID, device] of Object.entries(sONOFF)) {
      if (device.lastSeen && now - device.lastSeen > offlineTimeout) {
        if (device.online) {
          device.online = false;
          const alias = device.alias || `Sonoff-${deviceID.slice(-5)}`;
          console.log(`[TIMEOUT] ${deviceID} → OFFLINE (${alias})`);
          events.emit('device:offline', { deviceID, device });
        }
      }
    }
  }, checkInterval);
}

