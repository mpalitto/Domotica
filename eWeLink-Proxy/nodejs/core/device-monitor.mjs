/**
 * Periodically checks devices for inactivity and emits `device:offline`
 */

export function startDeviceMonitor({ sONOFF, events, offlineTimeout = 120_000, checkInterval = 30_000 }) {
  setInterval(() => {
    const now = Date.now();
    for (const [deviceID, device] of Object.entries(sONOFF)) {
      // Local online: WebSocket connection to device is open
      const wasLocalOnline = device.localOnline;
      device.localOnline = !!(device.ws && device.ws.readyState === 1);

      // Cloud online: cloud-bridge has a connection
      const wasCloudOnline = device.cloudOnline;
      device.cloudOnline = !!(device.conn?.cloudApiKey);

      if (device.lastSeen && now - device.lastSeen > offlineTimeout) {
        if (wasLocalOnline && !device.localOnline) {
          const alias = device.alias || `Sonoff-${deviceID.slice(-5)}`;
          console.log(`[TIMEOUT] ${deviceID} → LOCAL OFFLINE (${alias})`);
          events.emit('device:offline', { deviceID, device });
        }
      }
    }
  }, checkInterval);
}
