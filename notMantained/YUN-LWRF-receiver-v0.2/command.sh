#!/bin/bash
# this file (/root/command.sh) is run by the sketch when a RF code is received
LINUXarduinoTX="192.168.1.76"

if [ -e /tmp/root@$LINUXarduinoTX\:22 ]; then
  ssh root@$LINUXarduinoTX "echo 0A1400nn$1 >> tmp"
else
  ssh -M -o "ControlPersist=yes" root@$LINUXarduinoTX "echo 0A1400nn$1 >> tmp"
fi
