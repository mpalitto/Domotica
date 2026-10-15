# Agent Notes

## IoT Controller (house-map WEB UI) — `.77:3000`

- Runs on `192.168.1.77:3000` inside the `IoT-WEBui` `screen` session, launched by `LinuxServerScripts/startIoT-WEBui.sh` (idempotent: kills+recreates the session).
- Logic lives in `LinuxServerScripts/iot-controller/WEBserver-port3000.js` (Node + `express`/`body-parser`). The UI is `iot-controller/index.html`.
- **UI build (old iPad wall panel)**: the app script is **pre-compiled to ES5** — source is `iot-controller/webui-app.jsx`, build with `node build-webui.js` (Babel 8 devDeps: `npm install` in `iot-controller/`) → `app.js`. React/ReactDOM **16.14 UMD** + a `whatwg-fetch` polyfill are vendored locally in `iot-controller/vendor/` — **no CDN (unpkg) and no Babel standalone**: newer bundles (React 18, Babel 7+) contain ES2015+ syntax (arrows, `?.`, `??`) that Safari 9/12 on the wall-panel iPad cannot parse, which showed up as a black page. After editing `webui-app.jsx` or `index.html`, rerun the build, re-deploy `app.js` + `index.html` (+`vendor/`), then hard-refresh the iPad. `index.html` must keep `runtime: classic` JSX output.
- **Live state**: polls the eWeLink proxy at `192.168.1.11:3000/devices` every `STATE_POLL_MS` (default `2000ms`) and pushes diffs over SSE to `/api/states/stream`. Events fire only when the state signature changes. Clients get a full snapshot on connect.
- **Key mapping**: UI uses **RF codes**, proxy uses **burned-in deviceIDs** — joined by `button2sONOFF/config/sONOFF.config` (`deviceID : alias : RFcode : description`). Lights with an empty `deviceID` have **no live state** (dashed ring) and are optimistic-only.
- **Catalogue**: `sONOFF.list` is read from `button2sONOFF/config/sONOFF.list` (not `$IoTserverScripts/sONOFF.list`). The parser accepts `V s:CODE #name - description` (space after `#` optional). Both `sONOFF.list` and `sONOFF.config` are watched by mtime and reloaded automatically.
- **Modes**: `OPERATIVO` → live wins over stored; `CORREGGI` → stored wins (layout editing without live state fighting). Toggles are optimistic and reconciled by the SSE push.
- **State sync on toggle**: the web UI always sends the expected next state with `/api/light/toggle` (OPERATIVO) or `/api/state/update` (CORREGGI). The server records it, pushes SSE, and tells `managerLayer` (port 7777), which relays it to the eWeLink proxy so the recorded eWeLink state and the UI stay in sync — this matters for RF-fallback lights whose devices are offline and never report. Locally online devices report their real state and self-correct any mismatch on the next poll. CORREGGI never sends RF; OPERATIVO always does.
- **Endpoints/env**: `/api/states/stream`, `/api/states`, `/api/config`, `/api/light/toggle` (hex RF codes only), `/api/house-map`, `/api/room/:id`. Overridable: `IoTserverScripts`, `EWELINK_PROXY_HOST/PORT`, `STATE_POLL_MS`, `PORT`.
- **Resilient**: if proxy is unreachable it logs once and keeps last known state; an empty `/devices` is treated as "still starting up" not "all off". Restart with `export IoTserverScripts=/root/Domotica/LinuxServerScripts; $IoTserverScripts/startIoT-WEBui.sh`.

## Remote Access

- **The agent can run commands on these boxes directly** — the shell tool works and key-based SSH is password-less (`BatchMode=yes`, no TTY needed). Diagnose, fix and verify on-box yourself instead of asking the user to paste terminal output. Reserve user round-trips for things only their machine/physical devices can do: `sudo` on the Mac, phone Wi-Fi toggles, etc.
- Password-less SSH (key: `~/.ssh/id_ed25519`):
  - `root@192.168.1.77` — Linux server
  - `root@192.168.1.11` — eWeLink proxy host
  - `root@192.168.1.33` — Proxmox host (`pve`)
  - `root@192.168.1.1` — router LXC (`MAIN-router`)
- `macos/mount.sh` mounts `192.168.1.77:/root/Domotica/LinuxServerScripts` → `~/mnt/domotica` (uses NFS, requires sudo)
- NFS export on server uses `all_squash,anonuid=0,anongid=0` so all clients map to root
- Manual unmount: `sudo umount ~/mnt/domotica` or `diskutil unmount ~/mnt/domotica`
- Not all rclone builds support FUSE on macOS; use the binary from rclone.org (with `cmount` tag)

## eWeLink Proxy (192.168.1.11)

