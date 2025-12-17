#!/bin/bash

while true; do
  $IoTserverScripts/serial 2>> $IoTserverScripts/tmp-files/buttonPress.log
  sleep 1
done
