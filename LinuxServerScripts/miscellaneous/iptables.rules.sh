# Utilizing the Linux box as a proxy for sONOFF devices to connect to the cloud eWeLink server.
# The box operates as an access point (AP) where each sONOFF device connects through the "enxc..." interface.
# The AP is linked to the LAN via eth0.

# This rule substitutes the source IP address with the IP address of the Linux box for incoming packets from sONOFF devices.
# These packets undergo modification with source IP address replacement using Network Address Translation (NAT).
# MASQUERADE, a variant of Source NAT (SNAT) for dynamic IP addresses, is employed.
# If the Linux Box has a static IP address, it should be substituted with:
# iptables -t nat -A POSTROUTING -o eth0 -j SNAT --to 192.168.1.77 ???
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

# For sONOFF devices using the HTTPS protocol on port 443 to connect to the cloud server,
# this rule redirects such packets to the local Nodejs Proxy server listening on port 8080.
# Legacy sONOFF devices using HTTP protocol and port 8080 to connect to the cloud server do not require redirection.
iptables -t nat -I PREROUTING -i enxc4e9840b09a5 -p tcp --dport 443 -j REDIRECT --to-port 8080

# Save the iptables rules to /etc/network/iptables.rules for persistence.
iptables-save > /etc/network/iptables.rules
