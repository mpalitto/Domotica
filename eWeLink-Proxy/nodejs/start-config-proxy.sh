#!/bin/bash

# Environment variables

# Network Configuration
PROXY_IP=192.168.1.11
PROXY_PORT=8888

# TLS Configuration
TLS_KEY_PATH=/root/WS/tls/matteo-key.pem
TLS_CERT_PATH=/root/WS/tls/matteo-cert.pem
NODE_TLS_REJECT_UNAUTHORIZED=0

# Security
PROXY_API_KEY=your-secure-api-key-here

# Timeouts (milliseconds)
DEVICE_TIMEOUT=30000
PING_INTERVAL=3

# File Paths
SONOFF_CMD_FILE=./sONOFF.cmd

# Logging
NODE_ENV=production
LOG_LEVEL=info

# Cloud Configuration (if applicable)
CLOUD_SERVER_URL=https://eu-api.coolkit.cc
CLOUD_ENABLED=true

sysctl net.ipv4.ip_forward=1 
iptables -t nat -F

iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

iptables -t nat -A PREROUTING -p tcp --dport 80 -j DNAT --to-destination 192.168.1.11:8888
iptables -t nat -A PREROUTING -p tcp --dport 443 -j DNAT --to-destination 192.168.1.11:8888

iptables -t nat -A PREROUTING -p tcp --dport 8081 -j DNAT --to-destination 192.168.1.11:8888
iptables -t nat -A PREROUTING -p tcp --sport 8081 -j DNAT --to-destination 192.168.1.11:8888

# RUN the server
node proxy.mjs
