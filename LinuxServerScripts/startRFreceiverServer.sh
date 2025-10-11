screen -S nodeMCU -X quit
screen -S nodeMCU -d -m
#screen -S nodeMCU -X stuff "while true; do nodejs $IoTserverScripts/socket.js | tee -a $IoTserverScripts/tmp; done\n"
screen -S nodeMCU -X stuff "while true;do nodejs $IoTserverScripts/socket.js | tee -a $IoTserverScripts/tmp; done\n"
