screen -S switch -X quit
screen -S switch -d -m
screen -S switch -X stuff "$IoTserverScripts/switch.sh | tee -a $IoTserverScripts/.switch.log\n"
