#!/bin/bash
nogood=""
rx=""
sed '/^$/d' $IoTserverScripts/switches-clear.status > $IoTserverScripts/switches-clear.new.status
mv $IoTserverScripts/switches-clear.new.status $IoTserverScripts/switches-clear.status
echo >> $IoTserverScripts/switches-clear.status
echo -n > $IoTserverScripts/switches-clear.new.status
#while true
#do
#  stdbuf -o0 netcat -l 1234 | tee -a /var/log/faillog | \
#  sed -n '$!H;${G;s/\n/ /g;p}' | \
#  sed '/deviceid/!d;s/.*deviceid":"//;s/".*switch":"/ /;s/".*//' | \
stdbuf -o0 tcpdump  -Ann -i enxc4e9840b09a5 -p tcp port 8081 and greater 200 | while read line
do
  if [[ "$line" =~ "switch" ]]; then
    rx="$(echo $rx $line)"
    # time to elaborate the switch
    #echo -n "received: "
    stdbuf -o0 echo $rx | stdbuf -o0 sed '/deviceid/!d;s/.*deviceid":"//;s/".*switch":"/ /;s/".*//' | \
      while read deviceid status
      do 
        echo "received: $deviceid $status"
        if [ "$deviceid" ] && [ "$status" ]; then 
          sed "/$deviceid/d; /^$/ i $deviceid $status" $IoTserverScripts/switches-clear.status > $IoTserverScripts/switches-clear.new.status
        else
          echo NOGOOD found
          notgood=true
        fi
      done
      if [ $nogood ]; then notgood=""; continue; fi
      # echo NEW:; cat $IoTserverScripts/switches-clear.new.status
      sed '/^$/d' $IoTserverScripts/switches-clear.new.status > $IoTserverScripts/switches-clear.status
      echo >> $IoTserverScripts/switches-clear.status
      echo ACTUAL:; cat $IoTserverScripts/switches-clear.status
    rx=""
  else
    #keep storing
    rx="$(echo $rx $line)"
  fi
done
