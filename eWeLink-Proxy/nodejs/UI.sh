sonoff() {
        echo "$*" | nc -w 1 localhost 9999
}


echo '# Usage'
echo 'sonoff switch devAlias|devID ON|OFF      # for switching a device ON or OFF'
echo 'example: sonoff switch 1000024e09 ON'

echo 
echo 'sonoff ?                                 # for listing all possible commands'
