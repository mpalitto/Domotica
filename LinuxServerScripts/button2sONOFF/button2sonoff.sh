#!/bin/bash
# button2sonoff.sh
# Main orchestrator script that starts and monitors buttonPressReceiver.sh and managerLayer.sh

# Create a new process group so Ctrl+C kills all children
# $$ is the PID of this script
# The negative PID sends signal to the entire process group
cleanup() {
    trap - SIGINT SIGTERM   # disable trap immediately
    echo "button2sonoff: Stopping all..."
    kill -- -$$             # kill process group
    exit 0
}

trap cleanup SIGINT SIGTERM

# Define paths
BASE_DIR="/root/Domotica/LinuxServerScripts/button2sONOFF"  # Adjust to your actual path
FIFO_PATH="$BASE_DIR/logs/button_fifo"
LOG_FILE="$BASE_DIR/logs/button2sonoff.log"

# Create FIFO if not exists
mkfifo "$FIFO_PATH" 2>/dev/null

# Function to start a subprocess and log
start_subprocess() {
    local script=$1
    nohup "$BASE_DIR/$script" | tee -a "$LOG_FILE" 2>&1 &
    echo "$script started with PID $!"
}

# Function to start a subprocess inside a screen session (robust)
start_screen_session() {
    local script="$1"
    local session_name
    local log_file

    # Derive session name from script basename
    session_name=$(basename "$script")
    log_file="$BASE_DIR/logs/${session_name}.log"

    # Check if screen session already exists
    if screen -ls | grep -q "\.${session_name}[[:space:]]"; then
        echo "Screen session '$session_name' already exists. Quitting it..."
        screen -S "$session_name" -X quit
        sleep 1  # give it a moment to close
    fi

    # Start the script in a new detached screen session
    screen -dmS "$session_name" bash -c "
        echo 'Starting $script in screen session $session_name';
        exec \"$BASE_DIR/$script\" 2>&1 | tee -a \"$log_file\"
    "

    echo "$script started in screen session '$session_name', logging to $log_file"
}

# Start the scripts
# start_subprocess "buttonPressReceiver.sh"
# start_subprocess "managerLayer.js"
start_screen_session "buttonPressReceiver.sh"
start_screen_session "managerLayer.js"

wait
