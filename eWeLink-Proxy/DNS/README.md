# OpenWRT DNS & Network Enforcement

> **⚠️ MIGRATED (Oct 2026).** The design below is still in force, but it no
> longer runs on OpenWRT — the router is a Debian LXC (`192.168.1.1`, Proxmox
> LXC 111). What changed in practice:
>
> * IoT MACs `D0:27:00:*` are tagged in `/etc/dnsmasq.conf` and get the DHCP
>   pool `192.168.1.128-191` (UCI `config tag 'iot'` → `dhcp-mac=set:iot,...`)
> * The DNS interception is an **iptables PREROUTING `REDIRECT`** of `udp/tcp
>   53` from `192.168.1.128/26` to port **1053** (was OpenWRT `firewall.user`)
> * The second dnsmasq (`/etc/dnsmasq-iot.conf`, "answer everything with
>   `192.168.1.11`") listens on `192.168.1.1:1053`
> * Both instances are started by **`/etc/rc.local`**, not systemd
> * Since Oct 2026 every LAN client also gets `192.168.1.1` as its DHCP DNS,
>   so the main dnsmasq is the resolver in normal use and the interception is
>   the enforcement backstop for the IoT pool only
>
> See `AGENTS.md` ("Network" section) and `macos/README.md`.

This document describes the low-level DNS interception and DHCP configuration used to control SONOFF devices at the router level.

NOTE: All logic runs inside OpenWRT.

## 🔎 **Concept Overview**

The system does not inspect DNS domain names.

Instead, it:

* Classifies devices by MAC address
* Assigns them to a dedicated IP range
* Intercepts DNS traffic from that IP range using NAT
* Handles DNS locally via router dnsmasq

This ensures: 
* No DNS bypass
* No reliance on domain matching
* Centralized enforcement

## 🧩 **DHCP Configuration**

File: ``/etc/config/dhcp``

1️⃣ **Tag SONOFF Devices**
```
config tag 'iot'
    option mac 'D0:27:00:*:*:*'
```    
2️⃣ **IoT DHCP Pool**
```
config dhcp 'iot'
    option interface 'lan'
    option start '100'
    option limit '100'
    option leasetime '12h'
    option tag 'iot'
```
Result:
``192.168.1.100 – 192.168.1.199``

3️⃣ **Main LAN Pool**
```
config dhcp 'lan'
    option interface 'lan'
    option start '200'
    option limit '41'
    option leasetime '12h'
```
Result:
``192.168.1.200 – 192.168.1.240``

## 🌐 **DNS Interception** (Firewall)

File: ``/etc/firewall.user``

UDP DNS
```
iptables -t nat -A PREROUTING -i br-lan -p udp --dport 53 \
  -m iprange --src-range 192.168.1.100-192.168.1.199 \
  -j REDIRECT --to-ports 53
```
TCP DNS
```
iptables -t nat -A PREROUTING -i br-lan -p tcp --dport 53 \
  -m iprange --src-range 192.168.1.100-192.168.1.199 \
  -j REDIRECT --to-ports 53
```
🔬 **What These Rules Do**

If: Source IP ∈ 192.168.1.100–199 -- AND -- Destination port = 53

Then: Redirect traffic to router’s local DNS service

Even if device tries Hardcoded DNS like:
8.8.8.8
1.1.1.1

It is transparently redirected.

## 🧠 Router DNS Behavior

OpenWRT uses dnsmasq internally.

It can be configured to:
* Resolve proxy target to 192.168.1.11
* Forward other domains upstream
* Fully isolate IoT devices

Configuration file:

``/etc/config/dhcp``

No external DNS server required.

## 🔍 **Validation & Debugging**

Check DHCP Assignment: ``cat /tmp/dhcp.leases``

Monitor DNS Traffic: ``tcpdump -i br-lan port 53``

Verify Firewall Rule Loaded: ``iptables -t nat -L -n -v``

## 🛡 Security Properties
```
✔ Prevents DNS bypass
✔ Enforces deterministic resolution
✔ Segments IoT traffic
✔ Centralizes policy
✔ Reduces attack surface
```
## 📌 Final Architecture Summary
```
Component	        Responsibility
ISP Modem	        Internet upstream
OpenWRT	            DHCP, DNS, NAT enforcement
Debian SBC	        eWeLink-Proxy only
SONOFF Devices	    IoT clients
```
