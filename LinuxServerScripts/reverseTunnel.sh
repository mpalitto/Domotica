#!/bin/bash
# connect to remote host 89.46.79.101
# provide a reverse tunnel: from remote host it is possible to connect to the CPU running this script.
# from remote host use ssh -p 19999 root@localhost for connecting to this CPU
# if for any reason the connection dies gets re-established 30 sces later.
ssh root@89.46.79.101 "lsof -i TCP:19999"  | sed -n '/^ssh/{s/ssh[d]* *//;s/ .*//;p}' | uniq | while read pid; do
  if [ "$pid" ]; then 
    echo "killing remote process PID= $pid"; 
    ssh root@89.46.79.101 "kill -9 $pid"; 
  fi # clean preavious connection processes
done

while true; do
  #ssh -f -N -T -R 0.0.0.0:19999:localhost:22 root@89.46.79.101
  ssh -N -T -R 0.0.0.0:19999:localhost:22 root@89.46.79.101

  ssh root@89.46.79.101 "lsof -i TCP:19999"  | sed -n '/^ssh/{s/ssh[d]* *//;s/ .*//;p}' | uniq | while read pid; do
    if [ "$pid" ]; then 
      echo "killing remote process PID= $pid"; 
      ssh root@89.46.79.101 "kill -9 $pid"; 
    fi # clean preavious connection processes
  done

  sleep 30
done
