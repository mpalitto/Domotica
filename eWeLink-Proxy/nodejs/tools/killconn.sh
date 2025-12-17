#!/bin/bash
# Kill TCP connection for a specific device IP

if [ -z "$1" ]; then
    echo "Usage: $0 <device_ip>"
    exit 1
fi

DEVICE_IP=$1
PROXY_PORT=8888

echo "Looking for connections from $DEVICE_IP to port $PROXY_PORT..."

# Get the connection info
CONN=$(ss -tnp | grep "$DEVICE_IP" | grep ":$PROXY_PORT")

if [ -z "$CONN" ]; then
    echo "No connection found from $DEVICE_IP"
    exit 0
fi

echo "Found connection:"
echo "$CONN"

# Extract source port
SRC_PORT=$(echo "$CONN" | awk '{print $4}' | cut -d':' -f2)

if [ -z "$SRC_PORT" ]; then
    echo "Could not extract source port"
    exit 1
fi

echo ""
echo "Killing connection from $DEVICE_IP:$SRC_PORT..."

# Use ss to kill the connection (requires root for non-owned sockets)
sudo ss -K dst $DEVICE_IP dport = $SRC_PORT

echo "✅ Connection killed"
echo "Device should reconnect within 30-60 seconds"
