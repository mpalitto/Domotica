#!/bin/sh
# ipv6-relay-agent.sh — deployed to /usr/local/sbin/ipv6-relay.sh on the router
# LXC (Proxmox CT 111 "MAIN-router").  Driven by macos/fix-ipv6-relay.sh.
#
# WHAT IT DOES
#   Gives the inner LAN (192.168.1.0/24, bridge vmbr0) real, globally routable
#   IPv6 by *relaying* the single /64 that the Sky modem advertises by RA on our
#   WAN leg (ether2, the modem's own LAN).
#
# WHY A RELAY, NOT A ROUTED SUBNET
#   This router's WAN leg already sits on the modem's LAN, where the modem
#   advertises one on-link /64.  That /64 therefore *cannot* also be "on-link"
#   on the inner LAN: the same prefix on two segments is exactly the condition
#   that silently blackholed IPv6 in Oct 2026 (`radvd` on the Proxmox host with
#   forwarding off).  A relay makes the split explicit and deliberate instead:
#
#     * WAN leg  — no prefix, no SLAAC address; used only for the default route.
#     * LAN leg  — owns the /64 and advertises it with radvd.
#     * ndppd    — answers the modem's NDP for LAN hosts on the WAN leg, which
#                  is what makes *return* traffic come back to us.  Without it
#                  only the first outbound packet works.
#     * ip6tables — default-deny: the LAN may initiate outbound, the internet
#                  may not initiate inbound.  The modem applies no IPv6 firewall
#                  of its own (verified), so this is the only thing standing
#                  between the LAN and the internet.
#
# SAFETY
#   radvd is *not* enabled on its own (the Debian unit stays masked): it is
#   started by this agent only after the WAN prefix was found, the route was
#   moved to the LAN, ndppd is up, and the firewall is in place.  radvd also
#   `Requires=` ndppd, and advertises a 1h prefix lifetime, so if anything dies
#   the LAN loses IPv6 within the hour instead of blackholing.
#
# Subcommands: install | uninstall | harden | setup | teardown | refresh | status
set -u

LAN_IF="${LAN_IF:-eth0}"
WAN_IF="${WAN_IF:-ether2}"

SELF=/usr/local/sbin/ipv6-relay.sh
NDPPD_CONF=/etc/ndppd-relay.conf
RADVD_CONF=/etc/radvd-relay.conf
SYSCTL_FILE=/etc/sysctl.d/99-ipv6-relay.conf
STATE_FILE=/run/ipv6-relay.prefix

log() { echo "ipv6-relay: $*"; }

# --- prefix discovery --------------------------------------------------------
# Ask the modem for an RA on the WAN leg and take its first global-unicast
# prefix (2000::/3).  ULA (fc00::/7) and link-local are ignored: they are not
# routable on the internet, which is the whole point of the relay.
discover_prefix() {
  i=0
  while [ "$i" -lt 8 ]; do
    p=$(timeout 4 rdisc6 -1 -q "$WAN_IF" 2>/dev/null \
        | awk '/^[23][0-9a-fA-F]{3}:.*\/[0-9]+$/ {print; exit}')
    [ -n "$p" ] && { echo "$p"; return 0; }
    i=$((i + 1)); sleep 2
  done
  return 1
}

# --- IPv6 firewall -----------------------------------------------------------
# Everything is deny-by-default.  ICMPv6 is allowed wholesale on purpose: NDP,
# router advertisements and Packet-Too-Big are mandatory for IPv6 to function
# at all, and the set of legitimately-needed types keeps changing (RFC 4890).
harden() {
  ip6tables -F INPUT 2>/dev/null || true
  ip6tables -A INPUT -i lo -j ACCEPT
  ip6tables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  ip6tables -A INPUT -p ipv6-icmp -j ACCEPT
  ip6tables -A INPUT -i "$LAN_IF" -j ACCEPT
  ip6tables -P INPUT DROP

  ip6tables -F FORWARD 2>/dev/null || true
  ip6tables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  ip6tables -A FORWARD -p ipv6-icmp -j ACCEPT
  ip6tables -A FORWARD -i "$LAN_IF" -o "$WAN_IF" -j ACCEPT
  ip6tables -P FORWARD DROP

  log "IPv6 firewall: INPUT/FORWARD = DROP (LAN-initiated traffic allowed)"
}

