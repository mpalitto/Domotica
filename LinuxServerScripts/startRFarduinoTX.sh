#!/bin/bash
if [ -e /dev/ttyACM0 ]; then
  echo "starting SCREEN - $(date)" >> /root/.arduinoTX.log
  screen -S arduino433tx -X quit
  screen -S arduino433tx -d -m /dev/ttyACM0 9600
else
  echo "Arduino found - $(date)" >> /root/.arduinoTX.log
fi
