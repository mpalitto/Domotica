#!/bin/bash
REMOTE_DIR="/root/Domotica/LinuxServerScripts"
LOCAL_MOUNT="$HOME/mnt/domotica"
REMOTE_HOST="192.168.1.77"

mkdir -p "$LOCAL_MOUNT"
sudo mount -t nfs -o resvport,rw,noatime "$REMOTE_HOST:$REMOTE_DIR" "$LOCAL_MOUNT"
echo "Mounted $REMOTE_HOST:$REMOTE_DIR -> $LOCAL_MOUNT"
