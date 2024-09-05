# Domotica
Domotica system using Arduino + sONOFF-RF + LWRF mood switches + Linux Server 

## Component list:
* sONOFF-RF: WiFi + RF controlled switches
* LWRF mood controller: elegant RF remotes 
* ESP32 + RF-RX: switches code receiver
* ARDUINO + RF-TX: RF transmitter
* Linux Server

## Architecture:
''' LWRF controller --> ESP32 + RF-RX --> LAN(WiFi) --> Linux Server --> Arduino + RF-TX --> sONOFF-RF Switch '''

## Code:
