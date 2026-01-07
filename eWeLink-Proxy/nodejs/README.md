═══════════════════════════════════════════════════════════════════════════════
                    eWeLink Local Proxy - Architecture Documentation
═══════════════════════════════════════════════════════════════════════════════

Version: 1.0 (Modular)
Last Updated: 2025
Author: Matteo Palitto
License: All-You-can-Eat

═══════════════════════════════════════════════════════════════════════════════
                                TABLE OF CONTENTS
═══════════════════════════════════════════════════════════════════════════════

1. PROJECT OVERVIEW
   1.1. Purpose
   1.2. What Problem Does It Solve?
   1.3. Key Features
   1.4. Supported Devices

2. HIGH-LEVEL ARCHITECTURE
   2.1. System Architecture Diagram
   2.2. Server Components
   2.3. Communication Protocols
   2.4. Device Discovery & Registration Flow

3. DETAILED ARCHITECTURE
   3.1. Directory Structure
   3.2. Module Breakdown
   3.3. Core System
   3.4. Legacy Module
   3.5. Modern Module
   3.6. Shared Code
   3.7. Plugin System
   3.8. REST API

4. DATA FLOW & PROTOCOLS
   4.1. Device Discovery Flow
   4.2. Device Registration Flow
   4.3. Device Update Flow
   4.4. Command Flow (API → Device)
   4.5. WebSocket Protocol Details
   4.6. HTTP/HTTPS Endpoints

5. SECURITY & TLS
   5.1. Certificate Requirements
   5.2. TLS Configuration
   5.3. Compatibility with ESP8266
   5.4. Security Considerations

6. DEVICE LIFECYCLE
   6.1. States
   6.2. Transitions
   6.3. Timeout & Reconnection
   6.4. Offline Detection

7. EVENT SYSTEM
   7.1. Available Events
   7.2. Event Payloads
   7.3. Plugin Integration

8. REST API REFERENCE
   8.1. GET /devices
   8.2. POST /device/:id
   8.3. POST /set-alias/:id

9. CONFIGURATION
   9.1. Server Configuration
   9.2. Network Requirements
   9.3. DNS Hijacking Setup

10. EXTENDING THE SYSTEM
    10.1. Creating Plugins
    10.2. Adding New Device Types
    10.3. Custom Handlers

11. TROUBLESHOOTING
    11.1. Common Issues
    11.2. Debugging Tools
    11.3. Log Analysis

12. DEPLOYMENT
    12.1. Requirements
    12.2. Installation
    12.3. Running the Server
    12.4. Production Considerations

═══════════════════════════════════════════════════════════════════════════════
                            1. PROJECT OVERVIEW
═══════════════════════════════════════════════════════════════════════════════

1.1. PURPOSE
───────────────────────────────────────────────────────────────────────────────

eWeLink Local Proxy is a Node.js-based server that intercepts and handles 
communication between Sonoff/eWeLink smart devices and their cloud servers,
enabling:

  • 100% local control (no internet dependency)
  • Custom automation without cloud limitations
  • Privacy (data never leaves your network)
  • Custom REST API for integration with home automation systems
  • Plugin system for extensibility


1.2. WHAT PROBLEM DOES IT SOLVE?
───────────────────────────────────────────────────────────────────────────────

Sonoff/eWeLink devices normally communicate with Chinese cloud servers:

  Problem                          | Solution
  ─────────────────────────────────┼─────────────────────────────────────────
  Requires internet connection     | Local-only operation
  Cloud dependency                 | Self-hosted server
  Privacy concerns                 | Data stays in your network
  Limited automation               | Custom plugins & integrations
  Vendor lock-in                   | Open REST API
  Cloud service outages            | Independent operation


1.3. KEY FEATURES
───────────────────────────────────────────────────────────────────────────────

  ✓ Supports both legacy (HTTP) and modern (HTTPS) Sonoff devices
  ✓ WebSocket-based real-time communication
  ✓ RESTful API for device control
  ✓ Event-driven plugin system
  ✓ Automatic device discovery and registration
  ✓ Device alias management
  ✓ Persistent device state
  ✓ Heartbeat monitoring
  ✓ TLS compatibility with ESP8266 chips
  ✓ Modular, maintainable architecture


1.4. SUPPORTED DEVICES
───────────────────────────────────────────────────────────────────────────────

  Legacy Devices (HTTP/WS on port 8081):
    • Sonoff Basic (older firmware)
    • Sonoff RF
    • Sonoff Touch (older models)
    • ROM version < 2.7.0

  Modern Devices (HTTPS/WSS on ports 443/8082):
    • Sonoff Basic R3/R4
    • Sonoff Mini
    • Sonoff T1/T2/T3
    • ROM version >= 2.7.0
    • Any device with HTTPS support


═══════════════════════════════════════════════════════════════════════════════
                        2. HIGH-LEVEL ARCHITECTURE
═══════════════════════════════════════════════════════════════════════════════

2.1. SYSTEM ARCHITECTURE DIAGRAM
───────────────────────────────────────────────────────────────────────────────

                           ┌─────────────────────────┐
                           │   Sonoff/eWeLink Device │
                           │   (ESP8266/ESP32)       │
                           └───────────┬─────────────┘
                                       │
                                       │ DNS: dispatch.ewelink.cc
                                       │ → 192.168.1.11 (hijacked)
                                       │
                           ┌───────────▼─────────────┐
                           │    eWeLink Proxy        │
                           │   (This Application)    │
                           └───────────┬─────────────┘
                                       │
                ┌──────────────────────┼──────────────────────┐
                │                      │                      │
    ┌───────────▼────────┐ ┌──────────▼──────────┐ ┌────────▼────────┐
    │  Legacy Module     │ │  Modern Module      │ │  REST API       │
    │  HTTP + WS         │ │  HTTPS + WSS        │ │  :3000          │
    │  :8081             │ │  :443 + :8082       │ │                 │
    └───────────┬────────┘ └──────────┬──────────┘ └────────┬────────┘
                │                     │                      │
                └─────────────────────┼──────────────────────┘
                                      │
                          ┌───────────▼────────────┐
                          │   Core System          │
                          │  • Event Bus           │
                          │  • Device Registry     │
                          │  • Plugin Loader       │
                          │  • Storage             │
                          └───────────┬────────────┘
                                      │
                          ┌───────────▼────────────┐
                          │   Plugins              │
                          │  • MQTT Bridge         │
                          │  • Home Assistant      │
                          │  • Custom Handlers     │
                          └────────────────────────┘


