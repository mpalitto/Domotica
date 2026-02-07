#!/bin/bash

PCAP_FILE="$1"

if [[ -z "$PCAP_FILE" || ! -f "$PCAP_FILE" ]]; then
    echo "Usage: $0 <pcap-file>"
    exit 1
fi

echo "=========================================="
echo "SONOFF Traffic Analysis"
echo "File: $PCAP_FILE"
echo "=========================================="

# Basic stats
echo -e "\n📊 BASIC STATISTICS:"
echo "-------------------"
TOTAL=$(tcpdump -r "$PCAP_FILE" 2>/dev/null | wc -l)
echo "Total packets: $TOTAL"
echo "File size: $(du -h "$PCAP_FILE" | cut -f1)"
echo "Time range:"
tcpdump -r "$PCAP_FILE" -n -tttt 2>/dev/null | head -1 | awk '{print "  First: " $1, $2}'
tcpdump -r "$PCAP_FILE" -n -tttt 2>/dev/null | tail -1 | awk '{print "  Last:  " $1, $2}'

# Protocol breakdown
echo -e "\n📦 PROTOCOL BREAKDOWN:"
echo "-------------------"
tcpdump -r "$PCAP_FILE" -n 2>/dev/null | awk '{
    if ($0 ~ /IP.*\.53:/) proto="DNS";
    else if ($0 ~ /ARP/) proto="ARP";
    else if ($0 ~ /\.80[^0-9]/) proto="HTTP";
    else if ($0 ~ /\.443[^0-9]/) proto="HTTPS";
    else if ($0 ~ /\.8080[^0-9]/) proto="HTTP-Alt";
    else if ($0 ~ /IP/) proto="Other-IP";
    else proto="Other";
    count[proto]++;
}
END {
    for (p in count) printf "  %-15s: %d\n", p, count[p];
}' | sort -k2 -rn

# DNS queries
echo -e "\n🔍 DNS QUERIES:"
echo "-------------------"
tcpdump -r "$PCAP_FILE" -n 'port 53' 2>/dev/null | grep "A?" | awk '{
    for(i=1;i<=NF;i++) if($i ~ /A\?/) print $(i+1);
}' | sort | uniq -c | sort -rn

# DNS responses
echo -e "\n✅ DNS RESPONSES:"
echo "-------------------"
tcpdump -r "$PCAP_FILE" -n 'port 53' 2>/dev/null | grep -oP 'A \K[0-9.]+' | sort | uniq -c | sort -rn

# All unique IPs
echo -e "\n🌐 ALL IP ADDRESSES SEEN:"
echo "-------------------"
tcpdump -r "$PCAP_FILE" -n 2>/dev/null | grep -oP '\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b' | sort | uniq -c | sort -rn

# Port analysis
echo -e "\n🔌 PORT ANALYSIS:"
echo "-------------------"
echo "Source ports from device:"
tcpdump -r "$PCAP_FILE" -n 'src host 192.168.1.129' 2>/dev/null | grep -oP '\d+\.\d+\.\d+\.\d+\.\K\d+' | head -20 | sort | uniq -c | sort -rn

echo -e "\nDestination ports to device:"
tcpdump -r "$PCAP_FILE" -n 'dst host 192.168.1.129' 2>/dev/null | grep -oP '> \d+\.\d+\.\d+\.\d+\.\K\d+' | head -20 | sort | uniq -c | sort -rn

# Check for HTTP/HTTPS
echo -e "\n🌐 HTTP/HTTPS TRAFFIC:"
echo "-------------------"
HTTP_COUNT=$(tcpdump -r "$PCAP_FILE" 'port 80' 2>/dev/null | wc -l)
HTTPS_COUNT=$(tcpdump -r "$PCAP_FILE" 'port 443' 2>/dev/null | wc -l)
HTTP8080_COUNT=$(tcpdump -r "$PCAP_FILE" 'port 8080' 2>/dev/null | wc -l)
WS8081_COUNT=$(tcpdump -r "$PCAP_FILE" 'port 8081' 2>/dev/null | wc -l)

echo "  HTTP (80):       $HTTP_COUNT packets"
echo "  HTTPS (443):     $HTTPS_COUNT packets"
echo "  HTTP (8080):     $HTTP8080_COUNT packets"
echo "  WebSocket (8081): $WS8081_COUNT packets"

if [[ $HTTP_COUNT -eq 0 && $HTTPS_COUNT -eq 0 && $HTTP8080_COUNT -eq 0 && $WS8081_COUNT -eq 0 ]]; then
    echo -e "\n⚠️  WARNING: NO APPLICATION TRAFFIC DETECTED!"
    echo "  The device is only doing DNS lookups but not connecting."
    echo "  Possible issues:"
    echo "    - Proxy not listening on correct port"
    echo "    - Device expects HTTPS (443) not HTTP (8080)"
    echo "    - Firewall blocking traffic"
    echo "    - Device waiting for specific response"
fi

# Check for TCP connections
echo -e "\n🔗 TCP CONNECTIONS:"
echo "-------------------"
SYN_COUNT=$(tcpdump -r "$PCAP_FILE" 'tcp[tcpflags] & tcp-syn != 0' 2>/dev/null | wc -l)
echo "  TCP SYN packets:  $SYN_COUNT"

if [[ $SYN_COUNT -eq 0 ]]; then
    echo -e "\n❌ NO TCP CONNECTION ATTEMPTS!"
    echo "  Device is not trying to establish any TCP connections."
fi

# DNS request timing
echo -e "\n⏱️  DNS REQUEST TIMING:"
echo "-------------------"
tcpdump -r "$PCAP_FILE" -n -tttt 'port 53 and src host 192.168.1.129' 2>/dev/null | \
    grep "A?" | awk '{print $1, $2}' | head -10

echo -e "\n=========================================="
