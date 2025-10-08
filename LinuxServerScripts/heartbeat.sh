#!/bin/bash
while true; do
  sleep 1
  screen -S arduino433tx -X stuff "h:" #send heartbeat
done
