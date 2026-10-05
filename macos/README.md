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

## Usage

```bash
./mount.sh    # mount 192.168.1.77:/root/Domotica/LinuxServerScripts → ~/mnt/domotica
./status.sh   # full system health check (connectivity, ports, processes, devices)
./watchdog.sh # silent health check, for unattended runs
source UI.sh  # then: sonoff list, sonoff on/off <device>, etc.
sudo umount ~/mnt/domotica  # unmount
```
