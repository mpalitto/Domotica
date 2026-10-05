#!/bin/bash

# Color codes
GREEN=$'\033[0;32m'
RED=$'\033[0;31m'
RESET=$'\033[0m'
CHECK="${GREEN}✓${RESET}"
CROSS="${RED}✗${RESET}"

REMOTE="root@192.168.1.77"
PROXY="root@192.168.1.11"
GATEWAY="192.168.1.1"

# ==================== CONNECTIVITY ====================
echo "=== Connectivity ==="

ping_host() {
  local ip="$1"
  ping -c 2 -W 2 "$ip" >/dev/null 2>&1 && echo "PINGING" || echo "NOT RESPONDING"
}

GATEWAY_STATUS=$(ping_host "$GATEWAY")
PROXY_STATUS=$(ping_host "192.168.1.11")
SERVER_STATUS=$(ping_host "192.168.1.77")

ping_icon() {
  [ "$1" = "PINGING" ] && echo -n "$CHECK" || echo -n "$CROSS"
}

printf "  %-15s %-20s %s\n" "IP" "Host" "Status"
printf "  %-15s %-20s %s\n" "---------------" "--------------------" "------------------"
printf "  %-15s %-20s %s %s\n" "$GATEWAY" "This Computer" "$(ping_icon "$GATEWAY_STATUS")" "$GATEWAY_STATUS"
printf "  %-15s %-20s %s %s\n" "192.168.1.11" "eWeLink Proxy" "$(ping_icon "$PROXY_STATUS")" "$PROXY_STATUS"
printf "  %-15s %-20s %s %s\n" "192.168.1.77" "Linux Server" "$(ping_icon "$SERVER_STATUS")" "$SERVER_STATUS"

check_ports() {
  local host="$1"
  local ss_output
  ss_output=$(ssh -i ~/.ssh/id_ed25519 "$host" "ss -tlnp 2>/dev/null" 2>/dev/null)

  local ports_to_check
  if echo "$host" | grep -q "192.168.1.77"; then
    # 1212 (PIR) intentionally omitted: that project is retired and is not
    # started at boot on .77, so it would always show as NOT LISTENING.
    ports_to_check="1234 5678 7777 12345 12346"
  else
    ports_to_check="3000"
  fi

  printf "  %-6s %-20s %s\n" "Port" "Service" "Status"
  printf "  %-6s %-20s %s\n" "------" "--------------------" "------------------"
  for port in $ports_to_check; do
    local svc
    case "$port" in
      1234)  svc="RF receivers" ;;
      5678)  svc="KINETIC receivers" ;;
      7777)  svc="ManagerLayer" ;;
      12345) svc="Current sensor" ;;
      12346) svc="Display" ;;
      3000)  svc="API" ;;
    esac
    if echo "$ss_output" | grep -q ":${port} "; then
      printf "  %-6s %-20s %s %s\n" "$port" "$svc" "$CHECK" "LISTENING"
    else
      printf "  %-6s %-20s %s %s\n" "$port" "$svc" "$CROSS" "NOT LISTENING"
    fi
  done
}

echo ""
echo "=== Server .77 — Linux Server ==="
if [ "$SERVER_STATUS" = "PINGING" ]; then
  check_ports "$REMOTE"
else
  echo "  (server unreachable, skipping port check)"
fi

echo ""
echo "=== Server .11 — eWeLink Proxy ==="
if [ "$PROXY_STATUS" = "PINGING" ]; then
  check_ports "$PROXY"
else
  echo "  (server unreachable, skipping port check)"
fi

# ==================== SCREEN SESSIONS ====================
echo ""
echo "=== Screen Sessions ==="
SCREENS=$(ssh "$REMOTE" "screen -ls 2>/dev/null" | grep -E '^\t' | sed 's/^\t//')
if [ -z "$SCREENS" ]; then
  echo "  (none)"
else
  printf "  %-6s %-25s %s\n" "PID" "Name" "Status"
  printf "  %-6s %-25s %s\n" "------" "-------------------------" "------------------"
  echo "$SCREENS" | while read line; do
    pid=$(echo "$line" | sed 's/\..*//')
    name=$(echo "$line" | sed 's/^[0-9]*\.//' | awk '{print $1}')
    status=$(echo "$line" | grep -o '([^)]*)$' | tr -d '()')
    printf "  %-6s %-25s %s\n" "$pid" "$name" "$status"
  done
fi

