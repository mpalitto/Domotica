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

# Standard LAN devices: 200–240
config dhcp 'lan'
    option interface 'lan'
    option start '200'
    option limit '41'           # 200–240 = 41 IPs
    option leasetime '12h'
    option ignore '0'

# IoT devices tagged by MAC prefix
config tag 'iot'
    option mac 'D0:27:00:*:*:*'

# IoT pool: 100–199
config dhcp 'iot'
    option interface 'lan'
    option start '100'
    option limit '100'          # 100–199 = 100 IPs
    option leasetime '12h'
    option tag 'iot'

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
cat: can't open '/etc/dnsmasq.sconf': No such file or directory
root@OpenWrt:~# cat /etc/dnsmasq.conf
# Change the following lines if you want dnsmasq to serve SRV
# records.
# You may add multiple srv-host lines.
# The fields are <name>,<target>,<port>,<priority>,<weight>

# A SRV record sending LDAP for the example.com domain to
# ldapserver.example.com port 289
#srv-host=_ldap._tcp.example.com,ldapserver.example.com,389

# Two SRV records for LDAP, each with different priorities
#srv-host=_ldap._tcp.example.com,ldapserver.example.com,389,1
#srv-host=_ldap._tcp.example.com,ldapserver.example.com,389,2

# A SRV record indicating that there is no LDAP server for the domain
# example.com
#srv-host=_ldap._tcp.example.com

# The following line shows how to make dnsmasq serve an arbitrary PTR
# record. This is useful for DNS-SD.
# The fields are <name>,<target>
#ptr-record=_http._tcp.dns-sd-services,"New Employee Page._http._tcp.dns-sd-services"

# Change the following lines to enable dnsmasq to serve TXT records.
# These are used for things like SPF and zeroconf.
# The fields are <name>,<text>,<text>...

#Example SPF.
#txt-record=example.com,"v=spf1 a -all"

#Example zeroconf
#txt-record=_http._tcp.example.com,name=value,paper=A4

# Provide an alias for a "local" DNS name. Note that this _only_ works
# for targets which are names from DHCP or /etc/hosts. Give host
# "bert" another name, bertrand
# The fields are <cname>,<target>
#cname=bertand,bert

dhcp-range=tag:iot,192.168.1.100,192.168.1.199,12h
dhcp-range=tag:main,192.168.1.200,192.168.1.240,12h

dhcp-mac=set:iot,D0:27:00:*:*:*

# Force all DNS for IoT devices to 192.168.1.11
dhcp-option=tag:iot,6,192.168.1.11
```

root@OpenWrt:~# cat /etc/firewall.user 

```
# This file is interpreted as shell script.
# Put your custom iptables rules here, they will
# be executed with each firewall (re-)start.

# Internal uci firewall chains are flushed and recreated on reload, so
# put custom rules into the root chains e.g. INPUT or FORWARD or into the
# special user chains, e.g. input_wan_rule or postrouting_lan_rule.

# Redirect DNS for Sonoffs (DHCP 100-199)
iptables -t nat -A PREROUTING -i br-lan -p udp --dport 53 \
  -m iprange --src-range 192.168.1.100-192.168.1.199 \
  -j REDIRECT --to-ports 53

iptables -t nat -A PREROUTING -i br-lan -p tcp --dport 53 \
  -m iprange --src-range 192.168.1.100-192.168.1.199 \
  -j REDIRECT --to-ports 53
```