2.2. SERVER COMPONENTS
───────────────────────────────────────────────────────────────────────────────

Component                  | Protocol    | Port | Purpose
───────────────────────────┼─────────────┼──────┼──────────────────────────
Legacy HTTP Server         | HTTP        | 8081 | Old device dispatch
Legacy WebSocket           | WS          | 8081 | Old device communication
Modern Dispatch Server     | HTTPS       | 443  | New device dispatch
Modern WebSocket Server    | WSS         | 8082 | New device communication
REST API Server            | HTTP        | 3000 | External control interface


2.3. COMMUNICATION PROTOCOLS
───────────────────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────┐
│                         LEGACY DEVICES                                  │
└─────────────────────────────────────────────────────────────────────────┘

  Device                           Server
    │                                 │
    │  POST /dispatch/device (HTTP)   │
    ├────────────────────────────────>│
    │  { deviceid, apikey, model }    │
    │                                 │
    │  200 OK { port: 8081 }          │
    │<────────────────────────────────┤
    │                                 │
    │  WebSocket Upgrade (WS)         │
    ├────────────────────────────────>│
    │                                 │
    │  { action: "register", ... }    │
    ├────────────────────────────────>│
    │                                 │
    │  { error: 0, config: {...} }    │
    │<────────────────────────────────┤
    │                                 │
    │  Bidirectional Messages         │
    │<───────────────────────────────>│

┌─────────────────────────────────────────────────────────────────────────┐
│                         MODERN DEVICES                                  │
└─────────────────────────────────────────────────────────────────────────┘

  Device                           Server
    │                                 │
    │  POST /dispatch/device (HTTPS)  │
    ├────────────────────────────────>│
    │  { deviceid, apikey, model }    │
    │                                 │
    │  200 OK { port: 8082 }          │
    │<────────────────────────────────┤
    │                                 │
    │  WebSocket Upgrade (WSS)        │
    ├────────────────────────────────>│
    │                                 │
    │  { action: "register", ... }    │
    ├────────────────────────────────>│
    │                                 │
    │  { error: 0, config: {...} }    │
    │<────────────────────────────────┤
    │                                 │
    │  Bidirectional Messages (TLS)   │
    │<───────────────────────────────>│


2.4. DEVICE DISCOVERY & REGISTRATION FLOW
───────────────────────────────────────────────────────────────────────────────

Step 1: DNS Interception
  ┌─────────────────────────────────────────────────┐
  │ Device queries: dispatch.ewelink.cc             │
  │ Router DNS: Returns 192.168.1.11 (proxy server) │
  └─────────────────────────────────────────────────┘
                       ↓

Step 2: Dispatch Request
  ┌─────────────────────────────────────────────────┐
  │ Device POSTs to /dispatch/device                │
  │ Proxy determines: HTTP → 8081, HTTPS → 8082     │
  │ Proxy responds with { IP, port }                │
  └─────────────────────────────────────────────────┘
                       ↓

Step 3: WebSocket Connection
  ┌─────────────────────────────────────────────────┐
  │ Device connects to WS/WSS on assigned port      │
  │ Sends registration message with credentials     │
  │ Proxy validates and stores device info          │
  └─────────────────────────────────────────────────┘
                       ↓

Step 4: Operational
  ┌─────────────────────────────────────────────────┐
  │ Device sends periodic updates                   │
  │ Server can send commands                        │
  │ Heartbeat keeps connection alive                │
  └─────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════════
                        3. DETAILED ARCHITECTURE
═══════════════════════════════════════════════════════════════════════════════

3.1. DIRECTORY STRUCTURE
───────────────────────────────────────────────────────────────────────────────

eWeLink-Proxy/
│
├── core/                          # Core system components
│   ├── index.mjs                  # Application entry point
│   ├── config.mjs                 # Configuration & TLS options
│   ├── events.mjs                 # Singleton EventEmitter
│   ├── storage.mjs                # Device registry & persistence
│   ├── api.mjs                    # REST API handler
│   ├── plugins.mjs                # Plugin loader
│   ├── device-monitor.mjs         # Timeout/offline detection
│   ├── aliases.json               # Persistent device names
│   ├── sonoff-key.pem             # TLS private key
│   └── sonoff-cert.pem            # TLS certificate
│
├── modules/                       # Feature modules
│   │
│   ├── legacy/                    # Legacy device support
│   │   └── index.mjs              # HTTP + WS server (port 8081)
│   │
│   ├── modern/                    # Modern device support
│   │   └── index.mjs              # HTTPS dispatch + WSS server
│   │
│   └── shared-code/               # Shared functionality
│       ├── dispatch.mjs           # /dispatch/device handler
│       └── websocket.mjs          # WebSocket connection handler
│
├── plugins/                       # Optional plugins
│   ├── mqtt-bridge.mjs            # MQTT integration
│   ├── homeassistant.mjs          # Home Assistant integration
│   └── logger.mjs                 # Enhanced logging
│
├── package.json                   # Dependencies
└── README.md                      # User documentation


3.2. MODULE BREAKDOWN
───────────────────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────┐
│                              CORE SYSTEM                                │
└─────────────────────────────────────────────────────────────────────────┘

Purpose: Bootstrap application, manage global state, coordinate modules

Key Files:
  • index.mjs        - Entry point, starts all modules
  • events.mjs       - Singleton EventEmitter for pub/sub
  • storage.mjs      - In-memory device registry + file persistence
  • config.mjs       - Configuration constants & TLS options
  • plugins.mjs      - Dynamic plugin loading
  • api.mjs          - REST API request handler


┌─────────────────────────────────────────────────────────────────────────┐
│                           LEGACY MODULE                                 │
└─────────────────────────────────────────────────────────────────────────┘

