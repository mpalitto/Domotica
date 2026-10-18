# RF Event Fusion — Synchronized Receiver Timestamps

**Project start:** 2026-10-18
**Status:** DECIDED — Option A (SNTP epoch-ms on receivers). Firmware work pending (physical flashing).
**Owner:** Matteo
**Read this first** in any future session before touching RF receiver code or `buttonPressReceiver.sh`.

---

## 1. The idea (crystallized)

Three ideas that were fuzzy together, now separated:

1. **Correlation** — the server must know that N arriving messages are *copies of one
   physical button press*, not N events.
2. **Shared time base** — the timestamp in each message must mean the same thing on every
   node: *wall-clock time when the RF burst's first pulse was heard*, not "ms since I booted".
3. **Quality measurement** — once RF-time and server-arrival-time are both known, the
   difference is per-receiver latency, for free (health + coverage diagnostics).

**Core upgrade in one sentence:** replace receiver-local `millis()` with SNTP-synchronized
epoch-ms of the first pulse, so one button press stops looking like N unrelated events.

### What it unlocks
- **Tier 1:** event fusion (one press → one event + `seen-by` list); act on first arrival
  instead of waiting out the 2 s debounce (latency: ~2 s → ~100 ms); other receivers become
  *confirmation* rather than duplicates to suppress.
- **Tier 2:** per-receiver latency (`arrival − rf_time`) → deaf/dying/slow node detection
  (feeds the watchdog); coverage map (which receiver hears which button → placement).
- **Tier 3 (later):** full-burst capture (all 3–5 repeats), repeat-spacing analytics,
  interference detection.

---

## 2. Current architecture (ground truth from `.77`, 2026-10-18)

```
ESP8266 receivers (nodeMCU-0, nodeMCU-1, ...)   433 MHz LightwaveRF
   │  TCP :1234  —  "0A1400a F4B38D1101 376717863 nodeMCU-1"
   ▼
buttonPressReceiver.sh (socat :1234 + :5678)
   │  preprocess_rfxcom.sh / preprocess_kinetic.sh  → "4B38D 1 RFXCOM"
   │  2 s debounce on last buttID (time-window hack, no event identity)
   ▼
FIFO (logs/button_fifo) → managerLayer.js (:7777) → WiFi-first / RF-fallback
```

- **Message today:** `RECEIVER_ID CODE MILLIS_SINCE_BOOT RECEIVER_NAME` — field 3 is
  per-receiver uptime (e.g. 8.5 days vs 4.4 days for the *same* press), **not comparable
  across receivers, and currently discarded** by the preprocessor.
- **Same press from two receivers (real log):**
  ```
  0A1400a F4B38D1101 738448489 nodeMCU-0   ← forwarded
  0A1400a F4B38D1101 376717863 nodeMCU-1   ← debounced
  ```
- **`socket.js` (port 1234) is DORMANT** — it once did passive per-receiver offset
  calibration (α-filter, per-code offsets). Not running; `RFreceiver.offset` never existed.
- Firmware: `Arduino/RFreceiver_esp8266/` (v2.0 in repo — verify against what is actually
  flashed before editing; live codes show no `-` separator, e.g. `F4B38D1101`).

---

## 3. Decision: Option A — SNTP on the ESP8266

| Option | Verdict |
|---|---|
| **A. SNTP (`configTime()`), epoch-ms in message** | **CHOSEN** — ~1–10 ms LAN accuracy, minimal changes, no protocol handshake |
| B. Server round-trip (NTP-style) calibration | Rejected for now — sub-ms but more complexity both sides; possible future refinement |
| C. Revive passive offset calibration (`socket.js`) | Rejected — jitter-dependent, keeps fragile machinery |

- Receivers keep **UTC** (no TZ on device); convert server-side only for display.
- `.77` has an active NTP client. **Open:** give receivers a LAN-local time source
  (chrony/ntp server on `.77` or the router LXC `.1`) so sync survives WAN outages;
  fallback `pool.ntp.org`.

### Message format v2 (backward compatible)
```
0A1400a F4B38D1101 1760794215123 nodeMCU-1
        └─ code     └─ epoch ms of first pulse (UTC)
```
- Field 3 becomes epoch-ms (13 digits). Server rule: **value ≥ 10¹² → epoch mode (v2
  receiver); smaller / `0` → legacy `millis()` (v1)** → mixed firmware coexists during rollout.
- `0` = "never NTP-synced" → server uses legacy debounce path for that message.
- Field order unchanged → `preprocess_rfxcom.sh` position parsing ([9:5], [14:3], [17:1])
  is unaffected.
- Future (Tier 3): epoch-µs or burst-sequence number can be added as a 5th field without
  breaking v1/v2 parsers.

