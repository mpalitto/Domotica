screen -S switch -X quit
screen -S switch -d -m
screen -S switch -X stuff "/root/switch.sh | tee -a /root/.switch.log\n"