- Password-less SSH as `root@192.168.1.11` (key: `~/.ssh/id_ed25519`)
- Runs eWeLink Proxy API on port `3000` — local control of SONOFF devices
- `macos/UI.sh` provides the `sonoff` function for use **on the Mac** — source it to get commands:
  - `sonoff ?` — help
  - `sonoff list [all|online|offline|on|off|cloud]` — list devices
  - `sonoff on|off <deviceID|alias>` — toggle device
  - `sonoff set-alias <id> <alias>` — rename device
  - `sonoff livelog` — remote journalctl via SSH
- API base URL defaults to `http://192.168.1.11:3000` (override: `EWELINK_PROXY_URL`, `EWELINK_PROXY_HOST`)
- `eWeLink-Proxy/nodejs/UI.sh` is the same logic for use **on `.11`** instead (`API_URL=http://localhost:3000`, `livelog` runs `journalctl` locally). Keep both in sync when changing `sonoff` behaviour.

## System Health — `macos/status.sh`

`status.sh` runs a full health check from this machine. Sections:

- **Connectivity** — pings gateway (`.1`), eWeLink proxy (`.11`), Linux server (`.77`)
- **Listening ports** — verifies expected TCP listeners on each server:
  - `.77`: 1234 (RF), 5678 (KINETIC), 7777 (ManagerLayer), 12345 (Current sensor), 12346 (Display)
  - `.11`: 3000 (eWeLink API)
  - 1212 (PIR) is intentionally not checked — that project is retired and is not started at boot
- **Screen sessions** — lists running `screen` sessions on `.77`
- **Processes** — shows PIDs of core daemons (managerLayer, buttonPressReceiver, arduino433tx, displayServer, WEBserver)
- **Device States** — last 10 `STATE_UPDATE` events from managerLayer
- **NFS mount** — checks local mount status
- **eWeLink Proxy** — service status, process PID, API device count (total/online), loaded plugins

## Network (LAN, IPv6, DNS)

- **Topology**: ISP modem `192.168.0.1` (Sky hub, routing mode → double NAT; IPv6-carried access with IPv4→IPv6 translation, so the IPv4 **path MTU is 1480**, not 1492/1500) → router LXC `192.168.1.1` (Proxmox LXC `111` "MAIN-router": IPv4 NAT + dnsmasq DHCP/DNS) → home LAN `192.168.1.0/24` on the Proxmox host's `vmbr0` (host `192.168.1.33`, Fujitsu mini-PC; `vmbr1` is the USB NIC facing the modem).
- **IPv6 blackhole — fixed Oct 2026, do not regress**: `radvd` on `192.168.1.33` re-advertised the ISP's on-link prefix `2a0e:437:7b9b::/64` (learned on `vmbr1`) onto the LAN bridge `vmbr0` while IPv6 forwarding was 0 everywhere → all LAN IPv6 silently dropped → Android apps hung (IPv6/QUIC has no fallback; iOS fell back to IPv4). Fix: `radvd` is **disabled and must stay disabled** (`systemctl disable radvd`), plus a TCPMSS clamp (`--set-mss 1440`) on the LXC's `FORWARD` chain for this line's **1480-byte** IPv4 path MTU (Sky carries the access over IPv6 and the hub translates IPv4→IPv6, 464XLAT-style: 1500−20=1480 — *not* PPPoE/1492, so 1452 would be too high and let TCP emit silently-dropped 1492-byte segments). Persisted in the LXC's `/etc/firewall.user`, which `/etc/rc.local` applies at boot (iptables rules live in RAM and die with the container; there is no iptables-persistent here). The LAN is intentionally IPv4-only; real IPv6 would need modem bridge mode + prefix delegation. Never point an RA at `vmbr0` without working IPv6 forwarding/upstream.
- **DNS**: LAN clients get `192.168.1.1` (dnsmasq on the LXC) as resolver — applied by `macos/fix-dns-lxc.sh`, which appends a marked block to `/etc/dnsmasq.conf` (`dhcp-option=option:dns-server,192.168.1.1` + `no-resolv` + upstreams `192.168.0.1`, `1.1.1.1`, `8.8.8.8`); timestamped `.bak-*` backups next to the conf. Live since Oct 2026; clients only switch after a DHCP renew.
- **LXC dnsmasq specifics**: two instances started by **`/etc/rc.local`, not systemd** — main on `:53` (`/etc/dnsmasq.conf`: LAN DHCP `192.168.1.192-240`, IoT pool `192.168.1.128-191` tagged by `dhcp-mac=D0:27:00:*`, leases in `/tmp/dhcp.leases`) and the IoT DNS-hijack instance (`/etc/dnsmasq-iot.conf`, answers everything with `192.168.1.11`) on `192.168.1.1:1053`. The OpenWRT NAT redirect **was migrated and is active**: PREROUTING `REDIRECT` of `udp/tcp 53` from `192.168.1.128/26` to port `1053`. To restart the main instance: `kill $(cat /run/dnsmasq-main.pid)` then `dnsmasq --conf-file=/etc/dnsmasq.conf --pid-file=/run/dnsmasq-main.pid` — config changes are **not** picked up by SIGHUP.
- **Diagnostics/fix tooling** (all in `macos/`, see `macos/README.md` for details):
  - `netdiag.sh` — from the Mac: IPv4/IPv6/DNS/MTU + IPv6 forensics; verdict distinguishes healthy *absent* IPv6 (no default route, instant fail) from a *blackhole* (default route, silent drop).
  - `ipv6-diag.sh` — read-only SSH snapshot of `.33` and `.1` (RA/DHCP config, forwarding sysctls).
  - `fix-ipv6-lan.sh` — disables radvd on the host (`-m` adds the TCPMSS clamp); prints rollback + client IPv6 flush steps.
  - `fix-dns-lxc.sh` — hands DNS to the LXC (`-n` dry run, `-y` apply); validates with `dnsmasq --test` and self-restores on failure; restarts via the pidfile since dnsmasq here is rc.local-managed, not systemd.

