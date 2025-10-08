#!/bin/bash
cnt=0
while true; do
  if [ -e /dev/ttyACM0 ]; then
    echo "starting SCREEN - $(date)" >> /root/.screenWrapper.log
    screen -S arduino433tx -d -m /dev/ttyACM0 9600
    PID=$(pgrep -f "SCREEN -S arduino433tx" | tail -1)
    if [ $PID ]; then while [ -e /proc/$PID ]; do sleep 0.1; done; fi
    echo "restarting SCREEN - $(date)" >> /root/.screenWrapper.log
  else
    echo -n "Arduino not found - $(date): " >> /root/.screenWrapper.log
    while [ ! -e /dev/ttyACM0 ]; do echo -n "$cnt " >>  /root/.screenWrapper.log; let cnt++; sleep 3; done
    cnt=0; 
    echo >> /root/.screenWrapper.log; 
    echo "Arduino found - $(date)" >> /root/.screenWrapper.log
  fi
done