Purpose: Support older Sonoff devices using HTTP/WebSocket

Responsibilities:
  ✓ HTTP server on port 8081
  ✓ Handle /dispatch/device requests
  ✓ WebSocket server for device communication
  ✓ Route unencrypted traffic

Supported Devices:
  • ROM version < 2.7.0
  • Devices without HTTPS capability


┌─────────────────────────────────────────────────────────────────────────┐
│                           MODERN MODULE                                 │
└─────────────────────────────────────────────────────────────────────────┘

Purpose: Support newer Sonoff devices using HTTPS/WSS

Responsibilities:
  ✓ HTTPS dispatch server on port 443
  ✓ WSS server on port 8082
  ✓ TLS handshake with ESP8266 compatibility
  ✓ Route encrypted traffic

Supported Devices:
  • ROM version >= 2.7.0
  • Devices with HTTPS capability


┌─────────────────────────────────────────────────────────────────────────┐
│                          SHARED CODE                                    │
└─────────────────────────────────────────────────────────────────────────┘

Purpose: Common logic used by both legacy and modern modules

dispatch.mjs:
  • Handle POST /dispatch/device
  • Detect HTTP vs HTTPS
  • Route to correct port
  • Store device metadata

websocket.mjs:
  • WebSocket connection handling
  • Message parsing
  • Action routing (register, update, query, date)
  • Heartbeat management


3.3. CORE SYSTEM - DETAILED
───────────────────────────────────────────────────────────────────────────────

┌──────────────────────────────────────────────────────────────────────┐
│  FILE: core/index.mjs                                                │
└──────────────────────────────────────────────────────────────────────┘

Responsibilities:
  1. Load persisted device aliases
  2. Load plugins from plugins/ directory
  3. Start device monitor (timeout detection)
  4. Start LegacyModule
  5. Start ModernModule
  6. Start REST API server

Startup Sequence:
  loadAliases() 
    → loadPlugins() 
    → startDeviceMonitor() 
    → legacy.start() 
    → modern.start() 
    → apiServer.listen()


┌──────────────────────────────────────────────────────────────────────┐
│  FILE: core/storage.mjs                                              │
└──────────────────────────────────────────────────────────────────────┘

sONOFF Object Structure:
  {
    "<deviceID>": {
      deviceid: "1000abcdef",
      apikey: "device-specific-key",
      alias: "Living Room Light",
      model: "PSF-B01-GL",
      romVersion: "3.5.0",
      IP: "192.168.1.100",
      isSecure: true,
      online: true,
      state: "REGISTERED",
      ws: <WebSocket>,
      params: {
        switch: "on",
        fwVersion: "3.5.0",
        ...
      },
      lastSeen: 1234567890
    }
  }

Functions:
  • loadAliases()  - Read aliases.json, populate sONOFF
  • saveAliases()  - Write current aliases to disk


┌──────────────────────────────────────────────────────────────────────┐
│  FILE: core/events.mjs                                               │
└──────────────────────────────────────────────────────────────────────┘

Singleton EventEmitter

Available Events:
  • device:dispatched      - Device completed dispatch
  • device:connected       - WebSocket connection established
  • device:registered      - Device sent register action
  • device:updated         - Device sent update action
  • device:disconnected    - WebSocket closed
  • device:offline         - Device timeout (no heartbeat)
  • device:alias-updated   - Device alias changed


┌──────────────────────────────────────────────────────────────────────┐
│  FILE: core/config.mjs                                               │
└──────────────────────────────────────────────────────────────────────┘

CONFIG Object:
  {
    serverIp: '192.168.1.11',         // Your server IP
    legacyPort: 8081,                 // HTTP/WS port
    dispatchPort: 443,                // HTTPS dispatch port
    modernWsPort: 8082,               // WSS port
    apiPort: 3000,                    // REST API port
    localApiKey: '941c6e45-...',      // Server API key
    aliasesFile: './core/aliases.json'
  }

tlsOptions:
  {
    key:  <Buffer>,                   // PEM private key
    cert: <Buffer>,                   // PEM certificate
    minVersion: 'TLSv1',              // Support old ESP8266
    ciphers: 'DEFAULT:@SECLEVEL=0'    // Allow weak ciphers
  }


┌──────────────────────────────────────────────────────────────────────┐
│  FILE: core/plugins.mjs                                              │
└──────────────────────────────────────────────────────────────────────┘

Plugin Loading:
  1. Scan plugins/ directory
  2. Import each .mjs file
  3. Call plugin.init(events, sONOFF, CONFIG)
  4. Plugin subscribes to events

Plugin Interface:
  export default {
    init(events, sONOFF, CONFIG) {
      events.on('device:updated', (data) => {
        // Custom logic
      });
    }
  }


3.4. LEGACY MODULE - DETAILED
───────────────────────────────────────────────────────────────────────────────

┌──────────────────────────────────────────────────────────────────────┐
│  FILE: modules/legacy/index.mjs                                      │
└──────────────────────────────────────────────────────────────────────┘

Class: LegacyModule

Constructor:
  • Accepts: { sONOFF, CONFIG, events }
  • Stores references for use in handlers

start() Method:
  1. Create HTTP server with dispatch handler
  2. Listen on CONFIG.legacyPort (8081)
  3. Create WebSocket server attached to HTTP server
  4. Attach WebSocket handler

Server Stack:
  HTTP Server (port 8081)
    ↓
  Dispatch Handler (POST /dispatch/device)
    ↓
  WebSocket Server (same port)
    ↓
  WebSocket Handler (device communication)


3.5. MODERN MODULE - DETAILED
───────────────────────────────────────────────────────────────────────────────

┌──────────────────────────────────────────────────────────────────────┐
│  FILE: modules/modern/index.mjs                                      │
└──────────────────────────────────────────────────────────────────────┘

Class: ModernModule

Constructor:
  • Accepts: { sONOFF, CONFIG, events }
  • Initializes: dispatchServer, wssServer, wss

