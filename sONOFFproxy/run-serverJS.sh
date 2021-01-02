export LANG=en_US.UTF-8
iptables -t nat -F
# for locally generated packets with destination port 80 get redirected to local address port 7777
# iptables -t nat -A OUTPUT -p tcp --dport 80 -j DNAT --to 127.0.0.1:8080
# iptables -t nat -A PREROUTING -p tcp --dport 8081 -j REDIRECT --to-port 8080

#HTTP and HTTPS DISPATCH servers rules
iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8000
iptables -t nat -A PREROUTING -p tcp --dport 443 -j REDIRECT --to-port 8181

# are these rule really needed? it would only change the "response" of the HTTP|HTTPS server to port 8888... in server.js
iptables -t nat -A PREROUTING -p tcp --dport 8080 -j REDIRECT --to-port 8888
iptables -t nat -A PREROUTING -p tcp --dport 8443 -j REDIRECT --to-port 8888
iptables -t nat -L
# watch -n1 iptables -t nat -vnL
node server.js
# node socket-tls.js
#node https-server.js
