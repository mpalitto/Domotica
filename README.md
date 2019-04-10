# Domotica
Domotica system using Arduino + sONOFF-RF + LWRF mood switches + Linux Server 

## Component list:
* sONOFF-RF: WiFi + RF rele'
* LWRF mood switches: elegant RF remotes 
* ARDUINO YUN + RF-RX: switches code receiver
* ARDUINO + RF-TX: RF transmitter to sONOFF rele'
* Linux Server

## Architecture:
``` LWRF button --> ARDUINO YUN + RF-RX --> LAN --> Linux Server --> Arduino + RF-TX --> sONOFF relay ```

## Directory Structure:
``Arduino:`` (the code for programming the 2 ARDUINO boards + code for the nodeMCU ESP8266 RF receivers)

 ``--> YUN-LWRF-receiver-v0.2`` (Dir with Files for the ARDUINO YUN board used as a LW mood wall switches RF receiver)
 * --> -->  YUN-LWRF-receiver-v0.2.ino: (the ARDUINO code implementing the RF receiver logic)
 * --> --> send2HomeServer.sh: (the Shell Script used for sending the received codes to Home Server)
 * --> --> conn2HomeServer.sh: (establishes connection to Home Server over socket)

``--> sketch_rf433rxStoreCodePulseInMix-0.2`` (code for the ARDUINO RF TX)
It actually can TX RF signal, can receive for regular RF codes, and it can receive LW RF codes depending on the command used from terminal

``--> RFreceiver_esp8266`` (code for the nodeMCU LW RX modules)