start() Method:
  1. Create HTTPS dispatch server (port 443)
     • Uses tlsOptions
     • Handles /dispatch/device requests
     • TLS error logging
  
  2. Create HTTPS WSS server (port 8082)
     • Uses tlsOptions
     • WebSocket upgrade only
     • TLS error logging
  
  3. Attach WebSocket handler to WSS server

Server Stack:
  HTTPS Dispatch Server (port 443)
    ↓
  Dispatch Handler (POST /dispatch/device)

  HTTPS Server (port 8082)
    ↓
  WebSocket Server (WSS)
    ↓
  WebSocket Handler (device communication)


3.6. SHARED CODE - DETAILED
───────────────────────────────────────────────────────────────────────────────

┌──────────────────────────────────────────────────────────────────────┐
│  FILE: modules/shared-code/dispatch.mjs                              │
└──────────────────────────────────────────────────────────────────────┘

createDispatchHandler(sONOFF, CONFIG, events)

Returns: HTTP/HTTPS request handler

Logic:
  1. Verify POST /dispatch/device
  2. Parse JSON body
  3. Extract deviceID
  4. Determine if HTTPS (req.socket.encrypted)
  5. Route: HTTPS → 8082, HTTP → 8081
  6. Store device metadata in sONOFF
  7. Send response: { error: 0, IP, port }
  8. Emit device:dispatched event

Response Format:
  {
    "error": 0,
    "reason": "ok",
    "IP": "192.168.1.11",
    "port": 8081 or 8082
  }


┌──────────────────────────────────────────────────────────────────────┐
│  FILE: modules/shared-code/websocket.mjs                             │
└──────────────────────────────────────────────────────────────────────┘

setupWebSocketServer(wss, type, sONOFF, events, localApiKey)

WebSocket Message Types:

1. REGISTER
   Device → Server:
     {
       "action": "register",
       "deviceid": "1000abcdef",
       "apikey": "device-key",
       "params": { "deviceName": "My Switch" }
     }

   Server → Device:
     {
       "error": 0,
       "deviceid": "1000abcdef",
       "apikey": "server-key",
       "config": { "hb": 1, "hbInterval": 145 }
     }

2. UPDATE
   Device → Server:
     {
       "action": "update",
       "deviceid": "1000abcdef",
       "params": { "switch": "on" }
     }

   Server → Device:
     {
       "error": 0,
       "deviceid": "1000abcdef",
       "apikey": "server-key"
     }

3. QUERY
   Device → Server:
     {
       "action": "query",
       "deviceid": "1000abcdef"
     }

   Server → Device:
     {
       "error": 0,
       "deviceid": "1000abcdef",
       "apikey": "server-key",
       "params": { "switch": "off" }
     }

4. DATE
   Device → Server:
     {
       "action": "date",
       "deviceid": "1000abcdef"
     }

   Server → Device:
     {
       "error": 0,
       "deviceid": "1000abcdef",
       "apikey": "server-key",
       "date": "2024-01-15T12:34:56.789Z"
     }

Heartbeat:
  • Server sends ping every 20 seconds
  • Device responds with pong
  • Updates device.lastSeen timestamp


3.7. PLUGIN SYSTEM - DETAILED
───────────────────────────────────────────────────────────────────────────────

Plugin Template:

  // plugins/example.mjs
  export default {
    init(events, sONOFF, CONFIG) {
      console.log('[PLUGIN] Example loaded');

      events.on('device:updated', ({ deviceID, params }) => {
        console.log(`Device ${deviceID} updated:`, params);
        // Custom logic here
      });

      events.on('device:connected', ({ deviceID, device }) => {
        console.log(`Device ${deviceID} connected`);
        // Send welcome message, etc.
      });
    }
  };

Plugin Use Cases:
  • MQTT Bridge - Publish device states to MQTT broker
  • Home Assistant - Auto-discover devices
  • Database Logging - Store state history
  • Notifications - Send alerts on state changes
  • Custom Automation - Complex logic


3.8. REST API - DETAILED
───────────────────────────────────────────────────────────────────────────────

┌──────────────────────────────────────────────────────────────────────┐
│  FILE: core/api.mjs                                                  │
└──────────────────────────────────────────────────────────────────────┘

createApiHandler(saveAliases)

Endpoints:

1. GET /devices
   Lists all devices

   Response:
     [
       {
         "deviceid": "1000abcdef",
         "alias": "Living Room Light",
         "online": true,
         "state": "REGISTERED",
         "params": { "switch": "on" },
         "fwVersion": "3.5.0",
         "IP": "192.168.1.100"
       }
     ]

2. POST /device/:deviceid
   Send command to device

   Request:
     { "switch": "on" }

   Response:
     {
       "success": true,
       "params": { "switch": "on" },
       "sent2": "1000abcdef"
     }

3. POST /set-alias/:deviceid
   Set device alias

   Request:
     { "alias": "New Name" }

   Response:
     {
       "success": true,
       "alias": "New Name"
     }


═══════════════════════════════════════════════════════════════════════════════
                        4. DATA FLOW & PROTOCOLS
═══════════════════════════════════════════════════════════════════════════════

4.1. DEVICE DISCOVERY FLOW
───────────────────────────────────────────────────────────────────────────────

  [Device Powers On]
         │
         ↓
  DNS Query: dispatch.ewelink.cc
         │
         ↓
  [Router DNS Override]
  Returns: 192.168.1.11
         │
         ↓
  HTTP(S) POST /dispatch/device
    Body: {
      deviceid: "1000abcdef",
      apikey: "...",
      model: "PSF-B01-GL",
      romVersion: "3.5.0"
    }
         │
         ↓
  [Proxy Server]
  ├─ Parse JSON
  ├─ Check req.socket.encrypted
  ├─ Assign port: HTTP→8081, HTTPS→8082
  ├─ Store in sONOFF registry
  └─ Respond: { error: 0, IP, port }
         │
         ↓
  [Device receives response]
         │
         ↓
  Connect to WebSocket on assigned port


