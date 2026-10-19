# Arduino — 433 MHz RF receivers

Firmware that turns a press on a 433 MHz remote into a single event on the Linux
server (`192.168.1.77`), plus the two retired sketches kept for reference.

- **Design rationale, measurements and the fusion algorithm:**
  [`DOCs/RF-EVENT-FUSION.md`](../DOCs/RF-EVENT-FUSION.md) — the source of truth.
- **Protocol internals (LightwaveRF encoding, pulse decoding, hardware detail):**
  [`RFreceiver_esp8266/README.md`](RFreceiver_esp8266/README.md) — the deep dive.
- This file is the **map**: what runs where, what the wire format is, how the
  server consumes it, and what to check when a receiver goes quiet.

---

## 1. What is in this directory

| Path | Status | What it is |
|---|---|---|
| `RFreceiver_esp8266/` | **current** | The firmware running on every receiver. v2.2, one identical image fleet-wide. |
| `YUN-LWRF-receiver-v0.2/` | retired | The original Arduino YUN receiver: shell scripts that pipe codes into a `nc` connection. Kept because it is the only surviving copy of the correct LightwaveRF decode logic. |
| `sketch_rf433rxStoreCodePulseInMix-0.2/` | retired | The RFXCOM-era sketch, ancestor of the ESP8266 port. |

Inside `RFreceiver_esp8266/`:

```
RFreceiver_esp8266.ino   firmware (v2.2)
secrets.h                WiFi creds + OTA password + NTP servers  (gitignored)
secrets.h.example        template — copy to secrets.h and fill in
README.md                deep protocol/hardware documentation
```

> **The receiver firmware source is the only firmware source in this repo.**
> The KINETIC wall-switch receiver (`ESP32_RX_01`, an ESP32 + CC1101/E07-M1101D
> board on port `5678`) speaks the same server protocol but its firmware is
> **not** here — it was never committed, and while that unit is powered off the
> KINETIC remotes (`AB6EDE` master bath, `CCFF0E` Nicolò bath) are dead.

---

## 2. The fleet

Every receiver is an ESP8266-class board with a 433.92 MHz OOK receiver module
whose DATA pin is wired to **GPIO4 / D2**. They all run the same binary, so the
firmware never needs per-unit configuration: each board identifies itself by its
chip id.

| Friendly name | Chip id (field 4) | Board | Location | Notes |
|---|---|---|---|---|
| `rf-central` | `rx-058ef5` | nodeMCU (was `nodeMCU-0`) | corridor / hallway | Hears nearly every remote — the "everything" receiver. v2.2 since 2026-10-19 (USB — v1 had no OTA). |
| `rf-fridge` | `rx-241002` | D1 mini + RXB6 | kitchen, by the refrigerator | v2.2 since 2026-10-18. |
| `rf-laundry` | `rx-55d68f` | nodeMCU (was `nodeMCU-1`) | laundry | v2.2 since 2026-10-18. |
| `ESP32_RX_01` | — | ESP32 + CC1101 | (KINETIC receiver, port `5678`) | Firmware source not in this repo. |

- **`rx-XXXXXX` = `ESP.getChipId()` = the low 24 bits of the MAC.** It is
  immutable and impossible to spoof by reflashing, which is why friendly names
  live **server-side** in
  [`config/receivers.config`](../LinuxServerScripts/button2sONOFF/config/receivers.config)
  and never in the firmware. The id is predictable *before* a board is even
  plugged in (from `ip neigh`), which is how new units are pre-staged.
- The compiled image is reproducible: compiling this directory yields
  md5 `f7783deb438efb63192e8271e7e3c799` on every unit.

---

## 3. End-to-end data path

