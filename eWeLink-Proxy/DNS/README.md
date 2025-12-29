================================================================================
SONOFF LOCAL CONTROL PROJECT - DNS REDIRECTION SETUP
================================================================================

PROJECT OVERVIEW:
-----------------
This project enables local control of Sonoff smart devices by intercepting their
DNS requests and redirecting them to a local eWeLink proxy server. This prevents
the devices from reaching the external Coolkit cloud while allowing the local 
proxy to bridge the communication.

ARCHITECTURE:
-------------
1. Main Router (DHCP Server)
   └── Points all network clients to this Rock64 (192.168.1.11) as the DNS Server.

2. Linux DNS Server (Single machine running all services)
   ├── Primary System DNS (resolv.conf) -> Points to External DNS (e.g., 1.1.1.1).
   │   └── Used by the eWeLink Proxy to find the REAL cloud server IPs.
   │
   ├── Redirected dnsmasq (Port 5555) -> "The Liar".
   │   └── Uses 'address=' rules to point Coolkit domains to 192.168.1.11.
   │
   ├── nftables Rules -> "The Traffic Cop".
   │   └── Identifies Sonoff MAC addresses (d0:27:00:*) and forces their 
   │       DNS traffic (port 53) to Port 5555.
   │
   └── eWeLink Proxy Server (Port 8888) -> "The Middleman".
       └── Receives redirected device traffic and forwards it to the real cloud.

SPLIT-BRAIN DNS LOGIC:
----------------------
To avoid a loop, the same domain must resolve to two different places:
1. For Sonoff Devices: eu-disp.coolkit.cc -> 192.168.1.11 (Local Proxy)
2. For the Proxy App:  eu-disp.coolkit.cc -> 52.57.6.180 (Real Internet IP)

This is achieved by keeping the domain OUT of /etc/hosts and defining it
strictly within the dnsmasq instance listening on port 5555.



SONOFF TRAFFIC FLOW (INTERCEPTED):
----------------------------------
Sonoff Device (MAC: d0:27:00:xx:xx:xx)
  ↓ (DNS query for eu-disp.coolkit.cc)
nftables redirect rule
  ↓ (Intercepted and sent to Local Port 5555)
Secondary dnsmasq instance
  ↓ (Responds with 192.168.1.11)
Sonoff connects to Local eWeLink Proxy (Port 8888)

PROXY/GENERIC TRAFFIC FLOW (SYSTEM):
------------------------------------
eWeLink Proxy / Local System
  ↓ (DNS query for eu-disp.coolkit.cc)
System Resolver (/etc/resolv.conf)
  ↓ (Bypasses nftables redirect)
External DNS Server (1.1.1.1)
  ↓ (Responds with REAL Cloud IP)
Proxy successfully connects to WAN to forward device data.
================================================================================
