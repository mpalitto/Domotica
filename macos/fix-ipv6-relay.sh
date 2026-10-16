#!/usr/bin/env bash
# fix-ipv6-relay.sh — give the home LAN real, globally routable IPv6 by
# *relaying* the single /64 that the Sky modem advertises on our WAN leg.
#
# Why this shape is the only safe one: the router LXC's WAN leg (ether2) already
# sits on the modem's own LAN, where the modem advertises exactly one on-link
# /64. Putting that same /64 onto the inner LAN as a normal routed subnet is
# what blackholed IPv6 in Oct 2026 (radvd advertising with nothing forwarding).
# A relay makes the split explicit and deliberate instead:
#
#   WAN leg   -> default route only; the /64 is kept OFF it (accept_ra_pinfo=0)
#   LAN leg   -> owns the /64; radvd advertises it
#   ndppd     -> answers the modem's NDP for LAN hosts on the WAN leg, which is
#                what makes return traffic come back to us
#   ip6tables -> default-deny: the LAN may initiate outbound, nothing may
#                initiate inbound
#
# radvd is deliberately *not* enabled on its own (the Debian unit stays masked);
# the relay agent starts it only once the prefix, route, ndppd and firewall are
# all in place, and radvd Requires=ndppd. Prefix lifetime is 1h, so if anything
# dies the LAN loses IPv6 within the hour rather than blackholing.
#
# Usage:
#   bash macos/fix-ipv6-relay.sh          # report, then confirm
#   bash macos/fix-ipv6-relay.sh -y       # no confirmation
#   bash macos/fix-ipv6-relay.sh -s       # status only
#   bash macos/fix-ipv6-relay.sh -u -y    # remove the relay (LAN back to IPv4-only)
#
# Reversible: -u stops the relay and restores the WAN leg to plain SLAAC.

set -u
LXC=${LXC:-192.168.1.1}
SSHU=${SSHU:-root}
SSH_OPTS="-o ConnectTimeout=6 -o BatchMode=yes"
HERE="$(cd "$(dirname "$0")" && pwd)"
AGENT_LOCAL="$HERE/ipv6-relay-agent.sh"
AGENT_REMOTE=/usr/local/sbin/ipv6-relay.sh

CONFIRM=1; UNDO=0; STATUS=0
for a in "$@"; do
  case "$a" in
    -y) CONFIRM=0 ;;
    -u) UNDO=1 ;;
    -s) STATUS=1 ;;
    *) echo "unknown option: $a"; exit 2 ;;
  esac
done
ask() { [ "$CONFIRM" = 1 ] || return 0; read -r -p "$1 [y/N] " a; [ "$a" = "y" ]; }

[ -f "$AGENT_LOCAL" ] || { echo "!! missing $AGENT_LOCAL"; exit 1; }

lxc() { ssh $SSH_OPTS "$SSHU@$LXC" "$@"; }

# --- status -----------------------------------------------------------------
show_status() {
  echo "=== Router LXC ($LXC) ==="
  lxc "$AGENT_REMOTE status" 2>/dev/null || echo "(agent not deployed)"
}

# --- Mac-side verification ---------------------------------------------------
# The Mac is what actually consumes the relayed prefix, so this is the real
# end-to-end check (a default route existing on the router proves nothing).
verify_mac() {
  local ifc addr
  ifc=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
  [ -n "$ifc" ] || { echo "   (no IPv4 default interface found; skipping)"; return; }
  echo "   LAN interface: $ifc"
  echo "   waiting for a relayed IPv6 address (SLAAC)…"
  for _ in $(seq 1 10); do
    addr=$(ifconfig "$ifc" 2>/dev/null | awk '/inet6/{print $2}' \
           | grep -viE '^(fe80|fd|::)' | head -1)
    [ -n "$addr" ] && break
    sleep 2
  done
  if [ -z "$addr" ]; then
    cat <<EOF
   !! no global IPv6 address on $ifc yet.
      macOS can cache "no router". Nudge it, then re-run 'bash macos/fix-ipv6-relay.sh -s':
        sudo networksetup -setv6off "$(networksetup -listallhardwareports | awk -v d="$ifc" '/Hardware Port/{p=$0} /Device/{if ($2==d) {sub(/^Hardware Port: /,"",p); print p}}')"
        sudo networksetup -setv6automatic "$(networksetup -listallhardwareports | awk -v d="$ifc" '/Hardware Port/{p=$0} /Device/{if ($2==d) {sub(/^Hardware Port: /,"",p); print p}}')"
EOF
    return
  fi
  echo "   relayed address: $addr"
  echo -n "   IPv6 reachability: "
  if curl -6 -sS --max-time 8 -o /dev/null -w 'HTTP %{http_code}\n' https://ipv6.google.com 2>/dev/null; then
    echo "   OK — the LAN now has working IPv6."
  else
    echo "   FAILED — relay looks broken; see 'fix-ipv6-relay.sh -s' on the router."
  fi
}

