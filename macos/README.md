# Domotica

Home automation system — controls SONOFF RF outlets via wall switches and a web UI.

## Architecture

| Component | Location | Role |
|-----------|----------|------|
| **Linux Server** | `192.168.1.77` | Central brain — runs all automation scripts, web UI, RF logic |
| **eWeLink Proxy** | `192.168.1.11:3000` | Local WiFi control of SONOFF devices (bypasses cloud) |
| **Broadlink RM Bridge** | `192.168.1.164:7474` | IR/RF control of AV equipment (TV, sky, chromecast) |
| **Arduino + 433MHz TX** | `/dev/ttyACM0` on `.77` | Transmits RF ON/OFF codes to SONOFF outlets |
| **ESP8266/ESP32 RF Receivers** | WiFi → port 1234 | Capture wall switch button presses (RFXCOM protocol) |
| **ESP32 KINETIC Receivers** | WiFi → port 5678 | Capture KINETIC wall switch presses |
| **NodeMCU Current Sensor** | WiFi → port 12345 | Monitors current draw, triggers alarm on threshold |
| **Display Device** | TCP → port 12346 | Remote display receiving status updates |

> **PIR motion sensors (port 1212) are retired.** The code lives in
> `LinuxServerScripts/miscellaneous/PIRsocketServer.js` but is not started at
> boot (`startPIR.sh` is commented out in `.77`'s `rc.local`), so the port is
> not expected to be listening and is deliberately excluded from the health
> checks.

## Control Flow

```
Wall Switch → RF → ESP32/ESP8266 → WiFi → Linux Server (.77)
                                              ↓
                              ┌────────────────┴────────────────┐
                           RF (Arduino TX)              WiFi (eWeLink Proxy .11)
                              ↓                              ↓
                        SONOFF Outlets ←────────────── Local API
```

The new `button2sONOFF/` system tries WiFi first (`eWeLink Proxy`), falls back to RF.

## Scripts

| Script | Purpose |
|--------|---------|
| `mount.sh` | Mounts remote scripts folder locally via NFS |
| `status.sh` | Full system health check — connectivity, listening ports, screen sessions, processes, device states, mount, eWeLink proxy status |
| `watchdog.sh` | Silent-until-broken health check; scheduled by hermes, prints to stdout only |
| `device_state.py` | Classifies SONOFF devices as `DEAD` (local+cloud off) vs `OFF` (RF fallback only); called by `watchdog.sh` |
| `UI.sh` | Source to get `sonoff` commands for local SONOFF device control via eWeLink Proxy API |
| `netdiag.sh` | Network diagnostics from the Mac — IPv4 vs IPv6, DNS, MTU, and who advertises IPv6 on the LAN |
| `ipv6-diag.sh` | Read-only SSH diagnostic for the Proxmox host (`.33`) and router LXC (`.1`) |
| `fix-ipv6-lan.sh` | Stops the Proxmox host advertising the broken ISP IPv6 prefix on the LAN (`-m` also clamps TCP MSS) |
| `fix-dns-lxc.sh` | Makes the router LXC's DHCP hand out `192.168.1.1` as DNS instead of the ISP modem (`-n` dry run) |
| `fix-ipv6-firewall.sh` | Default-deny IPv6 on `.33` and `.1` — they sit in front of the LAN and were reachable from the internet (`-y` apply, `-u` remove) |
| `fix-ipv6-relay.sh` | Gives the LAN real IPv6 via an NDP relay on the router LXC (`-y` apply, `-s` status, `-u` remove) |
| `ipv6-relay-agent.sh` | LXC-side agent deployed to `/usr/local/sbin/ipv6-relay.sh` (`install`/`uninstall`/`harden`/`setup`/`teardown`/`refresh`/`status`) |
| `IPV6-RELAY.md` | Design + operational runbook for the IPv6 relay (deploy, verify, troubleshoot, roll back) |

All scripts resolve their siblings relative to their own location, so this
directory can be checked out anywhere.

## eWeLink Proxy — SONOFF Device Control

The eWeLink Proxy server at `192.168.1.11:3000` provides a local API to control SONOFF devices, bypassing the cloud.

```bash
source UI.sh          # load sonoff commands
sonoff ?              # show help
sonoff list           # list all devices
sonoff list online    # list online devices only
sonoff list on        # list online devices with switch ON
sonoff list cloud     # list cloud-connected devices only
sonoff on <device>    # turn device ON
sonoff off <device>   # turn device OFF
sonoff set-alias <id> <name>  # set device alias
sonoff livelog        # show live proxy logs (via SSH to .11)
```

`UI.sh` here is the Mac adaptation of `eWeLink-Proxy/nodejs/UI.sh`: it
defaults `API_URL` to the LAN address instead of `localhost` and reaches
`journalctl` over SSH. Both share the same `sonoff` logic, so the
`LOCAL`/`CLOUD` columns and the `cloud` filter behave identically.
Override with `EWELINK_PROXY_URL`, `EWELINK_PROXY_HOST`, or
`EWELINK_PROXY_PLUGIN` if your setup differs.

## Monitoring — `watchdog.sh`

Stays **silent unless something is broken**, so it can be run unattended.
Unlike `status.sh` it asserts only, and its result is deduplicated against
`$WATCH_STATE_FILE` so you are told once per problem rather than every run:

```bash
./watchdog.sh           # silent when healthy; prints only bad news
./watchdog.sh --verbose # every test, passed and failed
./watchdog.sh --json    # one machine-readable line
```

Exit code is `0` when there were no errors, `1` when there were.

Checks: node reachability; `.77` core processes; `ewelink-proxy.service`;
listening TCP ports on `.77` and `.11`; disk and RAM headroom; SONOFF device
state. The port check complements the process check — it catches a process
that is alive but no longer holding its socket.

Scheduling is handled by **hermes** (`~/.hermes/cron/jobs.json`), not system
cron — there are two jobs, "Domotica Morning Health Report" (daily 08:00,
runs `./watchdog.sh`) and "Domotica Extended Health Report" (on-demand,
runs `./watchdog.sh --verbose`). The script only prints; hermes sends the
Telegram message. Alert state is persisted so you are told once per
problem, then quiet until it changes again.

## Network Diagnostics & IPv6

### Why these scripts exist — the October 2026 IPv6 blackhole

**Symptom**: Android phones on the home WiFi hung inside apps (bank app, Sky
Go, homescreen widgets) while the same phone was fine on cellular, and iOS
devices were largely unaffected.

**Root cause**: `radvd` on the Proxmox host (`192.168.1.33`) re-advertised the
ISP's *on-link* prefix `2a0e:437:7b9b::/64` (learned via SLAAC on `vmbr1`,
the NIC facing the ISP modem) onto the home LAN bridge `vmbr0` — while
`net.ipv6.conf.all.forwarding = 0` on **both** the host and the router LXC.
Every IPv6 packet from a LAN client went to the host and was silently
dropped. Android prefers IPv6/QUIC and QUIC has no fallback → apps hang
forever; iOS falls back to IPv4 via Happy Eyeballs → looks fine. The same
/64 being "on-link" on two different networks made it unrouteable by
construction.

