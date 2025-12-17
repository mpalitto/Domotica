screen -S switch -X quit
screen -S switch -d -m
# screen -S switch -X stuff "$IoTserverScripts/switch.sh | tee -a $IoTserverScripts/.switch.log\n"
screen -S switch -X stuff "while true; do $IoTserverScripts/BUTTON2SONOFF/switch.sh | tee -a $IoTserverScripts/tmp-files/.switch.log; done\n"
