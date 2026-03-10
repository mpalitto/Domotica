# OpenWRT configuration
## Connecting to router via SSH
since the router is an older one and not able to connect with modern crypto algorithms,

I had to add all sort of options to the SSH cli command, to make my life easier I made an alias to make the connection from my PC
```
alias openwrt='ssh -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa root@192.168.1.1'
```
## OpenWRT router connections
one one side I have the ISP router working as a Modem connected via ethernet cable to the OpenWRT router to the WAN configured port, and one of the LAN port is connected to an Access Point

NOTE: I am using an external Mesh technology access point to reach out to all areas of my home. I did disabled the Wifi on the OpenWRT router.

## Configuration files
### root@OpenWrt:~# cat /etc/config/network 
```
config interface 'loopback'
	option ifname 'lo'
	option proto 'static'
	option ipaddr '127.0.0.1'
	option netmask '255.0.0.0'

config globals 'globals'
	option ula_prefix 'fdb0:dd96:df16::/48'

config interface 'lan'
	option type 'bridge'
	option ifname 'eth0.1'
	option proto 'static'
	option netmask '255.255.255.0'
	option ip6assign '60'
	option ipaddr '192.168.1.1'

config switch
	option name 'switch0'
	option reset '1'
	option enable_vlan '1'

config switch_vlan
	option device 'switch0'
	option vlan '1'
	option ports '1 2 3 8t'

config interface 'wan'
	option proto 'static'
	option ipaddr '192.168.0.254'
	option netmask '255.255.255.0'
	option gateway '192.168.0.1'
	option dns '1.1.1.1 8.8.8.8'
	option ifname 'eth0.2'

config switch_vlan
	option device 'switch0'
	option vlan '2'
	option ports '0 8t'

config switch_vlan
```

### root@OpenWrt:~# cat /etc/config/dhcp
```
config dnsmasq
    option domainneeded '1'
    option boguspriv '1'
    option filterwin2k '0'
    option localise_queries '1'
    option rebind_protection '1'
    option rebind_localhost '1'
    option local '/lan/'
    option domain 'lan'
    option expandhosts '1'
    option nonegcache '0'
    option authoritative '1'
    option readethers '1'
    option leasefile '/tmp/dhcp.leases'
    option resolvfile '/tmp/resolv.conf.auto'
    option localservice '1'

# Standard LAN devices: 192–240
config dhcp 'lan'
    option interface 'lan'
    option start '192'
    option limit '49'           # 192–240 = 49 IPs
    option leasetime '12h'
    option ignore '0'

# Ignore DHCP on WAN
config dhcp 'wan'
    option interface 'wan'
    option ignore '1'

# Disable odhcpd DHCPv4 on LAN (optional)
config odhcpd 'odhcpd'
    option maindhcp '0'
    option leasefile '/tmp/hosts/odhcpd'
    option leasetrigger '/usr/sbin/odhcpd-update'
```

### root@OpenWrt:~# cat /etc/dnsmasq.conf
```
# Tag devices whose MAC starts with D0:27:00
dhcp-mac=set:iot,D0:27:00:*:*:*

# Tagged IoT devices get IPs in 100–199
dhcp-range=tag:iot,192.168.1.128,192.168.1.191,255.255.255.0,12h
```
###  cat /etc/dnsmasq-iot.conf 
```
# This is the second dnsmasq instance — DNS-only, answers everything with 192.168.1.11
# No dhcp-range is defined, so this instance does not serve DHCP.

port=1053                    # Avoids conflict with main dnsmasq on port 53
listen-address=192.168.1.1   # Only listen on the LAN IP
bind-interfaces              # Bind explicitly to that address
address=/#/192.168.1.11      # Answer ALL queries with 192.168.1.11
no-resolv                    # Don't read upstream resolvers (not needed)
no-hosts                     # Don't read /etc/hosts
```

### root@OpenWrt:~# cat /etc/rc.local 
```
# Put your custom commands here that should be executed once
# the system init finished. By default this file does nothing.

# Auto-start the second instance of dnsmasq
dnsmasq --conf-file=/etc/dnsmasq-iot.conf &

exit 0
```

### root@OpenWrt:~# cat /etc/firewall.user 
```
# This file is interpreted as shell script.
# Put your custom iptables rules here, they will
# be executed with each firewall (re-)start.

# Internal uci firewall chains are flushed and recreated on reload, so
# put custom rules into the root chains e.g. INPUT or FORWARD or into the
# special user chains, e.g. input_wan_rule or postrouting_lan_rule.

# Redirect DNS for Sonoff devices (DHCP 129-191)
# packets from devices with IP in the range and destination port 53
# will be redirected to port 1053 where a second istance of dnsmasq is listning

iptables -t nat -A PREROUTING -i br-lan -p udp --dport 53 \
  -s 192.168.1.128/26 \
  -j REDIRECT --to-ports 1053

iptables -t nat -A PREROUTING -i br-lan -p tcp --dport 53 \
  -s 192.168.1.128/26 \
  -j REDIRECT --to-ports 1053
```
