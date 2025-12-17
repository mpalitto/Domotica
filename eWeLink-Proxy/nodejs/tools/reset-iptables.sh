sysctl net.ipv4.ip_forward=1 
iptables -t nat -F
# for locally generated packets with destination port 80 get redirected to local address port 7777
# iptables -t nat -A OUTPUT -p tcp --dport 80 -j DNAT --to 127.0.0.1:8080
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

