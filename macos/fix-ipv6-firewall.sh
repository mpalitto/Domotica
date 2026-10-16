#!/usr/bin/env bash
# fix-ipv6-firewall.sh — default-deny IPv6 on the two machines that sit directly
# on the modem's segment and are reachable from the whole internet over IPv6
# today. The Sky hub applies no inbound IPv6 firewall of its own (verified with
# an external IPv6 port checker), and neither box filters IPv6 at all:
#
#   * 192.168.1.33 (Proxmox host) — exposed :22 SSH and :8006 web UI
#   * 192.168.1.1  (router LXC)   — exposed :22 SSH and :53 open resolver
#
# The home LAN is IPv4-only, so neither needs inbound IPv6. Inbound *on the LAN*
# is policed centrally by the router's relay firewall (FORWARD=DROP), which
# covers every LAN host; this script covers the two hosts that sit in front of
# that and so bypass it.
#
# Applied per host:
#   INPUT   = DROP, allowing lo, ESTABLISHED/RELATED, ICMPv6 and the home LAN
#   FORWARD = DROP, allowing LAN-initiated traffic and ICMPv6 (router LXC only)
# ICMPv6 is allowed wholesale on purpose: NDP, router advertisements and
# Packet-Too-Big are mandatory for IPv6 to work at all (RFC 4890).
#
# Persistence: a systemd unit on the host (it has no iptables-persistent), and
# the existing /etc/firewall.user + rc.local path on the router LXC.
#
# Usage:
#   bash macos/fix-ipv6-firewall.sh        # report, then confirm
#   bash macos/fix-ipv6-firewall.sh -y     # no confirmation
#   bash macos/fix-ipv6-firewall.sh -u -y  # remove the rules again
#
# Reversible: -u restores plain ACCEPT policies on both hosts.

set -u
PVE=${PVE:-192.168.1.33}
LXC=${LXC:-192.168.1.1}
SSHU=${SSHU:-root}
SSH_OPTS="-o ConnectTimeout=6 -o BatchMode=yes"
HERE="$(cd "$(dirname "$0")" && pwd)"

CONFIRM=1; UNDO=0
for a in "$@"; do
  case "$a" in
    -y) CONFIRM=0 ;;
    -u) UNDO=1 ;;
    *) echo "unknown option: $a"; exit 2 ;;
  esac
done
ask() { [ "$CONFIRM" = 1 ] || return 0; read -r -p "$1 [y/N] " a; [ "$a" = "y" ]; }

echo "=== Current IPv6 filter state ==="
for h in "$PVE" "$LXC"; do
  echo "--- $h"
  ssh $SSH_OPTS "$SSHU@$h" "ip6tables -S INPUT | head -1; ip6tables -S FORWARD | head -1" \
    || { echo "!! cannot reach $h"; exit 1; }
done
echo

if [ "$UNDO" = 1 ]; then
  ask "Remove the IPv6 firewall from $PVE and $LXC?" || { echo aborted; exit 1; }

  echo "=== $PVE: removing ==="
  ssh $SSH_OPTS "$SSHU@$PVE" bash -s <<'REMOTE'
systemctl disable --now ipv6-harden.service 2>/dev/null || true
rm -f /etc/systemd/system/ipv6-harden.service /usr/local/sbin/ipv6-harden.sh
systemctl daemon-reload 2>/dev/null || true
ip6tables -P INPUT ACCEPT 2>/dev/null || true
ip6tables -F INPUT 2>/dev/null || true
ip6tables -P FORWARD ACCEPT 2>/dev/null || true
ip6tables -F FORWARD 2>/dev/null || true
echo "IPv6 filter reverted:"; ip6tables -S INPUT | head -1; ip6tables -S FORWARD | head -1
REMOTE

  echo
  echo "=== $LXC: removing ==="
  ssh $SSH_OPTS "$SSHU@$LXC" bash -s <<'REMOTE'
if grep -q '^# --- IPv6 hardening (fix-ipv6-firewall.sh)' /etc/firewall.user 2>/dev/null; then
  cp -a /etc/firewall.user "/etc/firewall.user.bak-$(date +%Y%m%d-%H%M%S)"
  sed -i '/^# --- IPv6 hardening (fix-ipv6-firewall.sh)/,$d' /etc/firewall.user
  echo "removed the IPv6 block from /etc/firewall.user"
else
  echo "/etc/firewall.user: no IPv6 block present"
fi
ip6tables -P INPUT ACCEPT 2>/dev/null || true
ip6tables -F INPUT 2>/dev/null || true
ip6tables -P FORWARD ACCEPT 2>/dev/null || true
ip6tables -F FORWARD 2>/dev/null || true
echo "IPv6 filter reverted:"; ip6tables -S INPUT | head -1; ip6tables -S FORWARD | head -1
REMOTE
  echo
  echo "Done. (If the relay is installed, 'fix-ipv6-relay.sh -u -y' also removes its firewall.)"
  exit 0
fi

ask "Apply the IPv6 firewall to $PVE and $LXC?" || { echo aborted; exit 1; }

