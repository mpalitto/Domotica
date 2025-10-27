# This script will install the ewelink-proxy as a systemd service and print out the instructions
# the service will be stated on system boot
#!/bin/bash


cp etc/systemd/system/ewelink-proxy.service /etc/systemd/system/ewelink-proxy.service

# Set up systemd service 
sudo systemctl daemon-reload # clear systemd cache so that it knows there has been changes
sudo systemctl enable ewelink-proxy.service # enable the service so that will be run on system boot
sudo systemctl start ewelink-proxy.service # start the service


cat << EOF
# Start/Stop/Restart
sudo systemctl start ewelink-proxy.service
sudo systemctl stop ewelink-proxy.service
sudo systemctl restart ewelink-proxy.service

# Enable/Disable auto-start on boot
sudo systemctl enable ewelink-proxy.service
sudo systemctl disable ewelink-proxy.service

# View status
sudo systemctl status ewelink-proxy.service

# View logs
sudo journalctl -u ewelink-proxy.service -f          # Follow (live)
sudo journalctl -u ewelink-proxy.service -n 50       # Last 50 lines
sudo journalctl -u ewelink-proxy.service --since today
sudo journalctl -u ewelink-proxy.service --since "2024-01-01 10:00:00"

# If service hit start limit
sudo systemctl reset-failed ewelink-proxy.service
sudo systemctl start ewelink-proxy.service

# Reload after editing service file
sudo systemctl daemon-reload
sudo systemctl restart ewelink-proxy.service
EOF
