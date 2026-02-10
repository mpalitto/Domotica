#!/bin/bash
# File: UI.sh
# Usage: source UI.sh
# Then use: sonoff ?, sonoff list, sonoff on cucina, sonoff set-alias 10000158df "cucina", etc.
#      use: sonoff ?  --> to get a complete list of commands avaiable 

sonoff() {
  local API_URL="http://localhost:3000"
  local PLUGIN_FILE="./plugins/cloud-bridge.mjs"  # Adjust if needed

  print_help() {
    echo "Usage: sonoff <command> [arguments]"
    echo ""
    echo "Commands:"
    echo " set-alias <deviceID|alias> <newAlias> - Set a new alias"
    echo " on <deviceID|alias> [newAlias]        - Turn device ON"
    echo " off <deviceID|alias> [newAlias]       - Turn device OFF"
    echo " list [filter]                         - List devices"
    echo "      all                              - List all devices (default)"
    echo "      online                           - List online devices only"
    echo "      offline                          - List offline devices only"
    echo "      on                               - List online devices with switch ON"
    echo "      off                              - List online devices with switch OFF"
    echo " livelog                               - Show live service logs"
    echo " ?                                     - Show this help"
    echo ""
    echo "Examples:"
    echo " sonoff set-alias 10000158df disimpegno"
    echo " sonoff on 10000158df"
    echo " sonoff off disimpegno"
    echo " sonoff on disimpegno \"Luce Disimpegno\""
    echo " sonoff list"
    echo " sonoff list online"
    echo " sonoff list on"
    echo " sonoff livelog"
  }

  # Show help if no args or ?
  if [ -z "$1" ] || [ "$1" = "?" ] || [ "$1" = "help" ] || [ "$1" = "-h" ]; then
    print_help
    return 0
  fi

  local ACTION=$1
  local TARGET=$2
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
    local LIST_FILTER="${TARGET:-all}"
    
    # Validate filter
    case "$LIST_FILTER" in
      all|online|offline|on|off)
        ;;
      *)
        echo "Error: Unknown list filter '$LIST_FILTER'"
        echo "Valid filters: all, online, offline, on, off"
        return 1
        ;;
    esac

    echo "Fetching device list (filter: $LIST_FILTER)..."

    # Detect if cloud-bridge plugin is present
    local CLOUD_COLUMN=false
    if [ -f "$PLUGIN_FILE" ]; then
      CLOUD_COLUMN=true
    fi

    # Print header
    if $CLOUD_COLUMN; then
      printf "%-12s | %-18s | %-6s | %-7s | %-6s | %-5s | %-7s | %-7s | %-5s\n" \
             "Device ID" "Alias" "Online" "State" "Switch" "RSSI" "FW" "IP" "CLOUD"
      printf "%-12s-+-%-18s-+-%-6s-+-%-7s-+-%-6s-+-%-5s-+-%-7s-+-%-7s-+-%-5s\n" \
             "------------" "------------------" "------" "-------" "------" "-----" "-------" "-------" "-----"
    else
      printf "%-12s | %-18s | %-6s | %-7s | %-6s | %-5s | %-7s | %-7s\n" \
             "Device ID" "Alias" "Online" "State" "Switch" "RSSI" "FW" "IP"
      printf "%-12s-+-%-18s-+-%-6s-+-%-7s-+-%-6s-+-%-5s-+-%-7s-+-%-7s\n" \
             "------------" "------------------" "------" "-------" "------" "-----" "-------" "-------"
    fi

    # Build jq filter based on LIST_FILTER
    local JQ_FILTER=""
    case "$LIST_FILTER" in
      all)
        JQ_FILTER="."
        ;;
      online)
        JQ_FILTER="select(.online == true)"
        ;;
      offline)
        JQ_FILTER="select(.online == false or .online == null)"
        ;;
      on)
        JQ_FILTER="select(.online == true and .params.switch == \"on\")"
        ;;
      off)
        JQ_FILTER="select(.online == true and .params.switch == \"off\")"
        ;;
    esac

    # Fetch devices and format output
    # NOTE: Using "-" instead of "—" (em-dash) for proper column alignment
    curl -s -X GET "$API_URL/devices" | jq -r --arg cloud "$CLOUD_COLUMN" --arg filter "$JQ_FILTER" '
      .[] | '"$JQ_FILTER"' |
      [
        .deviceid,
        (.alias // "-"),
        (.online | tostring),
        (.state // "-"),
        (.params.switch // "-"),
        (if .rssi then (.rssi | tostring) else "-" end),
        (.fwVersion // "-"),
        (.IP // "0.0.0.0"),
        (if $cloud == "true" then
           (if .cloudConnected | not then "NO" else "YES" end)
         else empty end)
      ] | @tsv
    ' | while IFS=$'\t' read -r deviceid alias online state switch rssi fw ip cloud_status; do
      # Show only last two octets of IP
      ip_last2=$(echo "$ip" | awk -F. '{print "."$(NF-1)"."$NF}')
      if $CLOUD_COLUMN; then
        printf "%-12s | %-18s | %-6s | %-7s | %-6s | %-5s | %-7s | %-7s | %-5s\n" \
               "$deviceid" "$alias" "$online" "$state" "$switch" "$rssi" "$fw" "$ip_last2" "${cloud_status:-NO}"
      else
        printf "%-12s | %-18s | %-6s | %-7s | %-6s | %-5s | %-7s | %-7s\n" \
               "$deviceid" "$alias" "$online" "$state" "$switch" "$rssi" "$fw" "$ip_last2"
      fi
    done

  elif [ "$ACTION" = "livelog" ]; then
    journalctl -u ewelink-proxy.service -f
    return 0

  else
    echo "Error: Unknown command '$ACTION'"
    print_help
    return 1
  fi
}
