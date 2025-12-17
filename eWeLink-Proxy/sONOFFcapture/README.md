# Packet Capture Directory

This directory is for LOCAL packet captures only.
Files here are excluded from git for security.

## Usage:
1. Capture traffic: `sudo tcpdump -i eth0 -w capture.pcap`
2. Analyze with: `../analyze-sONOFF.sh capture.pcap`

## Files NOT in git:
- *.pcap (packet captures)
- *.db (device databases)
- *.log (monitoring logs)

See parent directory for analysis tools.