```
   remote / wall switch                     (433.92 MHz OOK, LightwaveRF)
            │
            │  one press = a burst repeated ~70–270 ms apart
            ▼
   ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
   │ rf-central      │   │ rf-fridge       │   │ rf-laundry      │   ← all three hear
   │ ESP8266 + OOK    │   │ D1 mini + RXB6  │   │ ESP8266 + RXB6  │     the same press
   │ DATA → GPIO4/D2  │   │ DATA → GPIO4/D2 │   │ DATA → GPIO4/D2 │
   └────────┬─────────┘   └────────┬────────┘   └────────┬─────────┘
            │  TCP, one line per reception, SNTP epoch-ms stamp
            └──────────────┬───────┴───────────────────────┘
                           ▼
              192.168.1.77:1234   (KINETIC ESP32 → :5678)
                           │
              ┌────────────▼─────────────┐
              │ buttonPressReceiver.sh   │  socat -u TCP-LISTEN:1234,reuseaddr,fork
              │                          │  → normalize → FUSE → debounce
              └────────────┬─────────────┘
                           │  one line per LOGICAL event
                           ▼
                  logs/button_fifo  (FIFO)
                           │
              ┌────────────▼─────────────┐
              │ managerLayer.js          │  buttonID → devices (buttons.config,
              │                          │  sONOFF.config)
              └───┬──────────────────┬───┘
                  │                  │
      eWeLink proxy .11:3000     arduino433tx (/dev/ttyACM0 on .77)
      (Wi-Fi devices)            (433 MHz transmit back to RF-only devices)
```

**The problem this architecture solves.** A remote repeats its burst several
times per press, and every receiver in range hears it, so a naive server sees
"one press" as many events from many receivers — and would toggle a light twice.
The receivers therefore stamp each burst with the **UTC epoch-ms of the first
pulse they decoded**, and `buttonPressReceiver.sh` merges every reception of the
same button inside a short window into **one group** (`FUSED … n=N`), forwarding
it exactly once. That is *RF event fusion*: the whole design, the 1500 ms window
and the measurements behind it are in
[`DOCs/RF-EVENT-FUSION.md`](../DOCs/RF-EVENT-FUSION.md).

---

## 4. The wire protocol

One TCP line per reception, CRLF-terminated, to `192.168.1.77:1234`.

### v2 (current) — `RFreceiver_esp8266` v2.x

```
0A1400a F4A89A0101 1792439276093 rx-55d68f
└─┬───┘ └───┬────┘ └─────┬─────┘ └──┬───┘
  header    code      epoch-ms     receiver id
  (7)       (10)      (13 digits)  (rx-XXXXXX)
  1         2          3            4
```

| Field | Meaning |
|---|---|
| 1 | Protocol header, **exactly `0A1400a`** (7 chars). The server slices by fixed positions — never reformat it. |
| 2 | The decoded LightwaveRF code as 10 hex chars: `F` + 5-char address + 3-char type + 1-char button. |
| 3 | **UTC epoch-ms of the first RF pulse** of the burst (SNTP). `0` = SNTP not synced yet. |
| 4 | Chip-derived identity (`rx-XXXXXX`). The server maps it to a friendly name. |

Two other lines travel on the same socket, both harmless but easy to misread:

- `rx-55d68f connected` — sent on every (re)connect. A receiver connects
  **lazily, on its next transmission**, so "no connections on `:1234`" after a
  server restart is normal, not an outage.
- `rx-55d68f IDENTIFY OK` — reply to an `ID` command sent **server → receiver
  down the same connection** (the firmware blinks its LED 10×). The firmware half
  exists; the server-side sender does not yet.

### v1 (retired) — kept only so the server logic is understood

```
0A1400a F4AA0D1101 760276312 nodeMCU-0
                    └─── millis() uptime, <13 digits ──┘ └── hardcoded name ──┘
```

The only structural differences: **field 3 is a `millis()` uptime instead of an
epoch** (so `≥13` digits is what marks a message as v2), and field 4 is a name
baked into the sketch rather than a chip id. `buttonPressReceiver.sh` accepts
both: a v1 message **never opens a fusion group** and stays on the legacy 2 s
debounce path, which is exactly the rollback switch for the whole feature.

### How the code maps to a button

`preprocess_rfxcom.sh` slices the line by absolute position: switch id = chars
**9–13**, button type = chars **14–16** (must be `010`, `110`, `100` or `000`),
button number = char **17**. So `F4A89A0101` → `4A89A 1 RFXCOM`.

