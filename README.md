# Domotica
Domotica system using Arduino + sONOFF-RF + nodeMCU + LWRF mood switches + Linux Server 

Turns on/off relayes (SONOFF-RF) by pressing wall switches(LWRF mood switches) buttons.

SONOFF-RF relays were chosen for they are relaiable and cheap, they are controlled by RF or by WIFI. They are cellphone app controllable and can be connected to services as ALEXA, GOOGLE HOME, IFTTT.

LWRF mood switches were chosen for their look and style.

This project is the extension of the previous project with the addition of multiple receivers. This will allow to increase the area covered by the RF receivers and thus improve the switches 

The 1st RF receiver was implemented using an Arduino YUN + RF-RX. However at time of implementation YUN would cost about $70.

I have decided to use a less powerful but less expencive nodeMCU board ($4) + RF-RX.

The connection between Home Server and receivers have been changed from SSH to regular SOCKET, this was done to allow the less powerful nodeMCU to connect to the Home Server.

On the server side the SSH server was replaced with a Nodejs script which is able to accept several SOCKET connections from the different RF receivers.

## Component list:
* sONOFF-RF: WiFi + RF relay
* LWRF mood switches: elegant RF remotes 
* ARDUINO YUN + RF-RX: switch code RF receiver
* nodeMCU + RF-RX: switch code RF receiver
* ARDUINO + RF-TX: RF transmitter to sONOFF relay
* Linux Server

## Architecture:
``` LWRF button --> ARDUINO YUN + RF-RX / nodeMCU + RF-RX --> LAN --> Linux Server --> Arduino + RF-TX --> sONOFF relay ```

## Directory Structure:
### Arduino
(the code for programming the 2 ARDUINO boards + code for the nodeMCU ESP8266 RF receivers)

 ``--> YUN-LWRF-receiver-v0.2`` (Dir with Files for the ARDUINO YUN board used as a LW mood wall switches RF receiver)
 * --> -->  YUN-LWRF-receiver-v0.2.ino: (the ARDUINO code implementing the RF receiver logic)
 * --> --> send2HomeServer.sh: (the Shell Script used for sending the received codes to Home Server)
 * --> --> conn2HomeServer.sh: (establishes connection to Home Server over socket)

``--> sketch_rf433rxStoreCodePulseInMix-0.2`` (code for the ARDUINO RF TX)
It actually can TX RF signal, RX for regular RF codes, and RX LW RF codes, depending on the command used from terminal

``--> RFreceiver_esp8266`` (code for the nodeMCU LW RX modules)

### LinuxServerScripts
The Home Server is a Linux single board (I am using OrangePi)

It is connected to the ARDUINO RF-TX via USB cable working as SERIAL connection

and to LAN with static IP address

* ``heartbeat.sh`` (sends heat beats to ARDUINO RF TX for health monitoring)
* ``sONOFF.list`` (list of sONOFF devices)
* ``wallSwitches.list`` (list of LW wall switches)
* ``rc.local`` (server startup script) it should be installed into the ``/etc/`` dir
* ``switch.sh`` (once a LW wall switch button is pressed, and its code received, it sends the commands to ARDUINO TX)
* ``screenWrapper.sh`` (restart the screen session used for connecting to ARDUINO RF TX via serial port
* ``socket.js`` (nodejs socket server code for receiving codes from both YUN and nodeMCUs RF RX via sockets)

