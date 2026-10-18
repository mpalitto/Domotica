# Agent Notes

## Active Project — RF Event Fusion (started Oct 2026)

- **Goal**: SNTP-synchronized epoch-ms timestamps in the RF receiver messages
  (`Arduino/RFreceiver_esp8266`) → server-side event fusion in
  `button2sONOFF/buttonPressReceiver.sh`: one button press = one logical event + per-receiver
  latency/health data. Replaces the current 2 s debounce hack and the dormant
  `socket.js` offset-calibration.
- **Decision**: Option A — `configTime()` SNTP on the ESP8266, field 3 of the message becomes
  UTC epoch-ms of the first RF pulse (`0` or small value = legacy v1 receiver → old debounce
  path; server accepts both during rollout).
- **Status (2026-10-18, updated)**: firmware **v2.2** (the framing fix) is deployed and
  **server-side epoch fusion is DELIVERED and live** in `button2sONOFF/buttonPressReceiver.sh`
  (v2-epoch grouping + per-receiver `skew`/`lag` logging; `test_fusion.sh` + a live smoke test).
  On v2.2: `rx-55d68f` (`rf-laundry` — the former `nodeMCU-1`; OTA'd from `.77`) and `rx-241002`
  (`rf-fridge`, IP `.231` — its OTA listener was wedged, so it was **USB-flashed from the Mac** on
  2026-10-18, `Hash of data verified`; both framing wire-verified single-segment on `.77:1234`).
  Only **`nodeMCU-0`** remains on v1 — it will come back as **`rx-058ef5 : rf-central`**
  (id predicted from MAC `ec:fa:bc:05:8e:f5`; line already staged in `receivers.config`), and
  **v1 has no OTA at all**, so USB is mandatory for it. Flip `FUSION_ENABLED=1` only after that
  (with `=0` the legacy 2 s debounce still gates forwarding, which is what keeps v1+v2 pairs from
  toggling a light twice). The KINETIC receiver is **`ESP32_RX_01`** (ESP32 + CC1101/E07-M1101D,
  GDO0→GPIO13, `:5678`, RSSI) — its firmware source is **not in the repo** (wanted for the later
  "add LightwaveRF + RSSI" step) and it is currently powered off (`AB6EDE`/`CCFF0E` are dead until
  it is back). **Found & fixed a decode bug**: the ESP8266 refactor had truncated the LightwaveRF
  code to `F4AA0D-`, read by the server as `INVALID` and dropped; the original algorithm (only
  surviving in `notMantained/YUN-LWRF-receiver-v0.2`) was restored in `decodePulseData()` — **do
  not refactor that function again**.
- **OTA: always run `espota.py` from `.77`, never from the Mac.** `python3 /tmp/espota.py
  -i <ip> -p 8266 -a '<OTA_PASSWORD>' -f <firmware.bin>` (needs a v2 firmware already running; the
  Mac Wi-Fi cannot receive the ESP's UDP reply). Expect to retry: a lost `AUTH` datagram wedges the
  ESP's state machine, and an interrupted transfer can leave its OTA listener **dead until a power
  cycle** (that is exactly what happened to the fridge unit). For a unit in the field, **USB is the
  deterministic path**. Details in `DOCs/RF-EVENT-FUSION.md` §7; verify framing on the wire with
  `button2sONOFF/tools/rf-frame-check.py` (root, no `tcpdump` needed on `.77`).
  **Field OTA was tried on the reinstalled laundry unit and FAILED** (2026-10-18): the UDP
  handshake answers fine, but the 326 KB transfer never completes, and afterwards the unit becomes
  unreachable **from `.77` only** (ping 0/15, UDP 8266 dead) while every other host still reaches
  it — it clears itself on the unit's next RF press. So: **never start an OTA on a receiver you
  cannot physically reach**, and if a receiver looks dead, cross-check from `.33`/`.11` before
  believing it. A **handshake-only** probe (send the invitation, read `AUTH`, stop — no transfer,
  nothing to wedge) is the safe reachability test. **Decision (2026-10-19): OTA stays in the
  firmware as a bench-only tool** — removal would cost a USB trip for every installed unit and buy
  only 37.8 KB of flash plus 544 B of IRAM (measured), so bench OTA it is; see
  `DOCs/RF-EVENT-FUSION.md` §6/§7.
- **Restarting `buttonPressReceiver.sh`**: quit the screen session **and kill the leftover
  `socat`** (it keeps `:1234`/`:5678` bound, so a new listener would silently starve) — full
  recipe in `DOCs/RF-EVENT-FUSION.md` §8. Note receivers reconnect **lazily on their next
  transmission**, so "no connections on `:1234`" after a restart is normal, not an outage.
- **Read `DOCs/RF-EVENT-FUSION.md` first** — it is the source of truth (design, rollout plan,
  open questions, fix list, resume commands).

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
- **IPv6 blackhole — fixed Oct 2026, do not regress**: `radvd` on `192.168.1.33` re-advertised the ISP's on-link prefix `2a0e:437:7b9b::/64` (learned on `vmbr1`) onto the LAN bridge `vmbr0` while IPv6 forwarding was 0 everywhere → all LAN IPv6 silently dropped → Android apps hung (IPv6/QUIC has no fallback; iOS fell back to IPv4). Fix: `radvd` on the **host** is **disabled and must stay disabled** (`systemctl disable radvd`), plus a TCPMSS clamp (`--set-mss 1440`) on the LXC's `FORWARD` chain for this line's **1480-byte** IPv4 path MTU (Sky carries the access over IPv6 and the hub translates IPv4→IPv6, 464XLAT-style: 1500−20=1480 — *not* PPPoE/1492, so 1452 would be too high and let TCP emit silently-dropped 1492-byte segments). Persisted in the LXC's `/etc/firewall.user`, which `/etc/rc.local` applies at boot (iptables rules live in RAM and die with the container; there is no iptables-persistent here).
- **IPv6 relay — the LAN now HAS IPv6, on purpose (Oct 2026)**: the LAN is *not* IPv4-only any more. The LXC **relays** the hub's single on-link `/64` instead of routing it, because the hub delegates no prefix and puts the same `/64` on-link on the modem's LAN (the LXC's WAN leg `ether2`). WAN leg: `accept_ra=2` + `accept_ra_pinfo=0` (default route kept, `/64` kept OFF that leg). LAN leg `eth0`: owns `2a0e:437:7b9b::/64`, advertised by `radvd` with **no RDNSS** (preserves the IoT DNS hijack), 1 h prefix lifetime. `ndppd` on `ether2` answers the modem's NDP. Full design + runbook: **`macos/IPV6-RELAY.md`**; short version in `macos/README.md`.
  - **Invariants**: exactly one LAN advertiser (the LXC `eth0`); host `radvd` stays masked; the Debian `radvd.service` stays masked (radvd runs only from our own unit, `Requires=ndppd-relay`); never advertise without a working default route; `accept_ra=2` must be set *before* `all.forwarding=1` (enabling forwarding flushes RA-learned routes); no RDNSS in `radvd-relay.conf`; the `ndppd` rule names the LAN leg explicitly (`iface eth0`) — **never `auto`**, which on ndppd 0.2.4 silently relays nothing here (modem's NS unanswered → LAN-wide 50–100 % loss, apps hang).
  - **Inbound IPv6 is default-deny** on `.33` and `.1` (they are in front of the LAN and the Sky hub applies **no** inbound IPv6 firewall of its own — verified). The LXC's `FORWARD` is `DROP` allowing only LAN-initiated traffic + ICMPv6, so the whole LAN is protected centrally. Persisted by `ipv6-harden.service` (host) and `/etc/firewall.user` (LXC).
  - **Operate**: `bash macos/fix-ipv6-relay.sh -s` (status + end-to-end check from the Mac); on-box `/usr/local/sbin/ipv6-relay.sh {status|refresh|setup|teardown}`; `ipv6-relay-refresh.timer` re-derives the ISP prefix every 5 min. **Undo**: `bash macos/fix-ipv6-relay.sh -u -y` (leaves the IPv6 firewall in place) then `bash macos/fix-ipv6-firewall.sh -u -y`.
  - **Gotcha**: on macOS `ping6 -t` is *not* a timeout — it is a Node Information query that eats the next argument as a hostname. Using it makes IPv6 look broken (it caused a false blackhole verdict in `netdiag.sh`, now fixed with the `ping6_ok` helper).
- **DNS**: LAN clients get `192.168.1.1` (dnsmasq on the LXC) as resolver — applied by `macos/fix-dns-lxc.sh`, which appends a marked block to `/etc/dnsmasq.conf` (`dhcp-option=option:dns-server,192.168.1.1` + `no-resolv` + upstreams `192.168.0.1`, `1.1.1.1`, `8.8.8.8`); timestamped `.bak-*` backups next to the conf. Live since Oct 2026; clients only switch after a DHCP renew.
- **LXC dnsmasq specifics**: two instances started by **`/etc/rc.local`, not systemd** — main on `:53` (`/etc/dnsmasq.conf`: LAN DHCP `192.168.1.192-240`, IoT pool `192.168.1.128-191` tagged by `dhcp-mac=D0:27:00:*`, leases in `/tmp/dhcp.leases`) and the IoT DNS-hijack instance (`/etc/dnsmasq-iot.conf`, answers everything with `192.168.1.11`) on `192.168.1.1:1053`. The OpenWRT NAT redirect **was migrated and is active**: PREROUTING `REDIRECT` of `udp/tcp 53` from `192.168.1.128/26` to port `1053`. To restart the main instance: `kill $(cat /run/dnsmasq-main.pid)` then `dnsmasq --conf-file=/etc/dnsmasq.conf --pid-file=/run/dnsmasq-main.pid` — config changes are **not** picked up by SIGHUP.
- **Diagnostics/fix tooling** (all in `macos/`, see `macos/README.md` for details; the relay runbook is `macos/IPV6-RELAY.md`):
  - `netdiag.sh` — from the Mac: IPv4/IPv6/DNS/MTU + IPv6 forensics; verdict distinguishes healthy *absent* IPv6 (no default route, instant fail), healthy *dual-stack* (what the relay gives), and a real *blackhole* (default route, silent drop). Uses a bounded `ping6_ok` helper — see the `ping6 -t` gotcha above.
  - `ipv6-diag.sh` — read-only SSH snapshot of `.33` and `.1` (RA/DHCP config, forwarding sysctls).
  - `fix-ipv6-lan.sh` — disables radvd on the host (`-m` adds the TCPMSS clamp); prints rollback + client IPv6 flush steps.
  - `fix-dns-lxc.sh` — hands DNS to the LXC (`-n` dry run, `-y` apply); validates with `dnsmasq --test` and self-restores on failure; restarts via the pidfile since dnsmasq here is rc.local-managed, not systemd.
  - `fix-ipv6-firewall.sh` — default-deny IPv6 on `.33` and `.1` (`-y` apply, `-u -y` remove). Persists via `ipv6-harden.service` + `/etc/firewall.user`.
  - `fix-ipv6-relay.sh` — deploys/enables/verifies/undoes the IPv6 relay (`-y` apply, `-s` status, `-u -y` remove). Verifies end-to-end **from the Mac**, not just on the router.
  - `ipv6-relay-agent.sh` — the on-box half, deployed to `/usr/local/sbin/ipv6-relay.sh` (`install|uninstall|harden|setup|teardown|refresh|status`). Pure `sh`, idempotent, safe to run by hand.

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
