screen -S nodeMCU -X quit
screen -dmS nodeMCU bash
screen -S nodeMCU -X stuff ". /root/.nvm/nvm.sh\n"
screen -S nodeMCU -X stuff "while true; do node $IoTserverScripts/socket.js | tee -a $IoTserverScripts/tmp; done\n"