# ==================== PROCESSES ====================
echo ""
echo "=== Processes ==="
PROC_INFO=$(ssh -i ~/.ssh/id_ed25519 "$REMOTE" "
  echo managerLayer.js=\$(pgrep -f 'managerLayer\.js$' 2>/dev/null | head -1)
  echo buttonPressReceiver=\$(pgrep -f 'buttonPressReceiver\.sh$' 2>/dev/null | head -1)
  echo arduino433tx=\$(pgrep -f 'arduino433tx' 2>/dev/null | head -1)
  echo displayServer.js=\$(pgrep -f 'displayServer\.js$' 2>/dev/null | head -1)
  echo WEBserver=\$(pgrep -f 'WEBserver-port3000' 2>/dev/null | head -1)
" 2>/dev/null)
printf "  %-25s %s\n" "Process" "PID"
printf "  %-25s %s\n" "-------------------------" "------"
while IFS== read -r name pid; do
  [ -n "$pid" ] && printf "  %-25s %s\n" "$name" "$pid"
done <<< "$PROC_INFO"

# ==================== DEVICE STATES ====================
echo ""
echo "=== Device States ==="
ssh "$REMOTE" "cat /root/Domotica/LinuxServerScripts/button2sONOFF/logs/managerLayer.js.log 2>/dev/null | grep -E 'STATE_UPDATE' | tail -10" | while read line; do
  device=$(echo "$line" | sed -n 's/.*\[EVENT\] \([^:]*\):.*/\1/p')
  devid=$(echo "$line" | sed -n 's/.*STATE_UPDATE \([^ ]*\).*/\1/p')
  state=$(echo "$line" | sed -n 's/.*STATE_UPDATE [^ ]* \(.*\)/\1/p')
  printf "  %-22s %-16s %s\n" "$device" "$devid" "$state"
done

# ==================== MOUNT ====================
echo ""
echo "=== Mount ==="
MOUNT_INFO=$(mount | grep mnt/domotica)
if [ -z "$MOUNT_INFO" ]; then
  echo "  (not mounted)"
else
  printf "  %-30s %s\n" "Source" "Mount Point"
  printf "  %-30s %s\n" "------------------------------" "------------------------------"
  echo "$MOUNT_INFO" | awk '{printf "  %-30s %s\n", $1, $3}'
fi

# ==================== EWeLink PROXY ====================
echo ""
echo "=== eWeLink Proxy Service ==="
STATUS=$(ssh -i ~/.ssh/id_ed25519 "$PROXY" "systemctl is-active ewelink-proxy.service 2>/dev/null")
printf "  %-25s %s\n" "Service" "Status"
printf "  %-25s %s\n" "-------------------------" "------------------"
printf "  %-25s %s\n" "ewelink-proxy" "$STATUS"

echo ""
echo "=== eWeLink Proxy Process ==="
PROXY_PID=$(ssh -i ~/.ssh/id_ed25519 "$PROXY" "pgrep -f 'node core/index.mjs' 2>/dev/null | head -1")
printf "  %-25s %s\n" "Process" "PID"
printf "  %-25s %s\n" "-------------------------" "------"
printf "  %-25s %s\n" "core/index.mjs" "${PROXY_PID:-not running}"

echo ""
echo "=== eWeLink API ==="
printf "  %-10s %s\n" "Metric" "Value"
printf "  %-10s %s\n" "----------" "------------------"
DEVICE_COUNT=$(curl -s http://192.168.1.11:3000/devices 2>/dev/null | jq 'length' 2>/dev/null)
if [ "$DEVICE_COUNT" ]; then
  ONLINE=$(curl -s http://192.168.1.11:3000/devices 2>/dev/null | jq '[.[] | select(.online == true)] | length' 2>/dev/null)
  printf "  %-10s %d total, %d online\n" "Devices" "$DEVICE_COUNT" "$ONLINE"
else
  printf "  %-10s %s\n" "Devices" "API unreachable"
fi

echo ""
echo "=== eWeLink Plugins ==="
PLUGINS=$(ssh -i ~/.ssh/id_ed25519 "$PROXY" "ls ~/Domotica/eWeLink-Proxy/nodejs/plugins/*.mjs 2>/dev/null | sed 's|.*plugins/||' | sed 's|\.mjs||'")
printf "  %s\n" "Plugin"
printf "  %s\n" "------------------"
echo "$PLUGINS" | while read plugin; do
  printf "  %s\n" "$plugin"
done
