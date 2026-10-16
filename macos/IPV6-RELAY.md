# IPv6 relay — design & runbook

Real, globally routable IPv6 for the home LAN (`192.168.1.0/24`), relayed from
the single `/64` the Sky hub advertises — plus a default-deny IPv6 firewall on
the two boxes that sit in front of the LAN.

This is the **how** (deploy / verify / operate / troubleshoot / roll back).
`macos/README.md` → *"IPv6 relay (Oct 2026)"* has the **why**, and
`AGENTS.md` → *"Network (LAN, IPv6, DNS)"* is the short summary.

| | |
|---|---|
| Relayed prefix | `2a0e:437:7b9b::/64` (from the hub's RA on the WAN leg) |
| Advertised by | `radvd` on the LXC's LAN leg only |
| Relay daemon | `ndppd` on the LXC's WAN leg |
| Scripts | `fix-ipv6-relay.sh`, `fix-ipv6-firewall.sh`, `ipv6-relay-agent.sh` |

---

## 1. Why a relay

The Sky hub advertises exactly **one on-link `/64`** and gives **no prefix
delegation** — and that `/64` is on the *modem's* own LAN, which the router
LXC's WAN leg (`ether2`) already sits on. So the `/64` cannot also be a normal
on-link subnet on the inner LAN.

That is not a style preference: putting the same prefix on-link on two
segments, with forwarding off, is precisely what silently blackholed all LAN
IPv6 in **Oct 2026** (`radvd` on the Proxmox host + `forwarding=0` everywhere →
Android/QUIC hung, iOS quietly fell back to IPv4). See `macos/README.md`.

The relay makes the split explicit instead:

```
        modem LAN 192.168.0.0/24                     home LAN 192.168.1.0/24
                │                                              │
    ether2 ─────┤            router LXC (CT 111)           ├───── eth0
 default route   │            192.168.1.1                   │  owns the /64
 only; the /64   │                                          │  radvd advertises it
 kept OFF this   │  ndppd (auto): answers the modem's NDP   │  (deliberately no
 leg             │  for LAN hosts using our own MAC, so     │   RDNSS)
                 │  return traffic arrives here             │
                 └──────────────  ip6tables  ───────────────┘
                          LAN may initiate outbound;
                          nothing may initiate inbound
```

Alternatives that were rejected:

| Option | Why not |
|---|---|
| Do nothing (no IPv6) | Safe, but no IPv6 at all — the hub gives real IPv6, so refusing it is a waste |
| NAT66 | Same NAT pain as IPv4 for no benefit; breaks end-to-end addressing for no reason |
| Routed subnet | Needs a delegated prefix from the hub; it delegates nothing |
| Re-enable host radvd | That *was* the Oct 2026 bug |

## 2. Address plan

| Interface | Address | Notes |
|---|---|---|
| `eth0` (LAN) | `192.168.1.1/24`, `fe80::be24:11ff:fe94:bbff/64` | **No global IPv6** — the router is link-local-only, which is normal for a relay |
| `ether2` (WAN) | `192.168.0.254/24`, `fe80::be24:11ff:fe9a:2c95/64` | **No global IPv6** — the `/64` is deliberately kept off this leg |
| LAN clients | SLAAC from `2a0e:437:7b9b::/64` | Default gateway = the `eth0` link-local above |

A pleasant side effect: the router LXC itself has **no global IPv6 address at
all**, so it is not reachable over IPv6 even before the firewall.

## 3. Invariants — do not break these

1. **Exactly one LAN advertiser.** `radvd` runs on the LXC's `eth0` and nowhere
   else. The Proxmox host's `radvd.service` **stays masked** (`systemctl
   disable --now radvd`). Any second advertiser re-creates the blackhole.
2. **The `/64` is never on-link on the WAN leg.** `accept_ra_pinfo=0` on
   `ether2`. If you ever see a global address or the prefix route on `ether2`,
   the relay is misconfigured.
3. **`accept_ra=2` is set before `all.forwarding=1`.** Enabling forwarding makes
   the kernel *drop* the RA-learned default route; `accept_ra=2` is what lets a
   forwarding host keep taking it. Order matters (see §8).
4. **Never advertise without a working default route.** The agent refuses to
   start `radvd` if no default route is present, so a half-built relay degrades
   to IPv4-only rather than to a blackhole.
5. **`radvd` never runs without `ndppd`.** `radvd-relay.service` has
   `Requires=ndppd-relay.service`.
6. **The Debian `radvd.service` stays masked.** We drive radvd from our own
   unit only, so it can never start before the prefix/route/ndppd/firewall exist.
7. **No RDNSS is advertised.** This keeps LAN clients on the DHCPv4 resolver
   (`192.168.1.1`), which preserves the eWeLink DNS hijack for the IoT pool
   (`192.168.1.128/26`). Do not add an RDNSS block to `radvd-relay.conf`.

## 4. What gets installed

On the **router LXC** (`192.168.1.1`):

| Path | Role |
|---|---|
| `/usr/local/sbin/ipv6-relay.sh` | the agent (deployed from `ipv6-relay-agent.sh`) |
| `/etc/sysctl.d/99-ipv6-relay.conf` | the sysctls, applied at boot **and** by `setup` |
| `/etc/ndppd-relay.conf` | `ndppd` config (`rule <prefix> { auto; }`) |
| `/etc/radvd-relay.conf` | `radvd` config (prefix, 1 h lifetime, no RDNSS) |
| `/run/ipv6-relay.prefix` | last-seen prefix, used by `refresh` to detect a change |
| `ipv6-relay.service` | oneshot: `setup` at boot, `teardown` on stop |
| `ndppd-relay.service`, `radvd-relay.service` | the daemons |
| `ipv6-relay-refresh.{service,timer}` | every 5 min: re-derive the prefix, restart daemons if it changed |
| `/etc/firewall.user` | IPv4 rules **+** the IPv6 hardening block (applied by `/etc/rc.local`) |

On the **Proxmox host** (`192.168.1.33`) and the LXC:

| Path | Role |
|---|---|
| `/usr/local/sbin/ipv6-harden.sh` | the IPv6 `INPUT` rules (host only; the LXC has them inline in the agent) |
| `ipv6-harden.service` | oneshot, `After=pve-firewall.service`, applies them at boot |

Packages on the LXC: `ndppd` (relay), `ndisc6` (provides `rdisc6`, used for
prefix discovery and to solicit an RA), `radvd` (advertiser).

## 5. Deploy from scratch

Order matters: harden first (safe), then relay.

```bash
cd /Users/matteo/Projects/APPs/domotica
bash macos/fix-ipv6-firewall.sh -y    # default-deny IPv6 on .33 and .1
bash macos/fix-ipv6-relay.sh -y       # deps, agent, units, start, verify
```

`fix-ipv6-relay.sh` performs, in order:

1. installs `ndppd`, `ndisc6`, `radvd` on the LXC (and restores the `radvd`
   **binary** if it was stripped, as it was in Oct 2026 — the unit stays
   masked regardless);
2. `scp`s the agent to `/usr/local/sbin/ipv6-relay.sh`;
3. runs the agent's `install` (writes the units, enables the service and timer);
4. `systemctl restart ipv6-relay.service` → `setup`;
5. verifies **from the Mac** that a relayed address appeared and `curl -6`
   succeeds — a default route on the router proves nothing.

## 6. Verify

```bash
bash macos/fix-ipv6-relay.sh -s          # status + end-to-end check from the Mac
bash macos/netdiag.sh | tail -20         # expect: verdict HEALTHY: dual-stack
```

On the router:

```bash
ssh root@192.168.1.1 '/usr/local/sbin/ipv6-relay.sh status'
```

Expected, and what each line proves:

| Check | Expected | Proves |
|---|---|---|
| `net.ipv6.conf.all.forwarding` | `1` | the LXC forwards |
| relayed prefix | `2a0e:437:7b9b::/64` | discovery works |
| global addresses on `ether2` | **none** | the `/64` is off the WAN leg |
| `2a0e:437:7b9b::/64 dev eth0` | present | the LAN leg owns it |
| default route | via the hub's link-local on `ether2` | upstream works |
| `ndppd-relay` / `radvd-relay` / timer | `active` | daemons up |
| `ip6tables -S INPUT` / `FORWARD` | `-P ... DROP` | default-deny in place |
| packaged `radvd` | `masked` | no rogue advertiser |

Inbound is closed — verify **from outside**, with a control:

```bash
# Controls first (the checker must say Success for a known-open port):
#   2606:4700:4700::1111 :53   -> Success
#   2606:4700:4700::1111 :9    -> Failed
# Then ours — all must read Failed:
#   <host .33 global v6> :8006 and :22
#   <lxc  .1  global v6> :53   and :22
# e.g. https://port.tools/port-checker-ipv6/
```

Stronger check for LAN hosts: start a real listener on a LAN host, confirm it
is reachable **on** the LAN, then confirm it is **Failed** from outside. That
proves the router's `FORWARD DROP` is what is blocking, not a closed port.

## 7. Operate

```bash
# status (on the router)
/usr/local/sbin/ipv6-relay.sh status

# force a re-check of the ISP prefix (the timer does this every 5 min anyway)
/usr/local/sbin/ipv6-relay.sh refresh

# logs
journalctl -u ipv6-relay -u ndppd-relay -u radvd-relay -n 50 --no-pager

# what is the modem advertising right now?
timeout 6 rdisc6 -1 -q ether2
```

**If the ISP prefix changes** (it is RA-derived and can change): the refresh
timer notices within 5 min, rewrites both configs, and restarts `ndppd`/`radvd`
— LAN clients then re-SLAAC on the next RA. Nothing manual is required; if you
want it immediately, run `refresh`.

**To expose one LAN service to the internet** (denied by default): add a narrow
`DNAT` + `FORWARD` `ACCEPT` pair on the LXC. Note that anything added by hand
does **not** survive a reboot — put it in the agent's `setup` (or in
`/etc/firewall.user` for rules that do not depend on the prefix).

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ndppd` exits immediately; log says *"Low prefix length (64 <= 120) when using 'static' method"* | `static` rule mode requires a prefix longer than /120 and refuses a whole `/64` | use `auto` (the agent already does) |
| After enabling the relay, `ip -6 route show default` is **empty**; LAN has IPv6 but no internet | enabling `all.forwarding=1` made the kernel drop the RA-learned default route; it only returns on the hub's *next* RA (up to ~10 min) | the agent sends its own Router Solicitation and waits (`ensure_default_route`), and refuses to advertise without it. Re-run `setup` |
| `netdiag.sh` says **BLACKHOLE** but IPv6 actually works | on macOS `ping6 -t` is a *Node Information query*, not a timeout — it swallows the next argument as a hostname, so the check always fails | fixed in `netdiag.sh` via the `ping6_ok` helper; never use `ping6 -t` for a timeout |
| LAN clients hold a stale `2a0e:…` address and hang | the relay/radvd stopped, but clients keep the last RA for up to the 1 h lifetime | flush the client: Mac `sudo networksetup -setv6off Wi-Fi && sudo networksetup -setv6automatic Wi-Fi`; Android: toggle Wi-Fi |
| IPv6 broke again for *everything*, LAN-wide | a **second** advertiser (host radvd) came back | `ssh root@192.168.1.33 'systemctl disable --now radvd'`; confirm on a client with `ndp -rn` — only `fe80::be24:11ff:fe94:bbff` (LXC `eth0`) may appear |
| Wildcard: LAN IPv6 works, but one host cannot be reached from outside | by design — `FORWARD` is `DROP` | add a narrow DNAT + FORWARD rule (§7) |
| The Proxmox host is unreachable over IPv6 from the LAN | intended: it keeps its modem-side `2a0e:…` on `vmbr1` and takes no address on `vmbr0` | manage the host over IPv4; this is documented, not a fault |

## 9. Rollback

```bash
bash macos/fix-ipv6-relay.sh -u -y      # stop the relay; WAN leg back to plain SLAAC
bash macos/fix-ipv6-firewall.sh -u -y   # then reopen IPv6 on .33 and .1
```

The relay rollback **intentionally leaves the IPv6 firewall in place** — that is
the safe intermediate state (no IPv6 service, but nothing exposed). Then flush
clients (see the row above); they keep the stale prefix for up to an hour
otherwise.

## 10. Disaster recovery

**LXC rebuilt / config lost.** Re-run `bash macos/fix-ipv6-relay.sh -y`: it
reinstalls the packages, redeploys the agent, recreates the units and starts
everything. No manual state to recover.

**Rogue advertiser suspected after any network work.** From the Mac:

```bash
ndp -rn | grep -v utun          # default routers — must be only the LXC eth0 LL
```

## 11. Gotchas worth remembering

- **`ping6 -t` is not a timeout on macOS.** It is a Node Information query. Use
  the `ping6_ok` helper in `netdiag.sh`, or `ping -6`/`curl -6` with `--max-time`.
- **`ndppd`'s `static` cannot do a `/64`** — it requires > `/120`. Use `auto`.
- **Enabling forwarding flushes RA routes.** Set `accept_ra=2` first, and expect
  the default route to need a fresh RA (or your own solicitation).
- **`rdisc6` is the workhorse** — it both discovers the prefix and forces an RA
  (it sends a Router Solicitation), which is how the default route comes back.
- **The external IPv6 port checkers are fussy.** `check-host.net` rejects IPv6
  literals; `port.tools` works but needs a CSRF token + cookie. Always include a
  known-open *control* (e.g. Cloudflare `:53`) so a "Failed" is meaningful.
- **iptables/ip6tables rules die with the container.** That is why the LXC's
  rules live in `/etc/firewall.user` (re-applied by `/etc/rc.local`) and the
  host's in `ipv6-harden.service`.
- **A restart of `ipv6-relay.service` briefly interrupts LAN IPv6** (~a few
  seconds while `ndppd`/`radvd` cycle). Clients recover on the next RA.
