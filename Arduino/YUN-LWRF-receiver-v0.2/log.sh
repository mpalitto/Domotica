#!/bin/bash
#logs the codes that will be sent to LINUXarduinoTX server
# this file (/root/log.sh) is run by the sketch when a RF code is received

echo $1 >> /root/arduino.log
