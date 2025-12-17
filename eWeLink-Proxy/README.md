# eWeLink Proxy

## Objective

eWeLink is the cloud platform and mobile app used by SONOFF devices to operate relays over Wi-Fi via the internet.

The goal of this project is to make it possible to control SONOFF relays **locally** over Wi-Fi — without relying on the eWeLink app or cloud servers — even when no internet connection is available.

To achieve this, the idea is to **replace the official eWeLink cloud server with a local one**, without the SONOFF devices realizing the difference.

This would enable local control of SONOFF devices and open the door for integration with other home automation systems.

However, since the eWeLink app also allows remote control via Alexa and global access through the internet, it would be ideal to **preserve those capabilities**.
Therefore, the local server should also function as a **proxy**, forwarding communications between SONOFF devices and the eWeLink cloud whenever internet connectivity is present.

## Problem

During setup, each SONOFF relay stores the cloud server address it should connect to.
When powered on, the device connects to the local Wi-Fi and attempts to reach that cloud server.
If the device cannot reach the cloud, Wi-Fi control becomes unavailable.

## Solution

All SONOFF devices will connect to a **custom local proxy server** hosted on a low-cost Linux board.

When a SONOFF device boots, it sends a DHCP request to obtain an IP address and DNS server.
The local DHCP server provides the address of a **local DNS server**, which overrides DNS lookups for `eu-disp.coolkit.cc` (the official eWeLink cloud domain).
Instead of resolving to the real cloud, it returns the IP and port of the **local proxy server**.

This local server emulates the eWeLink cloud, providing a CLI interface for local relay control.

When an internet connection is available, the proxy can also simulate a SONOFF client to connect to the real cloud.
This allows cloud commands (e.g., from Alexa or the mobile app) to be forwarded to the correct SONOFF device, while device status updates are passed back to the cloud.
```
                           ┌──────────────────────┐
                           │      Cloud Server    │
                           │ (eWeLink official)   │
                           └──────────┬───────────┘
                                      ▲
                                      │ HTTP/HTTPS (proxy)
                                      │
                    ┌─────────────────┴─────────────────┐
                    │         Local Proxy Server        │
                    │  (on Linux board - Node.js app)   │
                    │-----------------------------------│
                    │  • Forwards traffic to Cloud       │
                    │  • Provides CLI for local control  │
                    └─────────────────┬─────────────────┘
                                      ▲
                     HTTP/HTTPS       │
                                      │
                           ┌──────────┴──────────┐
                           │     Local DNS       │
                           │ Overrides eu-disp.* │
                           └──────────┬──────────┘
                                      ▲
                         DNS Query    │
                                      │
                           ┌──────────┴──────────┐
                           │    SONOFF Device    │
                           │ (asks for cloud IP) │
                           │  Wi-Fi connection   │
                           └─────────────────────┘
```
### Node.js Version

The current implementation provides the **local server** functionality.
