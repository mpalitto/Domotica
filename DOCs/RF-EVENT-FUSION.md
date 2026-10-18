# RF Event Fusion — Synchronized Receiver Timestamps

**Project start:** 2026-10-18
**Status:** DECIDED + FIRMWARE DRAFTED (v2.1, compile-verified on core 3.1.2) — pending: review, USB flash of the two nodes, server-side fusion + `receivers.config`.
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
- Firmware: `Arduino/RFreceiver_esp8266/` (v2.1 = SNTP epoch + chip-id identity). **But the
  deployed nodeMCUs do not run this sketch** — see the hardware note below.
- **KINETIC receiver — `ESP32_RX_01` (identified 2026-10-18).** A separate, self-built receiver:
  an **ESP32** running "CC1101 KINETIC SWITCH DECODER v1.0" with an **E07-M1101D** (TI **CC1101**)
  whose `GDO0 → GPIO13`. Connects to `.77:**5678**` (the KINETIC port), IP `192.168.1.212`, banner
  `ESP32 ESP32_RX_01 connected!`. Messages carry **RSSI**:
  `KINETIC DEFF2E BUTTON_2 ESP32_RX_01 -84dBm`. Has NVS-stored codes (`AB6EDE`, `CCFF0E`), a
  TRAINING mode, and a serial command interface (`n/d/t/l/w/r/c/s/net/?`).
  - KINETIC needs much shorter pulses than LightwaveRF — that is why it is a separate receiver
    (and why the plain OOK path can't handle it). Whether **one** CC1101 can do both is open.
  - **Correction:** an E07-M1101D was seen on the board plugged into the Mac and initially
    assumed to be a deployed nodeMCU. It is *this* KINETIC receiver. The **deployed nodeMCUs' RF
    module is still unverified** — no nodeMCU has been inspected off the wall yet.
- **Possible v2 upgrade path on the CC1101 design:** the CC1101 can run 433.92 MHz **ASK/OOK
  asynchronous serial mode**, so `GDO0` emits the raw demodulated envelope — exactly what
  `decodePulseData()` already consumes. An ESP32/ESP8266 + CC1101 v2 receiver is therefore viable
  and would also provide **RSSI** for per-reception health data. Lower-risk alternative: keep
  building v2 units from SPI-free OOK modules (RXB6), which already works.
- **Mixed fleet works today:** verified — one press parsed from `rx-241002` (v2) *and* both
  v1 nodeMCUs, no server changes.

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

### Message format v2 (backward compatible, one universal image for all receivers)
```
0A1400a F4B38D1101 1760794215123 rx-8c02d7
        └─ code     └─ epoch ms of first pulse (UTC)   └─ chip-derived identity
```
- **Field 1 stays the literal `0A1400a` header** — `preprocess_rfxcom.sh` validates by fixed
  positions ([0:6]=`0A1400`, [9:5], [14:3], [17:1]); do not put anything else there.
- Field 3 = epoch-ms (13 digits). Server rule: **value ≥ 10¹² → epoch mode (v2
  receiver); smaller / `0` → legacy `millis()` (v1)** → mixed firmware coexists during rollout.
- `0` = "never NTP-synced" → server uses legacy debounce path for that message.
- **Field 4 = `rx-XXXXXX`** derived from `ESP.getChipId()` (immutable, unique). **No friendly
  names in firmware** — a reflashed board can never impersonate another, and the same
  compiled image fits every receiver.

### Code field — the 10-char layout (must be preserved; discovered the hard way)
`preprocess_rfxcom.sh` reads the *whole line with spaces* at fixed positions, so field 2 must
be 10 chars: `AAAAAA` (address) + `T` + `BBB` where, from `raw[9:14]`/`raw[14:17]`/`raw[17:1]`,
`SWITCH_ID = code[1:6]`, `BUTTON_TYPE = code[6:9]`, `BUTTON_NUMBER = code[9]`.
- `BUTTON_TYPE ∈ {010,110,100,000}` is **validated but never used**; `code[6]` is a *raw,
  jittery* RF bit. Measured (2026-10-18, 13+ presses of kitchen-column button 1, one press
  seen by all three units): `nodeMCU-0` 13×`…1101`; `nodeMCU-1` 17×`…1101` + 2×`…0101`;
  bench `rx-241002` (RXB6 @3.3 V) 9×`…1101` + 14×`…0101` — i.e. it flips on **every**
  receiver and **must not** be used for identity. (Same run: `rx-241002` sent 23 events vs
  `nodeMCU-0`'s 13 → the 3.3 V RXB6 is in spec and at least as sensitive as the deployed units,
  so bit-level jitter here is decoder variance, not a power problem.)
- **The button is `code[9]`** and the routing key is `code[1:6] + code[9]` (e.g. `4AA0D` + `1`).
- ⇒ **Fuse on the normalized buttonID, not the raw code string.**

### Identity → location mapping (server-side `receivers.config`)
Friendly names live on `.77`, same spirit as `sONOFF.config`:
```
# chipID : friendly-name : location : notes
rx-8c02d7 : nodeMCU-laundry : laundry    : by the fuse box
rx-3f2a1b : nodeMCU-living  : living rm  : near south wall
```
Applied at log/forward time in `buttonPressReceiver.sh` → logs, watchdog and managerLayer
see `nodeMCU-laundry`; the chip ID is only the machine key. Renames/moves = edit config,
never reflash.

**How a chip ID gets mapped to a room (three ways, in order of use):**
1. *Flash-time ritual (initial)*: flashing v2 requires USB anyway — the device in your hand
   prints `rx-XXXXXX` on serial at boot; write the config line while you hold it. Impossible
   to mix up.
2. *Power-cycle probe (fallback, zero tooling)*: unplug the box you're standing at →
   whichever `rx-XXXX` disappears from the log is that box.
3. *IDENTIFY command (daily driver)*: `identify.sh rx-XXXX` on `.77` pushes `ID` down the
   receiver's **existing** TCP connection (TCP is bidirectional; v1 just never used the
   return path) → firmware blinks the built-in LED 10× (GPIO2, active-low) and replies
   `<id> IDENTIFY OK`. ~15 lines of firmware + bidirectional-izing the socat listener
   (currently `socat -u`, unidirectional — needs an exec-wrapper with a per-connection
   FIFO; still pure bash).
