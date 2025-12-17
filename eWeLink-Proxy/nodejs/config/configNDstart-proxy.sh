#!/bin/bash
# NOTE: do not use this file if script was installed unsing install.sh
#       in which case the script is run and handled by systemd
#       see install.sh script for more info

source ./proxy.env

./setup-network.sh

# RUN the server
# Only backup if file exists
[ -f ./proxy.log ] && mv ./proxy.log ./proxy.log.bak

while true; do
    # Use bash builtin instead of spawning date process
    printf "starting Proxy at %(%Y-%m-%d %H:%M:%S)T\n"
    node proxy.mjs
    exit_code=$?
    printf "Proxy exited with code %d at %(%Y-%m-%d %H:%M:%S)T\n" "$exit_code"
    
    # Prevent crash loops - wait 2 seconds before restart
    sleep 2
done | tee -a ./proxy.log