## Monitoring — `macos/watchdog.sh`

- Silent-until-broken health check; `--verbose` for every test, `--json` for one machine-readable line. Exit `0` healthy, `1` on errors.
- Covers: node reachability, `.77` core processes, `ewelink-proxy.service`, listening TCP ports (one SSH round trip per host, then matched locally), disk/RAM headroom, and SONOFF device state. The port check complements the process check — it catches a process that is alive but no longer listening.
- **Scheduled by hermes, not system cron.** The Mac crontab is empty; there is no LaunchAgent. Jobs live in `~/.hermes/cron/jobs.json`:
  - `Domotica Morning Health Report` — `0 8 * * *` → `cd /Users/matteo/Projects/APPs/domotica/macos && ./watchdog.sh`
  - `Domotica Extended Health Report` — on-demand → `./watchdog.sh --verbose`
- The script only prints to stdout; **hermes** is what sends the Telegram message.
- `device_state.py` is invoked by `watchdog.sh` and classifies devices as `DEAD` (local+cloud off → error) or `OFF` (local off, cloud on → warning, RF fallback active).
- State persists in `/Users/matteo/.local/state/domotica-watchdog.state`, so you are alerted once per problem, not repeatedly.

## Git

- GitHub: `https://github.com/mpalitto/Domotica`
- The repo is checked out in **three** places, all the same repo on `master`:
  - **Mac**: `/Users/matteo/Projects/APPs/domotica` — full clone, this is the working copy for `macos/` tooling
  - **`.77`**: `~/Domotica` — sparse checkout of `/LinuxServerScripts` (plus `/.gitignore`, `/README.md`)
  - **`.11`**: `~/Domotica` — sparse checkout of `/eWeLink-Proxy/nodejs` and `/eWeLink-Proxy/DNS`
- Commit from whichever host owns the files you are changing; push with `git -C ~/Domotica` on `.77`/`.11`.
- `.77` and `.11` use `core.sparseCheckout` with **non-cone** patterns (see `.git/info/sparse-checkout`). Root files are NOT materialised unless listed explicitly — add e.g. `/README.md` to that file and run `git read-tree -mu HEAD` before editing a root file there.
- `macos/` holds the Mac-only tooling and is not used by the `.77`/`.11` runtime.

## Remote File Editing

- NFS mount (`~/mnt/domitica`) only covers `.77:LinuxServerScripts` — does **not** give access to eWeLink-Proxy or other paths.
- For files on `.11`, use SSH. Avoid heredocs with template literals — local zsh expands `${}` before sending.
- Safe multi-line remote execution from the shell tool: pipe a **quoted** heredoc into `ssh host bash -s` (`ssh ... 'host' bash -s <<'EOF'` — the quoted delimiter suppresses all local expansion; the remote bash does the interpreting). This is the pattern used by `macos/fix-dns-lxc.sh`; see also "Remote Access" above — direct on-box execution is available.
- Reliable method: write a `.py` script locally → `scp` to remote → `ssh` to run it.
- Use Python scripts for multi-line edits with tricky characters; use `sed` for simple one-line substitutions.

## Cloud Bridge (`nodejs/plugins/cloud-bridge.mjs`)

- Each device gets a cloud WebSocket connection to an AWS server (eu-disp.coolkit.cc).
- On WS close or dispatch failure, reconnects with exponential backoff: 5s → 10s → 20s → 40s → 60s (max 5 attempts).
- Retry counter resets on successful registration.
- On `device:disconnected`, pending reconnect is cancelled.
- `PLUGIN_FILE` in `nodejs/UI.sh` must point to `./nodejs/plugins/cloud-bridge.mjs` (relative to the service `WorkingDirectory`).
