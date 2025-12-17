#!/bin/bash
# Usage:
# screen -S ESP32-Kinetic-RX -r
screen -S ESP32-Kinetic-RX -X quit
screen -S ESP32-Kinetic-RX -d -m
screen -S ESP32-Kinetic-RX -X stuff "bash -c 'while true; do stdbuf -o0 nc -l 5678 | tee -a $IoTserverScripts/tmp-files/buttonPress.log; done'\n"
