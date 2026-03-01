# eWeLink Proxy

## Objective

eWeLink is the cloud platform and mobile app used by SONOFF devices to operate relays over Wi-Fi via the internet.

The goal of this project is to make it possible to control SONOFF relays **locally** over Wi-Fi — without relying on the eWeLink app or cloud servers — even when no internet connection is available.

To achieve this, the idea is to **replace the official eWeLink cloud server with a local one**, without the SONOFF devices realizing the difference.

This would enable local control of SONOFF devices and open the door for integration with other home automation systems.

However, since the eWeLink app also allows remote control via Alexa and global access through the internet, it would be ideal to **preserve those capabilities**.
Therefore, the local server should also function as a **proxy**, forwarding communications between SONOFF devices and the eWeLink cloud whenever internet connectivity is present.

## Problem

During setup, each SONOFF device stores the cloud server domain name it should connect to.
When powered on, the device connects to the local Wi-Fi and attempts to reach that cloud server using a DNS request.
If the device cannot reach the cloud, Wi-Fi control becomes unavailable.

## Solution

All SONOFF devices will connect to a **custom local proxy server** hosted on a low-cost Linux board.

When a SONOFF device boots, it sends a DHCP request to obtain an IP address and then sends a DNS request to an hardcoded DNS IP address.
The local DHCP server provides the address in a specified range to the sonoff device so that will be easier to write firewall rules later...
The firewall rules will get any request for destination port 53 and redirect the packet to the local DNS server (dnsmasq), which will return the IP and port of the **local proxy server** Instead of resolving to the real cloud.

NOTE: in order to get this configuration working the Home Router has OpenWRT OS (in my case I had an very old D-Link router that I have customized by installing the new OS). The ISP Router works as a Modem giving access to the Internet.    

``Internet <---> ISP Router(used as Modem) <---> OpenWRT Router (DHCP, DNS, Firewall)<---> Wifi <---> sonoff device``

This local proxy server emulates the eWeLink cloud, providing a CLI interface for local relay control.

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
                           ┌──────────┴───────────────────────┐
                           │     Local DNS                    │
                           │ Overrides any sonoff DNS request │
                           └──────────┬───────────────────────┘
                                      ▲
                         DNS Query    │
                                      │
                           ┌──────────┴──────────┐
                           │    SONOFF Device    │
                           │ (asks for cloud IP) │
                           │  Wi-Fi connection   │
                           └─────────────────────┘
```
## Installation & Configuration Steps
* Application Setup: Navigate to the nodejs directory to begin the eWeLink-Proxy software installation.
* Network Setup:
  1. Head to the DNS directory to configure the OpenWRT router.
  2. Follow the instructions below to add a new sONOFF device

### Adding a New Sonoff Device to Your Local Proxy
When adding a new Sonoff device to your network, follow these steps to ensure it connects to your local proxy instead of the cloud:

Step 1: Temporarily Disable Local DNS Override

> Turn OFF your local DNS redirection that forces Sonoff devices to use your proxy.

Step 2: Configure Device Using Official Method

> Follow the standard eWeLink app pairing procedure:
```
Open the eWeLink app on your phone
Add the device using the normal pairing process
Complete setup and verify the device connects to the cloud
Test that the device responds to commands from the app
```

Step 4: Re-enable Local DNS Override

> Turn your local DNS redirection back ON to redirect future devices to your proxy.

Step 5: Verify Local Connection

> The device will automatically reconnect to your local proxy:

Step 6: Check if device appears as online

`sonoff list online`

Step 7: Provide alias name

`sonoff set-alias <deviceID|alias> <newAlias>`

### Node.js Folder

The current eWelink-proxy implementation provides the **local server** functionality.
### DNS Folder
provide the OpenWRT Router configuration
###