- Future (Tier 3): epoch-µs or burst-sequence number can be added as a 5th field without
  breaking v1/v2 parsers.

### Firmware changes — v2.1 (2026-10-18; flashed & verified on bench D1 mini `rx-241002`)
1. ✅ `configTime(0, 0, NTP_SERVER_1, NTP_SERVER_2)` in `setup()` (UTC, no TZ/DST);
   wait up to 15 s at boot for sync, else run unsynced and send `0`.
2. ✅ RF-time stamp: `nowEpochMs()` captured at the first valid pulse of the burst
   (`waitForValidPulse`), monotonic guard at send (never run backwards).
3. ✅ Identity: `rx-%06x` from `ESP.getChipId()`; field 1 stays the `0A1400a` header.
4. ✅ ArduinoOTA (hostname = rx-id, password in `secrets.h`) — future updates over WiFi.
5. ✅ IDENTIFY listener: poll `espClient.available()` in loop; `ID` → blink LED 10× →
   reply `<id> IDENTIFY OK`.
6. ✅ `secrets.h` (gitignored, template in `secrets.h.example`): WiFi creds, OTA password,
   NTP servers. Default `pool.ntp.org` + `time.google.com` pending the LAN-time-source
   open question (§6).
7. ✅ RF decode pipeline **restored to the original (YUN) algorithm**. The ESP8266 port had
   silently broken it — see the code-format bug in §7. Both the deployed v1 units and this
   firmware now emit the same server-parseable 10-char code.

**Bench verification (2026-10-18, D1 mini + RXB6, id `rx-241002`):** boots, joins WiFi
(`NathanielPI`, 2.4 GHz, WPA2), SNTP syncs (UTC epoch), OTA armed, TCP to `.77:1234` OK.
A real press emitted `0A1400a F4AA0D0101 1792347373298 rx-241002` and the server parsed it to
buttonID `4AA0D 1 RFXCOM` — identical to the legacy units; it was only **debounced** because
`nodeMCU-0` reached the FIFO first (exactly the 2 s hack fusion removes).

**Measured fit (nodemcuv2, core 3.1.2, default 4M2M dual-OTA layout):**
| Resource   | v1        | v2.1      | Delta |
|------------|-----------|-----------|-------|
| IROM/app   | 249.7 KB (23% of 1 MB slot) | 290.4 KB (27%) | +41 KB (OTA+SNTP+IDENTIFY) |
| IRAM       | 60,375 (92%) | 60,919 (92%) | +544 B — OTA lives in flash |
| RAM globals| 30.1 KB (37%) | 31.1 KB (38%) | +1 KB |

Flash/OTA upload: `arduino-cli upload -p <port> --fqbn esp8266:esp8266:nodemcuv2 Arduino/RFreceiver_esp8266/`
(afterwards: `arduino-cli upload -p <port> --fqbn esp8266:esp8266:nodemcuv2 --input-dir ...` or `espota.py -r` for OTA).

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

1. **Bench:** flash ONE receiver (whichever box is nearest — identity is now chip-derived,
   so it no longer matters which image goes on which unit); serial banner prints the
   `rx-XXXXXX` id → **write the `receivers.config` line while the device is in hand**
   (flash-time mapping ritual, §3). Dual-run against the legacy node — verify epoch values,
   sync time at boot, IDENTIFY blink, message parse both sides, OTA reachable.
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

### RXB6 sensitivity — test log (2026-10-18, bench unit `rx-241002`)

Protocol: set a line-count marker on `.77` (`buttonPressReceiver.sh.log`), user presses by
hand, then count `0A1400a` lines per sender for that remote's code. Receptions ≈ sensitivity:
every unit sends once per press on its first clean decode, and *debounced* lines are still
logged, so the count is what each receiver actually heard. (Serial capture of the bench unit
via `screen -L` is verified working — a board reset shows the full boot banner.)

