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
#                                     #   (this line's path MTU is 1480, not the
#                                     #    usual 1500/1492 — auto-detected; MSS=PMTU-40)
#   MSS=1440 bash macos/fix-ipv6-lan.sh -y -m   # skip detection, force a value
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

# Path MTU on this line is 1480, not the usual 1492/1500. Sky Italia carries the
# access over IPv6 and the Sky hub TRANSLATES IPv4 to IPv6 (464XLAT/CLAT style),
# swapping the 20-byte IPv4 header for the 40-byte IPv6 one: 1500 - 20 = 1480.
# (Encapsulation such as DS-Lite/MAP-E would cost 40 bytes -> MTU 1460 or 1452;
# measured here is 1480, so it is translation, not tunneling.) Bisect with DF
# pings and return MSS = PMTU - 40. Fallback 1440 = 1480 - 40.
detect_mss() {
  local s
  for s in 1472 1464 1460 1452 1444 1436 1428 1420 1412 1400; do
    if ping -c1 -t2 -D -s "$s" 1.1.1.1 >/dev/null 2>&1; then
      echo $((s + 28 - 40)); return 0
    fi
  done
  echo 1440
}

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
  # A clamp sized to the real 1480 path MTU is essential: without it, TCP peers
  # offer MSS 1460 (-> 1500-byte packets) and the Sky hub silently drops
  # anything over 1480 (it sends no ICMP "frag needed"), so large transfers
  # blackhole. OpenWRT used to do this; a plain Debian LXC does not.
  MSS=${MSS:-$(detect_mss)}
  echo "   path MTU: $((MSS + 40))  ->  MSS clamp: $MSS"
  if ! ask "Add TCPMSS clamp (--set-mss $MSS) on $LXC?"; then echo "skipped"; MSSCLAMP=0; fi
  if [ "$MSSCLAMP" = 1 ]; then
    ssh $SSH_OPTS "$SSHU@$LXC" bash -s -- "$MSS" <<'REMOTE'
set -u
MSS="$1"
# drop any stale clamp (e.g. the old 1452 that assumed a 1492 path)
for rule in $(iptables -t mangle -S FORWARD | grep TCPMSS | sed 's/^-A FORWARD //'); do
  iptables -t mangle -D FORWARD $rule 2>/dev/null || true
done
iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss "$MSS"
echo "rule:"; iptables -t mangle -L FORWARD -n -v | grep TCPMSS || true
# persist: this LXC's boot path is /etc/rc.local -> /etc/firewall.user (no
# iptables-persistent installed), and rc.local only flushes the nat table —
# without this, the mangle rule is lost on every container restart
MARK="# TCPMSS clamp"
BLOCK="
$MARK for this line's measured 1480 path MTU (the Sky hub translates IPv4 to
# IPv6, 464XLAT-style: 1500 - 20 = 1480). Added by fix-ipv6-lan.sh -m. Applied
# at boot by /etc/rc.local step 4; the -C guard keeps it idempotent.
iptables -t mangle -C FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss $MSS 2>/dev/null || \\
  iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss $MSS"
if grep -q "$MARK" /etc/firewall.user 2>/dev/null; then
  cp -a /etc/firewall.user "/etc/firewall.user.bak-$(date +%Y%m%d-%H%M%S)"
  sed -i "s/--set-mss [0-9]*/--set-mss $MSS/g" /etc/firewall.user
  echo "persistent: updated clamp value in /etc/firewall.user"
else
  cp -a /etc/firewall.user "/etc/firewall.user.bak-$(date +%Y%m%d-%H%M%S)"
  printf '%s\n' "$BLOCK" >> /etc/firewall.user
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
   ssh root@192.168.1.1  "iptables -t mangle -D FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1440"
   (for -m also delete the TCPMSS block from /etc/firewall.user on the LXC)
EOF
