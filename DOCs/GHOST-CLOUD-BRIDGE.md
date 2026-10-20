# Ghost Cloud Bridge — Alexa control of RF-fallback lights

Status: **deployed and verified live** (2026-10-20)

## Problem

When a SONOFF device loses its WiFi, the eWeLink proxy (`192.168.1.11`) currently
tears down its cloud connection to the eWeLink AWS backend as a side effect:

- `cloud-bridge.mjs` started the cloud WS only on `device:registered`
  (which fires on a *local* WebSocket registration).
- On `device:disconnected` it did `ws.close()` + `cleanup()`.
- On a cloud command it bailed out with `Device not locally connected` if the
  device's local WS was not OPEN.

Result: AWS saw the device go **offline**, so Alexa said *"device is not
responding"* — even though the device was still perfectly controllable over RF
(via `button2sONOFF/managerLayer.js` on `.77`). The RF fallback was completely
invisible to the cloud.

## Goal

Decouple the **cloud link** from the device's **local WiFi link**. The proxy keeps
impersonating the device towards eWeLink AWS even when its WiFi is dead (a
"ghost device"), so Alexa/the app still reach it. Commands then flow to `.77`,
which fires the RF toggle. State flows back to the cloud, so Alexa's view stays
correct.

This is scoped to **RF-capable devices**: managerLayer decides whether an RF code
exists and silently no-ops otherwise (per design decision 2026-10-20).

## Architecture

```
Alexa/app ──▶ eWeLink AWS ──▶ proxy cloud WS (ghost, stays up)
                                   │
                    device local WS OPEN?
                     ├── yes ──▶ forward command to device over WiFi
                     └── no  ──▶ RF_TOGGLE <devID> <ON|OFF> ──▶ .77:7777
                                                                     │
                                              managerLayer.fallbackToRf()
                                              (WiFi first, RF fallback)
                                                                     │
                             STATE_UPDATE <devID> <state> ◀──────────┘
                                   │
      RF-integration.mjs updates params + emits device:updated
                                   │
              cloud-bridge sends unsolicited update ──▶ AWS (Alexa state synced)
```

## Changes

### Proxy (`eWeLink-Proxy/nodejs`)

- **`core/storage.mjs`** — new `loadDeviceIdentities()` / `saveDeviceIdentities()`.
  Persists `{ apikey, model, romVersion, alias }` per device to
  `core/devices.json`. The real cloud apikey is only ever observed once, on the
  device's first local registration, so it must survive proxy restarts.
- **`core/config.mjs`** — added `devicesFile: './core/devices.json'`.
- **`core/index.mjs`** — calls `loadDeviceIdentities()` at startup (after
  `loadAliases()`).
- **`plugins/cloud-bridge.mjs`** —
  - Opens a persistent **ManagerLayer TCP link** to `192.168.1.77:7777` and can
    send `RF_TOGGLE <devID> <ON|OFF>`.
  - Persists the device identity to `devices.json` when it learns the apikey
    (`device:registered`).
  - Cloud command handler: if the device's local WS is OPEN → forward as before;
    if **not** → `sendRfToggle()` instead, then send the sequenced ack exactly
    like a real device (this is what stops Alexa saying "not responding").
  - **`device:disconnected` no longer tears the cloud link down** — it keeps the
    ghost connection (or re-establishes it if it had dropped).
  - `romVersion` is now passed through from the device identity instead of being
    read off `sONOFF` at send time (fixes records when the device is offline).

### Server (`.77`)

- **`button2sONOFF/managerLayer.js`** — new `RF_TOGGLE` case in the event-loop
  switch → `fallbackToRf(alias, desired)`:
  - validates state, resolves alias → devID, warns on unknown/invalid,
  - WiFi-first (`sendWifiSet`) then RF fallback (`sendRfToggle`),
  - echoes `STATE_UPDATE <devID> <state>` back to the proxy via
    `broadcastStateToProxy()` and to the local Web UI via
    `broadcastStateToWebUI()`, so the cloud converges on the real state.

## Known/accepted trade-offs

- eWeLink app + Alexa will report the device as **online** while its WiFi is
  down (that is inherent to the ghost connection and is the point of the feature).
  The proxy's own `/devices` API still reports `localOnline: false` for
  observability.
- For RF-capable devices this is a real toggle. For non-RF devices the cloud
  command is acked but nothing physically happens (managerLayer logs
  `no RF code`). Scoped intentionally.

## Verification plan

1. Restart the proxy; confirm `devices.json` is written and cloud links come up.
2. Force one RF-fallback device (e.g. `lavanderia` `1000015767`) offline
   (power-cycle its WiFi) and confirm the cloud WS stays registered.
3. Fire a command from the eWeLink app / Alexa and watch:
   - `[CLOUD] → Device offline, sent RF_TOGGLE fallback` (proxy log),
   - `[EVENT] ... RF_TOGGLE` + `cloud toggle <alias>` (managerLayer log),
   - `STATE_UPDATE` echo back → `[CLOUD] → Sent unsolicited update`.
4. Confirm the physical light toggles and Alexa's state follows.

## Verified live (2026-10-20)

Device under test: **`kitchen`** (`10000157b7`, RF `5EA1A1`).
"WiFi down" simulated by blocking the device's IP (`192.168.1.172`) to the
proxy's WS ports with `iptables` on `.11` (rules removed afterwards).

- Proxy restarted with the device blocked →
  `[CLOUD] Bootstrapped 24 ghost cloud link(s) from persisted identities`,
  `[CLOUD] ✓ Registered 10000157b7`, `/devices` shows
  `localOnline:false, cloudOnline:true` — **the cloud sees the device online
  while its WiFi is dead**.
- User fired real Alexa/App commands (toggle on and off). Both routed:
  - proxy: `[CLOUD] RF_TOGGLE 10000157b7 OFF` / `ON`,
  - `.77`: `cloud toggle kitchen → OFF/ON` + `screen -S arduino433tx -X stuff "s:5EA1A1"`,
  - `.77`: `STATE_UPDATE 10000157b7 OFF/ON` echoed back,
  - proxy: `[CLOUD] → Sent unsolicited update` → cloud/Alexa state synced.
  - **The kitchen light physically toggled both times.**
- Removing the block: the device rejoined (`[MODERN WS] Device 10000157b7 →
  ONLINE`) with the ghost link still up, state already in sync.

### Bug found and fixed during verification

`managerLayer` kept a **stale `deviceConnected = yes`** across a proxy restart
(it never received a `DISCONNECTED` for a device that was offline). First live
commands therefore wasted a WiFi attempt (`cloud toggle kitchen → ON (wifi=yes)`
→ `WiFi failed, falling back to RF`) before the RF path fired — correct but
noisy. Fixed in `RF-integration.mjs`: on (re)connect it now sends `DISCONNECTED`
for devices that are not locally online. Re-tested → `cloud toggle kitchen →
ON (wifi=no)` straight to RF.