### Firmware changes (per receiver, ESP8266 Arduino core)
1. `configTime(0, 0, "ntp.<lan-host>", "pool.ntp.org")` in `setup()` (UTC, no TZ/DST).
2. Wait for sync at boot (e.g. `time(nullptr) > 1600000000`, timeout ~20 s → run unsynced).
3. Maintain an anchor pair `(anchor_epoch_ms, anchor_millis)` refreshed on each loop/sync;
   on first valid RF pulse capture `pulse_millis`; at send time:
   `rf_epoch_ms = anchor_epoch_ms + (pulse_millis − anchor_millis)`.
4. Monotonicity guard: never send an epoch lower than the previous one (clamp forward).
5. If never synced → send `0` in field 3.
6. (Optional, Tier 2 polish) sub-ms via `micros()` anchor → epoch-µs.

### Server fusion (bash, in `buttonPressReceiver.sh` — no Python, per project rules)
- Parse field 3; if ≥ 10¹² → epoch mode. `arrival = $(date +%s%3N)`.
- Event table per `buttID`: last event `{rf_epoch, count, first_receiver}`.
  - New rf_epoch − last rf_epoch ≤ **W** → same event: `count++`, do **not** re-forward
    (log as confirmation). Latency `arrival − rf_epoch` logged per receiver.
  - Else → new event: forward to FIFO immediately, record.
- **Act on first arrival** (latency win); later copies are confirmations, not blockers.
- **W initial = 500 ms**, then tune to the *measured* repeat spacing (see §5). A receiver
  may miss repeat #1 and stamp repeat #2 → intra-press spread is quantized by the repeat
  interval, not ms-jitter — W must be ≥ one repeat gap.
- Legacy messages keep the current 2 s debounce path until all receivers are v2.

---

## 4. Rollout plan

1. **Bench:** flash ONE receiver (suggest nodeMCU-1) with v2; dual-run against legacy —
   verify epoch values, sync time at boot, message parse both sides.
2. **Measure** (§5) with one v2 + one v1 receiver.
3. **Flash** remaining receivers opportunistically (physical access required — this is the
   slow part; server stays compatible meanwhile).
4. **Switch** `buttonPressReceiver.sh` fusion window on once ≥2 receivers are v2.
5. **Cleanup:** after all v2, optionally remove the legacy debounce path.

## 5. Pre-flight measurements (can start NOW on v1 firmware)
- Log every message (including debounced ones) with server arrival time → compute
  cross-receiver arrival spread per press → sanity-check the 2 s debounce assumption.
- After first v2 flash: log rf_epoch spread per press → set W; verify ESP8266 SNTP accuracy
  on this LAN (expect ~1–10 ms).

## 6. Open questions
- [ ] NTP source for receivers: LAN-local server (where?) vs WAN pool? Router LXC `.1`
      runs dnsmasq only; `.77` is NTP *client* — who becomes the LAN time master?
- [ ] Quorum policy: act on first arrival (fastest) vs require 2-of-N agreement
      (noise-rejection)? Make it a config knob; default = first arrival + log count.
- [ ] Does `managerLayer.js` want the fused event record (code, t, seen-by, latencies)?
- [ ] Are there really receivers named `nodeMCU-00` / `nodeMCU-10` in the log, or is that a
      TCP-coalescence artifact? (Check before assuming 4 receivers.)

## 7. Discovered issues / fix list (this session, 2026-10-18)
- [ ] `socket.js:27` — `rxOffestFile` typo (undefined var → would crash every 10 min).
      Dormant; fix or archive to `old-scripts/`.
- [ ] `.77` has stale `socat -u TCP-LISTEN:1234` processes (Oct 9/10/14 leftovers) next to
      the live one — hygiene cleanup.
- [ ] `buttonPressReceiver.sh` debounce tracks only the LAST buttID — alternating buttons
      within 2 s bypass the debounce entirely (may be acceptable; note it).
- [ ] `preprocess_rfxcom.sh` position-based parsing is brittle; the timestamp field is
      dropped today (fusion layer will consume it instead).

## 8. How to resume this project in a future session
1. This file: `DOCs/RF-EVENT-FUSION.md` (source of truth).
2. AGENTS.md has a short "Active Project" pointer.
3. Ground truth commands:
   - `ssh root@192.168.1.77 'tail -30 /root/Domotica/LinuxServerScripts/button2sONOFF/logs/buttonPressReceiver.sh.log'`
   - `ssh root@192.168.1.77 'ss -tlnp | grep -E ":1234\b|:5678\b"; screen -ls'`
4. Firmware lives in `Arduino/RFreceiver_esp8266/`; server in
   `LinuxServerScripts/button2sONOFF/buttonPressReceiver.sh`.
