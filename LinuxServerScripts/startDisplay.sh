#!/bin/bash
# Usage:
# screen -S displayServer -X stuff 'text to be displayed'
screen -S displayServer -X quit
screen -S displayServer -d -m
screen -S displayServer -X stuff "nodejs /root/displayServer.js\n"
