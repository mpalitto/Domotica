screen -S IoT-WEBui -X quit
screen -S IoT-WEBui -d -m
screen -S IoT-WEBui -X stuff "cd /root/iot-controller; node WEBserver-port3000.js | tee -a /root/.iot-controller.log\n"
