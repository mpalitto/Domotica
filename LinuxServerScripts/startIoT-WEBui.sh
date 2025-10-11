screen -S IoT-WEBui -X quit
screen -S IoT-WEBui -d -m
screen -S IoT-WEBui -X stuff "cd $IoTserverScripts/iot-controller; bash -c '. /root/.nvm/nvm.sh; node WEBserver-port3000.js' | tee -a $IoTserverScripts/.iot-controller.log\n"
