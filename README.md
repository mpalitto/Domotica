# sONOFF cloud Proxy
## OBJECTIVE:
sONOFF cloud server and APP are very useful for operating the relay using WIFI, but it would be nice to operate the relay through WIFI even when connection to the internet is not available.

The idea is to replace the cloud server with a local one without the sONOFF relay knowing it.

## PROBLEM:
The relays during setup time get the address of the cloud server to connect to.

when the sONOFF is turned on, it connects to the WIFI network and then will attempt to connect to the cloud server. If not connection to the cloud server is successful, the relay cannot be operated using WIFI.

## SOLUTION:
* have all sONOFF connect to custom WIFI AP which is implemented by using a low cost Linux board and a WIFI usb adapter.
* use IPTABLES to redirect received traffic to local address and port.
* have a local server running on the Linux board to serve the sONOFF and give a local interface to switch the relay.
* In order to keep the cellphone functionality in the case of available internet connection, we can simulate the sONOFF client and connect to the cloud server. This will allow the cloud server to send command which we can then forward to the sONOFF of interest, when sONOFF sends status to server (local) we forward it to the cloud server.

## SERVER IMPLEMENTATION:
### ANALISYS:
the following link shows the protocol between the cloud server and the sONOFF device:
http://blog.nanl.de/2017/05/sonota-flashing-itead-sonoff-devices-via-original-ota-mechanism/

from which we can identify 4 phases:
1. DISPATCH
2. WEBSOCKET
3. REGISTRATION
4. COMMANDS

### PHASE 1: DISPATCH
sONOFF send a POST HTTPS request to eu-disp.coolkit.cc
from which receives the IP and PORT for the WebSocket (WS) server.

### PHASE 2: Establish WS connection
according to the websocket standard.

### PHASE 3: REGISTRATION
Once the WS is established, a sequence of WS messages are exchanged to register the sONOFF device with the server (see above link for details)

### PHASE 4: COMMANDS
in this state the sONOFF device is waiting for commands from server, and sending periodic state updates.

## CONSIDERATIONs:
Since we want to use the same LINUX computer for DISPATCH server and for WS server, we need to necessarily use 2 different ports for the 2 servers.
DISPATCH uses port 443 or 8080 depending on the sONOFF version.
Our local sONOFF server will listen for HTTP requests on port 8000 and HTTPS requests on port 8181.

Thus our IPTABLES rules for the DISPATCH server will be:
```
iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8000
iptables -t nat -A PREROUTING -p tcp --dport 443 -j REDIRECT --to-port 8181
```
(Logica di attraversamento di iptables)[http://openskill.info/infobox.php?ID=1300]
(IPTABLES info di base)[https://wiki.archlinux.org/index.php/Iptables_(Italiano)#tabelle]

These rules will redirect all packets coming to the local sONOFF server (which works as AP for the sONOFF devices) to the respective ports for unsecured (legacy devices) or secure requests.

We can then use 8443 for the local DISPATCH server, thus using IPTABLES  we need to redirect ports 443 and 8080 to local port 8443.

The local DISPATCH server then will reply to the device by sending its own IP address 192.168.1.11 and port 8433 as the listening port for creating a WS connection. Thus the DISPATCH server and the WS server are really 2 aspects of the the same server listening on port 8443.

Our local server will then give the IP address of the local Linux computer and the PORT (for example 8888) where we have our WS server listening to each sONOFF device/.

For each sONOFF connection we will need to store the deviceID. On 1st use of each deviceID we can associate a device name that can be used for easier reference.
The association can be stored in a file. 

For each sONOFF a status must be maintained in memory.

Each sONOFF have settings that can be changed like the PowerON state and timers.
These will need to be stored in file.

A regular socket(port 9999) will be used to get commands from command-line.`echo list | nc -w 1 localhost 9999` (where `list` is the command to be sent in this case). available commands:
1. list - list connected sONOFF devices
2. name - `name devID devName` it gives an alias|name that can be used to give commands to the sONOFF device
3. switch - `switch deviceID|alias on|off` switch sONOFF device ON or OFF

(nodejs-websocket)[https://github.com/sitegui/nodejs-websocket] is A nodejs module for websocket server and client
which is what I have used for this implementation.

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

