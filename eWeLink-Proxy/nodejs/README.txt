modular-RESTapi/
├── index.mjs
├── core/
│   ├── config.mjs           # Configuration
│   ├── dispatch.mjs         # Shared dispatch handler logic
│   └── websocket.mjs        # Shared WebSocket logic
├── modules/
│   ├── legacy/
│   │   └── index.mjs        # HTTP + WS server setup (port 8081)
│   └── modern/
│       ├── index.mjs        # Module orchestrator
│       ├── dispatch.mjs     # HTTPS dispatch server (port 443)
│       └── wss.mjs          # WSS server (port 8082)
├── sonoff-key.pem
└── sonoff-cert.pem

Core server code handles:

Event system

Plugin loading

Alias storage

REST API server

TLS setup

Device registry

Legacy module handles:

Legacy HTTP+WebSocket server (8081)

Legacy dispatch handling

Legacy WS message handling

This isolates legacy behavior so you can later add a LAN/WebSocket module for modern devices without touching legacy code.
