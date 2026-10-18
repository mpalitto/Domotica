# RF Event Fusion — Synchronized Receiver Timestamps

**Project start:** 2026-10-18
**Status:** FIRMWARE **v2.2** DEPLOYED on every receiver that can take it, **SERVER-SIDE FUSION
LIVE** (epoch fusion running in `buttonPressReceiver.sh`, unit-tested + smoke-tested on `.77`).
On v2.2: `rx-55d68f` (laundry — the former `nodeMCU-1`; OTA'd from `.77`) and `rx-241002`
(fridge — OTA was wedged (§7 "OTA") so it was reflashed **over USB from the Mac** on 2026-10-18;
both framing-**wire-verified** on `.77:1234`). Still on v1: **`nodeMCU-0`** only = **`rx-058ef5`**
(id predicted from its MAC, staged as `rf-central`; v1 has **no OTA at all**, so USB is mandatory
for it) — the last blocker for `FUSION_ENABLED=1`. **v2.2 fixed a ~13 % silent message loss**
caused by line framing (§7). See §3 "Server fusion (as built)" and §9 "Next".
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
   │  epoch fusion (v2) + 2 s debounce (v1)  →  ONE logical event per press
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
- Firmware: `Arduino/RFreceiver_esp8266/` (**v2.2** = SNTP epoch + chip-id identity + single-write
  line framing). **But not every deployed node runs this sketch** — see the hardware note below.
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

**v2.2 (2026-10-18)** — one change: `sendLine()` frames every outgoing line (payload **+** `\r\n`)
in a **single `write()`**, fixing the ~13 % interleaving loss (§7). Nothing else changed. OTA'd to
`rx-55d68f` from `.77` and wire-verified with `tools/rf-frame-check.py`.

Flash/OTA upload (verified recipes):
- **USB:** `arduino-cli upload -p /dev/cu.usbserial-* --fqbn esp8266:esp8266:nodemcuv2 Arduino/RFreceiver_esp8266/`
- **OTA (needs a v2 firmware already running — v1 has no OTA at all):** run `espota.py` **from
  `.77`**, never from the Mac Wi-Fi (§7 "OTA"):
  `arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 --output-dir /tmp/rfbin Arduino/RFreceiver_esp8266/`
  → copy `RFreceiver_esp8266.ino.bin` and the core's `tools/espota.py` to `.77:/tmp` →
  `python3 /tmp/espota.py -i <receiver-ip> -p 8266 -a '<OTA_PASSWORD from secrets.h>' -f /tmp/rfbin/RFreceiver_esp8266.ino.bin`
  (retry a few times; success prints `Result: OK`).

### Server fusion (as built 2026-10-18 — bash only, in `buttonPressReceiver.sh`)
Live on `.77` since 21:50. `BASE_DIR` is now overridable and the listeners only start when the
script is **executed** (not sourced) — that is what makes it unit-testable.
- Parse the message; **v2 iff** header is `0A1400a` *and* field 3 is ≥ 13 digits → epoch mode.
  Everything else (v1 `millis()`, KINETIC) follows the untouched legacy path.
- Group state per port subshell: `{key, server_t0, first_epoch, count, seen[], forwarded}`.
- **Same key within `FUSION_WINDOW_MS` → fused**: not re-forwarded, just counted, and logged with
  `skew` (receiver epoch − group's first epoch, i.e. RF-time skew) and `lag` (server now −
  receiver epoch, i.e. **end-to-end latency**). A large or negative `lag` = that receiver's SNTP
  is off → clock problems surface in the log instead of as mystery dropped presses.
- **Act on first arrival** (latency win); later copies are confirmations, not blockers.
- **`W` is 1000 ms** — not the 500 ms first guessed. Measured intra-press repeat spacing is
  70–270 ms and a receiver may lock onto repeat #2 or #3, so the *spread* is quantized in whole
  repeat intervals (≈ up to 800 ms worst case) while separate presses are ≥ 1.9 s apart. 1000 ms
  therefore fuses the slowest realistic case with margin. Knob: `FUSION_WINDOW_MS`.
- The legacy 2 s debounce is **kept as the forwarding gate** while any v1 receiver is in the
  fleet (that is what stops a v1 + v2 pair from toggling a light twice). `FUSION_ENABLED=1`
  swaps that gate to the tight `FUSION_WINDOW_MS` for v2 events — **only enable it once every
  receiver speaks v2**.
- Friendly names come from `config/receivers.config` (`chipID : friendly-name : location`),
  falling back to the raw `rx-XXXXXX` for unmapped receivers.

Log shape per press (real smoke test on `.77`, three crafted receptions):
```
press start (recv=rxtest-01 epoch=1792353045448 lag=102ms)
fusing (recv=rxtest-02 skew=40ms lag=107ms n=2)
FUSED FFFFE1RFXCOM n=2 forwarded=1 via=rxtest-01@0ms,rxtest-02@40ms
```
`managerLayer.js` received exactly the two logical events (and, with a test address absent from
`buttons.config`, logged `devices -->` empty → **no light was toggled** by the test).

#### Reading the fusion log — two traps (both hit for real on 2026-10-18)
1. **`FUSED` is printed when the group *closes*, i.e. on the next *different* press** — not when
   the press happens. `flush_fusion` runs in step 4, just before a new group is opened, so the
   `FUSED …` line appears *after* the new press's `buttonID:` line and can describe a group from
   minutes earlier (observed: a 22:59 group logged at 23:07, which reads as a misattribution but
   is not one). Read `FUSED` as "the *previous* group is now complete". A group that never
   receives a second copy (`COUNT > 1`) prints nothing at all.
2. **A v1 reception cannot *open* a group** — it has no comparable epoch, so only a v2 event sets
   the group key. If the v1 copy arrives first it simply goes down the legacy debounce path and is
   forwarded; the group is then opened by the first v2 arrival, and the v1 copy joins afterwards
   as a `legacy-stamp` confirmation. So `n=` counts only copies that arrived *after* the group
   opened: an early v1 copy is a *forwarding*, not a *count* (live example: press 1 of `4AA0D` gave
   `n=2` naming only `rf-laundry` and `rf-fridge`, although `nodeMCU-0` had also heard it).
   Related: with `FUSION_ENABLED=0` the fusion path never forwards, so **`forwarded=0` is the
   normal value on every `FUSED` line** — the legacy debounce did the forwarding instead.

### Test harness (`LinuxServerScripts/button2sONOFF/test_fusion.sh`)
`bash test_fusion.sh` — sources the real script with a stubbed clock and fixture receivers, no
`.77`, no socat, no radios. Covers: mixed v1+v2 fusion (4 receptions → 1 forward + a `FUSED`
summary listing `nodeMCU-0@v1`), the legacy debounce still swallowing a stale v1 re-report, the
`FUSION_ENABLED=1` tight window letting a real second press through, the **KINETIC regression
path**, and invalid input. Runs green on macOS and on `.77` (bash 5.2).

---

## 4. Rollout plan

1. ✅ **Bench:** flash ONE receiver (whichever box is nearest — identity is now chip-derived,
   so it no longer matters which image goes on which unit); serial banner prints the
   `rx-XXXXXX` id → **write the `receivers.config` line while the device is in hand**
   (flash-time mapping ritual, §3). Dual-run against the legacy node — verify epoch values,
   sync time at boot, IDENTIFY blink, message parse both sides, OTA reachable.
   → done on the bench D1 mini (`rx-241002`), then **installed at the fridge** (IP `.231`).
2. ✅ **Measure** (§5) with one v2 + two v1 receivers — done, see §5 (also gave the window `W`).
3. ✅ **Server-side fusion** built, unit-tested and deployed (§3). The deployed nodeMCUs still
   run v1 and are untouched by it.
4. 🔄 **Flash** remaining receivers to v2 (physical access required — the slow part; server stays
   compatible meanwhile). **Then** flip `FUSION_ENABLED=1` in `buttonPressReceiver.sh` (or export
   it) and restart the receiver.
   → 2026-10-18: the laundry unit (`nodeMCU-1`, IP `.208`) was taken down, the deployed v1
   firmware **backed up** (`esptool read_flash`, full 4 MB; the sketch itself was also recovered
   from git — see §8), reflashed to v2.1, mapped as **`rx-55d68f : rf-laundry`**, then OTA'd to
   **v2.2** from `.77`.
   → 2026-10-18 (later): the fridge unit `rx-241002` (`.231`), stuck on v2.1 with a **wedged OTA
   listener** (§7), was brought to the Mac and **USB-flashed to v2.2** (no backup needed — v2.1 is
   reproducible from this repo). Boot banner `Version: 2.2 … id: rx-241002`, and its hello was
   captured as **one** 21-byte TCP segment on `.77:1234` (`tools/rf-frame-check.py`).
   → 2026-10-18 (later): **field OTA test on the reinstalled laundry unit — NEGATIVE result.**
   From its final in-situ position, `espota.py` on `.77` got the UDP handshake (`AUTH` on the
   *first* invitation, twice) but the real 326 KB transfer **never completed**: three attempts
   timed out at invitation/AUTH, the fourth authenticated and began uploading and never reached
   `Result: OK`. Worse, the unit then became **unreachable from `.77`** (ping 0/15, UDP 8266 dead)
   while remaining perfectly alive for every other host (`.1`, `.11`, `.33` all pinged it 15/15).
   It **recovered by itself on its next RF press** (§7 "OTA" #4 has the forensics).
   ⇒ **Do not OTA a field unit**; for installed receivers USB is the only deterministic path.
   Remaining: **`nodeMCU-0` only**.
5. ⬜ **Cleanup:** after all v2, optionally remove the legacy debounce path.

### Operational note — receivers reconnect **lazily**
`ensureSocketConnection()` is called from `sendDataToServer()` (`RFreceiver_esp8266.ino:270`),
i.e. a receiver opens its TCP connection at boot and, if that socket is broken, reconnects
**on its next transmission**. Consequence: after restarting `buttonPressReceiver.sh` (or booting
`.77`) the fleet shows **no connections until each unit's next button press**, and `ss` on
`:1234` deliberately looks empty in the meantime. This is pre-existing v1 behaviour, not a
regression — just do not read "no connections" as "receivers are down". The KINETIC ESP32
reconnects on its own (it retries and re-sends its boot banner, which the RFXCOM preprocessor
correctly logs as `INVALID` and ignores).

**Zombie sockets (cosmetic, 2026-10-18).** There is no TCP keepalive and no app-level heartbeat,
so a receiver that is power-cut or reset leaves its server-side connection `ESTAB` forever, each
one holding a `socat` child (roughly one per reboot). `ss` therefore never proves liveness — the
log (and the per-receiver `lag`) does. The listeners use `fork`+`reuseaddr`, so zombies never
block or starve new connections; they are just clutter in `ps`. Future nicety: SO_KEEPALIVE or an
idle timeout on the listener to reap them. Note v2.x also sends a `<rx-id> connected` hello line
on connect (visible in the log); the RFXCOM preprocessor logs it as `INVALID` and ignores it.

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
- [x] Quorum policy: **first arrival + log count** (2026-10-18) — the first reception is
      forwarded immediately and later copies are logged as confirmations. Rejecting noise is
      still possible later via `FUSION_ENABLED`/window tuning, but nothing needs 2-of-N today.
- [ ] Does `managerLayer.js` want the fused event record (code, t, seen-by, latencies)? Today it
      only gets the normalized `buttonID`, so the health data lives in the receiver log.
- [x] **RESOLVED 2026-10-18 — no such receivers exist.** `nodeMCU-00` / `nodeMCU-10` were a
      TCP-framing artifact, not extra boxes: two messages had been concatenated into one line.
      See §7 "Line framing". Do not go looking for a fourth receiver.
- [ ] `identify.sh` listener design: replace `socat -u TCP-LISTEN:1234` with a
      bidirectional exec-wrapper (per-connection FIFO for outbound commands), still bash.
      Needs care: must not break the `while read` pipeline in `buttonPressReceiver.sh`.
      **Firmware half already exists**: v2.x `handleIncoming()` reads a line from the socket and
      answers `ID` with an LED blink + `<rx-id> IDENTIFY OK` (TCP is already bidirectional — only
      the server wrapper is missing). Nice-to-have while we're there: put the **firmware version**
      in the reply, so the whole fleet can be audited remotely (that is what would have made the
      fridge's wedged-OTA state visible without a packet sniffer).
- [x] **RESOLVED 2026-10-19 — OTA stays in the firmware, demoted to a bench-only tool.**
      Prompted by the failed field test (§7 "OTA" #4) and the obvious question "then should we just
      delete OTA?": **no.** Bench OTA works (v2.1→v2.2 on `rx-55d68f`), so nothing is broken — what
      fails is the *transport* at installed positions (sleepy/marginal Wi-Fi vs a 326 KB download),
      and deleting the code would not fix that, it would only remove the one remote path we have.
      The cost of keeping it was measured, not guessed (A/B compile, `esp8266:esp8266:nodemcuv2`,
      2026-10-19): **flash 290,540 → 251,816 B (−37.8 KB, 27%→24%), IRAM 60,919 → 60,375 (−544 B,
      92%), global RAM 31,152 → 30,512 (−640 B)**. So keeping OTA costs 4% of the app slot plus
      **12% of the remaining *free* IRAM** (4617 → 5161 B) — IRAM being the resource that matters
      (RF decode must stay ISR-resident). Against that, *removing* it costs a **physical USB trip
      for every installed unit** — starting with the laundry — which is exactly what OTA exists to
      avoid. **Decision: keep it, use it only on the bench**; removal can ride along with the next
      firmware change that needs USB anyway (or be reconsidered if IRAM headroom becomes the
      binding constraint). If field OTA ever becomes a requirement, fix the transport rather than
      the feature: `WiFi.setSleepMode(WIFI_NONE_SLEEP)` (units are mains-powered, so the power cost
      is irrelevant), the straight ¼-wave antenna (§5), and an OTA-stall watchdog so a dead
      transfer reboots instead of wedging the listener. Test any such change on the **fridge at its
      kitchen spot** — reachable by hand — never on the laundry.

## 7. Discovered issues / fix list (this session, 2026-10-18)
- [x] **Line framing: ~13 % of receptions were silently dropped (FIXED 2026-10-18 — firmware v2.2
      + server-side CR strip).** `espClient.println()` issues the payload and the `\r\n`
      terminator as **two separate writes**, i.e. potentially two TCP segments. Server-side one
      `socat` child per connection writes into a *single shared* pipe
      (`socat -u TCP-LISTEN:…,reuseaddr,fork STDOUT`), so when two receivers answered the same
      press their chunks could interleave: the second receiver's message landed **inside** the
      first receiver's line, between its payload and its terminator. The positional parser then
      consumed only the first message and **silently dropped the other**, and the stranded
      terminator surfaced as a junk line (`^M` → `buttonID: INVALID`).
      Measured in `logs/buttonPressReceiver.sh.log`: **2 992 of 22 527 receptions (~13 %)**.
      This is also the explanation for the phantom `nodeMCU-00` / `nodeMCU-10` ids (§6).
      Fix, both halves:
      - firmware **v2.2**: `sendLine()` writes payload+terminator in ONE `write()`; used for RF
        data, the connect hello and IDENTIFY. **Do not reintroduce `println()` on the socket** —
        the comment above `sendLine()` carries the full story.
      - `buttonPressReceiver.sh`: strip the stray `\r` from the parsed fields (`CR=$'\r'`), which
        otherwise leaked into the fusion record (`via=nodeMCU-0\r@v1`) whenever an *unmapped*
        receiver id was echoed verbatim.
      Regression test: `test_fusion.sh` Run E.
      **Wire-verified 2026-10-18** (raw-socket sniffer on `.77` = `tools/rf-frame-check.py`,
      because `.77` has no `tcpdump`): a reset of the v2.2 bench board produced
      `192.168.1.208:52051 -> 192.168.1.77:1234  flags=0x18 len=21  payload=b'rx-55d68f connected\r\n'`
      — the whole line, terminator included, in **one** TCP segment (the same `sendLine()` path
      RF data uses). Do not reintroduce a second write per line.
      **Same-press contrast — the clearest evidence of all (2026-10-18, press of `4AA0D`).**
      One press, three receivers, all captured on `.77:1234`:
      - `nodeMCU-0` (v1): `len=38 b'0A1400a F4AA0D1101 760276312 nodeMCU-0'` **followed 9 ms later
        by** `len=2 b'\r\n'` — the old two-write split, live and undeniable;
      - `rx-55d68f` and `rx-241002` (v2.2): `len=44 b'0A1400a F4AA0D0101 <epoch-ms> rx-XXXXXX\r\n'`
        — one complete segment each.
      And a press of `4A89A` captured the damage on the server side: the v1 fragment became part of
      the *next* line —
      `0A1400a F4A89A1101 760010212 nodeMCU-00A1400a F4A89A0101 1792357636497 rx-55d68f`.
      **That merged line is the bug; `nodeMCU-0` must be flashed to stop producing it.**
- [x] **OTA: works, but it is a one-shot protocol with two nasty failure modes (2026-10-18,
      verified from `.77`).** `espota.py` (bundled with core 3.1.2) does
      invitation → `AUTH <nonce>` → `AUTH <cnonce> <digest>` → `OK` over **UDP 8266**, then the
      image moves over TCP; on success the ESP prints `Result: OK` (the `Update` library
      md5-checks the image, so `Result: OK` really does prove the new firmware is installed).
      1. **Run it from `.77`, not the Mac.** The Mac (`.235`, Wi-Fi) sent invitations the ESP
         answered, but the reply never got back to the Mac (`No Answer`); the identical command
         from `.77` (wired) succeeded on the 1st/2nd try. Copy `espota.py` + the `.bin` to
         `.77:/tmp` and run `python3 /tmp/espota.py -i <ip> -p 8266 -a <OTA_PASSWORD> -f <bin>`
         (its own `-a`, not arduino-cli's `--auth`).
      2. **A lost `AUTH` datagram wedges the state machine.** The ESP is left in `OTA_WAITAUTH`;
         the *next* invitation is then silently swallowed (`cmd != U_AUTH` → `_state = OTA_IDLE;
         return;` — no reply at all). Retrying the whole command clears it: the bench board took
         2 attempts, and `08:42`→`08:43` failures were pure UDP loss on the sleepy Wi-Fi.
      3. **If the transfer dies after `Update.begin()`, the OTA listener can stay dead for good**
         — the `UdpContext` is never re-armed, so the unit answers **nothing** on UDP 8266
         (the fridge unit ignored **16** invitations over ~6 min). **Only a reboot / power cycle
         clears it.** ⇒ Never start an OTA you can't finish, and for a unit in the field treat
         **USB as the deterministic path**, OTA as the convenience. A wedged unit is otherwise
         still a perfectly healthy *receiver* (the fridge kept feeding `.77:1234` throughout).
      Diagnose with `tools/rf-frame-check.py --udp 8266` (dumps the handshake) or by repeating a
      hand-rolled invitation (see §8).
   4. **From a real field position the transfer does not complete — and it breaks the
      `.77`→unit direction until the unit next transmits (2026-10-18, laundry `rx-55d68f`
      reinstalled in the laundry room).** Observed sequence: 3 failed attempts (2× `No Answer`,
      1× `No Answer to our Authentication`), then `Authenticating...OK` + upload started → no
      `Result: OK`. Afterwards `.77` could not even ping the unit (0/15) and the handshake got
      **no reply to 10 invitations**, while `.1`/`.11`/`.33` pinged the same unit 15/15 and the
      unit still answered `.77`'s ARP (`neigh … REACHABLE`) — i.e. **`.77`→unit *unicast* was
      dropped while *broadcast* got through.** Forensics (why this is *not* an ARP/neighbour
      fault on the ESP): a **fresh source IP** on `.77` (secondary `.250`, same MAC) failed
      identically, a repeated gratuitous-ARP nudge changed nothing, and a bridge-side sniff on
      `.33` saw **zero** frames for the unit's MAC (`.77` is not on `.33`'s bridge — its MAC is
      learned on the LAN uplink `enp1s0`). Conclusion: a stale **L2 forwarding entry along
      `.77`'s path** for the unit's MAC, which the unit's own traffic then refreshed — after the
      next button press (`rx-55d68f connected` in the log) `.77` pinged it **6/6** and the
      handshake answered on the 1st invitation. *(A "handshake-only" probe is the safe way to test
      OTA reachability: send the invitation, read `AUTH`, then stop — no transfer, nothing to wedge.
      Script: `/tmp/otaprobe.py` on `.77`.)*
      ⇒ **Operational rule: an aborted OTA can leave a unit unreachable *from the server* until its
      next press; never start an OTA on a unit you cannot reach physically.** Note the trap this
      sets: every *other* host could still talk to it, so a ping test from `.77` alone looks
      exactly like "the receiver is dead" — always cross-check from a second host (`.33`/`.11`/`.1`)
      before touching hardware.
- [x] **RESOLVED 2026-10-18 — v1 firmware has NO OTA at all.** Every revision of
      `RFreceiver_esp8266.ino` back to the original port (5 revisions checked) contains **zero**
      `ArduinoOTA` references, so `nodeMCU-0` on v1 cannot be updated over the air — Bluetooth /
      Wi-Fi flashing is impossible and **USB is mandatory** for it.
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
- [x] `.77` had stale `socat -u TCP-LISTEN:1234` processes (Oct 9/10/14 leftovers) next to the
      live one — **cleaned 2026-10-18** by the receiver restart (the restart procedure kills the
      leftover `socat` *before* starting the new one; a surviving `socat` would keep the port
      bound and silently starve the new listener).
- [x] `buttonPressReceiver.sh` housekeeping (2026-10-18): removed the broken `mkdir -p ""`
      (unset `LAST_PRESS_DIR` → `mkdir: cannot create directory ''` on every start) and the
      misleading `stdbuf -o0 nc -lk <port>` debug echo that claimed nc while actually running
      socat.
- [ ] `buttonPressReceiver.sh` debounce tracks only the LAST buttID — alternating buttons
      within 2 s bypass the debounce entirely (may be acceptable; note it). The fusion layer
      does not change this: it only improves the *same-button* case.
- [ ] **KINETIC debounce key is unstable by construction.** `preprocess_kinetic.sh` emits
      `SWITCH_ID 1 KINETIC <receiver> <rssi>` — `BUTTON_NUMBER` is **hard-coded to 1** (the
      `BUTTON_N` field is ignored) and the receiver + RSSI are appended, so the debounce key
      becomes `DEFF2E1KINETICESP32_RX_01-84dBm`. Two receptions of one press at different dBm
      look like two different buttons → the 2 s debounce cannot merge them (harmless today:
      one KINETIC receiver, one message per press). Proper fix = parse `BUTTON_N` into
      `BUTTON_NUMBER` and drop receiver/RSSI from the key, treating them as health data.
      Left untouched deliberately (the KINETIC path must keep working as-is); recorded here so
      it is not "fixed" accidentally by the fusion work.
- [ ] `preprocess_rfxcom.sh` position-based parsing is brittle; the timestamp field is
      dropped today (fusion layer will consume it instead).

## 8. How to resume this project in a future session
1. This file: `DOCs/RF-EVENT-FUSION.md` (source of truth).
2. AGENTS.md has a short "Active Project" pointer.
3. Ground truth commands:
   - `ssh root@192.168.1.77 'tail -30 /root/Domotica/LinuxServerScripts/button2sONOFF/logs/buttonPressReceiver.sh.log'`
   - `ssh root@192.168.1.77 'ss -tlnp | grep -E ":1234\b|:5678\b"; screen -ls'`
4. Firmware lives in `Arduino/RFreceiver_esp8266/` (**v2.2** = committed, flashed & verified on
   laundry + fridge); server in `LinuxServerScripts/button2sONOFF/buttonPressReceiver.sh`
   (+ `test_fusion.sh` for the fusion logic, `tools/rf-frame-check.py` to verify framing on `.77`).
   - **`rx-241002`** = D1 mini + RXB6, mapped to `rf-fridge` in `config/receivers.config`,
     installed at the fridge, IP `192.168.1.231`, MAC `bc:dd:c2:24:10:02`. Now on **v2.2**: its
     OTA listener was wedged (§7) so it was reflashed **over USB** from the Mac on 2026-10-18
     (`arduino-cli upload` → `Hash of data verified`; banner `Version: 2.2 … id: rx-241002`).
   - **`rx-55d68f`** = nodeMCU (the laundry unit, formerly `nodeMCU-1`), IP `192.168.1.208`,
     flashed 2026-10-18, mapped to `rf-laundry`; **now on v2.2** (OTA'd from `.77`, framing
     wire-verified). MAC `cc:50:e3:55:d6:8f`.
   - **`nodeMCU-0`** still runs **v1** (raw `millis()`; the `nodeMCU-0` string it sends is a
     hardcoded name, *not* a chip id), IP `192.168.1.240`, MAC `ec:fa:bc:05:8e:f5` ⇒ its id will
     be **`rx-058ef5`**, already staged in `config/receivers.config` as **`rf-central`** (it hears
     nearly every remote: master corridor, Nicolò, kitchen, bilocale). v1 has **no OTA**, so USB is
     mandatory. The config line is inert until the board speaks v2.
   - **ids are predictable**: `rx-XXXXXX` = `ESP.getChipId()` = the MAC's **low 24 bits**, so the
     `receivers.config` line can be written from `ip neigh` / `esptool.py flash_id` **before** the
     board is even plugged in (that is how `rx-058ef5` was pre-staged).
   - `ESP32_RX_01` = the KINETIC receiver (ESP32 + CC1101), on `:5678`.
   - **The deployed v1 sketch source is in this repo's history** —
     `git show 196e049^:Arduino/RFreceiver_esp8266/RFreceiver_esp8266.ino`. It is what runs on
     `nodeMCU-0` too: serial banner `connection YESSS`, hardcodes its own name, **RF data on
     GPIO4 / D2**, single-pin OOK module (same pin as v2.1, so v2.1 drops straight in). Commit
     `196e049` ("Refactor ESP8266 RF receiver code") later broke the LightwaveRF decode, but the
     deployed units were never reflashed with it. Pre-flash binary dumps per unit are kept in
     `~/.local/share/domotica/receiver-fw-backups/` (laundry: 4 MB, md5
     `6e72b82a9f3ae1a050d8b9d81c199a83`).
   - ⚠️ **Security:** that historical sketch hardcodes the WiFi SSID **and password** in plaintext,
     and it is already in this public repo's git history — worth rotating the WiFi PSK at some point.
   - Serial capture on macOS (`serialid.py` toggles DTR/RTS to force a boot banner; opening the
     port alone does not reliably reset the board). `arduino-cli monitor` reads zero bytes here.
5. Toolchain on the Mac (installed 2026-10-18): `arduino-cli` + `esp8266:esp8266` core 3.1.2.
   - compile: `arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 Arduino/RFreceiver_esp8266/`
   - USB flash — the **default** path (no UDP lottery, and the only option for v1):
     `arduino-cli upload -p /dev/cu.usbserial-* --fqbn esp8266:esp8266:nodemcuv2 Arduino/RFreceiver_esp8266/`
     ends with `Hash of data verified`. Every board here is CH340-based, so the device path is the
     same whichever is plugged in — identify the unit by the **boot banner id**, not the port.
   - serial: `python3 serialid.py /dev/cu.usbserial-* <seconds>` (toggles DTR/RTS to force the
     banner; `arduino-cli monitor` reads zero bytes on these boards)
   - OTA flash — **v2 only**, and **run espota from `.77`**, never the Mac (§7 "OTA"):
     hostname = `rx-XXXXXX`, password from `secrets.h`

### Restarting the receiver safely (do NOT just `screen -X quit`)
`button2sonoff.sh` starts it as a detached screen session named `buttonPressReceiver.sh`, and
`tee`s stdout into `logs/buttonPressReceiver.sh.log`. A leftover `socat` keeps `:1234`/`:5678`
**bound**, so the new listener would fail to bind and the fleet would go dark silently. Order:
1. `screen -S buttonPressReceiver.sh -X quit`
2. `pkill -f 'button2sONOFF/buttonPressReceiver.sh'`; `pkill -f 'socat -u TCP-LISTEN:1234'`;
   `pkill -f 'socat -u TCP-LISTEN:5678'`
3. wait until `ss -ltn | grep -E ':(1234|5678) '` is empty (must verify, do not assume)
4. re-create the session with the same `screen -dmS ... bash -c '... | tee -a <log>'` shape
5. verify both listeners + the `=== listening: ... ===` lines in the log, then remember the
   lazy-reconnect note in §4 (receivers stay quiet until their next press).
`managerLayer.js` opens the FIFO `r+`, so restarting only the receiver never blocks the writer
and never needs the manager restarted.

## 9. Next

1. ✅ **DONE 2026-10-18 — the fridge unit `rx-241002` was USB-flashed to v2.2** (its OTA listener
   was wedged, §7 "OTA", so USB was the only path; no backup needed as v2.1 is reproducible from
   this repo). ⚠️ Action for the physical world: the box is still **on the bench at the Mac** —
   put it back in the kitchen with its RXB6 module attached.
2. **Flash `nodeMCU-0` = `rx-058ef5` / `rf-central` to v2.2** — take it down, USB-flash (v1 has no
   OTA at all), confirm the id from the boot banner, put it back. Its `receivers.config` line is
   already staged. Optional but wise: `esptool read_flash 0 0x400000` backup first, as for laundry.
3. **Then** flip the tight window: `FUSION_ENABLED=1` **and restart the receiver** (§8 restart
   recipe — quit the screen session *and* kill the leftover `socat`), then watch `FUSED … n=2/n=3`
   with sensible `skew`/`lag`. Note grouping already runs today; with `FUSION_ENABLED=0` the legacy
   2 s debounce still gates forwarding, which is what stops a v1+v2 pair from toggling twice.
4. Watch `lag` for a day — a receiver whose `lag` is huge or **negative** is not NTP-synced.
   Already seen once: on a real press (2026-10-18) the laundry unit logged
   `press start (recv=rf-laundry epoch=1792359674954 lag=-459ms)` — a negative lag means its SNTP
   clock runs **≈0.46 s ahead** of `.77`'s. Harmless for `skew` (relative) but it eats ~half of
   `W=1000 ms`: if two v2 receivers ever sit at opposite offsets, a real press could straddle the
   window. Check NTP on `.77` and on the units before widening `FUSION_WINDOW_MS`; do not widen it
   blindly (nearby presses are 1.9–6.7 s apart, per §5, so there is room).
   Related cosmetic noise: the `<rx-id> connected` hello is logged as `buttonID: INVALID` by the
   RFXCOM preprocessor (harmless, §4).
5. Optional (still open from §5): straight 17.3 cm ¼-wave antenna on the fridge unit + a
   co-located A/B against a nodeMCU, to settle RXB6 sensitivity properly.
6. Optional: the ESP32/CC1101 route — add the LightwaveRF decode to `ESP32_RX_01`'s firmware
   (keeping KINETIC working) and get **RSSI** into the fusion record. The firmware source is
   **not in this repo** — it must be recovered from wherever it was written (the flashed binary
   can only be dumped, not decompiled to source).
7. Optional: `identify.sh` (bidirectional `socat` wrapper) — the firmware half already exists.
   Also **re-power the ESP32 KINETIC (`.212`)**: while it is off, KINETIC remotes `AB6EDE`
   (master-bath switch) and `CCFF0E` (Nicolò-bath switch) are dead.
