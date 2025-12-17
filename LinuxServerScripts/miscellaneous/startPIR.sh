#!/bin/bash
screen -S PIRsensors -X quit
screen -S PIRsensors -d -m
screen -S PIRsensors -X stuff "bash -c '. /root/.nvm/nvm.sh; node $IoTserverScripts/PIRsocketServer.js'\n"
