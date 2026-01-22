#!/bin/bash

# Create a new process group so Ctrl+C kills all children
# $$ is the PID of this script
# The negative PID sends signal to the entire process group
# trap 'echo "buttonPressReceiver: Stopping all..."; kill -TERM -$$' SIGINT SIGTERM


# buttonPressReceiver.sh
# Receives raw codes, preprocesses them into common buttonID, debounces, pushes to FIFO

BASE_DIR="/root/Domotica/LinuxServerScripts/button2sONOFF"
# BUTTONS_CONFIG="$BASE_DIR/config/buttons.config"
FIFO_PATH="$BASE_DIR/logs/button_fifo"
DEBOUNCE_TIME=2
# LAST_PRESS_DIR="/tmp/button_last_press"

mkdir -p "$LAST_PRESS_DIR"

# IMPORTANT: point to your real preprocessor scripts
PREPROCESS_KINETIC="$BASE_DIR/preprocess_kinetic.sh"
PREPROCESS_RFXCOM="$BASE_DIR/preprocess_rfxcom.sh"
# Add more if you have other protocols: PREPROCESS_XXX=...

normalize_code() {
    local raw="$*"
    local type=$1
    # echo "type: $1"
    # echo "raw: $raw"

    local normalized
    # Add more preprocessors here if needed...
    # normalized=$("$PREPROCESS_OTHER" "$raw" 2>/dev/null)
    # ...
    case $type in
      'KINETIC')
          normalized=$("$PREPROCESS_KINETIC" "$raw" 2>/dev/null)
	  ;;
      *)
          # Then rfxcom
          normalized=$("$PREPROCESS_RFXCOM" "$raw" 2>/dev/null)
	  ;;
    esac

    if [[ -n "$normalized" && "$normalized" != "ERROR"* ]]; then
        echo "$normalized"
        return 0
    fi

    # If nothing matched → return empty (will be ignored)
    echo ""
    return 1
}

last_buttID=""
last_time=0
handle_port() {
    local port=$1
    # while true; do
	echo "stdbuf -o0 nc -lk $port"
        # stdbuf -o0 nc -l $port | while read -r button raw_line; do
        socat -u TCP-LISTEN:$port,reuseaddr,fork STDOUT | while read -r button raw_line; do
	    echo " $button $raw_line"
            # 1. Normalize / preprocess
            buttonID="$(normalize_code $button $raw_line)"
            echo "buttonID: $buttonID"

	    # 2. Skip if no valid buttonID was extracted or explicitly INVALID
            [[ -z "$buttonID" || "$buttonID" == "INVALID" ]] && continue

	    buttID=${buttonID// /} #remove all spaces

            # 3. Debounce
            current_time=$(date +%s)

		echo "$buttID =? $last_buttID"
	    if [[ $buttID == $last_buttID ]]; then
		echo "$buttID == $last_buttID"
                if (( current_time - last_time < DEBOUNCE_TIME )); then
		    echo "debouncing $buttonID"
                    continue # code already receivced, ignoring this code
                fi
            fi
	    echo "sending $buttonID to FIFO"
            echo "$buttonID" > "$FIFO_PATH" # send code to FIFO to get executed
            last_buttID="$buttID"
	    last_time="$current_time"

            # # 4. Optional: check that this buttonID exists in config
            # if grep -q "^$buttonID[[:space:]]" "$BUTTONS_CONFIG"; then
            #     echo "$buttonID" > "$FIFO_PATH"
            #     echo "$(date '+%Y-%m-%d %H:%M:%S') - Button $buttonID accepted" >&2
            # else
            #     echo "$(date '+%Y-%m-%d %H:%M:%S') - Unknown buttonID: $buttonID" >&2
            # fi
        done
    # done
}

# Launch listeners
handle_port 1234 &
handle_port 5678 &

wait
