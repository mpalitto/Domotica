# for learning new codes: 
#   http://rm-bridge.fun2code.de/rm_manage/code_learning.html

bridge="http://192.168.1.164:7474/code"
# TV-power
# chromecast
# sky
# alexa
# RCV-HDMI
# RCV-SELECT
# RCV-MUTE
# RCV-volUP
# RCV-volDOWN
# SKY-POWER
# SKY-ESC
# SKY-[0 - 9]
case $1 in
  'TV-ON')
    curl $bridge/sky-ON
    curl $bridge/TV-POWER
    curl $bridge/rcv-POWER
    curl $bridge/sky-ON
    ;;

  'TV-OFF')
    curl $bridge/sky-OFF
    curl $bridge/TV-POWER
    curl $bridge/rcv-POWER
    ;;

  'sky')
    curl $bridge/rcv-bd
    sleep .5
    curl $bridge/rcv-in-left
    sleep .5
    curl $bridge/rcv-in-left
    ;;

  'chromecast')
    curl $bridge/rcv-bd
    ;;

  'babytv')
#    curl $bridge/SKY-ESC
#    sleep .1
#    curl $bridge/SKY-ESC
#    sleep .1
    curl $bridge/SKY-ESC
    sleep 1
    curl $bridge/SKY-6
    sleep 1
    curl $bridge/SKY-2
    sleep 1
    curl $bridge/SKY-4
    ;;

  'volDOWN')
    if [ "$2" ]; then byN=$2; else byN=50; fi
    for i in $(seq 1 $byN); do source RMbridge.sh rcv-volDOWN; done
    ;;

  'volUP')
    if [ "$2" ]; then byN=$2; else byN=50; fi
    for i in $(seq 1 $byN); do source RMbridge.sh rcv-volUP; done
    ;;

  *)
    curl $bridge/$1
    ;;

esac
echo
