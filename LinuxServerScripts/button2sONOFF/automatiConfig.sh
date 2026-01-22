#!/bin/bash

# automaticConfig.sh
# Generates sONOFF.config by matching RFcodes to deviceIDs via toggling and watching state updates.
# Assumes no other activity during run. Run once.

# Define paths
BASE_DIR="/path/to/your/domotica/LinuxServerScripts/BUTTON2SONOFF"  # Adjust
SONOFF_LIST="$BASE_DIR/sONOFF.list"  # Format: RFcode comments
ALIASES_LIST="$BASE_DIR/aliases.list"  # Assume format: deviceID alias
SONOFF_CONFIG="$BASE_DIR/sONOFF.config"
ARDUINO_DEV="/dev/ttyUSB0"
EVENT_PORT=7777
TEMP_EVENT_LOG="/tmp/proxy_events.log"

# Associative arrays
declare -A rf_comments  # RFcode => comments
declare -A id_alias  # deviceID => alias
declare -A rf_to_id  # RFcode => deviceID

# Load sONOFF.list
while IFS= read -r line; do
    if [[ -z "$line" || "$line" =~ ^# ]]; then continue; fi
    rfcode=$(echo "$line" | awk '{print $1}')
    comments=$(echo "$line" | cut -d' ' -f2-)
    rf_comments[$rfcode]="$comments"
done < "$SONOFF_LIST"

# Load aliases.list (assume deviceID alias)
while IFS= read -r line; do
    if [[ -z "$line" || "$line" =~ ^# ]]; then continue; fi
    deviceID=$(echo "$line" | awk '{print $1}')
    alias=$(echo "$line" | awk '{print $2}')
    id_alias[$deviceID]=$alias
done < "$ALIASES_LIST"

# Function to send RF toggle
send_rf_toggle() {
    local rfcode=$1
    echo "SEND $rfcode" > "$ARDUINO_DEV"  # Adjust protocol
}

# Start listener in background, log to file
nc -l -p $EVENT_PORT > "$TEMP_EVENT_LOG" &
LISTENER_PID=$!

# For each RFcode
for rfcode in "${!rf_comments[@]}"; do
    # Clear log
    > "$TEMP_EVENT_LOG"

    # Toggle once, wait for update
    send_rf_toggle "$rfcode"
    sleep 5  # Wait for state update

    # Check log for STATE_UPDATE
    changed_id=$(grep "STATE_UPDATE" "$TEMP_EVENT_LOG" | awk '{print $2}' | head -1)
    if [ -n "$changed_id" ]; then
        rf_to_id[$rfcode]=$changed_id
    fi

    # Toggle back to restore
    send_rf_toggle "$rfcode"
    sleep 2
done

# Kill listener
kill $LISTENER_PID

# Generate config
> "$SONOFF_CONFIG"
for rfcode in "${!rf_to_id[@]}"; do
    deviceID=${rf_to_id[$rfcode]}
    alias=${id_alias[$deviceID]:-""}
    comments=${rf_comments[$rfcode]}
    echo "\"$deviceID\": \"$alias\" : \"$rfcode\" : \"$comments\"" >> "$SONOFF_CONFIG"
done

echo "sONOFF.config generated."