# --- sysctls -----------------------------------------------------------------
# Written to /etc/sysctl.d for boot *and* applied now (a privileged container
# can set these, but they reset with the network namespace on every start).
write_sysctls() {
  cat > "$SYSCTL_FILE" <<EOF
# Managed by ipv6-relay.sh — see macos/README.md ("IPv6 relay").
# WAN leg: accept_ra=2 is what lets a *forwarding* host keep taking the modem's
# default route.  Order matters: enabling forwarding makes the kernel drop
# RA-learned routes, so accept_ra must be raised first.
net.ipv6.conf.$WAN_IF.accept_ra = 2
net.ipv6.conf.$WAN_IF.accept_ra_defrtr = 1
# Forwarding for the relay (set once accept_ra is already 2).
net.ipv6.conf.all.forwarding = 1
# Keep the /64 OFF the WAN leg: the same prefix must not be on-link on two
# segments (that is the Oct 2026 blackhole).
net.ipv6.conf.$WAN_IF.accept_ra_pinfo = 0
# LAN leg: we are the router here, so never take an RA from our own radvd.
net.ipv6.conf.$LAN_IF.accept_ra = 0
net.ipv6.conf.$LAN_IF.accept_ra_defrtr = 0
net.ipv6.conf.$LAN_IF.accept_ra_pinfo = 0
EOF

  sysctl -qw net.ipv6.conf.$WAN_IF.accept_ra=2
  sysctl -qw net.ipv6.conf.$WAN_IF.accept_ra_defrtr=1
  sysctl -qw net.ipv6.conf.all.forwarding=1
  sysctl -qw net.ipv6.conf.$WAN_IF.accept_ra_pinfo=0
  sysctl -qw net.ipv6.conf.$LAN_IF.accept_ra=0
  sysctl -qw net.ipv6.conf.$LAN_IF.accept_ra_defrtr=0
  sysctl -qw net.ipv6.conf.$LAN_IF.accept_ra_pinfo=0
}

# Enabling forwarding makes the kernel drop the RA-learned default route, and it
# only comes back on the modem's *next* RA (up to ~10 minutes away).  Send a
# Router Solicitation ourselves and wait.  Without a default route we must not
# advertise: that would hand the LAN IPv6 with nowhere to send it.
ensure_default_route() {
  i=0
  while [ "$i" -lt 8 ]; do
    ip -6 route show default 2>/dev/null | grep -q '^default' && return 0
    timeout 4 rdisc6 -1 -q "$WAN_IF" >/dev/null 2>&1 || true
    i=$((i + 1)); sleep 2
  done
  ip -6 route show default 2>/dev/null | grep -q '^default'
}

