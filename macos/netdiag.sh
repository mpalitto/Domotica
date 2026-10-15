#!/usr/bin/env bash
# netdiag.sh — diagnose "apps hang on Wi-Fi but work on cellular"
#
# Checks, in order:  interfaces -> default routes -> DNS -> gateway/upstream
#                    -> DNS-by-name vs by-IP -> MTU -> IPv6 reachability
#
# Usage:   bash macos/netdiag.sh
# Read-only. Safe to run any time. Exit code 0 (informational only).

set -u

hr() { printf '\n===== %s =====\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

hr "Time"
date

# ---------------------------------------------------------------- interfaces
hr "Interfaces (IPv4 / IPv6)"
for i in $(ifconfig -l 2>/dev/null); do
  v4=$(ifconfig "$i" 2>/dev/null | awk '/[[:space:]]inet[[:space:]]/{print $2}' | tr '\n' ' ')
  v6=$(ifconfig "$i" 2>/dev/null | awk '/[[:space:]]inet6[[:space:]]/{print $2}' | tr '\n' ' ')
  if [ -n "$v4" ] || [ -n "$v6" ]; then
    printf '%-8s IPv4: %-28s IPv6: %s\n' "$i" "${v4:-none}" "${v6:-none}"
  fi
done

# Which interface is Wi-Fi (so we can tell if this Mac is even on Wi-Fi)
WIFI_DEV=$(networksetup -listallhardwareports 2>/dev/null \
  | awk '/Hardware Port: (Wi-Fi|AirPort)/{getline; print $2}')
[ -n "${WIFI_DEV:-}" ] && echo "Wi-Fi interface: $WIFI_DEV"

# ------------------------------------------------------------------- routes
hr "Default routes"
echo "-- IPv4 default:"
netstat -rn -f inet 2>/dev/null | awk '$1=="default"{print "   " $0}'
echo "-- IPv6 default:"
netstat -rn -f inet6 2>/dev/null | awk '$1=="default"{print "   " $0}'

# ---------------------------------------------------------------------- DNS
hr "Resolvers (system)"
scutil --dns 2>/dev/null | awk '/nameserver\[[0-9]+\]/{print "   " $3}' | sort -u

hr "DNS: router dnsmasq (192.168.1.1) vs system resolver"
if have dig; then
  printf '   router  : '; dig +time=3 +tries=1 +short @192.168.1.1 www.google.com 2>&1 | tr '\n' ' '; echo
  printf '   system  : '; dig +time=3 +tries=1 +short www.google.com 2>&1 | tr '\n' ' '; echo
  printf '   router A : '; dig +time=3 +tries=1 +short @192.168.1.1 www.google.com A 2>&1 | tr '\n' ' '; echo
  printf '   router AAAA: '; dig +time=3 +tries=1 +short @192.168.1.1 www.google.com AAAA 2>&1 | tr '\n' ' '; echo
  printf '   router AAAA (ipv6.google.com): '; dig +time=3 +tries=1 +short @192.168.1.1 ipv6.google.com AAAA 2>&1 | tr '\n' ' '; echo
else
  echo "   (dig not found; using nslookup/host)"
  host www.google.com 2>&1 | head -5
fi

# --------------------------------------------------------------- reachability
hr "Reachability (IPv4)"
for t in 192.168.1.1 192.168.1.11 192.168.1.33 192.168.1.77 1.1.1.1 8.8.8.8; do
  if ping -c 2 -t 3 "$t" >/dev/null 2>&1; then echo "   OK    $t"; else echo "   FAIL  $t"; fi
done

hr "Reachability (IPv6)"
# Google's IPv6 address for ipv6.google.com (fallback to known anycast DNS)
for t in 2606:4700:4700::1111 2001:4860:4860::8888; do
  if ping6 -c 2 -i 1 2>/dev/null 5 "$t" >/dev/null 2>&1 || ping6 -c 2 "$t" >/dev/null 2>&1; then
    echo "   OK    $t"
  else
    echo "   FAIL  $t   <-- IPv6 blackhole if this fails while v4 pings OK"
  fi
done
echo "   (ULA of the router, if any:)"; netstat -rn -f inet6 2>/dev/null | grep -i 'fdb0' | head -3

# ---------------------------------------------------------- HTTP by IP / name
hr "HTTP by raw IPv4 (no DNS) vs by name"
curl -sS -o /dev/null -m 8 -w "   by IPv4  http://1.1.1.1/      -> HTTP %{http_code} in %{time_total}s\n" http://1.1.1.1/ 2>&1
# resolve Google fresh — a hardcoded IP can be dead/filter and give a false alarm
GIP=$(dig +time=2 +tries=1 +short www.google.com A 2>/dev/null | grep -E '^[0-9]+\.' | head -1)
curl -sS -o /dev/null -m 8 -w "   by IPv4  http://${GIP:-none}/ (google, resolved now) -> HTTP %{http_code} in %{time_total}s\n" "http://${GIP:-127.0.0.1}/" 2>&1
curl -sS -o /dev/null -m 8 -w "   by name  https://www.google.com/ -> HTTP %{http_code} in %{time_total}s\n" https://www.google.com/ 2>&1
curl -sS -o /dev/null -m 8 -w "   local    http://192.168.1.77:3000/ -> HTTP %{http_code} in %{time_total}s\n" http://192.168.1.77:3000/ 2>&1

hr "IPv6-only name and IPv6-literal requests (must hang if IPv6 is blackholed)"
curl -sS -o /dev/null -m 8 -w "   https://ipv6.google.com/  -> HTTP %{http_code} in %{time_total}s\n" https://ipv6.google.com/ 2>&1
curl -sS -o /dev/null -m 8 -w "   http://[2606:4700:4700::1111]/ -> HTTP %{http_code} in %{time_total}s\n" "http://[2606:4700:4700::1111]/" 2>&1
echo "   (both should FAIL fast/instantly if IPv6 is simply absent;"
echo "    a ~8s hang = packets silently dropped = blackhole)"

# ---------------------------------------------------------------------- MTU
hr "MTU / packet size (DF, does not fragment)"
if ping -D -c 1 -s 1472 1.1.1.1 >/dev/null 2>&1; then
  echo "   1472-byte payload (1500 MTU): OK"
else
  echo "   1472-byte payload (1500 MTU): FAIL  <-- path MTU problem (PMTU blackhole)"
fi
if ping -D -c 1 -s 1400 1.1.1.1 >/dev/null 2>&1; then
  echo "   1400-byte payload: OK"
else
  echo "   1400-byte payload: FAIL"
fi

# ------------------------------------------------------------ IPv6 forensics
hr "IPv6 forensics — who advertises IPv6 on the LAN?"
echo "-- IPv6 default router(s)  [MAC identifies the advertising device]  (ndp -rn):"
ndp -rn 2>/dev/null | sed 's/^/   /'
echo "-- Devices seen on IPv6 (ndp -an, first 20):"
ndp -an 2>/dev/null | head -20 | sed 's/^/   /'
echo "-- IPv6 default route detail:"
route -n get -inet6 default 2>/dev/null | sed 's/^/   /'
echo "-- IPv6 addresses per interface (fd00::/8 = ULA/self-generated, 2xxx/2001 = ISP):"
for i in $(ifconfig -l 2>/dev/null); do
  ifconfig "$i" 2>/dev/null | awk '/inet6 /{print "   " $2 "  scope=" $4 "  iface='$i'"}' 
done
echo "-- Ping our IPv6 router via its link-local address:"
# ignore utun* (VPN tunnels) — only consider a real LAN interface
GW6=$(netstat -rn -f inet6 2>/dev/null | awk '$1=="default" && $NF !~ /^utun/{print $2}' | head -1 | cut -d% -f1)
if [ -n "${GW6:-}" ]; then
  IF6=$(netstat -rn -f inet6 2>/dev/null | awk '$1=="default" && $NF !~ /^utun/{print $NF}' | head -1)
  ping6 -c 2 "${GW6}%${IF6:-en0}" >/dev/null 2>&1 \
    && echo "   OK   local IPv6 to router works (${GW6}%${IF6})" \
    || echo "   FAIL local IPv6 to router (${GW6}%${IF6})"
else
  echo "   (no IPv6 default route)"
fi
echo "   HINT: match the ROUTER's MAC above against your gear:"
echo "         gateway/router LXC = 192.168.1.1,  Proxmox host = 192.168.1.33"
# auto-identify the RA source: link-local -> MAC -> IPv4 (ARP) -> vendor
RA6=$(netstat -rn -f inet6 2>/dev/null | awk '$1=="default" && $NF !~ /^utun/{print $2}' | head -1 | cut -d% -f1)
RAMAC=$(ndp -an 2>/dev/null | awk -v g="$RA6" '$1==g {print $2}' | head -1)
if [ -n "${RAMAC:-}" ]; then
  echo "   IPv6 router MAC: $RAMAC"
  A4=$(arp -an 2>/dev/null | grep -i "$RAMAC" | head -1)
  [ -n "$A4" ] && echo "   Same MAC on IPv4 (arp):$A4" || echo "   No IPv4 (arp) entry for that MAC"
  VEND=$(curl -sS -m 5 "https://api.macvendors.com/$RAMAC" 2>/dev/null)
  [ -n "${VEND:-}" ] && echo "   Vendor: $VEND"
fi

# ------------------------------------------------------------------- verdict
hr "Quick verdict"
V6OK=1
ping6 -c 2 -t 3 2606:4700:4700::1111 >/dev/null 2>&1 || V6OK=0
V4OK=1
ping -c 2 -t 3 1.1.1.1 >/dev/null 2>&1 || V4OK=0
# does the LAN interface still have an IPv6 default route? (utun = VPN, ignored)
V6DEF=$(netstat -rn -f inet6 2>/dev/null | awk '$1=="default" && $NF !~ /^utun/{print $NF}' | head -1)
if [ -z "$V6DEF" ] && [ "$V4OK" = 1 ]; then
  echo "   ==> HEALTHY: no IPv6 default route on the LAN -> IPv6 is simply"
  echo "       ABSENT and fails fast (milliseconds). Clients fall back to IPv4"
  echo "       immediately, so apps hang on nothing. IPv4 works. All good."
  echo "       (Stale 2xxx:: addresses may still be listed above — harmless"
  echo "       without a default route; they age out or flush with:"
  echo "       sudo networksetup -setv6off Wi-Fi && sudo networksetup -setv6automatic Wi-Fi)"
elif [ "$V4OK" = 1 ] && [ "$V6OK" = 0 ]; then
  echo "   ==> BLACKHOLE: IPv6 default route present via $V6DEF but upstream"
  echo "       IPv6 is silently dropped (IPv4 works). This is the classic cause"
  echo "       of apps hanging on Wi-Fi (Android prefers IPv6/QUIC; iOS falls"
  echo "       back to IPv4). Fix the box sending Router Advertisements:"
  echo "         * Proxmox host 192.168.1.33 -> systemctl disable --now radvd"
  echo "         * router LXC   192.168.1.1   -> drop 'iface eth0 inet6 auto',"
  echo "           disable any enable-ra / radvd / IPv6SendRA on its LAN bridge"
  echo "       Re-run macos/fix-ipv6-lan.sh if not done yet."
elif [ "$V4OK" = 0 ]; then
  echo "   ==> IPv4 itself is failing from this Mac."
else
  echo "   ==> IPv4 and IPv6 both reachable; problem may be intermittent or"
  echo "       client-specific (check the phone's own IPv6/DNS settings)."
fi

hr "Done"