> Note the slight oddity: the code's 7th character (a raw decoded bit) happens to
> land in the server's *button type* field, which is why v1 codes read `…1101`
> and v2 codes `…0101` — both validate, and both yield the same button. The
> positional parser is brittle by design (see the open item in
> `DOCs/RF-EVENT-FUSION.md` §7); it works, so it is left alone.

The KINETIC protocol on `:5678` has its own preprocessor:
`KINETIC AB6EDE BUTTON_1 ESP32_RX_01 -44dBm` → `AB6EDE 1 KINETIC`.

---

## 5. Where the server code lives

All of it is under
[`LinuxServerScripts/button2sONOFF/`](../LinuxServerScripts/button2sONOFF/) on
`.77` (mirrored in this repo):

| File | Role |
|---|---|
| `buttonPressReceiver.sh` | Two listeners (`:1234` RFXCOM-family, `:5678` KINETIC) via one `socat … fork STDOUT` each; normalizes, fuses, debounces, writes accepted presses to the FIFO. **The fusion algorithm lives here.** |
| `preprocess_rfxcom.sh` | Raw RFXCOM-family line → `SWITCH_ID BUTTON_NUMBER RFXCOM` (positional). |
| `preprocess_kinetic.sh` | Raw KINETIC line → `SWITCH_ID BUTTON_NUMBER KINETIC …`. |
| `config/receivers.config` | `rx-XXXXXX : friendly-name : location : notes` — the id → name map. |
| `config/buttons.config` | `buttonID` → the light(s) it controls. |
| `config/sONOFF.config` | Device alias → eWeLink `deviceID` + `rfCode`. |
| `managerLayer.js` | Reads the FIFO; actuates via the eWeLink proxy (`.11:3000`) or RF (`arduino433tx`); serves events on `:7777`. |
| `button2sonoff.sh` | Launcher: starts `buttonPressReceiver.sh` and `managerLayer.js` in `screen` sessions, logging to `logs/`. |
| `test_fusion.sh` | Unit test for the fusion/debounce logic (Runs A–E, incl. a regression guard for the 914 ms repeat-lock spread); `KEEP=1` keeps its logs. |

Two traps when reading the code and logs:

1. **`FUSED` is printed when a group *closes*** (i.e. when a *different* key
   arrives), so consecutive presses of the same button print no `FUSED` line.
>  "No `FUSED` line" does **not** mean "not fused" — with `FUSION_ENABLED=1` a
>   healthy forwarded event reads `forwarded=1`.
2. **Grouping is measured on server arrival time, not on the epochs.** `skew`
   (within a group) and `lag` (end-to-end, incl. clock error) are diagnostics;
> a large or negative `lag` is a receiver whose SNTP is off, not a grouping change.

Also on `.77`: `startRFreceiverServer.sh` starts the **legacy** `socket.js`
offset-calibration daemon in a `nodeMCU` screen. It is dormant now that fusion
exists — don't confuse it with the live listener started by `button2sonoff.sh`.

---

## 6. Hardware notes

- **DATA → GPIO4 (D2)** on every board. That single wire plus 3.3 V is the whole
  interface.
- Module type varies (RXB6 superhet, generic single-pin OOK) and does not matter
  to the firmware **as long as the DATA output is non-inverted** — the decoder
  looks for `pulseIn(pin, HIGH)`, so a module that idles **high** reads as
  permanent signal and `waitForValidPulse()` times out: total silence, identical
  to a dead board. If a receiver is silent, measure the module's DATA pin at rest
  (should be ≈0 V) before suspecting anything else.
- An unpowered module and a damaged GPIO **both** look exactly like RF silence.
  Check, in order: module VCC↔GND (≈3.3 V), DATA idle level (≈0 V), DATA pin →
  D2 continuity, D2↔GND resistance (should be MΩ, not a few Ω).
- Antennas are a wire/coil on the module's ANT pad; SWR hardly matters at these
  power levels, but a detached ANT trace still usually picks up *something* at
  point-blank range — so "nothing at all, right next to the remote" points at
  power or DATA, not the antenna.
