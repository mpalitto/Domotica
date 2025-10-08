#!/bin/bash
screen -S PIRsensors -X quit
screen -S PIRsensors -d -m
screen -S PIRsensors -X stuff "nodejs /root/PIRsocketServer.js\n"
