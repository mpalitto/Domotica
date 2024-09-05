# Domotica System Overview

**Components Used:**

- **sONOFF-RF**: Switches controlled by WiFi and RF signals
- **LWRF Mood Controller**: Stylish remote controls that use RF signals
- **ESP8266 + RF-RX**: Receives codes from the remote controls
- **Arduino + RF-TX**: Sends ON/OFF commands to the sONOFF switches
- **Linux Server**: Manages the system

**System Architecture:**

1. ![image](https://github.com/user-attachments/assets/61b4dce5-5deb-4a12-9c55-6c51129e3704)
**LWRF Mood Controller** sends RF signals.
2. ![image](https://github.com/user-attachments/assets/662b5011-f7e4-48c5-a2b8-b61e419d7f73)
**ESP8266 + RF-RX** receives these RF signals.
3. **ESP8266** connects to the **Linux Server** via WiFi.
4. ![image](https://github.com/user-attachments/assets/5fb99af1-e832-484b-b28c-54b38e446c26)
The **Linux Server** communicates with the **Arduino + RF-TX**.
5. ![image](https://github.com/user-attachments/assets/dd578410-a87e-46ef-bf4a-f16b2424cf12)
**Arduino + RF-TX** transmits ON/OFF commands to the **sONOFF-RF Switches**.
6. ![image](https://github.com/user-attachments/assets/6e4ca74c-d807-420b-8169-60b8fd3bf3c6)**sONOFF-RF Switches** switches ON or OFF the ![image](https://github.com/user-attachments/assets/342dbbcc-0a28-4be2-9f60-d0a9fffacacc)
lights


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
                            Cloud communication    `-. ~~~~~~~ .-'
```
### Smartphone APP Control
Each SONOFF-RF device connects to the internet via WiFi and establishes a link with the SONOFF Cloud Server. The smartphone app connects to the SONOFF Cloud Server, allowing the user to control the lights remotely from anywhere in the world... as long the SONOFF-RF Switch is connected to the INTERNET... and ** ITEAD Studio **(manufacturer) provides the Cloud Server!