# --- setup / teardown --------------------------------------------------------
setup() {
  harden

  p=$(discover_prefix) || {
    log "WARNING: no global IPv6 prefix advertised on $WAN_IF — relay NOT started"
    rm -f "$NDPPD_CONF" "$RADVD_CONF" "$STATE_FILE"
    return 0
  }
  log "relaying $p : $WAN_IF (WAN) <- $LAN_IF (LAN)"

  write_sysctls

  if ! ensure_default_route; then
    log "WARNING: no IPv6 default route on $WAN_IF — relay NOT started"
    rm -f "$NDPPD_CONF" "$RADVD_CONF" "$STATE_FILE"
    return 0
  fi

  # WAN leg keeps only the default route: strip the /64 and any SLAAC address
  # the kernel may already have taken from the modem's RA.
  ip -6 route del "$p" dev "$WAN_IF" 2>/dev/null || true
  ip -6 addr flush dev "$WAN_IF" scope global 2>/dev/null || true
  # LAN leg owns the /64.
  ip -6 route replace "$p" dev "$LAN_IF"

  cat > "$NDPPD_CONF" <<EOF
# Managed by ipv6-relay.sh.  Answers the modem's Neighbor Solicitations for
# LAN hosts on the WAN leg with our own MAC, so replies come back to us.
#
# The rule MUST name the LAN leg explicitly ('iface $LAN_IF'): ndppd 0.2.4's
# 'auto' mode is supposed to pick it from the routing table, but here it
# silently relays nothing: the modem's NS for LAN hosts go unanswered, so
# inbound IPv6 is dropped and every client sees 50-100% packet loss (apps hang).
# Verified Oct 2026 with ndisc6 from the WAN segment: 'auto' -> no reply,
# 'iface' -> answers with our WAN MAC.  Do not "simplify" this back to 'auto'.
# ('static' would answer without probing but ndppd refuses it below /121, so it
# cannot be used for a whole /64 — also verified against 0.2.4.)
route-ttl 30000

proxy $WAN_IF {
  router yes
  timeout 500
  ttl 30000

  rule $p {
    iface $LAN_IF
  }
}
EOF

  cat > "$RADVD_CONF" <<EOF
# Managed by ipv6-relay.sh.
# No RDNSS on purpose: LAN clients keep the DHCPv4 resolver (192.168.1.1), which
# preserves the eWeLink DNS hijack for the IoT pool (192.168.1.128/26).
interface $LAN_IF {
  AdvSendAdvert on;
  AdvManagedFlag off;
  AdvOtherConfigFlag off;
  AdvDefaultLifetime 1800;

  prefix $p {
    AdvOnLink on;
    AdvAutonomous on;
    # 1h lifetime: if the relay stops, clients drop the stale prefix within the
    # hour rather than keeping an unusable address (i.e. never blackhole again).
    AdvValidLifetime 3600;
    AdvPreferredLifetime 1800;
  };
};
EOF

  echo "$p" > "$STATE_FILE"
  log "wrote $NDPPD_CONF, $RADVD_CONF, $SYSCTL_FILE"
}

teardown() {
  p=$(cat "$STATE_FILE" 2>/dev/null || true)
  if [ -n "${p:-}" ]; then ip -6 route del "$p" dev "$LAN_IF" 2>/dev/null || true; fi
  rm -f "$NDPPD_CONF" "$RADVD_CONF" "$STATE_FILE" "$SYSCTL_FILE"

  sysctl -qw net.ipv6.conf.all.forwarding=0
  sysctl -qw net.ipv6.conf.$WAN_IF.accept_ra=1
  sysctl -qw net.ipv6.conf.$WAN_IF.accept_ra_defrtr=1
  sysctl -qw net.ipv6.conf.$WAN_IF.accept_ra_pinfo=1
  sysctl -qw net.ipv6.conf.$LAN_IF.accept_ra=1
  sysctl -qw net.ipv6.conf.$LAN_IF.accept_ra_defrtr=1
  sysctl -qw net.ipv6.conf.$LAN_IF.accept_ra_pinfo=1

  log "relay stopped; WAN leg back to plain SLAAC (IPv6 firewall left in place)"
}

# --- prefix-change watchdog --------------------------------------------------
refresh() {
  p=$(discover_prefix) || { log "refresh: modem is not advertising a global prefix yet"; return 0; }
  cur=$(cat "$STATE_FILE" 2>/dev/null || true)

  # Guard: the kernel must never keep the /64 on-link on the WAN leg.
  ip -6 route del "$p" dev "$WAN_IF" 2>/dev/null || true

  if [ "$p" != "$cur" ]; then
    log "refresh: prefix changed (${cur:-none} -> $p); reconfiguring"
    setup
    systemctl restart ndppd-relay.service radvd-relay.service 2>/dev/null || true
    return 0
  fi

  # Same prefix: make sure the two daemons are actually up.
  systemctl is-active --quiet ndppd-relay.service || systemctl restart ndppd-relay.service 2>/dev/null || true
  systemctl is-active --quiet radvd-relay.service || systemctl restart radvd-relay.service 2>/dev/null || true
}

status() {
  echo "== forwarding =="; sysctl net.ipv6.conf.all.forwarding
  echo "== relayed prefix =="; cat "$STATE_FILE" 2>/dev/null || echo "(none)"
  echo "== WAN leg ($WAN_IF) =="; ip -6 addr show dev "$WAN_IF" | grep -E 'inet6' || true
  ip -6 route show dev "$WAN_IF"
  echo "== LAN leg ($LAN_IF) =="; ip -6 route show dev "$LAN_IF" | grep -v '^fe80' || true
  echo "== default =="; ip -6 route show default
  echo "== daemons =="
  printf '  ndppd-relay: %s\n' "$(systemctl is-active ndppd-relay.service 2>&1)"
  printf '  radvd-relay: %s\n' "$(systemctl is-active radvd-relay.service 2>&1)"
  printf '  refresh.timer: %s\n' "$(systemctl is-active ipv6-relay-refresh.timer 2>&1)"
  echo "== ip6tables INPUT =="; ip6tables -S INPUT
  echo "== ip6tables FORWARD =="; ip6tables -S FORWARD
}