# ---------------------------------------------------------------------------
echo
echo "=== $PVE: default-deny IPv6 INPUT ==="
ssh $SSH_OPTS "$SSHU@$PVE" bash -s <<'REMOTE'
set -eu
cat > /usr/local/sbin/ipv6-harden.sh <<'EOS'
#!/bin/sh
# Default-deny IPv6 on the Proxmox host.
# Managed by macos/fix-ipv6-firewall.sh — do not edit by hand.
set -u
LAN=vmbr0                       # home LAN bridge; management stays on IPv4
ip6tables -F INPUT 2>/dev/null || true
ip6tables -A INPUT -i lo -j ACCEPT
ip6tables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
ip6tables -A INPUT -p ipv6-icmp -j ACCEPT
ip6tables -A INPUT -i "$LAN" -j ACCEPT
ip6tables -P INPUT DROP
EOS
chmod 0755 /usr/local/sbin/ipv6-harden.sh

cat > /etc/systemd/system/ipv6-harden.service <<'EOS'
[Unit]
Description=Default-deny IPv6 on the Proxmox host (macos/fix-ipv6-firewall.sh)
# Applied after pve-firewall so nothing PVE does can precede it. PVE does not
# touch ip6tables here (the datacenter firewall has no ruleset), so these rules
# are not flushed by it.
After=pve-firewall.service
Wants=pve-firewall.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/ipv6-harden.sh

[Install]
WantedBy=multi-user.target
EOS

systemctl daemon-reload
systemctl enable --now ipv6-harden.service
echo "applied:"; ip6tables -S INPUT
REMOTE

# ---------------------------------------------------------------------------
echo
echo "=== $LXC: default-deny IPv6 INPUT + FORWARD ==="
# The relay agent owns these same rules; deploy it so both paths agree and so
# the LAN-initiated FORWARD allowance exists for the relay.
ssh $SSH_OPTS "$SSHU@$LXC" "mkdir -p /usr/local/sbin"
scp -q $SSH_OPTS "$HERE/ipv6-relay-agent.sh" "$SSHU@$LXC:/usr/local/sbin/ipv6-relay.sh"

ssh $SSH_OPTS "$SSHU@$LXC" bash -s <<'REMOTE'
set -eu
chmod 0755 /usr/local/sbin/ipv6-relay.sh
/usr/local/sbin/ipv6-relay.sh harden

BLOCK='/etc/firewall.user'
MARK='# --- IPv6 hardening (fix-ipv6-firewall.sh) ---'
if grep -q "^$MARK" "$BLOCK" 2>/dev/null; then
  cp -a "$BLOCK" "$BLOCK.bak-$(date +%Y%m%d-%H%M%S)"
  sed -i "/^$MARK/,\$d" "$BLOCK"
fi
cp -a "$BLOCK" "$BLOCK.bak-$(date +%Y%m%d-%H%M%S)"
cat >> "$BLOCK" <<'EOS'

# --- IPv6 hardening (fix-ipv6-firewall.sh) ---
# The home LAN is IPv4-only, so deny inbound IPv6 except the LAN, our own
# replies and ICMPv6 (NDP/RA/PMTU are mandatory). FORWARD lets the LAN initiate
# outbound IPv6 (used by the relay) and drops everything else, which is what
# protects every LAN host from the internet-facing edge.
ip6tables -F INPUT 2>/dev/null
ip6tables -A INPUT -i lo -j ACCEPT
ip6tables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
ip6tables -A INPUT -p ipv6-icmp -j ACCEPT
ip6tables -A INPUT -i eth0 -j ACCEPT
ip6tables -P INPUT DROP
ip6tables -F FORWARD 2>/dev/null
ip6tables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
ip6tables -A FORWARD -p ipv6-icmp -j ACCEPT
ip6tables -A FORWARD -i eth0 -o ether2 -j ACCEPT
ip6tables -P FORWARD DROP
EOS
echo "persisted to /etc/firewall.user (applied at boot by rc.local)"
echo "applied now:"; ip6tables -S INPUT; ip6tables -S FORWARD
REMOTE

cat <<'EOF'

=== Verify (from outside) ===
   The point of this change is that the internet can no longer reach these
   hosts. Probe from an external IPv6 port checker, e.g.
   https://port.tools/port-checker-ipv6/ :
     192.168.1.33  -> its global IPv6, port 8006 and 22 : must be FAILED
     192.168.1.1   -> its global IPv6, port 53 and 22   : must be FAILED
   (addresses are RA-derived and change if the ISP prefix changes; read them
    with: ssh root@192.168.1.33 'ip -6 -o addr show dev vmbr1 scope global')

=== Verify (locally) ===
   Management stays on IPv4 and must be unaffected:
     ssh root@192.168.1.33 true && ssh root@192.168.1.1 true && echo "IPv4 management OK"
   IPv6 itself must still work (ICMPv6 was allowed):
     ssh root@192.168.1.33 'ping -6 -c1 -W2 2606:4700:4700::1111'   # if the host still has a v6 default route

=== Rollback ===
   bash macos/fix-ipv6-firewall.sh -u -y
EOF
