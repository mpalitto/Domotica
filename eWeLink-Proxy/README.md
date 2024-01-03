# eWeLink Proxy
## OBJECTIVE: 
eWeLink is the sONOFF cloud server and APP, it is used for operating the relay using WIFI through the internet.

It would be nice to operate the relay through WIFI without using the eWeLink APP and CLOUD server even when connection to the internet is not available. 

The idea is to replace the CLOUD server with a LOCAL one without the sONOFF relay knowing it.

This would allow a local control of sONOFF devices and eventually integrating it with home automation local software.

Since eWeLink APP allow us to check and control sONOFF devices from Alexa and from anywhere in the world,
it would be nice to keep that functionality, thus the LOCAL server would need to PROXY the sONOFF device connection with the CLOUD server when internet connection is available.

## PROBLEM: 
The relays during setup time get the address of the cloud server to connect to. when the sONOFF is turned on, it connects to the WIFI network and then will attempt to connect to the cloud server. If not connection to the cloud server is successful, the relay cannot be operated using WIFI.

## SOLUTION:
have all sONOFF devices connect to custom WIFI AP which is implemented by using a low cost Linux board and a WIFI usb adapter.
use IPTABLES to redirect received traffic coming from WIFI interface to local address and port.

Have a local server running on the Linux board to serve the sONOFF and give a local interface to switch the relay.

In order to keep the cellphone functionality in the case of available internet connection, we can simulate the sONOFF client and connect to the cloud server. This will allow the cloud server to send command which we can then forward to the sONOFF of interest, when sONOFF sends status to server (local) we forward it to the cloud server.

## IMPLEMETATIONs (see corresponding code sub-directories)
### MITM-PORXY Version
Originally I started using an open source tool available outthere called [mitmproxy](https://mitmproxy.org/)

However, since I am not familiar with the tool and with Python, after making a working version but with limeted capability, 
I abbandoned the effort for starting a new version using Node JS

1. succefully proxyes the devices to CLOUD server
2. I was able to inject messages to control locally the sONOFF devices

However it still requires internet connection working to connect to CLOUD server to function.

Thus, it would not be possible to use it locally without the internet connection

### Node JS Version

As of now, it implements the local server, however I will need to implement the PROXY functionality in order to keep the eWeLink APP working, even though it is not necessary.
