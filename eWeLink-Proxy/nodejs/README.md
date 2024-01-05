# NodeJS version of eWwLink Proxy
Please refer to [eWeLink-proxy](https://github.com/mpalitto/Domotica/new/master/eWeLink-Proxy) README file 
for understanding the context of this implementarion

## What it offers
### Working so far
1. succefully implements the LOCAL server
2. offers command line interface for controlling the sONOFF devices ON or OFF
3. run server into a screen session

### Work in Progress

### Work Planned 
1. Proxy functionality
2. implement timer

### New ideas
1. define groups of devices
2. pretend someone home routines
3. implement command to list all new devices (not alias assigned yet)

## Installation
1. Install screen `sudo apt install screen`
2. Install hostapd `sudo apt install hostapd`
3. Install dhcpd `sudo apt install dhcp`
4. configure hostapd and dhcpd
5. clone this repository 

## Usage
1. `cd ~/Domotica/eWeLink-Proxy/nodejs`
2. `source run-screen.sh`

This will open a `screen` session divided into a top pane and a bottom one.
![image](https://github.com/mpalitto/Domotica/assets/7433768/8a228df7-1835-42e5-8a4a-997a5ece0ef5)

The TOP pane is where the server script will be started and shows the server output.

The BOTTOM pane is where the User Interface is found.

### User Interface
it is a regular bash shell where a new command `sonoff` will be available, by using which, it is possible to interact with the Server.

---

Available `sonoff` command options and their syntax:

1. switch <deviceID|alias> <on|off>: Switches the device on or off by their alias or deviceID.  
2. name <deviceID> <devAlias>: Assigns an alias to a device.
3. list [online|offline|on|off|all]: Lists devices based on status filters.
4. ? : Lists all available commands and their syntax.


## Files 
### <p align="center">System files</p>

---

#### * `run.sh` 
responsible for re-directing the TCP packets coming from sONOFF devices connected to WIFI interface 
to a local IP address and port at which the Server will be listening.
 
Since I keep the sONOFF devices on a separate sub-net it also instruct the Linux SBC to behave as a NAT router

Usage: from linux terminal `source run.sh`

NOTEs: it would be better to have it run into a [screen session](https://linuxize.com/post/how-to-use-linux-screen/)

---

#### * `reset-iptables.sh`
remove eventual re-directs but it keeps the NAT functionality. By running this the sONOFF will connect to CLOUD server directly.

---

### <p align="center">Sever files</p>

---

#### * `sharedVARs.js`
shared variables and objects

---

#### * `sONOFFserver.mjs`
Main Server file

---

#### * `requestHandler.mjs`
Handels the HTTPs requests and WebSocket requests

---

#### * `messageHandler.mjs`
in charge of receiving and sending the messages to the sONOFF devices

---

#### * `cmd.mjs`
Opens a local socket for user to interact with the server (using commands)

---

### <p align="center">working files</p>

---

#### * `sONOFF.cmd`
list of commands which will be executed when server is started

as of now, this is used to provide an alias to the sONOFF devices for easier user interaction

---
