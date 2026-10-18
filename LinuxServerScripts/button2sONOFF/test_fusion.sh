#!/bin/bash
# Unit test for the RF Event Fusion logic in buttonPressReceiver.sh.
#
# Sources the real script with a stubbed clock and fixture receivers, feeds
# crafted receiver lines and checks what gets forwarded to the FIFO.
# No .77, no socat, no radios involved.
#
# Usage: bash test_fusion.sh
set -u

SRC="$(cd "$(dirname "$0")" && pwd)"
T="${TMPDIR:-/tmp}/fusion-test.$$"
export BASE_DIR="$T/rt"

rm -rf "$T"
mkdir -p "$BASE_DIR/logs" "$BASE_DIR/config"
cp "$SRC/preprocess_rfxcom.sh" "$SRC/preprocess_kinetic.sh" "$BASE_DIR/"
chmod +x "$BASE_DIR"/preprocess_*.sh
cat > "$BASE_DIR/config/receivers.config" <<'EOF'
# comment line
rx-241002 : rf-fridge : kitchen : test
rx-TEST01 : rf-lab : bench : test
EOF

# Stub the clock so every run is deterministic.
NOW_MS=1792400000000
date() { if [[ "${1:-}" == "+%s%3N" ]]; then echo "$NOW_MS"; else command date "$@"; fi; }

fails=0
check() { # check <label> <expected> <actual>
    if [[ "$2" == "$3" ]]; then
        echo "  ok   $1 (== $2)"
    else
        echo "  FAIL $1: expected [$2] got [$3]"
        fails=$((fails + 1))
    fi
}
fwd() { grep -c '^sending ' "$LOG" 2>/dev/null || :; }
fused_summaries() { grep -c '^FUSED ' "$LOG" 2>/dev/null || :; }

step() { # step <now_ms> <raw line>
    NOW_MS="$1"; shift
    process_line "${1%% *}" "${1#* }"
}

# ---------------------------------------------------------------------------
echo
echo "=== Run A: mixed fleet (v2 + v1), FUSION_ENABLED=0 ==="
source "$SRC/buttonPressReceiver.sh"
LOG="$T/runA.log"; : > "$LOG"

{
  # ONE press of kitchen button 1 (4AA0D b1), heard by three receivers.
  step 1792400000100 "0A1400a F4AA0D1101 1792400000050 rx-241002"
  step 1792400000150 "0A1400a F4AA0D0101 1792400000090 rx-TEST01"
  step 1792400000160 "0A1400a F4AA0D0101 753805177 nodeMCU-0"
  step 1792400000400 "0A1400a F4AA0D1101 1792400000350 rx-241002"   # later repeat
  # A different button closes the first group.
  step 1792400003400 "0A1400a F4A85C0101 1792400003350 rx-241002"
  # Same button again, well after the window.
  step 1792400006000 "0A1400a F4AA0D1101 1792400005950 rx-241002"
  # A stale re-report 1.5 s on (as a v1 unit would): the legacy 2 s debounce
  # must still swallow it, otherwise the light would toggle twice.
  step 1792400007500 "0A1400a F4AA0D0101 392074320 nodeMCU-1"
} > "$LOG" 2>&1

check "3 logical events forwarded (once per press)" 3 "$(fwd)"
check "1 fusion summary emitted" 1 "$(fused_summaries)"
SUMM=$(grep '^FUSED ' "$LOG")
echo "  summary: $SUMM"
check "group merged all 4 receptions, in order" 1 \
    "$(grep -c '^FUSED 4AA0D1RFXCOM n=4 forwarded=1 via=rf-fridge@0ms,rf-lab@40ms,nodeMCU-0@v1,rf-fridge@300ms$' <<<"$SUMM")"
check "3 press-start lines carry a lag" 3 "$(grep -c 'press start .*lag=' "$LOG")"
check "stale v1 re-report was debounced" 1 "$(grep -c '^debouncing 4AA0D 1 RFXCOM$' "$LOG")"

# ---------------------------------------------------------------------------
echo
echo "=== Run B: all-v2 fleet, FUSION_ENABLED=1 (tight window replaces 2 s) ==="
NOW_MS=1792400100000
FUSION_ENABLED=1
source "$SRC/buttonPressReceiver.sh"
LOG="$T/runB.log"; : > "$LOG"

{
  step 1792400100100 "0A1400a F4AA0D1101 1792400100050 rx-241002"
  step 1792400100140 "0A1400a F4AA0D0101 1792400100090 rx-TEST01"
  # A genuine second press 1.2 s later: the legacy 2 s debounce would have
  # swallowed it, the fusion window must let it through.
  step 1792400101900 "0A1400a F4AA0D1101 1792400101850 rx-241002"
} > "$LOG" 2>&1

check "2 logical events forwarded" 2 "$(fwd)"
check "second press reached the FIFO" 2 "$(grep -c 'sending 4AA0D 1 RFXCOM to FIFO' "$LOG")"

# ---------------------------------------------------------------------------
echo
echo "=== Run C: KINETIC path unchanged (regression guard) ==="
NOW_MS=1792400200000
source "$SRC/buttonPressReceiver.sh"
LOG="$T/runC.log"; : > "$LOG"

{
  step 1792400200100 "KINETIC AB6EDE BUTTON_1 ESP32_RX_01 -44dBm"
  step 1792400200200 "KINETIC AB6EDE BUTTON_1 ESP32_RX_01 -44dBm"   # exact repeat
} > "$LOG" 2>&1

check "KINETIC buttonID normalized as before" 2 \
    "$(grep -c '^buttonID: AB6EDE 1 KINETIC ESP32_RX_01 -44dBm$' "$LOG")"
check "KINETIC press forwarded" 1 "$(fwd)"
check "exact KINETIC repeat debounced" 1 "$(grep -c '^debouncing AB6EDE 1 KINETIC ESP32_RX_01 -44dBm$' "$LOG")"
check "no fusion on KINETIC (no epoch)" 0 "$(grep -c 'press start' "$LOG")"

# ---------------------------------------------------------------------------
echo
echo "=== Run D: invalid / unrelated lines are ignored ==="
NOW_MS=1792400300000
source "$SRC/buttonPressReceiver.sh"
LOG="$T/runD.log"; : > "$LOG"
{
  step 1792400300100 "0A1400a FFFFFF INVALID junk"
  step 1792400300200 "SOME OTHER PROTOCOL LINE"
} > "$LOG" 2>&1
check "nothing forwarded" 0 "$(fwd)"
check "no FUSED noise" 0 "$(fused_summaries)"

echo
if (( fails == 0 )); then echo "ALL TESTS PASSED"; else echo "$fails TEST(S) FAILED"; fi
rm -rf "$T"
exit $(( fails > 0 ))
