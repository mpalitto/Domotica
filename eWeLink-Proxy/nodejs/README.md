# NodeJS version of eWwLink Proxy
Please refer to [eWeLink-proxy](https://github.com/mpalitto/Domotica/new/master/eWeLink-Proxy) README file 
for understanding the context of this implementarion

## What it offers
### Working so far
1. succefully implements the LOCAL server
2. offers command line interface for controlling the sONOFF devices ON or OFF

### Work in Progress

### Work Planned 
1. Proxy functionality
2. run server into a screen session
3. implement timer

### New ideas
1. define groups of devices
2. pretend someone home routines

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
