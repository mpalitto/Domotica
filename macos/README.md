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
a TCPMSS clamp (`--set-mss 1440`) in the router LXC's `FORWARD` chain. The LAN
is deliberately IPv4-only now; if real IPv6 is ever wanted it requires the
modem in bridge mode with prefix delegation (PD), because with the modem
routing, its on-link /64 can never be shared with the LAN.

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
| ISP modem (Sky hub) | `192.168.0.1` | Routing mode (double NAT); IPv6-carried access with IPv4→IPv6 translation → IPv4 path MTU 1480 |
| Router LXC | `192.168.1.1` | Proxmox LXC `111` "MAIN-router" — IPv4 NAT, dnsmasq DHCP + DNS for the LAN |
| Proxmox host | `192.168.1.33` | Fujitsu mini-PC — `vmbr0` = home LAN, `vmbr1` = USB NIC facing the modem |

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
```

- **`netdiag.sh`** — interfaces/routes, system resolvers, router-vs-system
  DNS comparison, IPv4 vs IPv6 reachability, HTTP by raw IP vs by name, DF
  MTU probe, and IPv6 forensics that resolves the RA source MAC to a vendor
  and an IPv4/ARP match. Its verdict distinguishes a healthy *absent* IPv6
  (no default route, fails in ms) from a *blackhole* (default route present,
  packets silently dropped — the app-hanging failure mode).
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

### Verify after any network change

```bash
./netdiag.sh                    # IPv6-only tests must fail FAST (ms), verdict HEALTHY
scutil --dns | head             # after a DHCP renew: first nameserver = 192.168.1.1
```

## Usage

```bash
./mount.sh    # mount 192.168.1.77:/root/Domotica/LinuxServerScripts → ~/mnt/domotica
./status.sh   # full system health check (connectivity, ports, processes, devices)
./watchdog.sh # silent health check, for unattended runs
source UI.sh  # then: sonoff list, sonoff on/off <device>, etc.
sudo umount ~/mnt/domotica  # unmount
```
