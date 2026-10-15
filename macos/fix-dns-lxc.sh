#!/usr/bin/env bash
# fix-dns-lxc.sh — make the router LXC's DHCP hand out 192.168.1.1 (itself)
# as DNS for LAN clients instead of the ISP modem 192.168.0.1.
#
# Why clients get 192.168.0.1 today: dnsmasq's default is to pass on whatever
# /etc/resolv.conf says. Pointing clients at the LXC gives you caching, local
# names, and makes the eWeLink DNS design (eWeLink-Proxy/DNS/) effective again.
#
# What it does (all on the LXC, /etc/dnsmasq.conf only — the separate
# dnsmasq-iot.conf instance is NOT touched):
#   1. inspect: resolv.conf, dnsmasq procs/units, full conf, NAT redirect rules
#   2. backup /etc/dnsmasq.conf (timestamped .bak-*)
#   3. append an idempotent marked block:
#        dhcp-option=option:dns-server,192.168.1.1
#        no-resolv
#        server=192.168.0.1 / 1.1.1.1 / 8.8.8.8
#   4. `dnsmasq --test` syntax check (restores the backup if it fails)
#   5. restart dnsmasq (systemd unit if any; else — as on this network, where
#      /etc/rc.local starts it — kill via /run/dnsmasq-main.pid and re-exec)
#   6. verify from this Mac: dig @192.168.1.1
#
# Usage:
#   bash macos/fix-dns-lxc.sh -n     # inspect only (dry run, changes nothing)
#   bash macos/fix-dns-lxc.sh        # inspect, then ask before changing
#   bash macos/fix-dns-lxc.sh -y     # apply without asking
#
# Clients only see the new DNS after their DHCP lease renews — see the
# instructions printed at the end. Rollback path is printed too.

set -u
LXC=${LXC:-192.168.1.1}
SSHU=${SSHU:-root}
SSH_OPTS="-o ConnectTimeout=5 -o BatchMode=yes"

CONFIRM=1; DRY=0
for a in "$@"; do
  case "$a" in
    -y) CONFIRM=0 ;;
    -n) DRY=1 ;;
    *) echo "unknown option: $a (use -y to apply, -n for a dry run)"; exit 2 ;;
  esac
done

# quoted heredoc => the local shell expands nothing; the LXC's bash does
R(){ ssh $SSH_OPTS "$SSHU@$LXC" bash -s -- "$@"; }