**Fix** (applied Oct 2026): `systemctl disable --now radvd` on the host, plus
a TCPMSS clamp (`--set-mss 1440`) in the router LXC's `FORWARD` chain. That
stopped the blackhole, leaving the LAN with *no* IPv6 at all — which is safe,
because an absent IPv6 fails in milliseconds and clients fall back to IPv4
instantly.

**Then real IPv6 was added back on purpose** — but correctly, as a *relay*
rather than a routed subnet (the modem gives no prefix delegation, and its
single on-link `/64` cannot be handed to the LAN as a normal subnet). See
[IPv6 relay](#ipv6-relay-oct-2026). The host's radvd stays disabled; the only
device allowed to advertise IPv6 on the LAN is the router LXC.

### IPv6 relay (Oct 2026)

> **Operational runbook:** [`IPV6-RELAY.md`](IPV6-RELAY.md) — deploy, verify,
> operate, troubleshoot and roll back the relay. This section is the *why*.

The LAN has real, globally routable IPv6 again. It is a **relay** (NDP proxy),
not NAT66 and not a routed subnet, because the Sky hub advertises a single
on-link `/64` and gives **no prefix delegation** — and that `/64` is on the
*modem's* LAN, which the router LXC's WAN leg (`ether2`) already sits on. The
relay makes the split explicit instead of putting the same prefix on-link on
two segments (which is exactly what broke in Oct 2026).

```
        modem LAN 192.168.0.0/24                     home LAN 192.168.1.0/24
                │                                              │
    ether2 ─────┤            router LXC (CT 111)           ├───── eth0
 default route   │            192.168.1.1                   │  owns the /64
 only; the /64   │                                          │  radvd advertises it
 kept OFF this   │  ndppd: answers the modem's NDP for      │  (deliberately no
 leg (that is    │  LAN hosts using our own MAC, so         │   RDNSS)
 the whole       │  return traffic arrives here             │
 point)          └──────────────  ip6tables  ───────────────┘
                           LAN may initiate outbound;
                           nothing may initiate inbound
```

| Piece | Setting | Why |
|---|---|---|
| WAN leg | `accept_ra=2`, `accept_ra_defrtr=1` | Keep the modem's default route on a *forwarding* host — plain `accept_ra=1` loses it the instant forwarding turns on |
| WAN leg | `accept_ra_pinfo=0` | The `/64` must **not** be on-link here; this is what prevents the Oct 2026 situation |
| WAN leg | `all.forwarding=1` | The LXC forwards LAN ⇄ modem |
| LAN leg | `accept_ra=0`, holds `2a0e:437:7b9b::/64` | We are the router here; never take an RA from our own radvd |
| `ndppd` (`iface eth0` rule) | on `ether2` | Answers the modem's Neighbour Solicitations for LAN addresses with our MAC, so replies come back to us. **Not `auto`** — on ndppd 0.2.4 `auto` silently relays nothing here (see `IPV6-RELAY.md` §11) |
| `radvd` | on `eth0`, **no RDNSS** | Hands the prefix to LAN clients. Withholding RDNSS keeps the DHCPv4 resolver `192.168.1.1` — and therefore the IoT DNS hijack for `192.168.1.128/26` — fully intact |

Why it is safe this time:

- **One advertiser only.** The host's radvd stays disabled. `netdiag.sh`'s IPv6
  forensics resolve the RA source MAC: it must be the LXC's `eth0`
  (`bc:24:11:94:bb:ff`), never the Proxmox host.
- **It refuses to advertise without a working upstream.** Enabling forwarding
  makes the kernel *drop* the RA-learned default route, and it only comes back
  on the modem's next RA (up to ~10 min). The agent therefore sends its own
  Router Solicitation and, if no default route appears, does **not** start
  radvd — so a half-built relay degrades to IPv4-only, never to a blackhole.
- **radvd cannot outlive its plumbing.** `radvd-relay.service` has
  `Requires=ndppd-relay.service`, and the advertised prefix lifetime is 1 h, so
  anything that dies self-heals back to IPv4-only within the hour.
- **Default-deny inbound, centrally.** The LXC's IPv6 `FORWARD` policy is
  `DROP`, allowing only LAN-initiated and ICMPv6 traffic, so every LAN host is
  protected without configuring any host. Verified with an external IPv6 port
  checker: a *live* listener on a LAN host is unreachable from the internet.
- **The packaged `radvd.service` stays masked.** radvd is driven only by our
  own unit, after the prefix, route, ndppd and firewall all exist.

Persistence and plumbing:

| File / unit | Role |
|---|---|
| `/etc/sysctl.d/99-ipv6-relay.conf` | The sysctls above (order matters — see the comments) |
| `ipv6-relay.service` | oneshot; runs `setup` at boot and `teardown` on stop |
| `ndppd-relay.service`, `radvd-relay.service` | the two daemons (radvd `Requires=` ndppd) |
| `ipv6-relay-refresh.timer` | every 5 min; re-derives the prefix and restarts the daemons if it changed |
| `/usr/local/sbin/ipv6-relay.sh` | the on-box agent (deployed from `ipv6-relay-agent.sh`) |

**Known quirk, deliberately left alone:** the **Proxmox host** keeps its
modem-side IPv6 on `vmbr1` (a `2a0e:…` address in the *same* `/64` as the LAN)
and takes no address on `vmbr0`. So it can reach the IPv6 internet but it and
the LAN cannot reach each other over IPv6. Host management is IPv4 anyway, and
its inbound IPv6 is default-denied.

### The WAN path MTU is 1480, not 1492 (and why the clamp must match)

OpenWRT's `mtu_fix` used to clamp MSS automatically; a plain Debian LXC does
not, so the clamp is now explicit. The value matters: Sky Italia carries the
access over IPv6 and the **Sky hub translates IPv4 to IPv6** (464XLAT/CLAT
style), swapping the 20-byte IPv4 header for the 40-byte IPv6 one, so the IPv4
path MTU is `1500 - 20 = 1480` — *not* the classic 1492 (PPPoE) or 1500. The
Sky hub also gives **no ICMP "frag needed"**: an oversized packet is just
dropped, so a clamp set too high (e.g. 1452, which assumes 1492) lets TCP emit
1492-byte segments that vanish → PMTU blackhole on large transfers.

Measured with a DF-ping bisect (`netdiag.sh` does this automatically):

| Largest IPv4 packet that fits | Overhead | Mechanism | MSS clamp |
|---|---|---|---|
| 1500 | 0 | native IPv4 | none |
| 1492 | 8 | PPPoE | 1452 |
| **1480** | **20** | **IPv4→IPv6 translation (464XLAT/CLAT)** ← this line | **1440** |
| 1460 | 40 | IPv4 encapsulated in IPv6 (DS-Lite/MAP-E over IPoE) | 1420 |
| 1452 | 40 | DS-Lite over PPPoE (1492 − 40) | 1412 |

The 20-byte signature is what rules out DS-Lite/MAP-E *encapsulation* here. The
clamp is `--set-mss 1440`, auto-detected by `fix-ipv6-lan.sh -m` (`MSS=` overrides)
and verified on the wire (client SYNs leave the LXC with `mss 1440`).

### Network topology

| Box | Address | Role |
|-----|---------|------|
| ISP modem (Sky hub) | `192.168.0.1` | Routing mode (double NAT); IPv6-carried access with IPv4→IPv6 translation → IPv4 path MTU 1480; advertises the on-link `/64`, gives **no** prefix delegation, and applies **no** inbound IPv6 firewall |
| Router LXC | `192.168.1.1` | Proxmox LXC `111` "MAIN-router" — IPv4 NAT, dnsmasq DHCP + DNS for the LAN, **and the IPv6 relay** (ndppd on the WAN leg + radvd on the LAN leg) |
| Proxmox host | `192.168.1.33` | Fujitsu mini-PC — `vmbr0` = home LAN, `vmbr1` = USB NIC facing the modem; radvd stays disabled here |

### DNS

LAN clients get `192.168.1.1` (dnsmasq on the router LXC) as their resolver,
set by `fix-dns-lxc.sh`. dnsmasq forwards to explicit upstreams
(`192.168.0.1`, `1.1.1.1`, `8.8.8.8` via `no-resolv`) instead of relying on
`/etc/resolv.conf`.

Both dnsmasq instances on the LXC are started by **`/etc/rc.local`, not
systemd**: the main one on `:53` (LAN DHCP + DNS, leases in
`/tmp/dhcp.leases`) and the IoT DNS-hijack instance from
`eWeLink-Proxy/DNS/` on `192.168.1.1:1053`, which answers everything with
`192.168.1.11`. The OpenWRT-era NAT redirect **was** migrated: PREROUTING
`REDIRECT` of UDP/TCP port 53 from the IoT DHCP pool `192.168.1.128/26`
(tagged via `dhcp-mac=D0:27:00:*`) to port 1053 — active, thousands of
packets a day. Because there is no systemd unit, config changes need a
pidfile restart (`kill $(cat /run/dnsmasq-main.pid)` + re-exec), which
`fix-dns-lxc.sh` handles automatically.

### The scripts

**Prerequisites**: the `ipv6-diag`/`fix-*` scripts SSH as `root` to the
Proxmox host and the router LXC, so they need the Mac's key-based
password-less SSH to work (`BatchMode`, no password prompt). Hosts are
overridable via `PVE=`/`LXC=`/`SSHU=` env vars; everything is read-only until
you confirm (or pass `-y`).

```bash
./netdiag.sh        # always safe: read-only, run from the Mac
./ipv6-diag.sh      # always safe: read-only SSH snapshots of .33 and .1
./fix-ipv6-lan.sh   # -y no questions, -m also adds the TCPMSS clamp
./fix-dns-lxc.sh    # -n dry run (inspect only), -y apply, no flag = ask
./fix-ipv6-firewall.sh  # -y apply, -u -y remove; default-deny IPv6 on .33 + .1
./fix-ipv6-relay.sh     # -y apply, -s status, -u -y remove; the IPv6 relay
```

- **`netdiag.sh`** — interfaces/routes, system resolvers, router-vs-system
  DNS comparison, IPv4 vs IPv6 reachability, HTTP by raw IP vs by name, DF
  MTU probe, and IPv6 forensics that resolves the RA source MAC to a vendor
  and an IPv4/ARP match. Its verdict distinguishes a healthy *absent* IPv6
  (no default route, fails in ms), a healthy *dual-stack* LAN (which is what
  the relay provides), and a genuine *blackhole* (default route present,
  packets silently dropped — the app-hanging failure mode). Note it uses a
  bounded `ping6` helper: on macOS `ping6 -t` is *not* a timeout (it is a Node
  Information query that eats the next argument as a hostname), so using it
  makes the check fail and report a false blackhole.
- **`ipv6-diag.sh`** — SSHes into the Proxmox host and the router LXC and
  dumps interfaces, IPv6 routes, forwarding sysctls, radvd/dnsmasq configs
  and processes. This is what pinpointed `radvd` on the host.
- **`fix-ipv6-lan.sh`** — disables radvd on the host (prints the rollback
  line); `-m` additionally adds the TCPMSS clamp on the LXC, idempotently
  (checks before adding), and **persists it** in `/etc/firewall.user` — the
  file `/etc/rc.local` re-applies at boot, since this LXC has no
  `iptables-persistent` and iptables rules die with the container. After running it, flush the stale IPv6 on clients:
  Mac — `sudo networksetup -setv6off Wi-Fi && sudo networksetup -setv6automatic
  Wi-Fi`; Android — toggle Wi-Fi.
- **`fix-dns-lxc.sh`** — backs up `/etc/dnsmasq.conf` (timestamped), appends
  an idempotent marked block (DNS option + upstreams), validates with
  `dnsmasq --test` (restores the backup on failure or if dnsmasq does not
  come back), restarts dnsmasq (systemd unit if present, else via the
  pidfile — this LXC is `rc.local`-managed) and verifies with `dig` from the
  Mac. Clients only see the new resolver after their DHCP lease renews —
  Mac: `sudo ipconfig set en0 DHCP`; Android: toggle Wi-Fi.
- **`fix-ipv6-firewall.sh`** — the two boxes that sit in *front* of the LAN
  (the Proxmox host and the router LXC) accepted everything over IPv6 from the
  whole internet, because the Sky hub applies no inbound IPv6 firewall at all.
  This sets `INPUT` to `DROP` on both (allowing only `lo`, our own replies,
  ICMPv6 and the LAN) and `FORWARD` to `DROP` on the LXC (allowing only
  LAN-initiated traffic). ICMPv6 is allowed wholesale on purpose — NDP, RA and
  Packet-Too-Big are mandatory for IPv6 to function (RFC 4890). It persists via
  a systemd unit on the host (no `iptables-persistent` there) and the usual
  `/etc/firewall.user` + `rc.local` on the LXC, and is idempotent. `-u -y`
  restores plain `ACCEPT`. Verify from outside with an IPv6 port checker —
  `:22` and `:8006` on `.33`, `:22` and `:53` on `.1` must all read **Failed**.
- **`fix-ipv6-relay.sh`** — deploys and enables the relay: checks/installs
  `ndppd`/`ndisc6`/`radvd` on the LXC, ships `ipv6-relay-agent.sh` to
  `/usr/local/sbin/ipv6-relay.sh`, runs `install`, starts
  `ipv6-relay.service` and then verifies **end-to-end from the Mac** (a relayed
  address must appear and `curl -6` must succeed — a default route on the
  router proves nothing). `-s` prints status plus the Mac-side check; `-u -y`
  tears the relay down, restoring the WAN leg to plain SLAAC while *leaving the
  IPv6 firewall in place*. Deliberately does **not** use the packaged
  `radvd.service` (kept masked) — radvd is started only by the agent, only
  after the prefix, route, ndppd and firewall exist.
- **`ipv6-relay-agent.sh`** — the on-box half: pure POSIX `sh`, deployed to
  `/usr/local/sbin/ipv6-relay.sh` on the LXC. `install`/`uninstall` manage the
  systemd units, `harden` applies the IPv6 firewall, `setup`/`teardown` apply
  and revert the relay, `refresh` re-derives the ISP prefix and restarts the
  daemons only if it changed, and `status` reports the whole picture. It is
  safe to run by hand and is idempotent.

### Verify after any network change

```bash
./netdiag.sh                # expect verdict HEALTHY: dual-stack
./fix-ipv6-relay.sh -s      # relay status + end-to-end IPv6 check from the Mac
scutil --dns | head         # after a DHCP renew: first nameserver = 192.168.1.1
```

## Usage

```bash
./mount.sh    # mount 192.168.1.77:/root/Domotica/LinuxServerScripts → ~/mnt/domotica
./status.sh   # full system health check (connectivity, ports, processes, devices)
./watchdog.sh # silent health check, for unattended runs
source UI.sh  # then: sonoff list, sonoff on/off <device>, etc.
sudo umount ~/mnt/domotica  # unmount
```
