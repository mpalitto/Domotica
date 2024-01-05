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

# Start a new screen session for the server and UI
# Commands for setting the screen layout and will be executed after a delay to ensure the screen session is ready

# Start a new screen session where to run both the Server and the User Interface
# However in order to get the screen layout we need to issue some commands o the new session
# I am going to execute the commands on a separate background process that will wait 
# before starting to execute the commands, so that, I can start first the screen session
# and the commands will be issued once the session is up and running
# NOTE: I am sure there is a better way to do this... maybe using (.screenrc file)?
bash <<EOF > /dev/tty &
sleep 3 # wait 3 secs for the new screen session be up and running
# Start a new screen session with title
# this session is for running the Server
screen -S "sONOFF-Server" -X title "SERVER" # give it a title
# Start a new screen session with title
# this session is for the User Interface
screen -S "sONOFF-Server" -X screen -t "CMD"

# Split the screen horizontally
screen -S "sONOFF-Server" -X split

# select SERVER titled session for top screen
screen -S "sONOFF-Server" -X  select SERVER
# select CMD titled session for bottom screen
screen -S "sONOFF-Server" -X focus
screen -S "sONOFF-Server" -X select CMD

# Resize the new region to have 5 lines
# screen -S "sONOFF-Server" -p "sONOFFserver" -X resize -h 5

# RUN the Server in the bot pane (-p 0)
screen -S "sONOFF-Server" -p 0 -X stuff 'node sONOFFserver.mjs
'
# RUN the User Interface in the bottom pane (-p 1)
screen -S "sONOFF-Server" -p 1 -X stuff 'source UI.sh
'
# Save layout to allow to detach and re-attach and keeping the layout
screen -S "sONOFF-Server" -X layout save default
EOF

# Start a new screen session
screen -S "sONOFF-Server"  -m 

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
