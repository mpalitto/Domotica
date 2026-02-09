# 1. Intent of the Configuration
The primary goal is DNS Hijacking for IoT devices. By intercepting requests to domains like coolkit.cc and ewelink.cc, you trick your smart switches and plugs into communicating with a local server (192.168.1.11) instead of the manufacturer's cloud.

Privacy: Keeps device data within your local network.

Speed: Reduces latency by processing commands locally.

Local Control: Allows platforms like Home Assistant or a custom proxy to control devices even if your internet is down.

## 2. How it Works
```
NOTE: 
in my network the DNS Server is on a debian based Single Board Computer(SBC),
the same SBC where the eWeLink-Proxy is run.
The SBC IP address in my case is: 192.168.1.11
```
Dnsmasq acts as the "traffic controller" for your network's DNS queries.

#### Core Components
1. Upstream Forwarding: For normal requests (like google.com), dnsmasq forwards the query to Google (8.8.8.8) or Cloudflare (1.1.1.1).

2. The "Sinkhole" Strategy: In sonoff.conf, the configuration uses the address=/domain/IP syntax. This tells dnsmasq: "If anyone asks for this domain, don't look it up online; tell them it is located at 192.168.1.11."

3. IPv6 Neutralization: The entries mapping domains to :: (the IPv6 "unspecified" address) act as a sinkhole. This prevents devices from bypassing your IPv4 proxy by trying to connect via IPv6.

#### Configuration Breakdown
```
etc/
├── dnsmasq.conf
└── dnsmasq.d
    └── sonoff.conf
```
* `dnsmasq.conf`	--> Global Settings: Sets the listening interface (eth0), disables system default resolvers (no-resolv), and defines public upstream servers.
* `sonoff.conf`	--> Domain Specifics: Maps all eWeLink and Coolkit subdomains to your local proxy IP (192.168.1.11).
## 3. Installation & Deployment
Since the files are currently in a subfolder (~/Domotica/...), you need to move them to the system path and restart the service.

Step 1: Install Dnsmasq
On a Debian-based system, run:

```
sudo apt update
sudo apt install dnsmasq
```
Step 2: Deploy Configuration
Move the custom files to the standard system locations:

```
# Backup original config if it exists
sudo mv /etc/dnsmasq.conf /etc/dnsmasq.conf.bak
```
# Copy the files
```
sudo cp ~/Domotica/eWeLink-Proxy/DNS/etc/dnsmasq.conf /etc/dnsmasq.conf
sudo cp ~/Domotica/eWeLink-Proxy/DNS/etc/dnsmasq.d/sonoff.conf /etc/dnsmasq.d/
```
Step 3: Permissions and Testing
Ensure the log file exists and the syntax is correct:

```
sudo touch /var/log/dnsmasq.log
sudo chown dnsmasq:root /var/log/dnsmasq.log
```
# Check for syntax errors
`dnsmasq --test`
Step 4: Restart Service
`sudo systemctl restart dnsmasq`
4. Validation
To verify the redirection is working, run this command from any machine on your network:

`nslookup eu-disp.coolkit.cc`
Expected Result: It should return 192.168.1.11 instead of a public IP address.
