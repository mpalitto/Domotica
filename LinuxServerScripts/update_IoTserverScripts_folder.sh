#!/bin/bash

BASHRC_FILE="/root/.bashrc"
VAR_NAME="IoTserverScripts"
VAR_VALUE="$IoTserverScripts"
NEW_LINE="export ${VAR_NAME}=${VAR_VALUE}"

# Check if the file exists
if [[ ! -f "$BASHRC_FILE" ]]; then
    echo "Error: $BASHRC_FILE not found."
    exit 1
fi

# Check if the line exists
if grep -q "^${VAR_NAME}=" "$BASHRC_FILE"; then
    echo "Variable found, replacing existing line..."
    # Replace the existing line
    sed -i "s|^${VAR_NAME}=.*|${NEW_LINE}|" "$BASHRC_FILE"
else
    echo "Variable not found, appending to the end of the file..."
    echo "$NEW_LINE" >> "$BASHRC_FILE"
fi

echo "Done. Check $BASHRC_FILE for the updated variable."

