# RF button "toggle every other press" — managerLayer state-desync fix

Status: **deployed and verified live** (2026-10-31)

## Problem

RF wall buttons (bagnetto, kitchen-column, **dining** / fridge-wall) sometimes
toggled **every other press** — one press did nothing ("already in sync…
skipping"), the next did the toggle. Every RF press was forwarded to the FIFO
exactly once (`forwarded=1`), so the fusion layer was **not** at fault. The
fault was downstream, in `button2sONOFF/managerLayer.js`.

## Root cause

`syncDevice()` wrote the new state to `deviceState[devID]`:

```js
await sendWifiSet(devID, desired);
deviceState[devID] = desired;   // BUG: deviceState is keyed by alias, not devID
```

But `deviceState` is keyed by **alias** (`deviceState[alias] = 'OFF'` at config
load), so that write landed in a **dead key** and never updated the authoritative
state. The authoritative `deviceState[alias]` was therefore refreshed only by the
async, racy device `STATE_UPDATE` feedback — which can arrive **late**, **not at
all** (device briefly offline), or as a **stale mid-switch reading**. When it was
missing/stale, the next press saw the old state and either skipped or toggled the
wrong way.

## Fix (`button2sONOFF/managerLayer.js`)

1. `syncDevice()` now writes the **authoritative** key synchronously, so state is
   correct the instant we send — no longer dependent solely on late feedback:

   ```js
   await sendWifiSet(devID, desired);
   deviceState[alias] = desired;   // authoritative key is alias, not devID
   lastCommandTime[alias] = Date.now();
   return;
   ```

2. `STATE_SETTLE_MS = 500` + a `lastCommandTime[alias]` map gate the
   `STATE_UPDATE` handler: a contradictory reading arriving **< 500 ms** after we
   commanded the device is a **mid-switch reading** (relay not yet flipped) and is
   ignored (logged as `ignoring mid-switch reading for …`); the device's real
   state is trusted **after** that window. This keeps the device's reported state
   as the source of truth while stopping a transient from flipping it back.

## Verification

Live test on the real system, `managerLayer.js` log, fridge-wall button
(`4A0E9 5` → dining, device `10000157df`):

```
switching dining: OFF → ON   → STATE_UPDATE … ON
switching dining: ON → OFF   → STATE_UPDATE … OFF
switching dining: OFF → ON   → STATE_UPDATE … ON
switching dining: ON → OFF   → STATE_UPDATE … OFF
```

Each press toggled **exactly once**, no `"already in sync… skipping"`, and every
toggle was followed by a matching report from the physical device. Zero
`"already in sync"` skips remain in the whole production log.

## Notes

- Production SONOFFs are WiFi-connected (`deviceConnected === 'yes'`), so this
  path covers them. RF-fallback (offline) devices are unaffected — they take the
  RF branch, which also writes `deviceState[alias]` and records the command time.
- Restart `managerLayer.js` (screen session `managerLayer.js`) after any future
  edit; see `DOCs/RF-EVENT-FUSION.md` §8.