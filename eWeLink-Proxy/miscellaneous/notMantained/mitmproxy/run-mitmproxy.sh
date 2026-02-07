
export LANG=en_US.UTF-8
iptables -t nat -F

# PAT using eth0 as the WAN port and its IP address as the "public address"
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

#HTTP and HTTPS DISPATCH servers rules
iptables -t nat -A PREROUTING -p tcp --dport 80 -j DNAT --to-destination 192.168.200.1:8000
iptables -t nat -A PREROUTING -p tcp --dport 443 -j DNAT --to-destination 192.168.200.1:8080

if [ "$1" ]; then script="$1"; else script="websocketCMD.py"; fi

# starts a screen session with mitmproxy

#quit session if already running
screen -S proxy -X quit
#start new session in ditached mode
screen -S proxy -d -m
sleep 1
#start mitmproxy 
screen -S proxy -X stuff "mitmproxy --ssl-insecure -m transparent -s $script\n"
