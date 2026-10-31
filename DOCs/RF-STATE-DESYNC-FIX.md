# RF button "toggle every other press" — managerLayer state-desync fix

Status: **deployed and verified live** (2026-10-31)

## Problem

RF wall buttons (bagnetto, kitchen-column, **dining** / fridge-wall) sometimes
toggled **every other press** — one press did nothing ("already in sync…
skipping"), the next did the toggle. Every RF press was forwarded to the FIFO
exactly once (`forwarded=1`), so the fusion layer was **not** at fault. The
fault was downstream, in `button2sONOFF/managerLayer.js`.

## Root cause

`syncDevice()` wrote the new state to `deviceState[devID]` — a **dead key**,
because `deviceState` is keyed by **alias** (`deviceState[alias] = 'OFF'` at
config load). So the authoritative `deviceState[alias]` was refreshed only by the
async, racy device `STATE_UPDATE` feedback — which can arrive **late**, **not at
all** (device briefly offline), or as a **stale mid-switch reading**. When it was
missing/stale, the next press saw the old state and either skipped or toggled the
wrong way.

## Fix (commit `5de6352`) — optimistic write + mid-switch guard

`syncDevice()` wrote `deviceState[alias] = desired` synchronously (the
authoritative key) and added a `STATE_SETTLE_MS = 500` guard in the
`STATE_UPDATE` handler: a contradictory reading arriving **< 500 ms** after we
commanded the device is a **mid-switch reading** (relay not yet flipped) and is
ignored; the device's real state is trusted **after** that window.

## Update (commit `8482d8f`) — guard removed; device report is source of truth

The 500 ms guard and the optimistic WiFi write were both **removed**. For a
WiFi-connected device the device's own `STATE_UPDATE` is now the single source
of truth and updates `deviceState[alias]` directly; the WiFi path just sends and
returns, leaving state to the device's report.

**Why this is safe:**

- The guard **never fired** in the whole production log (0 mid-switch readings
  for dining / kitchen / bagnetto).
- WiFi feedback is **100% reliable and synchronous** — every command is followed
  by the device's matching report the very next log line, and the reports never
  conflict with what we commanded. So waiting for the report is fine.
- The RF branch still records state optimistically, because RF has **no device
  feedback** — the device never reports back, so the optimistic write is the only
  signal.

Live test after the change (kitchen column button `4AA0D 1` → kitchen, device
`10000157b7`): **6 presses → 6 clean single toggles**, each followed by a matching
device `STATE_UPDATE`, **0 skips, 0 guard firings**.

### Current code (post-`8482d8f`)

WiFi path — do **not** store state; let the device's `STATE_UPDATE` record it:

```js
await sendWifiSet(devID, desired);
// device's STATE_UPDATE is the source of truth and updates deviceState[alias]
return;
```

RF path — record state ourselves (RF has no device feedback):

```js
sendRfToggle(deviceRfCode[alias]);
deviceState[alias] = desired;   // RF device never reports back
```

`STATE_UPDATE` handler — guard removed; trust the device's reported state:

```js
case 'STATE_UPDATE': {
  deviceState[alias] = value;   // source of truth
  if (isLocalWebUI(socket)) broadcastStateToProxy(devID, value);
  break;
}
```

## Notes

- Production SONOFFs are WiFi-connected (`deviceConnected === 'yes'`), so this
  path covers them. RF-fallback (offline) devices take the RF branch, which
  records state optimistically (no device feedback to trust).
- Restart `managerLayer.js` (screen session `managerLayer.js`) after any future
  edit; see `DOCs/RF-EVENT-FUSION.md` §8.