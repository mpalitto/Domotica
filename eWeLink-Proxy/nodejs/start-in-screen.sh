#!/bin/bash

# if the script was started from a different folder, go to the folder where the script is found
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd $SCRIPT_PATH

SESSION_NAME="sONOFF-Server"

# Check if a screen session with the same name already exists
if screen -list | grep -q "$SESSION_NAME"; then
    # Prompt the user to decide whether to attach or replace the existing session
    read -p "A session named '$SESSION_NAME' already exists. Do you want to replace it? (y/n): " choice
    if [ "$choice" = "y" ]; then
        # Quit the existing session
        screen -S "$SESSION_NAME" -X quit
        # Start a new screen session for the server and UI
        screen -mS "$SESSION_NAME" -c .screenrc
    else
        # Attach to the existing session
        screen -r "$SESSION_NAME"
    fi
else
    # Start a new screen session for the server and UI as no session exists
    screen -mS "$SESSION_NAME" -c .screenrc
fi

# Note: the "-m" option forces an new top level screen session even if it was started with in
# screen session
# 
# without "-m" option
# ├── screen 1
# │    └── screen 2
# 
# with "-m" option
# ├── screen 1
# ├── screen 2