# --- systemd units -----------------------------------------------------------
install() {
  chmod +x "$SELF" 2>/dev/null || true

  cat > /etc/systemd/system/ipv6-relay.service <<'EOF'
[Unit]
Description=IPv6 relay — relay the modem's /64 onto the LAN
After=network-online.target
Wants=network-online.target ndppd-relay.service radvd-relay.service
Before=ndppd-relay.service radvd-relay.service

[Service]
Type=oneshot
RemainAfterExit=yes
TimeoutStartSec=120
ExecStart=/usr/local/sbin/ipv6-relay.sh setup
ExecStop=/usr/local/sbin/ipv6-relay.sh teardown

[Install]
WantedBy=multi-user.target
EOF

  cat > /etc/systemd/system/ndppd-relay.service <<'EOF'
[Unit]
Description=ndppd — NDP proxy on the WAN leg for the IPv6 relay
After=ipv6-relay.service
PartOf=ipv6-relay.service
ConditionPathExists=/etc/ndppd-relay.conf

[Service]
Type=simple
ExecStart=/usr/sbin/ndppd -c /etc/ndppd-relay.conf
Restart=always
RestartSec=2
EOF

  cat > /etc/systemd/system/radvd-relay.service <<'EOF'
[Unit]
Description=radvd — Router Advertisements on the LAN leg for the IPv6 relay
# radvd must never advertise without the NDP proxy behind it: that is the
# Oct 2026 blackhole.  Hence Requires=ndppd-relay and After=the setup unit.
After=ipv6-relay.service ndppd-relay.service
PartOf=ipv6-relay.service
Requires=ndppd-relay.service
ConditionPathExists=/etc/radvd-relay.conf

[Service]
Type=simple
ExecStart=/usr/sbin/radvd -C /etc/radvd-relay.conf -n
Restart=on-failure
RestartSec=5
EOF

  cat > /etc/systemd/system/ipv6-relay-refresh.service <<'EOF'
[Unit]
Description=Re-check the relayed IPv6 prefix (prefix-change watchdog)
After=ipv6-relay.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/ipv6-relay.sh refresh
EOF

  cat > /etc/systemd/system/ipv6-relay-refresh.timer <<'EOF'
[Unit]
Description=Periodically re-check the relayed IPv6 prefix

[Timer]
OnBootSec=90s
OnUnitActiveSec=5min
AccuracySec=30s

[Install]
WantedBy=timers.target
EOF

  systemctl daemon-reload
  systemctl enable ipv6-relay.service ipv6-relay-refresh.timer
  log "units installed (ipv6-relay.service, ndppd-relay, radvd-relay, refresh.timer)"
}

uninstall() {
  systemctl disable --now ipv6-relay-refresh.timer 2>/dev/null || true
  systemctl disable --now ipv6-relay.service 2>/dev/null || true
  systemctl stop ndppd-relay.service radvd-relay.service 2>/dev/null || true
  rm -f /etc/systemd/system/ipv6-relay.service \
        /etc/systemd/system/ndppd-relay.service \
        /etc/systemd/system/radvd-relay.service \
        /etc/systemd/system/ipv6-relay-refresh.service \
        /etc/systemd/system/ipv6-relay-refresh.timer
  systemctl daemon-reload
  systemctl reset-failed 2>/dev/null || true
  log "units removed"
}

# --- entry point -------------------------------------------------------------
case "${1:-}" in
  harden)    harden ;;
  setup)     setup ;;
  teardown)  teardown ;;
  refresh)   refresh ;;
  status)    status ;;
  install)   install ;;
  uninstall) uninstall ;;
  *) echo "usage: $0 {install|uninstall|harden|setup|teardown|refresh|status}" >&2; exit 2 ;;
esac
