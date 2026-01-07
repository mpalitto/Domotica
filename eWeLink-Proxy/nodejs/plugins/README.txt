Plugins for eWeLink Local Proxy
This project includes a simple plugin system that allows you to extend the server's functionality without modifying the core code.
Plugins are useful for:

Custom logging
Sending notifications (Telegram, Pushover, etc.)
Integrating with Home Assistant, MQTT, InfluxDB, etc.
Executing scripts on device events
And anything else you can imagine!

Folder Structure
textminimal-localonly-server/
├── plugins/
│   └── logger.mjs          ← example plugin
├── main.mjs                ← loads plugins automatically
└── ...
All plugins must be placed in the plugins/ directory and have the .mjs extension.
How the Plugin System Works
On startup, the server:

1. Scans the plugins/ folder
2. Dynamically imports every .mjs file
3. Calls the init function exported by each plugin, passing:
  * events – an EventEmitter with device-related events
  * sONOFF – the shared object containing all device data (read-only recommended)
  * CONFIG – the server configuration object


Available Events
+-----------------------+------------------------------+--------------------------------------------------------------+
| Event                 | Payload                      | Description                                                  |
+-----------------------+------------------------------+--------------------------------------------------------------+
| device:connected      | { deviceID, device }         | A device has established a WebSocket connection              |
| device:disconnected   | { deviceID, device }         | WebSocket closed (normal reconnect expected)                 |
| device:registered     | { deviceID, device }         | Device sent register action                                  |
| device:updated        | { deviceID, params }         | Device sent state update (switch, rssi, etc.)                |
| device:alias-updated  | { deviceID, alias }          | Alias was changed (via register or API)                      |
| device:offline        | { deviceID, device }         | Device timed out (no activity > 2 minutes)                  |
+-----------------------+------------------------------+--------------------------------------------------------------+

Creating a New Plugin

Create a new file in the plugins/ folder, e.g. my-plugin.mjs
Export a default object with an init function:
```
JavaScript// plugins/my-plugin.mjs
export default {
  init: (events, sONOFF, CONFIG) => {
    // Example: Log when any device turns on/off
    events.on('device:updated', ({ deviceID, params }) => {
      if (params.switch !== undefined) {
        const status = params.switch === 'on' ? 'ON' : 'OFF';
        const alias = sONOFF[deviceID]?.alias || `Sonoff-${deviceID.slice(-5)}`;
        console.log(`[MyPlugin] ${alias} (${deviceID}) turned ${status}`);
      }
    });

    // Example: Notify on connection
    events.on('device:connected', ({ deviceID }) => {
      console.log(`[MyPlugin] Device online: ${deviceID}`);
    });

    // You can add as many listeners as you want
    console.log('[MyPlugin] Plugin loaded successfully');
  }
};
```
Save the file and restart the server:

`Bash> node minimal-restAPI.mjs`
The plugin will be loaded automatically and you’ll see your custom logs.
Tips

Plugins are loaded asynchronously in no particular order.
Avoid modifying sONOFF directly unless necessary (it’s shared state).
Use console.log for simple output, or integrate with external services.
You can access CONFIG.localApiKey, CONFIG.serverIp, etc., if needed.

Example Plugins Ideas

telegram-notify.mjs – send messages via Telegram Bot on switch changes
mqtt-publish.mjs – publish device state to MQTT broker
home-assistant.mjs – trigger HA services
influxdb-logger.mjs – log RSSI and switch state to InfluxDB
power-monitor.mjs – estimate energy usage

Enjoy extending your local eWeLink proxy exactly how you want it!
