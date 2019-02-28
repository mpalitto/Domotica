# Domotica
Domotica system using nodeMCU + sONOFF + LWRF mood switches + Linux Server 

I did use an ARDUINO YUN and an ARDUINO UNO for RF-Rx and RF-Tx in the 1st version. 

However the YUN is about 70 EURO (vs. nomeMCU about 4 EUROs), SONOFF-RF is more expensive than the regular SONOFF, TX-RF needs to be amplified (more $$). Thus in the new version I will use:
* nodeMCU as RF-Rx
* NO-Tx: There will no need for ARDUINO + RF-TX + RF Amplifier
* LWRF mood switches: elegant RF remotes 
* Linux Server + WIFI

Other CONs:
* I will be able to receive the SONOFF reported state.
* I will be able to send commands with the actual wanted state as supposed to taggle the state.

## Component list:
* sONOFF-RF: WiFi + RF rele'
* LWRF mood switches: elegant RF remotes 
* ARDUINO YUN + RF-RX: switches code receiver
* ARDUINO + RF-TX: RF transmitter to sONOFF rele'
* Linux Server

## Architecture:
''' LWRF button -->nodeMCU + RF-RX --> WIFI --> LAN --> Linux Server --> WIFI --> sONOFF relay '''

## Code:
