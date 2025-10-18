#!/bin/bash
nogood=""
rx=""
sed '/^$/d' $IoTserverScripts/switches.status > $IoTserverScripts/switches.new.status
mv $IoTserverScripts/switches.new.status $IoTserverScripts/switches.status
echo >> $IoTserverScripts/switches.status
#while true
#do
#  stdbuf -o0 netcat -l 1234 | tee -a /var/log/faillog | \
#  sed -n '$!H;${G;s/\n/ /g;p}' | \
#  sed '/deviceid/!d;s/.*deviceid":"//;s/".*switch":"/ /;s/".*//' | \
stdbuf -o0 /usr/local/bin/mitmdump -vvv -T --cert *=cert.pem -ddd --insecure | stdbuf -o0 grep -B3 switch | while read line
do
  if [[ "$line" =~ "switch" ]]; then
    rx="$(echo $rx $line)"
    # time to elaborate the switch
    echo -n "received: "
    echo $rx | sed '/deviceid/!d;s/.*deviceid":"//;s/".*switch":"/ /;s/".*//' | \
      while read deviceid status
      do 
        echo "received: $deviceid $status"
        if [ "$deviceid" ] && [ "$status" ]; then 
          sed "/$deviceid/d; /^$/ i $deviceid $status" $IoTserverScripts/switches.status > $IoTserverScripts/switches.new.status
        else
          echo NOGOOD found
          notgood=true
        fi
      done
      if [ $nogood ]; then notgood=""; continue; fi
      # echo NEW:; cat $IoTserverScripts/switches.new.status
      sed '/^$/d' $IoTserverScripts/switches.new.status > $IoTserverScripts/switches.status
      echo >> $IoTserverScripts/switches.status
      echo ACTUAL:; cat $IoTserverScripts/switches.status
    rx=""
  else
    #keep storing
    rx="$(echo $rx $line)"
  fi
done
