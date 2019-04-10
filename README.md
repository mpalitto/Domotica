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
### Arduino
(the code for programming the 2 ARDUINO boards + code for the nodeMCU ESP8266 RF receivers)

 ``--> YUN-LWRF-receiver-v0.2`` (Dir with Files for the ARDUINO YUN board used as a LW mood wall switches RF receiver)
 * --> -->  YUN-LWRF-receiver-v0.2.ino: (the ARDUINO code implementing the RF receiver logic)
 * --> --> send2HomeServer.sh: (the Shell Script used for sending the received codes to Home Server)
 * --> --> conn2HomeServer.sh: (establishes connection to Home Server over socket)

``--> sketch_rf433rxStoreCodePulseInMix-0.2`` (code for the ARDUINO RF TX)
It actually can TX RF signal, can receive for regular RF codes, and it can receive LW RF codes depending on the command used from terminal

``--> RFreceiver_esp8266`` (code for the nodeMCU LW RX modules)

### LinuxServerScripts
The Home Server is a Linux single board (I am using OrangePi)

It is connected to the ARDUINO RF TX via USB cable working as SERIAL connection

and to LAN with static IP address

* ``heartbeat.sh`` (sends heat beats to ARDUINO RF TX for health monitoring)
* ``sONOFF.list`` (list of sONOFF devices)
* ``wallSwitches.list`` (list of LW wall switches)
* ``rc.local`` (server startup script) it should be installed into the ``/etc/`` dir
* ``switch.sh`` (once a LW wall switch button is pressed, and its code received, it sends the commands to ARDUINO TX)
* ``screenWrapper.sh`` (restart the screen session used for connecting to ARDUINO RF TX via serial port
* ``socket.js`` (nodejs socket server code for receiving codes from both YUN and nodeMCUs RF RX via sockets)

