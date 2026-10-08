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

- Password-less SSH as `root@192.168.1.77` (key: `~/.ssh/id_ed25519`)
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
- Reliable method: write a `.py` script locally → `scp` to remote → `ssh` to run it.
- Use Python scripts for multi-line edits with tricky characters; use `sed` for simple one-line substitutions.

## Cloud Bridge (`nodejs/plugins/cloud-bridge.mjs`)

- Each device gets a cloud WebSocket connection to an AWS server (eu-disp.coolkit.cc).
- On WS close or dispatch failure, reconnects with exponential backoff: 5s → 10s → 20s → 40s → 60s (max 5 attempts).
- Retry counter resets on successful registration.
- On `device:disconnected`, pending reconnect is cancelled.
- `PLUGIN_FILE` in `nodejs/UI.sh` must point to `./nodejs/plugins/cloud-bridge.mjs` (relative to the service `WorkingDirectory`).
