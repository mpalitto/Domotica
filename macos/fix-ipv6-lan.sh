#!/usr/bin/env bash
# fix-ipv6-lan.sh — stop the Proxmox host advertising the ISP IPv6 prefix onto
# the home LAN (it blackholes IPv6 for every client: nothing forwards it).
#
# Root cause: radvd on the host re-advertises the modem's on-link /64
# (2a0e:437:7b9b::/64) onto vmbr0 while net.ipv6.conf.all.forwarding = 0 on
# both the host and the router LXC. Android prefers IPv6 -> apps hang.
#
# Usage:
#   bash macos/fix-ipv6-lan.sh        # interactive confirm, IPv6 fix only
#   bash macos/fix-ipv6-lan.sh -y     # no confirmation
#   bash macos/fix-ipv6-lan.sh -y -m  # also add TCP MSS clamp on the router LXC
#                                     #   (fixes PPPoE ~1492 MTU -> missing since OpenWRT)
#
# Reversible: systemctl enable radvd  (and remove the iptables rule with -D).

set -u
PVE=${PVE:-192.168.1.33}
LXC=${LXC:-192.168.1.1}
SSHU=${SSHU:-root}
SSH_OPTS="-o ConnectTimeout=5 -o BatchMode=yes"

CONFIRM=1; MSSCLAMP=0
for a in "$@"; do
  case "$a" in
    -y) CONFIRM=0 ;;
    -m) MSSCLAMP=1 ;;
    *) echo "unknown option: $a"; exit 2 ;;
  esac
done

ask() { [ "$CONFIRM" = 1 ] || return 0; read -r -p "$1 [y/N] " a; [ "$a" = "y" ]; }

echo "=== 1. Current state on $PVE (Proxmox host) ==="
ssh $SSH_OPTS "$SSHU@$PVE" "systemctl is-active radvd 2>/dev/null; echo '--- /etc/radvd.conf:'; cat /etc/radvd.conf 2>/dev/null; echo '--- forwarding:'; sysctl net.ipv6.conf.all.forwarding"
echo

echo "=== 2. Stop advertising IPv6 on the LAN ==="
if ! ask "Disable radvd on $PVE (stops RAs on vmbr0)?"; then echo "aborted"; exit 1; fi
ssh $SSH_OPTS "$SSHU@$PVE" "systemctl disable --now radvd && echo 'radvd stopped+disabled'"
echo
echo "=== 3. Verify on $PVE ==="
ssh $SSH_OPTS "$SSHU@$PVE" "systemctl is-active radvd 2>/dev/null || echo 'radvd: inactive'; pgrep -a radvd || echo 'radvd: no process'"

if [ "$MSSCLAMP" = 1 ]; then
  echo
  echo "=== 4. TCP MSS clamp on the router LXC ($LXC) ==="
  echo "   (your WAN is PPPoE-class: ping 1472B fails / 1400B ok -> ~1492 MTU;"
  echo "    OpenWRT used to clamp MSS, a plain Debian LXC does not)"
  if ! ask "Add TCPMSS clamp rule on $LXC?"; then echo "skipped"; MSSCLAMP=0; fi
  if [ "$MSSCLAMP" = 1 ]; then
    ssh $SSH_OPTS "$SSHU@$LXC" bash -s <<'REMOTE'
set -u
if ! iptables -t mangle -C FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1452 2>/dev/null; then
  iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1452
fi
echo "rule:"; iptables -t mangle -L FORWARD -n -v | grep TCPMSS || true
# persist: this LXC's boot path is /etc/rc.local -> /etc/firewall.user (no
# iptables-persistent installed), and rc.local only flushes the nat table —
# without this, the mangle rule is lost on every container restart
if grep -q "set-mss 1452" /etc/firewall.user 2>/dev/null; then
  echo "persistent: already in /etc/firewall.user"
else
  cp -a /etc/firewall.user "/etc/firewall.user.bak-$(date +%Y%m%d-%H%M%S)"
  cat >> /etc/firewall.user <<'EOF'

# TCPMSS clamp for the PPPoE-class WAN (~1492 MTU) — added by fix-ipv6-lan.sh -m.
# Applied at boot by /etc/rc.local step 4; idempotent (-C checks first).
iptables -t mangle -C FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1452 2>/dev/null || \
  iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1452
EOF
  echo "persistent: appended to /etc/firewall.user (rc.local applies it at boot)"
fi
REMOTE
  fi
fi

cat <<'EOF'

=== Done. Flush stale IPv6 on clients ===
   The old IPv6 default route lives on clients for up to ~30 min (RA lifetime).
   Flush it now so apps recover immediately:
     Mac:     sudo networksetup -setv6off Wi-Fi && sudo networksetup -setv6automatic Wi-Fi
     Android: toggle Wi-Fi off/on (or re-join the network)

=== Verify ===
   bash macos/netdiag.sh
      -> the "IPv6-only name / IPv6-literal" lines must now FAIL INSTANTLY
         (no 8s hang), and the Quick verdict must say IPv6 is simply absent.
      -> retest the Android apps that were hanging.

=== Rollback ===
   ssh root@192.168.1.33 "systemctl enable --now radvd"
   ssh root@192.168.1.1  "iptables -t mangle -D FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1452"
   (for -m also delete the TCPMSS block from /etc/firewall.user on the LXC)
EOF