echo "===== 1. Current state on $LXC (router LXC) ====="
R <<'REMOTE'
echo '--- /etc/resolv.conf:'
cat /etc/resolv.conf 2>/dev/null || echo '   (missing)'
echo
echo '--- dnsmasq processes:'
ps -eo pid,user,args | grep '[d]nsmasq' || echo '   (none running!)'
echo
echo '--- systemd units:'
systemctl list-units --all --type=service --no-legend 2>/dev/null | grep -i dnsmasq || echo '   (no dnsmasq systemd unit found — how is it started?)'
echo
echo '--- /etc/dnsmasq.conf:'
cat /etc/dnsmasq.conf 2>/dev/null || echo '   (missing)'
echo
echo '--- drop-ins in /etc/dnsmasq.d/:'
ls -la /etc/dnsmasq.d/ 2>/dev/null || echo '   (no such dir)'
echo
echo '--- existing dhcp-option / upstream lines (ours appends LAST, last wins):'
grep -nE 'dhcp-option|^[[:space:]]*server=|no-resolv|resolv-file|dhcp-range' \
  /etc/dnsmasq.conf /etc/dnsmasq.d/* 2>/dev/null || echo '   (none found)'
echo
echo '--- IoT DNS interception: NAT PREROUTING/REDIRECT rules (port 53):'
iptables -t nat -L PREROUTING -n -v 2>/dev/null | head -30
iptables -t nat -L PREROUTING -n -v 2>/dev/null | grep -q REDIRECT \
  && echo '   -> REDIRECT rules present (old OpenWRT design migrated)' \
  || echo '   -> NO REDIRECT rules: the dnsmasq-iot instance is running but nothing'
echo '      sends IoT-range clients (192.168.1.128-191) to it. Worth checking'
echo '      separately if eWeLink devices should resolve to 192.168.1.11.'
REMOTE

if [ "$DRY" = 1 ]; then
  echo; echo "(-n: dry run — nothing changed)"
  exit 0
fi
if [ "$CONFIRM" = 1 ]; then
  echo
  read -r -p "Apply: hand out 192.168.1.1 as DNS from $LXC and restart dnsmasq? [y/N] " a
  [ "$a" = "y" ] || { echo "aborted — nothing changed"; exit 1; }
fi

echo
echo "===== 2. Applying on $LXC ====="
if ! R apply "$SSHU" "$LXC" <<'REMOTE'
set -eu
SSHU=${2:-root}
LXC=${3:-192.168.1.1}
CONF=/etc/dnsmasq.conf
BEG='### BEGIN domotica-dns (fix-dns-lxc.sh) ###'
END='### END domotica-dns (fix-dns-lxc.sh) ###'

BAK="$CONF.bak-$(date +%Y%m%d-%H%M%S)"
cp -a "$CONF" "$BAK"
echo "backup: $BAK"

# idempotent: drop any previous copy of our block first
awk -v b="$BEG" -v e="$END" '$0==b{skip=1;next} $0==e{skip=0;next} !skip' "$CONF" > "$CONF.new"
mv "$CONF.new" "$CONF"

cat >> "$CONF" <<'DNSBLOCK'
### BEGIN domotica-dns (fix-dns-lxc.sh) ###
# LAN DHCP clients use the router LXC as DNS (was the ISP modem, 192.168.0.1)
dhcp-option=option:dns-server,192.168.1.1
# explicit upstream resolvers — do not depend on /etc/resolv.conf churn
no-resolv
server=192.168.0.1
server=1.1.1.1
server=8.8.8.8
### END domotica-dns (fix-dns-lxc.sh) ###
DNSBLOCK

if dnsmasq --test --conf-file="$CONF" >/tmp/dnsmasq-test.log 2>&1; then
  echo "config syntax: OK"
else
  echo "config syntax: FAILED — restoring backup"
  cat /tmp/dnsmasq-test.log
  mv "$BAK" "$CONF"
  exit 1
fi

UNITS=$(systemctl list-units --all --type=service --no-legend 2>/dev/null | awk '/dnsmasq/{print $1}')
OLDPIDS=$(pgrep -d' ' dnsmasq || true)
if [ -n "$UNITS" ]; then
  for u in $UNITS; do echo "restarting $u"; systemctl restart "$u"; done
else
  # this LXC starts dnsmasq from /etc/rc.local, not systemd — restart the MAIN
  # instance via its pidfile; the IoT instance on :1053 is left alone
  echo "no systemd unit — restarting the MAIN dnsmasq via its pidfile"
  PID=$(cat /run/dnsmasq-main.pid 2>/dev/null || true)
  [ -n "$PID" ] || PID=$(pgrep -f "dnsmasq --conf-file=$CONF" | head -1 || true)
  if [ -n "$PID" ]; then
    echo "stopping old main dnsmasq (pid $PID)"
    kill "$PID"; sleep 1
    dnsmasq --conf-file="$CONF" --pid-file=/run/dnsmasq-main.pid
  else
    echo "WARNING: no running main dnsmasq found to restart; start it with:"
    echo "  dnsmasq --conf-file=$CONF --pid-file=/run/dnsmasq-main.pid"
  fi
fi
sleep 1
NEWPIDS=$(pgrep -d' ' dnsmasq || true)
if [ -z "$NEWPIDS" ]; then
  echo "dnsmasq DID NOT COME BACK — restoring backup"
  mv "$BAK" "$CONF"
  for u in $UNITS; do systemctl restart "$u"; done
  exit 1
fi
echo "dnsmasq pids: before=[$OLDPIDS] after=[$NEWPIDS]"
echo 'listening on :53:'
ss -lnup 2>/dev/null | grep ':53 ' || true
echo "ROLLBACK: ssh $SSHU@$LXC \"cp -a $BAK $CONF && systemctl restart dnsmasq\""
REMOTE
then
  echo "APPLY FAILED (see above) — no changes should remain"; exit 1
fi

echo
echo "===== 3. Verify from this Mac ====="
V=$(dig +time=3 +tries=1 +short @192.168.1.1 www.google.com 2>/dev/null | head -3 | tr '\n' ' ')
if [ -n "$V" ]; then
  echo "   192.168.1.1 resolves www.google.com -> $V"
else
  echo "   WARNING: 192.168.1.1 did not answer — check step 2 output"
fi
echo "   this Mac's system resolver right now: $(scutil --dns 2>/dev/null | awk '/nameserver\[0\]/{print $3; exit}') (changes only after a DHCP renew)"

cat <<'EOF'

=== Done. Make clients actually use it ===
   The option only lands in a client's settings when its DHCP lease renews:
     Mac:     sudo ipconfig set en0 DHCP     (or toggle Wi-Fi off/on)
     Android: toggle Wi-Fi off/on
   Then confirm:  dig +short www.google.com   (should be fast)
                  scutil --dns | head        (first nameserver = 192.168.1.1)

=== Rollback ===
   Printed as ROLLBACK above (restore the timestamped backup + restart).
EOF
