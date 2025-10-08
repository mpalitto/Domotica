#!/bin/ash
# make HomeServer fifo if not there
# HomeServer is a named pipe 
# used for sending codes from the Arduino core over the network with netcat (nc)
# The script is expecting screen intstalled (nc should be by default)
if [ ! -e /root/HomeServer ]; then mkfifo /root/HomeServer; fi

# check if netcat session is already opened
if [ "$(ps | sed -n '/S \+nc/p')" = "" ]; then
  if [ "$(ps | sed -n '/ \+cat$/p')" = "" ]; then
    echo 'keeping PIPE from closing'
    screen -S HomeServer -p 0 -X stuff 'cat > /root/HomeServer &
    '
  fi
  echo 'Establishing "nc" connection to Home Server'
  screen -S HomeServer -p 0 -X stuff 'nc 192.168.1.77 1234 < /root/HomeServer
  '
fi
