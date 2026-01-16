# sONOFF local control
In this version the main goal is the integration of the 433MHz RF sonoff control with the eWelink-Proxy
```
Physical button pressed
          ↓
RF 433 code received → buttonPressReceiver.sh
          ↓
debounce + validation
          ↓
echo "A1B2C3D4" > button_fifo
          ↓
managerLayer.js reads buttonID = "A1B2C3D4"
          ↓
looks up button_devices["A1B2C3D4"] → "1000015719,100001588a"
          ↓
toggles button logical state (ON ↔ OFF)
          ↓
for each deviceID in that list:
    decides WiFi or RF → sends command
    (tries WiFi first if device is connected)

Architecture:
-------------------------------------------------------------------------
Linux SBC 192.168.1.77
┌─────────────────────────────────────────────────────────────────────┐
│                        button2sonoff.sh                             │
│                     (Main Orchestrator)                             │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ starts modules
            ┌───────────────┴───────────────┐
            ▼                               ▼
┌───────────────────────┐       ┌─────────────────────────────────────┐
│ buttonPressReceiver.sh│       │        managerLayer.js              │
│                       │       │         sONOFF.config               │
│                       │       │         buttons.config              │
│(receives from remotes)│       │                                     │
│ • TCP :1234 and 5678  │       │   • Maintains device ledger         │
│                       │       │   • Maps button→devices             │
│  Receives raw codes   │       │   • Keeps buttons and devices state │
│   • Preprocess codes  │──────▶│   • WiFi/RF routing decision        │
│   • Debounce logic    │ FIFO  │                                     │
│   • Push codes to FIFO│     ┌─┼─▶ • TCP :7777(receives proxy events)│
└───────────────────────┘     │ └─────────────┬───────────────────────┘
                              │               │                │
                              │               │  |             │
-------------------------------------------------|------------------------
 Linux SBC 192.168.1.11       │(LAN)     (LAN)│  |Arduino R3   │(USB)
                              │               │  |             ▼
            ┌───────────────────┐             │  |   ┌───────────────────┐
            │   eWeLink-proxy   │             │  |   │   Arduino TX      │
            │   (WiFi control)  │             │  |   │   (RF control)    │
            │   REST API :3000◀─┼─────────────┘  |   │   /dev/ttyUSB0    │
            └─────────┬─────────┘                |   └─────────┬─────────┘
                      .                          |             .
             ------------------------------------|-----------------------
                (WiFi).        (wireless connection)           .(RF 433MHz)
                      .                                        .
                      .                                        .
                      ▼                                        ▼
            ┌───────────────────┐                    ┌───────────────────┐
            │   SONOFF Device   │                    │   SONOFF Device   │
            │   (WiFi mode)     │                    │   (RF mode)       │
            └───────────────────┘                    └───────────────────┘

Config files:
there are 2 sonoff device identifiers
alias:    an arbitrary string (used to identify the light is connected to). This ID was originally used when the RF only control was developed
deviceID: a burned in device ID, transmitted by the device once the WiFi connection is established

NOTE: since the deviceID is available only if the sonoff is connected to WiFi, it might be NOT available for all sonoff if RF only mode is configured.
      deivce ID can be found on the ewelink cloud app under device info and on the ewelink-proxy config files.

at each device is associated the following attributes:
* RF coder:      the RF code that gets  programmed during device setup
* description:   for more infos on the device, used to locate the device in the house

buttons.config
buttons code --> target devices(identified by alias)

sONOFF.config
alias --> RF code, deviceID, description
```
