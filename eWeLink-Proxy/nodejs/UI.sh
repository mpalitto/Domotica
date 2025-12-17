#!/bin/bash

sonoff() {
        echo "$*" | nc -w 1 localhost 9999
}

SONOFF_FILE="/root/Domotica/eWeLink-Proxy/nodejs/sONOFF.cmd"
last_seen_sonoff() { # lista tutti is sONOFF devices visti dal proxy nell'ultima giornata
	# it assumes the proxy has been started as a systemd service
	journalctl -u ewelink-proxy.service --since today | sed -n 's/^\([A-Za-z]* [0-9]* [0-9:]*\).*"deviceid":"\([^"]*\)".*/\2 \1/p' | sort -r | awk '!seen[$1]++' | \
		awk -v width=20 '
		    NR==FNR {
		        names[$2] = $3
		        next
		    }
		    {
		        name = ($1 in names) ? names[$1] : "unknown"
		        printf "%-*s %s\n", width, name, $0
		    }
		' "$SONOFF_FILE" -
}

echo '# Usage'
echo 'sonoff switch devAlias|devID ON|OFF      # for switching a device ON or OFF'
echo 'example: sonoff switch 1000024e09 ON'

echo 
echo 'sonoff ?                                 # for listing all possible commands'