# --- main -------------------------------------------------------------------
if [ "$STATUS" = 1 ]; then show_status; echo; verify_mac; exit 0; fi

echo "=== Current state ==="
show_status
echo

if [ "$UNDO" = 1 ]; then
  ask "Remove the IPv6 relay from $LXC (LAN goes back to IPv4-only)?" || { echo aborted; exit 1; }
  echo "=== Stopping the relay ==="
  lxc "systemctl stop ipv6-relay.service 2>/dev/null; $AGENT_REMOTE teardown; $AGENT_REMOTE uninstall"
  echo
  echo "=== State after removal ==="
  show_status
  cat <<'EOF'

=== Flush stale IPv6 on clients ===
   Clients keep the old IPv6 address/route for up to the RA lifetime (1h).
     Mac:  sudo networksetup -setv6off Wi-Fi && sudo networksetup -setv6automatic Wi-Fi
   The IPv6 firewall is intentionally left in place; remove it with
     bash macos/fix-ipv6-firewall.sh -u -y
EOF
  exit 0
fi

# --- preflight --------------------------------------------------------------
echo "=== Preflight ==="
lxc 'set -e
  for p in ndppd ndisc6 radvd; do
    dpkg -s "$p" >/dev/null 2>&1 || { echo "installing $p…"; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$p" >/dev/null 2>&1; }
  done
  # radvd was deliberately stripped from this container during the Oct 2026
  # incident (binary removed, unit masked). We keep the unit masked and drive
  # radvd ourselves, but the binary must exist.
  [ -x /usr/sbin/radvd ] || { echo "restoring radvd binary…"; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --reinstall radvd >/dev/null 2>&1; }
  echo "deps: ndppd=$(command -v ndppd) rdisc6=$(command -v rdisc6) radvd=$(command -v radvd || echo /usr/sbin/radvd)"
  echo -n "modem advertises: "; timeout 6 rdisc6 -1 -q ether2 2>/dev/null | tr "\n" " " || echo "(no RA seen)"
  echo'
echo
echo "   NOTE: this is a real change to a live router. radvd is kept masked and"
echo "         is started only by the relay agent, requires ndppd, and advertises"
echo "         a 1h prefix lifetime — but if you want to back out, it is"
echo "         'bash macos/fix-ipv6-relay.sh -u -y'."
echo
ask "Deploy and enable the IPv6 relay on $LXC?" || { echo aborted; exit 1; }

# --- deploy -----------------------------------------------------------------
echo "=== Deploying the relay agent ==="
lxc "mkdir -p /usr/local/sbin"
scp -q $SSH_OPTS "$AGENT_LOCAL" "$SSHU@$LXC:$AGENT_REMOTE"
lxc "chmod 0755 $AGENT_REMOTE && $AGENT_REMOTE install"

echo
echo "=== Starting it ==="
lxc "systemctl restart ipv6-relay.service; systemctl start ipv6-relay-refresh.timer"

echo
echo "=== State after enabling ==="
show_status
echo
echo "=== End-to-end check (this Mac) ==="
verify_mac

cat <<'EOF'

=== Notes ===
   * The LAN firewall is central: the router drops all inbound IPv6 FORWARD, so
     every LAN host is protected without touching it. To expose one service,
     add a narrow DNAT + FORWARD pair on the router (ip6tables) — it will still
     not survive a router reboot unless added to the agent.
   * Re-run 'bash macos/fix-ipv6-relay.sh -s' any time for status.
   * The IoT DNS hijack is preserved: no RDNSS is advertised, so IoT clients
     keep the DHCPv4 resolver (192.168.1.1) and still reach the eWeLink proxy.
EOF
