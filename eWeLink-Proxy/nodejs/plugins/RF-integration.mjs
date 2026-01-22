// plugins/RF-integration.mjs
// Persistent TCP connection to RF managerLayer.sh (192.168.1.77:7777)
// With automatic reconnect and better burst handling
// sends events: 
// STATE_UPDATE 100001588a OFF
// CONNECTED 100001588a
// DISCONNECTED 100001588a
// ALIAS_UPDATE 100001588a dining
// where: (deviceID is 100001588a), (deviceAlias is dining), (deviceState is OFF)

import net from 'net';

export default {
  name: 'EventSenderPersistent',
  description: 'Sends device events to managerLayer via persistent TCP connection',

  init: (events, sONOFF, CONFIG) => {
    // ──────────────────────────────────────────────
    // CONFIGURATION
    // ──────────────────────────────────────────────
    const HOST = '192.168.1.77';
    const PORT = 7777;
    const RECONNECT_DELAY = 2500;        // ms
    const MAX_RECONNECT_ATTEMPTS = 30;   // prevent infinite fast loop

    let client = null;
    let reconnectTimer = null;
    let reconnectAttempts = 0;
    let isConnected = false;

    // ──────────────────────────────────────────────
    // Connection Management
    // ──────────────────────────────────────────────
    function connectTcp() {
      if (client && !client.destroyed) {
        return; // already trying or connected
      }

      client = new net.Socket();
      client.setNoDelay(true); // Disable Nagle → better for small/frequent messages

      client.on('connect', () => {
        isConnected = true;
        reconnectAttempts = 0;
        clearTimeout(reconnectTimer);
        console.log(`[EVENT SENDER] Connected to ${HOST}:${PORT}`);
	// on connection with managerLayer send all devices state and connection
	Object.entries(sONOFF).forEach(([deviceID, device]) => {
	  console.log(`device: ${deviceID} is ${device.online} online`);
	  if (device.online) {
            sendToTcp(`CONNECTED ${deviceID}`);
            console.log(`[EVENT SENDER] CONNECTED ${deviceID}`);
            sendToTcp(`STATE_UPDATE ${deviceID} ${device.state}`);
            console.log(`[EVENT SENDER] STATE_UPDATE ${deviceID} ${device.state}`);
          }
        });
      });

      client.on('data', (data) => {
        // Optional: if managerLayer ever wants to send something back
        console.debug('[EVENT SENDER] received from manager:', data.toString().trim());
      });

      client.on('error', (err) => {
        console.error(`[EVENT SENDER] socket error: ${err.message}`);
        cleanupAndScheduleReconnect();
      });

      client.on('close', () => {
        isConnected = false;
        console.log('[EVENT SENDER] socket closed');
        cleanupAndScheduleReconnect();
      });

      console.log(`[EVENT SENDER] Connecting to ${HOST}:${PORT}...`);
      client.connect(PORT, HOST);
    }

    function cleanupAndScheduleReconnect() {
      if (client) {
        client.removeAllListeners();
        client.destroy();
        client = null;
      }

      // if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      //   console.error('[EVENT SENDER] Max reconnect attempts reached. Giving up.');
      //   return;
      // }

      clearTimeout(reconnectTimer);
      reconnectAttempts++;
      const delay = Math.min(RECONNECT_DELAY * (1 + reconnectAttempts * 0.3), 30000); // backoff

      console.log(`[EVENT SENDER] Will attempt reconnect in ${delay/1000}s (attempt ${reconnectAttempts})`);
      reconnectTimer = setTimeout(connectTcp, delay);
    }

    function sendToTcp(message) {
      if (!client || client.destroyed || !isConnected) {
        console.warn(`[EVENT SENDER] Cannot send (not connected): ${message}`);
        // You could queue here if you want zero message loss during short disconnects
        return;
      }

      client.write(message + '\n', (err) => {
        if (err) {
          console.error(`[EVENT SENDER] Write failed for "${message}": ${err.message}`);
          cleanupAndScheduleReconnect();
        }
      });
    }

    // ──────────────────────────────────────────────
    // Event Subscriptions
    // ──────────────────────────────────────────────
    events.on('device:connected', ({ deviceID }) => {
      sendToTcp(`CONNECTED ${deviceID}`);
      console.log(`[EVENT SENDER] CONNECTED ${deviceID}`);
    });

    events.on('device:disconnected', ({ deviceID }) => {
      sendToTcp(`DISCONNECTED ${deviceID}`);
      // sendToTcp(`{
      //       event: 'device_offline',
      //       deviceId: '${deviceID}'
      //   }`);
      console.log(`[EVENT SENDER] DISCONNECTED ${deviceID}`);
    });

    events.on('device:updated', ({ deviceID, params }) => {
      if (params.switch) {
        const state = params.switch.toUpperCase();
        sendToTcp(`STATE_UPDATE ${deviceID} ${state}`);
        console.log(`[EVENT SENDER] STATE_UPDATE ${deviceID} ${state}`);
      }
    });

    events.on('device:alias-updated', ({ deviceID, alias }) => {
      sendToTcp(`ALIAS_UPDATE ${deviceID} ${alias}`);
      // sendToTcp(`{
      //       event: 'alias_update',
      //       deviceId: '${deviceID}',
      //       alias:'${alias}' 
      //  }`);
      console.log(`ALIAS_UPDATE ${deviceID} ${alias}`);
    });

    // Optional: also useful during startup
    // events.on('device:list-refreshed', ({ devices }) => {
    //   devices.forEach(dev => {
    //     if (dev.online) {
    //       sendToTcp(`CONNECTED ${dev.deviceid}`);
    //     } else {
    //       sendToTcp(`DISCONNECTED ${dev.deviceid}`);
    //     }
    //   });
    // });

    // ──────────────────────────────────────────────
    // Start connection
    // ──────────────────────────────────────────────
    connectTcp();

    console.log('[PLUGIN] EventSenderPersistent loaded → persistent TCP to managerLayer');
  }
};
