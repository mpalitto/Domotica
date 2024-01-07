sysctl net.ipv4.ip_forward=1 
iptables -t nat -F
# for locally generated packets with destination port 80 get redirected to local address port 7777
# iptables -t nat -A OUTPUT -p tcp --dport 80 -j DNAT --to 127.0.0.1:8080

iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

iptables -t nat -A PREROUTING -p tcp --dport 80 -j DNAT --to-destination 192.168.200.1:8888
iptables -t nat -A PREROUTING -p tcp --dport 443 -j DNAT --to-destination 192.168.200.1:8888

iptables -t nat -A PREROUTING -p tcp --dport 8081 -j DNAT --to-destination 192.168.200.1:8888
iptables -t nat -A PREROUTING -p tcp --sport 8081 -j DNAT --to-destination 192.168.200.1:8888

# RUN the server
node proxy.js
