#!/bin/bash
# File: UI.sh
# Usage: source UI.sh
# Then use: sonoff list, sonoff on cucina, sonoff set-alias 10000158df "Cucina Luce", etc.

sonoff() {
  local API_URL="http://localhost:3000"

  print_help() {
    echo "Usage: sonoff <command> [arguments]"
    echo ""
    echo "Commands:"
    echo "  set-alias <deviceID|alias> <newAlias>   - Set a new alias"
    echo "  on <deviceID|alias> [newAlias]          - Turn device ON"
    echo "  off <deviceID|alias> [newAlias]         - Turn device OFF"
    echo "  list                                    - List all devices"
    echo "  ?                                       - Show this help"
    echo ""
    echo "Examples:"
    echo "  sonoff set-alias 10000158df disimpegno"
    echo "  sonoff on 10000158df"
    echo "  sonoff off disimpegno"
    echo "  sonoff on disimpegno \"Luce Disimpegno\""
    echo "  sonoff list"
  }

  # Show help if no args or ?
  if [ -z "$1" ] || [ "$1" = "?" ] || [ "$1" = "help" ] || [ "$1" = "-h" ]; then
    print_help
    return 0
  fi

  local ACTION=$1
  local TARGET=$2   # deviceID or alias
  local NEW_ALIAS=$3

  # Helper: resolve TARGET to actual deviceID
  resolve_device_id() {
    local target="$1"
    local json=$(curl -s "$API_URL/devices")
    local device_id=$(echo "$json" | jq -r --arg t "$target" '.[] | select(.deviceid == $t or .alias == $t) | .deviceid' 2>/dev/null)

    if [ -z "$device_id" ]; then
      echo "Error: Device or alias '$target' not found." >&2
      return 1
    elif [ "$(echo "$device_id" | wc -l)" -gt 1 ]; then
      echo "Error: Multiple devices match '$target'. Please use deviceID." >&2
      return 1
    else
      echo "$device_id"
    fi
  }

  if [ "$ACTION" = "set-alias" ]; then
    if [ -z "$TARGET" ] || [ -z "$NEW_ALIAS" ]; then
      echo "Error: Missing arguments."
      echo "Usage: sonoff set-alias <deviceID|alias> <newAlias>"
      return 1
    fi

    local DEVICE_ID=$(resolve_device_id "$TARGET")
    [ $? -ne 0 ] && return 1

    echo "Setting alias '$NEW_ALIAS' for device $DEVICE_ID..."
    curl -s -X POST "$API_URL/set-alias/$DEVICE_ID" \
         -H "Content-Type: application/json" \
         -d "{\"alias\": \"$NEW_ALIAS\"}" | jq .

  elif [ "$ACTION" = "on" ] || [ "$ACTION" = "off" ]; then
    if [ -z "$TARGET" ]; then
      echo "Error: Device ID or alias is required."
      echo "Usage: sonoff $ACTION <deviceID|alias> [newAlias]"
      return 1
    fi

    local DEVICE_ID=$(resolve_device_id "$TARGET")
    [ $? -ne 0 ] && return 1

    local SWITCH_VALUE=$([ "$ACTION" = "on" ] && echo "on" || echo "off")

    if [ -n "$NEW_ALIAS" ]; then
      local BODY="{\"switch\": \"$SWITCH_VALUE\", \"alias\": \"$NEW_ALIAS\"}"
      echo "Turning $ACTION device '$TARGET' ($DEVICE_ID) and setting alias to '$NEW_ALIAS'..."
    else
      local BODY="{\"switch\": \"$SWITCH_VALUE\"}"
      local CURRENT_ALIAS=$(curl -s "$API_URL/devices" | jq -r --arg id "$DEVICE_ID" '.[] | select(.deviceid == $id) | .alias // empty' 2>/dev/null)
      local ALIAS_DISPLAY=${CURRENT_ALIAS:-$DEVICE_ID}
      echo "Turning $ACTION device '$ALIAS_DISPLAY' ($DEVICE_ID)..."
    fi

    curl -s -X POST "$API_URL/device/$DEVICE_ID" \
         -H "Content-Type: application/json" \
         -d "$BODY" | jq .

 elif [ "$ACTION" = "list" ]; then
  echo "Fetching device list..."

  # Header
  printf "%-12s | %-18s | %-6s | %-7s | %-10s | %-7s | %-7s\n" \
         "Device ID" "Alias" "Online" "State" "Switch" "FW" "IP"
  printf "%-12s-+-%-18s-+-%-6s-+-%-7s-+-%-10s-+-%-7s-+-%-7s\n" \
         "------------" "------------------" "------" "-------" "----------" "------" "------"

  curl -s -X GET "$API_URL/devices" | jq -r '
    .[] |
    [
      .deviceid,
      (.alias // "—"),
      (.online | tostring),
      (.state // "—"),
      (.params.switch // "—"),
      (.fwVersion // "—"),
      (.IP // "0.0.0.0")
    ] | @tsv
  ' | while IFS=$'\t' read -r deviceid alias online state switch fw ip; do
    # Last 2 IP octets
    ip_last2=$(echo "$ip" | awk -F. '{print "."$(NF-1)"."$NF}')
    printf "%-12s | %-18s | %-6s | %-7s | %-10s | %-7s | %-7s\n" \
           "$deviceid" "$alias" "$online" "$state" "$switch" "$fw" "$ip_last2"
  done



  else
    echo "Error: Unknown command '$ACTION'"
    print_help
    return 1
  fi
}
