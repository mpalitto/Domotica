#!/usr/bin/env bash
# ipv6-diag.sh — find what advertises IPv6 on the LAN and why it blackholes.
#
# Read-only. SSHes into the Proxmox host and the router LXC (passwordless).
# Run it while the problem is visible, then paste the output.
#
# Usage: bash macos/ipv6-diag.sh
# Override hosts:  PVE=192.168.1.33 LXC=192.168.1.1 bash macos/ipv6-diag.sh

set -u

PVE=${PVE:-192.168.1.33}        # Proxmox host
LXC=${LXC:-192.168.1.1}         # router LXC (Debian/Ubuntu + dnsmasq)
SSHU=${SSHU:-root}              # ssh user
RAMAC="4c:52:62:08:0d:e8"       # MAC seen as IPv6 default router (RA source)
# note: EUI-64 inserts ff:fe -> fe80::4e52:62ff:fe08:de8

SSH_OPTS="-o ConnectTimeout=5 -o BatchMode=yes"
hr()  { printf '\n===== %s =====\n' "$1"; }
run() { local host="$1"; shift; ssh $SSH_OPTS "$host" "$@" 2>&1 | sed 's/^/   /' || echo "   [ssh failed: $host]"; }

hr "Mac: IPv4 <-> MAC mapping for the RA source ($RAMAC)"
arp -an | grep -i "$RAMAC" || echo "   no arp entry for that MAC"
echo "   ndp entries for it:"
ndp -an | grep -i "$RAMAC" || echo "   none"

hr "Proxmox host ($PVE): interfaces, MACs, bridge config"
run "$SSHU@$PVE" "ip -br addr; echo '--- links:'; ip -br link; echo '--- /etc/network/interfaces:'; cat /etc/network/interfaces 2>/dev/null"

hr "Proxmox host: IPv6 routes & forwarding"
run "$SSHU@$PVE" "ip -6 route show; echo '--- forwarding:'; sysctl net.ipv6.conf.all.forwarding net.ipv6.conf.default.forwarding; echo '--- rules:'; ip -6 rule show"

hr "Proxmox host: what sends RAs / DHCPv6"
run "$SSHU@$PVE" "ps aux | grep -Ei 'radvd|dnsmasq|odhcpd|dhcpd|keepalived' | grep -v grep; echo '--- listening (53/546/547):'; ss -lnup | grep -E ':53|:546|:547'; echo '--- running services:'; systemctl list-units --type=service --state=running --no-legend | grep -Ei 'radvd|dnsmasq|odhcpd|dhcp'"

hr "Proxmox host: RA-related config files"
run "$SSHU@$PVE" "cat /etc/radvd.conf 2>/dev/null; echo '--- dnsmasq/radvd/systemd-networkd RA settings:'; grep -rEn 'enable-ra|ra-param|ra-stateless|AdvSendAdvert|dhcp-range=.*::' /etc/dnsmasq.conf /etc/dnsmasq.d /etc/radvd.conf /etc/radvd /etc/systemd/network 2>/dev/null"

hr "Proxmox host: LXC list + router container config"
run "$SSHU@$PVE" "pct list; echo '--- router LXC net config:'; V=\$(pct list | awk 'NR>1 && \$3==\"running\"{print \$1; exit}'); pct config \$V 2>/dev/null | grep -E 'net|hostname|memory|rootfs'"

hr "Router LXC ($LXC): interfaces, IPv6 routes, forwarding"
run "$SSHU@$LXC" "ip -br addr; echo '--- links:'; ip -br link; echo '--- ipv6 routes:'; ip -6 route show; echo '--- forwarding:'; sysctl net.ipv6.conf.all.forwarding"

hr "Router LXC: RA/DHCP config"
run "$SSHU@$LXC" "echo '--- radvd active?'; systemctl is-active radvd 2>/dev/null; echo '--- dnsmasq process:'; ps aux | grep dnsmasq | grep -v grep; echo '--- dnsmasq config:'; grep -rEn 'enable-ra|ra-param|ra-stateless|dhcp-range=.*::|dhcp-option|interface=' /etc/dnsmasq.conf /etc/dnsmasq.d 2>/dev/null; echo '--- netplan/interfaces:'; cat /etc/netplan/*.yaml 2>/dev/null; cat /etc/network/interfaces 2>/dev/null; echo '--- sysctl:'; cat /etc/sysctl.d/*.conf 2>/dev/null | grep -iE 'ipv6|forward'"

hr "Interpretation"
echo "   * RA source MAC is $RAMAC (Fujitsu) -> the Proxmox host's NIC / its bridge."
echo "   * If the HOST runs radvd or a dnsmasq advertising the ISP prefix:"
echo "       systemctl disable --now radvd      # or stop the RA in its config"
echo "       sysctl -w net.ipv6.conf.all.forwarding=0   # only if the host isn't routing v6"
echo "   * If the LXC advertises RA: drop 'enable-ra' / IPv6 dhcp-range / radvd there."
echo "   * Verify after the fix with: bash macos/netdiag.sh  (IPv6 should FAIL fast, not hang)"
