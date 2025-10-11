#!/bin/bash

while true; do
  $IoTserverScripts/serial 2>> $IoTserverScripts/tmp
  sleep 1
done