4.2. DEVICE REGISTRATION FLOW
───────────────────────────────────────────────────────────────────────────────

  [WebSocket Connection Established]
         │
         ↓
  Device → Server:
    {
      "action": "register",
      "deviceid": "1000abcdef",
      "apikey": "device-key",
      "params": {
        "deviceName": "My Switch",
        "fwVersion": "3.5.0"
      }
    }
         │
         ↓
  [Proxy Server]
  ├─ Identify device from deviceid
  ├─ Store ws connection reference
  ├─ Set device.online = true
  ├─ Set device.alias from deviceName
  ├─ Set device.state = 'REGISTERED'
  ├─ Emit 'device:registered' event
  └─ Respond:
         │
         ↓
  Server → Device:
    {
      "error": 0,
      "deviceid": "1000abcdef",
      "apikey": "941c6e45-...",
      "config": {
        "hb": 1,
        "hbInterval": 145
      }
    }
         │
         ↓
  [Device enters normal operation]


4.3. DEVICE UPDATE FLOW
───────────────────────────────────────────────────────────────────────────────

  Scenario A: Device Reports State Change
  ─────────────────────────────────────────

  [User presses physical button]
         │
         ↓
  Device → Server:
    {
      "action": "update",
      "deviceid": "1000abcdef",
      "params": { "switch": "on" }
    }
         │
         ↓
  [Proxy Server]
  ├─ Update sONOFF[deviceID].params
  ├─ Update device.lastSeen
  ├─ Emit 'device:updated' event
  └─ Respond:
         │
         ↓
  Server → Device:
    {
      "error": 0,
      "deviceid": "1000abcdef",
      "apikey": "941c6e45-..."
    }


  Scenario B: Server Sends Command
  ─────────────────────────────────

  [API Request: POST /device/1000abcdef]
    Body: { "switch": "off" }
         │
         ↓
  [API Handler]
  ├─ Lookup device in sONOFF
  ├─ Verify ws connection is open
  └─ Send via WebSocket:
         │
         ↓
  Server → Device:
    {
      "action": "update",
      "deviceid": "1000abcdef",
      "apikey": "941c6e45-...",
      "userAgent": "app",
      "sequence": "1234567890",
      "params": { "switch": "off" },
      "from": "app"
    }
         │
         ↓
  [Device executes command]
         │
         ↓
  Device → Server:
    {
      "action": "update",
      "deviceid": "1000abcdef",
      "params": { "switch": "off" }
    }
         │
         ↓
  [Server confirms state change]


4.4. HEARTBEAT FLOW
───────────────────────────────────────────────────────────────────────────────

  Every 20 seconds:

  Server → Device: PING (WebSocket frame)
         │
         ↓
  Device → Server: PONG (WebSocket frame)
         │
         ↓
  [Server updates device.lastSeen]


  If no PONG received for 120 seconds:
    ├─ device.online = false
    ├─ Emit 'device:offline' event
    └─ WebSocket connection may be stale


═══════════════════════════════════════════════════════════════════════════════
                          5. SECURITY & TLS
═══════════════════════════════════════════════════════════════════════════════

5.1. CERTIFICATE REQUIREMENTS
───────────────────────────────────────────────────────────────────────────────

Modern Sonoff devices verify TLS certificates. You need:

1. Self-signed certificate OR trusted CA certificate
2. Certificate must match DNS name (dispatch.ewelink.cc)

Generate Self-Signed Certificate:

  # Generate private key
  openssl genrsa -out sonoff-key.pem 2048

  # Generate certificate signing request
  openssl req -new -key sonoff-key.pem -out sonoff.csr \
    -subj "/CN=dispatch.ewelink.cc"

  # Generate self-signed certificate (10 years)
  openssl x509 -req -in sonoff.csr -signkey sonoff-key.pem \
    -out sonoff-cert.pem -days 3650

  # Move to core directory
  mv sonoff-key.pem core/
  mv sonoff-cert.pem core/


5.2. TLS CONFIGURATION
───────────────────────────────────────────────────────────────────────────────

ESP8266 Compatibility Issues:
  • Limited RAM (~80KB available)
  • Old SSL/TLS libraries
  • Weak cipher support only
  • TLS 1.0/1.1 required

Solution in config.mjs:

  tlsOptions: {
    key:  fs.readFileSync('./core/sonoff-key.pem'),
    cert: fs.readFileSync('./core/sonoff-cert.pem'),
    
    // Allow TLS 1.0 (insecure but required)
    minVersion: 'TLSv1',
    
    // CRITICAL: @SECLEVEL=0 disables OpenSSL 3.0 restrictions
    // Without this, ESP8266 devices cannot connect
    ciphers: 'DEFAULT:@SECLEVEL=0',
  }


5.3. SECURITY CONSIDERATIONS
───────────────────────────────────────────────────────────────────────────────

⚠️  WARNING: This configuration is INSECURE by modern standards

  Risk                          | Mitigation
  ──────────────────────────────┼────────────────────────────────────────
  TLS 1.0 is deprecated         | Local network only, no internet exposure
  Weak ciphers enabled          | Isolate on separate VLAN if possible
  Self-signed certificate       | Acceptable for local use
  No client authentication      | Devices use API keys

Best Practices:
  ✓ Run on isolated network segment
  ✓ Firewall: Block ports 443, 8081, 8082 from internet
  ✓ Use strong localApiKey
  ✓ Regular firmware updates on devices
  ✓ Monitor for unauthorized devices


═══════════════════════════════════════════════════════════════════════════════
                          6. DEVICE LIFECYCLE
═══════════════════════════════════════════════════════════════════════════════

6.1. DEVICE STATES
───────────────────────────────────────────────────────────────────────────────

State         | Description
──────────────┼──────────────────────────────────────────────────────────────
UNKNOWN       | Initial state (not yet seen)
DISPATCH      | Device completed dispatch, has port assignment
REGISTERED    | WebSocket connected, registration complete
UPDATED       | Device sent state update
OFFLINE       | No heartbeat for > 120 seconds


6.2. STATE TRANSITIONS
───────────────────────────────────────────────────────────────────────────────

  UNKNOWN
     │
     │ POST /dispatch/device
     ↓
  DISPATCH
     │
     │ WebSocket connect + register action
     ↓
  REGISTERED
     │
     │ Update action received
     ↓
  UPDATED
     │
     │ Timeout (120s no heartbeat)
     ↓
  OFFLINE
     │
     │ WebSocket reconnect
     ↓
  REGISTERED


