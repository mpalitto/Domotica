#!/bin/bash

cat << 'EOF'
╔════════════════════════════════════╗
║   eWeLink Proxy Network Setup      ║
╚════════════════════════════════════╝
EOF

echo ""
echo "Step 1: Enabling IP forwarding..."
sysctl -w net.ipv4.ip_forward=1 > /dev/null
echo "  ✓ IP forwarding enabled"

echo ""
echo "Step 2: Configuring iptables..."
iptables -t nat -F
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
echo "  ✓ NAT masquerading configured"

# the traffic will be redirected unless the source address is the proxy device itself
iptables -t nat -I PREROUTING 1 -s 192.168.1.11 -p tcp -j RETURN #do not redirect for traffic generated on the device itself
iptables -t nat -A PREROUTING -p tcp --dport 80 -j DNAT --to-destination 192.168.1.11:8888
iptables -t nat -A PREROUTING -p tcp --dport 443 -j DNAT --to-destination 192.168.1.11:8888
iptables -t nat -A PREROUTING -p tcp --dport 8081 -j DNAT --to-destination 192.168.1.11:8888

cat << 'EOF'
  ✓ Port redirects configured:
    • 80   → 192.168.1.11:8888
    • 443  → 192.168.1.11:8888
    • 8081 → 192.168.1.11:8888
EOF

echo ""
echo "✓ Network configuration complete!"
echo ""
