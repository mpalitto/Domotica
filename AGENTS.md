# Agent Notes

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
  - `.77`: 1212 (PIR), 1234 (RF receivers), 5678 (KINETIC), 7777 (ManagerLayer), 12345 (Current sensor), 12346 (Display)
  - `.11`: 3000 (eWeLink API)
- **Screen sessions** — lists running `screen` sessions on `.77`
- **Processes** — shows PIDs of core daemons (managerLayer, buttonPressReceiver, arduino433tx, displayServer, WEBserver)
- **Device States** — last 10 `STATE_UPDATE` events from managerLayer
- **NFS mount** — checks local mount status
- **eWeLink Proxy** — service status, process PID, API device count (total/online), loaded plugins

## Monitoring — `macos/watchdog.sh`

- Silent-until-broken health check; `--verbose` for every test, `--json` for one machine-readable line. Exit `0` healthy, `1` on errors.
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