6.3. TIMEOUT & RECONNECTION
───────────────────────────────────────────────────────────────────────────────

Timeout Detection (device-monitor.mjs):
  • Runs every 30 seconds
  • Checks device.lastSeen timestamp
  • If now - lastSeen > 120000ms:
    → Set device.online = false
    → Emit 'device:offline' event

Reconnection:
  • Device detects connection loss
  • Device re-runs discovery (POST /dispatch/device)
  • New WebSocket connection established
  • State restored from sONOFF registry


═══════════════════════════════════════════════════════════════════════════════
                          7. EVENT SYSTEM
═══════════════════════════════════════════════════════════════════════════════

7.1. AVAILABLE EVENTS
───────────────────────────────────────────────────────────────────────────────

Event Name            | When Emitted
──────────────────────┼───────────────────────────────────────────────────────
device:dispatched     | Device completed /dispatch/device request
device:connected      | WebSocket connection established (first message)
device:registered     | Device sent 'register' action
device:updated        | Device sent 'update' action
device:disconnected   | WebSocket connection closed
device:offline        | Device timeout (no heartbeat > 120s)
device:alias-updated  | Device alias changed


7.2. EVENT PAYLOADS
───────────────────────────────────────────────────────────────────────────────

device:dispatched
  {
    deviceID: "1000abcdef",
    device: { ...deviceObject },
    targetPort: 8081 or 8082
  }

device:connected
  {
    deviceID: "1000abcdef",
    device: { ...deviceObject }
  }

device:registered
  {
    deviceID: "1000abcdef",
    device: { ...deviceObject }
  }

device:updated
  {
    deviceID: "1000abcdef",
    params: { switch: "on" }
  }

device:disconnected
  {
    deviceID: "1000abcdef",
    device: { ...deviceObject }
  }

device:offline
  {
    deviceID: "1000abcdef",
    device: { ...deviceObject }
  }

device:alias-updated
  {
    deviceID: "1000abcdef",
    alias: "New Name"
  }


7.3. PLUGIN INTEGRATION EXAMPLE
───────────────────────────────────────────────────────────────────────────────

// plugins/mqtt-bridge.mjs
import mqtt from 'mqtt';

export default {
  init(events, sONOFF, CONFIG) {
    const client = mqtt.connect('mqtt://192.168.1.10');

    events.on('device:updated', ({ deviceID, params }) => {
      const device = sONOFF[deviceID];
      const topic = `sonoff/${device.alias}/state`;
      client.publish(topic, JSON.stringify(params));
    });

    events.on('device:connected', ({ deviceID, device }) => {
      const topic = `sonoff/${device.alias}/status`;
      client.publish(topic, 'online');
    });

    events.on('device:offline', ({ deviceID, device }) => {
      const topic = `sonoff/${device.alias}/status`;
      client.publish(topic, 'offline');
    });

    console.log('✓ MQTT Bridge loaded');
  }
};


═══════════════════════════════════════════════════════════════════════════════
                        8. REST API REFERENCE
═══════════════════════════════════════════════════════════════════════════════

Base URL: http://<server-ip>:3000

8.1. GET /devices
───────────────────────────────────────────────────────────────────────────────

Description: List all devices

Request:
  GET /devices HTTP/1.1
  Host: 192.168.1.11:3000

Response:
  HTTP/1.1 200 OK
  Content-Type: application/json

  [
    {
      "deviceid": "1000abcdef",
      "alias": "Living Room Light",
      "online": true,
      "state": "REGISTERED",
      "params": {
        "switch": "on",
        "fwVersion": "3.5.0"
      },
      "fwVersion": "3.5.0",
      "IP": "192.168.1.100"
    },
    {
      "deviceid": "1000fedcba",
      "alias": "Bedroom Switch",
      "online": false,
      "state": "OFFLINE",
      "params": {
        "switch": "off"
      },
      "fwVersion": "—",
      "IP": "0.0.0.0"
    }
  ]


8.2. POST /device/:deviceid
───────────────────────────────────────────────────────────────────────────────

Description: Send command to device

Request:
  POST /device/1000abcdef HTTP/1.1
  Host: 192.168.1.11:3000
  Content-Type: application/json

  {
    "switch": "on"
  }

Response (Success):
  HTTP/1.1 200 OK
  Content-Type: application/json

  {
    "success": true,
    "params": {
      "switch": "on"
    }
  }

Response (Device Offline):
  HTTP/1.1 404 Not Found
  Content-Type: application/json

  {
    "error": "Device not online"
  }


8.3. POST /set-alias/:deviceid
───────────────────────────────────────────────────────────────────────────────

Description: Set device friendly name

Request:
  POST /set-alias/1000abcdef HTTP/1.1
  Host: 192.168.1.11:3000
  Content-Type: application/json

  {
    "alias": "Kitchen Light"
  }

Response:
  HTTP/1.1 200 OK
  Content-Type: application/json

  {
    "success": true,
    "alias": "Kitchen Light"
  }

Note: Alias is persisted to core/aliases.json


═══════════════════════════════════════════════════════════════════════════════
                          9. CONFIGURATION
═══════════════════════════════════════════════════════════════════════════════

9.1. SERVER CONFIGURATION
───────────────────────────────────────────────────────────────────────────────

Edit core/config.mjs:

export const CONFIG = {
  serverIp: '192.168.1.11',           // ← Your server's IP
  legacyPort: 8081,                   // HTTP/WS port (can change)
  dispatchPort: 443,                  // HTTPS dispatch (must be 443)
  modernWsPort: 8082,                 // WSS port (can change)
  apiPort: 3000,                      // REST API port (can change)
  localApiKey: '<random-uuid>',       // ← Generate unique key
  aliasesFile: './core/aliases.json'  // Alias persistence
};


9.2. NETWORK REQUIREMENTS
───────────────────────────────────────────────────────────────────────────────

1. Static IP Address
   └─ Server must have fixed IP (e.g., 192.168.1.11)

