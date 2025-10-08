#!/bin/bash
nogood=""
rx=""
sed '/^$/d' /root/switches-clear.status > /root/switches-clear.new.status
mv /root/switches-clear.new.status /root/switches-clear.status
echo >> /root/switches-clear.status
echo -n > /root/switches-clear.new.status
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
          sed "/$deviceid/d; /^$/ i $deviceid $status" /root/switches-clear.status > /root/switches-clear.new.status
        else
          echo NOGOOD found
          notgood=true
        fi
      done
      if [ $nogood ]; then notgood=""; continue; fi
      # echo NEW:; cat /root/switches-clear.new.status
      sed '/^$/d' /root/switches-clear.new.status > /root/switches-clear.status
      echo >> /root/switches-clear.status
      echo ACTUAL:; cat /root/switches-clear.status
    rx=""
  else
    #keep storing
    rx="$(echo $rx $line)"
  fi
done
