screen -S nodeMCU -X quit
screen -S nodeMCU -d -m

# screen -S IoT-WEBui -X stuff "bash -c '. /root/.nvm/nvm.sh; node WEBserver-port3000.js' | tee -a $IoTserverScripts/.iot-controller.log\n"

screen -S nodeMCU -X stuff "bash -c '. /root/.nvm/nvm.sh; while true; do node $IoTserverScripts/socket.js | tee -a $IoTserverScripts/tmp-files/buttonPress.log; done'\n"