2. DNS Hijacking
   └─ Router must resolve these domains to your server IP:
      • dispatch.ewelink.cc
      • eu-disp.coolkit.cc
      • us-disp.coolkit.cc
      • as-disp.coolkit.cc

3. Firewall Rules
   └─ Allow inbound on:
      • Port 443 (HTTPS dispatch)
      • Port 8081 (Legacy HTTP/WS)
      • Port 8082 (Modern WSS)
      • Port 3000 (REST API - optional, can restrict to LAN)

4. Internet Blocking (Optional)
   └─ Block devices from reaching real eWeLink servers:
      • *.ewelink.cc
      • *.coolkit.cc


9.3. DNS HIJACKING SETUP
───────────────────────────────────────────────────────────────────────────────

Method 1: Router DNS Override (Recommended)
  
  Example (OpenWrt/DD-WRT):
    echo "192.168.1.11 dispatch.ewelink.cc" >> /etc/dnsmasq.conf
    echo "192.168.1.11 eu-disp.coolkit.cc" >> /etc/dnsmasq.conf
    /etc/init.d/dnsmasq restart

  Example (Pi-hole):
    Admin → Local DNS → DNS Records
    Add: dispatch.ewelink.cc → 192.168.1.11

Method 2: Hosts File (Per-Device)
  
  Not recommended - requires modification on each client


═══════════════════════════════════════════════════════════════════════════════
                        10. EXTENDING THE SYSTEM
═══════════════════════════════════════════════════════════════════════════════

10.1. CREATING PLUGINS
───────────────────────────────────────────────────────────────────────────────

Plugin Template:

// plugins/my-plugin.mjs

export default {
  /**
   * @param {EventEmitter} events - Global event bus
   * @param {object} sONOFF - Device registry
   * @param {object} CONFIG - Server configuration
   */
  init(events, sONOFF, CONFIG) {
    console.log('[MY-PLUGIN] Initializing...');

    // Subscribe to events
    events.on('device:updated', handleUpdate);
    events.on('device:connected', handleConnect);

    // Access device registry
    console.log('Current devices:', Object.keys(sONOFF));

    // Use configuration
    console.log('Server IP:', CONFIG.serverIp);
  }
};

function handleUpdate({ deviceID, params }) {
  console.log(`Device ${deviceID} updated:`, params);
  // Your logic here
}

function handleConnect({ deviceID, device }) {
  console.log(`Device ${deviceID} connected`);
  // Your logic here
}


10.2. ADDING NEW DEVICE TYPES
───────────────────────────────────────────────────────────────────────────────

Most Sonoff devices use the same protocol. For new device types:

1. Capture Traffic
   └─ Use Wireshark to capture device communication

2. Identify Message Format
   └─ Look for JSON messages with different params

3. Extend WebSocket Handler
   └─ Add new action types in websocket.mjs

4. Update API Handler
   └─ Add support for new params in api.mjs

Example: Multi-Channel Device

// In websocket.mjs, handleUpdate function:
if (msg.params.switches) {
  // Multi-channel device
  device.params.switches = msg.params.switches;
}

// In api.mjs, POST /device/:id:
if (cmd.switches) {
  // Send to multi-channel device
  device.ws.send(JSON.stringify({
    action: 'update',
    params: { switches: cmd.switches }
  }));
}


10.3. CUSTOM HANDLERS
───────────────────────────────────────────────────────────────────────────────

Add Custom REST Endpoints:

// In core/api.mjs, add before final 404:

if (req.method === 'GET' && req.url === '/custom/action') {
  // Your custom logic
  res.end(JSON.stringify({ result: 'success' }));
  return;
}


Add Custom WebSocket Actions:

// In websocket.mjs, add in message handler:

else if (msg.action === 'custom') {
  handleCustomAction(ws, msg, device, deviceID);
}

function handleCustomAction(ws, msg, device, deviceID) {
  // Your custom logic
  ws.send(JSON.stringify({ error: 0, custom: 'response' }));
}


═══════════════════════════════════════════════════════════════════════════════
                        11. TROUBLESHOOTING
═══════════════════════════════════════════════════════════════════════════════

11.1. COMMON ISSUES
───────────────────────────────────────────────────────────────────────────────

Issue: Legacy devices connect, modern devices don't
─────────────────────────────────────────────────────────────────────────────

Symptoms:
  ✓ Legacy HTTP+WS: 192.168.1.11:8081
  ✓ REST API running
  ✗ Modern module not started

Solution:
  1. Verify ModernModule is imported in core/index.mjs
  2. Verify modern.start() is called
  3. Check console for "✓ Modern HTTPS Dispatch" message
  4. Check console for "✓ Modern WSS" message


Issue: TLS handshake failures
─────────────────────────────────────────────────────────────────────────────

Symptoms:
  [DISPATCH TLS ERROR] From 192.168.1.100: write EPROTO 1234:error:...

Causes:
  • Missing @SECLEVEL=0 in ciphers
  • Certificate/key file not found
  • TLS version too high

Solution:
  1. Verify tlsOptions in config.mjs:
     ciphers: 'DEFAULT:@SECLEVEL=0'
     minVersion: 'TLSv1'

  2. Verify certificate files exist:
     ls -la core/sonoff-*.pem

  3. Check OpenSSL version:
     openssl version
     (Must support @SECLEVEL directive)


Issue: Devices not found by DNS
─────────────────────────────────────────────────────────────────────────────

Symptoms:
  • Devices blink rapidly (no connection)
  • No dispatch requests in logs

Solution:
  1. Verify DNS hijacking:
     nslookup dispatch.ewelink.cc
     Should return: 192.168.1.11

  2. Check from device subnet:
     # On another device in same network
     nslookup dispatch.ewelink.cc

  3. Verify router DNS override is active
  4. Restart devices after DNS changes


Issue: Device connects but doesn't respond to commands
─────────────────────────────────────────────────────────────────────────────

Symptoms:
  • Device shows online in /devices
  • POST /device/:id returns success
  • Device doesn't change state

