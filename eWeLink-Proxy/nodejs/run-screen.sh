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

# # remove previous screen session if exists
# screen -S "sONOFF-Server" -X quit
# # Start a new screen session for the server and UI
# screen -mS "sONOFF-Server" -c .screenrc

SESSION_NAME="sONOFF-Server"

# Check if a screen session with the same name already exists
if screen -list | grep -q "$SESSION_NAME"; then
    # Prompt the user to decide whether to attach or replace the existing session
    read -p "A session named '$SESSION_NAME' already exists. Do you want to replace it? (y/n): " choice
    if [ "$choice" = "y" ]; then
        # Quit the existing session
        screen -S "$SESSION_NAME" -X quit
        # Start a new screen session for the server and UI
        screen -mS "$SESSION_NAME" -c .screenrc
    else
        # Attach to the existing session
        screen -r "$SESSION_NAME"
    fi
else
    # Start a new screen session for the server and UI as no session exists
    screen -mS "$SESSION_NAME" -c .screenrc
fi

# Note: the "-m" option forces an new top level screen session even if it was started with in
# screen session
# 
# without "-m" option
# ├── screen 1
# │    └── screen 2
# 
# with "-m" option
# ├── screen 1
# ├── screen 2
