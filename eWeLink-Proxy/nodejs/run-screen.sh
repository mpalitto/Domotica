#!/bin/bash

sysctl net.ipv4.ip_forward=1 
iptables -t nat -F
# for locally generated packets with destination port 80 get redirected to local address port 7777
# iptables -t nat -A OUTPUT -p tcp --dport 80 -j DNAT --to 127.0.0.1:8080

iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

iptables -t nat -A PREROUTING -p tcp --dport 80 -j DNAT --to-destination 192.168.200.1:8888
iptables -t nat -A PREROUTING -p tcp --dport 443 -j DNAT --to-destination 192.168.200.1:8888

iptables -t nat -A PREROUTING -p tcp --dport 8081 -j DNAT --to-destination 192.168.200.1:8888
iptables -t nat -A PREROUTING -p tcp --sport 8081 -j DNAT --to-destination 192.168.200.1:8888

# Start a new screen session
bash <<EOF > /dev/tty &
sleep 3
screen -S "sONOFF-Server" -X title "SERVER" # give it a title
# Start a new screen session with title
screen -S "sONOFF-Server" -X screen -t "CMD"
#screen -S "sONOFF-Server"  -t "sONOFFserver" -d -m node sONOFFserver.mjs

# Split the screen horizontally
screen -S "sONOFF-Server" -X split

# select SERVER titled session for top screen
screen -S "sONOFF-Server" -X  select SERVER
# select SERVER titled session for bottom screen
screen -S "sONOFF-Server" -X focus
screen -S "sONOFF-Server" -X select CMD
# Resize the new region to have 5 lines
# screen -S "sONOFF-Server" -p "sONOFFserver" -X resize -h 5

# Run a different command in the new region
# RUN the User Interface
screen -S "sONOFF-Server" -p 0 -X stuff 'node sONOFFserver.mjs'
screen -S "sONOFF-Server" -p 1 -X stuff 'source UI.sh'

screen -S "sONOFF-Server" -X layout save default
EOF
screen -S "sONOFF-Server"  -m 
