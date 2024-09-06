# Domotica System Overview

## System Architecture

1. ![image](https://github.com/user-attachments/assets/61b4dce5-5deb-4a12-9c55-6c51129e3704)
**LWRF Mood Controller** sends RF signals.
2. ![image](https://github.com/user-attachments/assets/662b5011-f7e4-48c5-a2b8-b61e419d7f73)
**ESP8266 + RF-RX** receives these RF signals.
3. **ESP8266** connects to the **Linux Server** via WiFi.
4. ![image](https://github.com/user-attachments/assets/5fb99af1-e832-484b-b28c-54b38e446c26)
The **Linux Server** communicates with the **Arduino + RF-TX**.
5. ![image](https://github.com/user-attachments/assets/dd578410-a87e-46ef-bf4a-f16b2424cf12)
**Arduino + RF-TX** transmits ON/OFF commands to the **sONOFF-RF Switches**.
6. ![image](https://github.com/user-attachments/assets/6e4ca74c-d807-420b-8169-60b8fd3bf3c6)  **sONOFF-RF** switches ON or OFF the   ![image](https://github.com/user-attachments/assets/342dbbcc-0a28-4be2-9f60-d0a9fffacacc)
lights

**Components Used:**

- N x **sONOFF-RF**: Switches controlled by WiFi and RF signals
- M x **LWRF Mood Controller**: Stylish remote controls that use RF signals
- L x **ESP8266 + RF-RX**: Receives codes from the remote controls
- 1 x **Arduino + RF-TX**: Sends ON/OFF commands to the sONOFF switches
- 1 x **Linux Server**: Manages the system

## Architecture Overview Diagram
```
   [LWRF Mood Controller]                          [Smartphone App (eWelink)]
             |                                            |
             | RF codes (Lightwave proprietary)           |  Cloud communication
             v                                            v
    [ESP8266 + RF-RX]                                [SONOFF Cloud Server (eu-disp.coolkit.cc)]
             |                                            ^
             | WiFi                                       |
             v                                            |
       [Linux Server]                                     |
             |                                            |  Cloud communication
             | USB (serial)                               |
             v                                            |
   [Arduino + RF-TX]                                      |
             |                                            |
             | RF codes (standard)                        v
             |                                         .-~~~-.
             v                                     .-~~       ~~-.
 [SONOFF-RF Switch] <---------------------------->(    Internet    )
                          Cloud communication      `-. ~~~~~~~ .-'
```
### Smartphone APP Control
Each SONOFF-RF device connects to the internet via WiFi and establishes a link with the SONOFF Cloud Server. The smartphone app connects to the SONOFF Cloud Server, allowing the user to control the lights remotely from anywhere in the world... as long the SONOFF-RF Switch is connected to the INTERNET... and **ITEAD Studio** (manufacturer) provides the Cloud Server!

## Architecture Home side details Diagram

```
 Remote Controller 1          Remote Controller 2  ........  Remote Controller N
           |                            |                              |
       [RF Signal]                 [RF Signal]                   [RF Signal]
           |                            |                              |
           v                            v                              v
    --------------------------[ Lightwave codes ]--------------------------
           |                            |                              |
           v                            v                              v
    ESP8266+RF-Rx(1)             ESP8266+RF-Rx(2)   ..........  ESP8266+RF-Rx(M)
           |                            |                              |
      [WiFi Signal]                [WiFi Signal]                 [WiFi Signal]
           |                            |                              |
           v                            v                              v
     ---------------------------[ Buttons codes ]--------------------------
                                        |
                                        v
                       [ Linux-Server + Arduino + RF-Tx ]
                                        |
                                        v
     ---------------------------[ RF sONOFF codes ]--------------------------
           |                            |                              |
           v                            v                              v
       sONOFF-RF(1)                 sONOFF-RF(2)     ..........    sONOFF-RF(L)
           |                            |                              |
           v                            v                              v
        LIGHT(1)                     LIGHT(2)       ..........      LIGHT(L)
```
