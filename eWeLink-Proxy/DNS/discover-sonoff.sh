#!/bin/bash

SONOFF_PREFIX="d0:27:00"
# OUT_FILE="/etc/dnsmasq.d/sonoff-hosts.conf"
OUT_FILE="./sonoff-hosts.conf"

[[ $EUID -ne 0 ]] && { echo "Run as root"; exit 1; }

declare -A MAC2IP
FOUND=0

echo "Scanning network for Sonoff devices..."

# Populate ARP cache
ping -b -c 2 255.255.255.255 >/dev/null 2>&1

while read -r IP _ _ _ MAC _; do
    [[ "$MAC" == "FAILED" ]] && continue

    MAC_LC=$(echo "$MAC" | tr 'A-Z' 'a-z')

    if [[ "$MAC_LC" == $SONOFF_PREFIX* ]]; then
        MAC2IP["$MAC_LC"]="$IP"
        echo "Found Sonoff device: $MAC_LC -> $IP"
        FOUND=1
    fi
done < <(ip neigh show)

echo
echo "# Auto-generated Sonoff DHCP reservations" > "$OUT_FILE"
echo "# Generated on $(date)" >> "$OUT_FILE"
echo >> "$OUT_FILE"

for MAC in "${!MAC2IP[@]}"; do
    echo "dhcp-host=$MAC,${MAC2IP[$MAC]},set=sonoff" >> "$OUT_FILE"
done

if [[ $FOUND -eq 0 ]]; then
    echo "No Sonoff devices found."
    echo "Make sure devices are online and on the same LAN."
else
    echo "----------------------------------------"
    echo "Written $((${#MAC2IP[@]})) unique Sonoff devices to:"
    echo "  $OUT_FILE"
    echo
    echo "Review it, then apply:"
    echo "  systemctl restart dnsmasq"
fi

