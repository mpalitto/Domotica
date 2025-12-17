#!/bin/bash

# Load NVM
export NVM_DIR="/root/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Change to working directory
cd /root/Domotica/eWeLink-Proxy/nodejs

# Run the proxy with the current active node version
exec node proxy.mjs
