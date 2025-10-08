# starts a screen session with current Alarm script
# it assumes currentAllarm.sh found in the location as below

#quit session if already running
screen -S current -X quit
#start new session in ditached mode
screen -S current -d -m
#start currentAllarm.sh 
screen -S current -X stuff "/root/currentAlarm.sh 300\n"