Debug:
  1. Check WebSocket connection:
     [MODERN WS] ✓ New connection from 192.168.1.100

  2. Verify registration:
     [MODERN WS] ✓ Registered: 1000abcdef

  3. Check command format:
     [API] → 1000abcdef: { switch: 'on' }

  4. Verify device receives message (add logging in websocket.mjs)


11.2. DEBUGGING TOOLS
───────────────────────────────────────────────────────────────────────────────

Enhanced Logging Plugin:

// plugins/debug-logger.mjs
export default {
  init(events, sONOFF, CONFIG) {
    events.on('device:dispatched', (data) => {
      console.log('[DEBUG] DISPATCH:', JSON.stringify(data, null, 2));
    });

    events.on('device:updated', ({ deviceID, params }) => {
      console.log(`[DEBUG] UPDATE: ${deviceID}`, params);
    });

    // Log all WebSocket messages (add to websocket.mjs):
    // console.log('[WS RX]', data.toString());
  }
};


Network Capture:

# Capture TLS handshake
tcpdump -i eth0 -s 0 -w sonoff.pcap port 443 or port 8082

# Analyze in Wireshark
wireshark sonoff.pcap


Test Endpoints:

# Test dispatch endpoint
curl -X POST http://192.168.1.11:8081/dispatch/device \
  -H 'Content-Type: application/json' \
  -d '{"deviceid":"test123","apikey":"test"}'

# Test HTTPS dispatch
curl -k -X POST https://192.168.1.11/dispatch/device \
  -H 'Content-Type: application/json' \
  -d '{"deviceid":"test123","apikey":"test"}'

# Test API
curl http://192.168.1.11:3000/devices


11.3. LOG ANALYSIS
───────────────────────────────────────────────────────────────────────────────

Successful Connection Sequence:

[DISPATCH] Device: 1000abcdef (PSF-B01-GL) from 192.168.1.100 (secure: true) → port 8082
[MODERN WS] ✓ New connection from 192.168.1.100 (secure: true)
[MODERN WS] Device 1000abcdef → ONLINE (Living Room Light)
[MODERN WS] ✓ Registered: 1000abcdef (Living Room Light)


Failed TLS Handshake:

[DISPATCH TLS] ✓ Secure connection: TLSv1.2 / ECDHE-RSA-AES128-GCM-SHA256
[MODERN WSS TLS ERROR] From 192.168.1.100: write EPROTO
└─ Cause: Cipher mismatch, missing @SECLEVEL=0


Missing Modern Module:

✓ Legacy HTTP+WS: 192.168.1.11:8081
✓ REST API running: http://0.0.0.0:3000
[DISPATCH] Device: 1000abcdef → port 8082
(No modern servers started)
└─ Cause: ModernModule not started in core/index.mjs


═══════════════════════════════════════════════════════════════════════════════
                            12. DEPLOYMENT
═══════════════════════════════════════════════════════════════════════════════

12.1. REQUIREMENTS
───────────────────────────────────────────────────────────────────────────────

Software:
  • Node.js >= 18.0
  • npm >= 8.0
  • OpenSSL >= 1.1.1

Hardware:
  • Raspberry Pi 3/4 or equivalent
  • 512MB RAM minimum
  • 100MB disk space

Network:
  • Static IP address
  • Router with DNS override capability
  • Open ports: 443, 8081, 8082, 3000


12.2. INSTALLATION
───────────────────────────────────────────────────────────────────────────────

# 1. Clone repository
git clone https://github.com/yourusername/ewelink-proxy.git
cd ewelink-proxy

# 2. Install dependencies
npm install

# 3. Generate TLS certificates
openssl genrsa -out core/sonoff-key.pem 2048
openssl req -new -key core/sonoff-key.pem -out sonoff.csr \
  -subj "/CN=dispatch.ewelink.cc"
openssl x509 -req -in sonoff.csr -signkey core/sonoff-key.pem \
  -out core/sonoff-cert.pem -days 3650
rm sonoff.csr

# 4. Edit configuration
nano core/config.mjs
# Update serverIp to your server's IP
# Generate new localApiKey: uuidgen

# 5. Configure router DNS
# Add DNS override: dispatch.ewelink.cc → <your-server-ip>

# 6. Run server
node core/index.mjs


12.3. RUNNING AS A SERVICE
───────────────────────────────────────────────────────────────────────────────

Systemd Service (Linux):

# Create service file
sudo nano /etc/systemd/system/ewelink-proxy.service

[Unit]
Description=eWeLink Local Proxy
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/ewelink-proxy
ExecStart=/usr/bin/node core/index.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target

# Enable and start
sudo systemctl enable ewelink-proxy
sudo systemctl start ewelink-proxy

# Check status
sudo systemctl status ewelink-proxy

# View logs
sudo journalctl -u ewelink-proxy -f


PM2 (Process Manager):

# Install PM2
npm install -g pm2

# Start application
pm2 start core/index.mjs --name ewelink-proxy

# Configure autostart
pm2 startup
pm2 save

# Monitor
pm2 monit

# Logs
pm2 logs ewelink-proxy


12.4. PRODUCTION CONSIDERATIONS
───────────────────────────────────────────────────────────────────────────────

Security:
  ✓ Change default localApiKey
  ✓ Restrict API port (3000) to LAN only
  ✓ Use firewall rules to block internet access
  ✓ Regular security audits

Performance:
  ✓ Monitor memory usage (should be < 100MB)
  ✓ Log rotation (PM2 handles this)
  ✓ Limit plugin count

Reliability:
  ✓ Use systemd or PM2 for auto-restart
  ✓ Monitor logs for errors
  ✓ Backup aliases.json regularly
  ✓ UPS for server (prevent data loss)

Monitoring:
  ✓ Check /devices endpoint periodically
  ✓ Alert on device offline events
  ✓ Monitor server disk space


═══════════════════════════════════════════════════════════════════════════════
                              END OF DOCUMENTATION
═══════════════════════════════════════════════════════════════════════════════

For questions, issues, or contributions:
  GitHub: https://github.com/mpalitto/Domotica/ewelink-proxy/nodejs
  Issues: https://github.com/mpalitto/Domotica/issues

Last updated: 2025