| test | remote | `nodeMCU-0` | `nodeMCU-1` | `rx-241002` | note |
|---|---|---|---|---|---|
| near | `4AA0D` b1 (kitchen column) | 13 | 19 | 23 | bench unit sits next to this switch → **not** a fair comparison |
| mid | `4A85C` b1 (P-letto-Matteo) | 7 | 6 | 9 | bench unit heard the **most** of the three |
| far | `4A77D` b4 (BL-disimpegno) | 13 | 15 | **0** | opposite end of the house; bench heard nothing |

Reading: the bench RXB6 out-hears both nodeMCUs at near *and* mid range and only drops out at
the far end — consistent with a healthy radio in a spot that can't reach the bilocale (the
nodeMCUs, which heard the bilocale remote *better* than the bedroom one, are evidently nearer
that end). Not evidence of a weak module.

Also measured (same near run): within one press the remote's repeated frames decode **70–270 ms**
apart; between presses the gap is **1.9–6.7 s** → a fusion window of a few hundred ms merges
receivers with wide margin, and `code[6]` jitters on *every* unit (see §3) so fusion must key
on the normalized buttonID.

**Caveats before drawing conclusions about the radio:** the bench unit still has the **coiled
spring antenna** the RXB6 ships with (not a straight 17.3 cm ¼-wave) *and* sits beside a
computer — both cost several dB. Next steps: (1) swap in a straight 17.3 cm wire, vertical,
clear of metal, re-run the far test; (2) **co-located A/B** — run `rx-241002` headless on a USB
charger beside a nodeMCU for a few hours and compare counts at identical geometry. Do **not**
conclude the RXB6 is worse until (2) runs; a superhet RXB6 should out-hear the cheap modules.

## 6. Open questions
- [ ] NTP source for receivers: LAN-local server (where?) vs WAN pool? Router LXC `.1`
      runs dnsmasq only; `.77` is NTP *client* — who becomes the LAN time master?
      (v2.1 defaults to `pool.ntp.org` + `time.google.com` in `secrets.h` until decided.)
- [ ] Quorum policy: act on first arrival (fastest) vs require 2-of-N agreement
      (noise-rejection)? Make it a config knob; default = first arrival + log count.
- [ ] Does `managerLayer.js` want the fused event record (code, t, seen-by, latencies)?
- [ ] Are there really receivers named `nodeMCU-00` / `nodeMCU-10` in the log, or is that a
      TCP-coalescence artifact? (Check before assuming 4 receivers.)
- [ ] `identify.sh` listener design: replace `socat -u TCP-LISTEN:1234` with a
      bidirectional exec-wrapper (per-connection FIFO for outbound commands), still bash.
      Needs care: must not break the `while read` pipeline in `buttonPressReceiver.sh`.

## 7. Discovered issues / fix list (this session, 2026-10-18)
- [x] **Firmware decode bug (FIXED 2026-10-18).** The ESP8266 "refactor" replaced the original
      YUN decode (`notMantained/YUN-LWRF-receiver-v0.2`, 9 nibbles + `1000-→0100`,
      `10F0-→1002`, `12F2-→1003`, `14F2-→1005`, …) with a truncated 6-nibble buffer + a
      nonsense table. Receivers emitted `F4AA0D-` → server logged `buttonID: INVALID` and
      **silently dropped every v2 press**. Restored the original algorithm in
      `decodePulseData()` (10-char code, `code[6]` = raw bit, dash stripped). Verified on the
      bench D1 mini: server now logs `buttonID: 4AA0D 1 RFXCOM` for our line.
      *(The `bak.Domotica` copy on `.77` and the repo both contain the broken version — the
      correct logic only survives in `notMantained/`. Do not "refactor" this again.)*
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
4. Firmware lives in `Arduino/RFreceiver_esp8266/` (v2.1 = committed, flashed & verified);
   server in `LinuxServerScripts/button2sONOFF/buttonPressReceiver.sh`.
   - Bench unit: D1 mini + RXB6, id **`rx-241002`** (still needs its `receivers.config` line).
   - Serial capture on macOS: `screen -L -dmS cap /dev/cu.usbserial-* 115200`, then read
     `screenlog.0`. `arduino-cli monitor` reads zero bytes here, and opening the port does
     **not** reliably reset the board — have the sketch print on a loop instead.
5. Toolchain on the Mac (installed 2026-10-18): `arduino-cli` + `esp8266:esp8266` core 3.1.2.
   - compile: `arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 Arduino/RFreceiver_esp8266/`
   - USB flash: `arduino-cli upload -p /dev/cu.usbserial-* --fqbn esp8266:esp8266:nodemcuv2 Arduino/RFreceiver_esp8266/`
   - serial: `arduino-cli monitor -p /dev/cu.usbserial-* -c baudrate=115200`
   - OTA flash (after first USB flash): hostname = `rx-XXXXXX`, password from `secrets.h`
