#!/bin/bash
cnt=0
while true; do
  if [ -e /dev/ttyACM0 ]; then
    echo "starting SCREEN - $(date)" >> $IoTserverScripts/.screenWrapper.log
    screen -S arduino433tx -X quit
    screen -S arduino433tx -d -m /dev/ttyACM0 9600
    PID=$(pgrep -f "SCREEN -S arduino433tx" | tail -1)
    if [ $PID ]; then 
	    while [ -e /proc/$PID ]; do sleep 1; done
    fi
    echo "restarting SCREEN - $(date)" >> $IoTserverScripts/.screenWrapper.log
  else
    echo -n "Arduino not found - $(date): " >> $IoTserverScripts/.screenWrapper.log
    while [ ! -e /dev/ttyACM0 ]; do echo -n "$cnt " >>  $IoTserverScripts/.screenWrapper.log; let cnt++; sleep 3; done
    cnt=0; 
    echo >> $IoTserverScripts/.screenWrapper.log; 
    echo "Arduino found - $(date)" >> $IoTserverScripts/.screenWrapper.log
  fi
done
