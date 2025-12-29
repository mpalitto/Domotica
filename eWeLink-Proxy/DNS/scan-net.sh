#!/bin/bash

MAC_FILE="$1"
SUBNET="${2:-192.168.1}"

# Ping sweep to populate ARP cache
echo "[*] Pinging subnet to populate ARP table..."
for i in $(seq 1 254); do
    ping -c 1 -W 1 "${SUBNET}.$i" &>/dev/null &
done
wait

echo "[*] Reading ARP table..."
echo ""

# Match MACs from file against ARP table
while IFS= read -r mac || [[ -n "$mac" ]]; do
    [[ -z "$mac" || "$mac" =~ ^# ]] && continue
    
    mac_clean=$(echo "$mac" | tr '[:upper:]' '[:lower:]' | tr '-' ':')
    
    ip=$(ip neigh | grep -i "$mac_clean" | awk '{print $1}' | head -1)
    
    printf "%s -> %-20s\n" "${ip:-NOT FOUND}" "$mac" 
done < "$MAC_FILE"
