#!/bin/bash

# ==============================================================================
# IPTABLES LOGGING SCRIPT
# Inserts LOG rules into the PREROUTING chain for traffic destined for the
# eWeLink ports (80, 443, 8081).
# ==============================================================================

# WARNING: This script uses the -I (Insert) flag. If you run it multiple times,
# you will get duplicate log entries. Run the cleanup command below to remove them.

echo "Inserting LOG rules into iptables nat table..."

# LOG Rule 1: Log all incoming TCP traffic destined for port 80
# --log-prefix is used to make it easy to filter the logs later.
iptables -t nat -I PREROUTING -p tcp --dport 80 -j LOG --log-prefix "EWELINK-PROXY:P80 " --log-level 7

# LOG Rule 2: Log all incoming TCP traffic destined for port 443
iptables -t nat -I PREROUTING -p tcp --dport 443 -j LOG --log-prefix "EWELINK-PROXY:P443 " --log-level 7

# LOG Rule 3: Log all incoming TCP traffic destined for port 8081
iptables -t nat -I PREROUTING -p tcp --dport 8081 -j LOG --log-prefix "EWELINK-PROXY:P8081 " --log-level 7

echo "Logging rules inserted. Check system logs now."

# --- Cleanup Function ---
# Use this command to remove the logging rules when done:
echo ""
echo "To clean up the logging rules, run:"
echo "sudo iptables -t nat -D PREROUTING -p tcp --dport 80 -j LOG --log-prefix \"EWELINK-PROXY:P80 \" --log-level 7"
echo "sudo iptables -t nat -D PREROUTING -p tcp --dport 443 -j LOG --log-prefix \"EWELINK-PROXY:P443 \" --log-level 7"
echo "sudo iptables -t nat -D PREROUTING -p tcp --dport 8081 -j LOG --log-prefix \"EWELINK-PROXY:P8081 \" --log-level 7"

