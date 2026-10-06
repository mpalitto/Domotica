#!/bin/bash
# Starts the IoT house map WEB UI (port 3000) inside the IoT-WEBui screen session.
#
# Live sonoff state: the node process this launches polls the eWeLink proxy
# (/devices) every STATE_POLL_MS and pushes the result to the browser over
# SSE (/api/states/stream), so switch changes made from a physical button, the
# eWeLink app or another controller show up in the UI without a reload.
#
# Overridable: IoTserverScripts, EWELINK_PROXY_HOST, EWELINK_PROXY_PORT, STATE_POLL_MS

export IoTserverScripts="${IoTserverScripts:-/root/Domotica/LinuxServerScripts}"

screen -S IoT-WEBui -X quit
screen -S IoT-WEBui -d -m
screen -S IoT-WEBui -X stuff "cd $IoTserverScripts/iot-controller; bash -c '. /root/.nvm/nvm.sh; IoTserverScripts=$IoTserverScripts EWELINK_PROXY_HOST=${EWELINK_PROXY_HOST:-192.168.1.11} EWELINK_PROXY_PORT=${EWELINK_PROXY_PORT:-3000} STATE_POLL_MS=${STATE_POLL_MS:-2000} node WEBserver-port3000.js' | tee -a $IoTserverScripts/.iot-controller.log\n"