screen -S nodeMCU -X quit
screen -S nodeMCU -d -m
#screen -S nodeMCU -X stuff "while true; do nodejs /root/socket.js | tee -a /root/tmp; done\n"
screen -S nodeMCU -X stuff "while true;do nodejs /root/socket.js | tee -a /root/tmp; done\n"