- The onboard LED (`LED_BUILTIN` = GPIO2; `LOW` = on) is off in normal operation;
  it blinks during Wi-Fi association and 10× on an `ID` command.

---

## 7. Build, flash, bench

Toolchain on the Mac: `arduino-cli` + core `esp8266:esp8266` 3.1.2.

```bash
# compile (from the repo root)
arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 Arduino/RFreceiver_esp8266/

# USB flash — the default and only fully reliable path
arduino-cli upload -p /dev/cu.usbserial-* --fqbn esp8266:esp8266:nodemcuv2 Arduino/RFreceiver_esp8266/
#   ends with "Hash of data verified"
```

- Every board here is CH340-based, so **the device path is the same whichever
  unit is plugged in** — identify the unit by its **boot banner id**, never by
  the port, and only ever have **one** serial reader open (two readers split the
  tty stream and silently lose data; verify with `lsof /dev/cu.usbserial-*`).
- Bench capture helpers live in
  [`macos/`](../macos/README.md): `serialid.py` (identify a unit),
  `serialcap.py` (stream), `serialreset.py` (reset **and** stream — if the banner
  lands in the file the reader is proven live, so later silence is real RF
  silence), `serialdiag.py` (is the USB driver wedged?).
- **OTA** works but is a one-shot UDP protocol with nasty failure modes — run
  `espota.py` **from `.77`, never from the Mac**, and never start an OTA on a
  unit you cannot reach physically. Treat USB as the deterministic path. Full
  story: `DOCs/RF-EVENT-FUSION.md` §7.

Adding a receiver: flash any board → read its id from the boot banner →
add one line to `config/receivers.config`. No firmware change, no rebuild.

---

## 8. Troubleshooting

| Symptom | First thing to check |
|---|---|
| Serial is completely silent while pressing next to the unit | Module **power** and DATA wiring (see §6). Not the antenna. Not the sketch. |
| Serial silent *and* a capture script died with `Invalid argument` | The macOS USB-serial **driver is wedged** — physically unplug/replug the USB; `python3 macos/serialdiag.py` confirms. |
| Board alive (banner, SNTP, `connected`) but nothing reaches the server | Is something bound to `:1234` on `.77`? A leftover `socat` silently starves a new listener. |
| Server logs `buttonID: INVALID` right after `rx-XXXXXX connected` | Cosmetic: the hello line is fed through the button preprocessor and dropped before the debounce/fusion path. Not a reception. |
| Occasional `INVALID` on real presses | A single-bit misdecode — dropped, so no phantom press. Rate matters; see `DOCs/RF-EVENT-FUSION.md` §7. |
| One press toggles a light twice | Fusion/debounce. Compare `FUSED … forwarded=` and `n=` in the log against `test_fusion.sh`. |
| Receiver never reconnects | Normal after a server restart — receivers reconnect on their **next transmission**. |

Bench capture hygiene: exactly **one** reader (`lsof /dev/cu.usbserial-*` → 1 PID),
and remember that `arduino-cli monitor` reads zero bytes on these boards.

---

## 9. History and security notes

- The **v1 sketch is recoverable** from git history:
  `git show 196e049^:Arduino/RFreceiver_esp8266/RFreceiver_esp8266.ino`
  (commit `196e049` "Refactor ESP8266 RF receiver code" broke the LightwaveRF
  decode; the deployed units were never reflashed with it). Pre-flash binary
  dumps are kept in `~/.local/share/domotica/receiver-fw-backups/`.
- ⚠️ **That historical sketch hardcodes the WiFi SSID and password in plaintext,
  and it is already in this public repo's history.** Rotating the WiFi PSK is
  worth doing. `secrets.h` is gitignored — only `secrets.h.example` is committed.
- The decode logic in `decodePulseData()` is the corrected version restored from
  the YUN receiver. **Do not "refactor" it** — a previous attempt truncated the
  code to `F4AA0D-`, which the server reads as `INVALID` and silently drops.
