#!/bin/bash

# buttonPressReceiver.sh
# Receives raw codes, preprocesses them into a common buttonID, debounces,
# and pushes accepted presses to the manager FIFO.
#
# ===========================================================================
# RF EVENT FUSION
# ===========================================================================
# Design + measurements: DOCs/RF-EVENT-FUSION.md
#
# A radio remote sends the same burst several times per press (~70-270 ms
# apart), so every receiver in range hears "one press" several times. v2
# receivers stamp each burst with the UTC epoch-ms of the FIRST pulse they
# decoded (message field 3, >= 10^12); v1 receivers still send their millis()
# uptime (< 10^12) and keep the legacy 2 s debounce.
#
# Receptions with the same normalized buttonID that fall inside the fusion
# window are therefore ONE logical event, and each receiver is logged with:
#     skew : its epoch stamp minus the group's first epoch stamp (RF-time skew)
#     lag  : server now minus its epoch stamp (end-to-end latency, incl. clock
#            error -> a large or negative lag means a receiver's SNTP is off)
#
# The FIRST arrival is what gets forwarded. With FUSION_ENABLED=0 the legacy
# 2 s debounce is the forwarding gate - that is what stops a v1 + v2 pair from
# toggling a light twice, so it was required while any v1 receiver was in
# service. FUSION_ENABLED=1 swaps that gate for the tighter fusion window; it
# is safe now that every receiver in the fleet speaks v2.
#
# Knobs (override via environment or edit here):
#   FUSION_WINDOW_MS   grouping window, measured on SERVER ARRIVAL time (not on
#                      the epochs). Repeats within one press are 70-270 ms
#                      apart, so the spread is quantised in whole repeat
#                      intervals and a receiver that locks onto a late repeat
#                      lands far out: field worst case is 914 ms (fridge,
#                      2026-10-19, three-receiver press). 1500 ms covers that
#                      with margin while staying below the smallest observed
#                      gap between separate presses (1.9 s), so two genuine
#                      presses are never merged into one.
#   FUSION_ENABLED     1 = use the fusion window instead of the 2 s debounce as
#                      the forwarding gate for v2 events. Enabled 2026-10-19:
#                      the whole fleet runs v2.2, no v1 receiver remains.
# ---------------------------------------------------------------------------

BASE_DIR="${BASE_DIR:-/root/Domotica/LinuxServerScripts/button2sONOFF}"
FIFO_PATH="$BASE_DIR/logs/button_fifo"
RECEIVERS_CONFIG="$BASE_DIR/config/receivers.config"
PREPROCESS_KINETIC="$BASE_DIR/preprocess_kinetic.sh"
PREPROCESS_RFXCOM="$BASE_DIR/preprocess_rfxcom.sh"

DEBOUNCE_TIME=2000                          # legacy window, ms
FUSION_WINDOW_MS="${FUSION_WINDOW_MS:-1500}"
FUSION_ENABLED="${FUSION_ENABLED:-1}"

RFXCOM_HEADER="0A1400a"

mkdir -p "$BASE_DIR/logs"

# IMPORTANT: point to your real preprocessor scripts
# (Add more if you have other protocols: PREPROCESS_XXX=...)

normalize_code() {
    local raw="$*"
    local type=$1
    # echo "type: $1"
    # echo "raw: $raw"

    local normalized
    # Add more preprocessors here if needed...
    # normalized=$("$PREPROCESS_OTHER" "$raw" 2>/dev/null)
    # ...
    case $type in
      'KINETIC')
          normalized=$("$PREPROCESS_KINETIC" "$raw" 2>/dev/null)
	  ;;
      *)
          # Then rfxcom
          normalized=$("$PREPROCESS_RFXCOM" "$raw" 2>/dev/null)
	  ;;
    esac

    if [[ -n "$normalized" && "$normalized" != "ERROR"* ]]; then
        echo "$normalized"
        return 0
    fi

    # If nothing matched → return empty (will be ignored)
    echo ""
    return 1
}

# chipID ("rx-XXXXXX", field 4 of the message) -> friendly name, from
# config/receivers.config ("chipID : friendly-name : location : notes").
# Falls back to the raw id so an unmapped receiver still identifies itself.
receiver_label() {
    local id="${1:-}" name=""
    if [[ -n "$id" && -r "$RECEIVERS_CONFIG" ]]; then
        name=$(awk -F: -v want="$id" '
            /^[[:space:]]*#/ { next }
            {
                key = $1; gsub(/[[:space:]]/, "", key)
                if (key == want) {
                    val = $2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", val)
                    print val; exit
                }
            }
        ' "$RECEIVERS_CONFIG")
    fi
    printf '%s' "${name:-$id}"
}

#-----------------------------------------------------------------------------
# Fusion + debounce state. Lives in the per-port subshell, so ports do not
# interfere with each other (each handles its own protocol/button namespace).
#-----------------------------------------------------------------------------
last_buttID=""
last_time=0

FUSION_KEY=""       # normalized buttonID of the group currently open
FUSION_T0=0         # server ms when the group opened
FUSION_EPOCH=""     # epoch-ms stamp of the group's first (v2) reception
FUSION_COUNT=0
FUSION_SEEN=""
FUSION_FWD=0        # 1 if the group was actually forwarded to the FIFO

CR=$'\r'            # receivers terminate their lines with CRLF; strip it on parse
now_ms() { date +%s%3N; }

flush_fusion() {
    [[ -z "$FUSION_KEY" ]] && return 0
    if (( FUSION_COUNT > 1 )); then
        echo "FUSED $FUSION_KEY n=$FUSION_COUNT forwarded=$FUSION_FWD via=$FUSION_SEEN"
    fi
    FUSION_KEY=""; FUSION_T0=0; FUSION_EPOCH=""; FUSION_COUNT=0
    FUSION_SEEN=""; FUSION_FWD=0
}

#-----------------------------------------------------------------------------
# process_line <field1> <rest-of-line>
#-----------------------------------------------------------------------------
process_line() {
    local button="$1" raw_line="$2"

    echo " $button $raw_line"

    # 1. Normalize / preprocess
    local buttonID
    buttonID="$(normalize_code $button $raw_line)"
    echo "buttonID: $buttonID"

    # 2. Skip if no valid buttonID was extracted or explicitly INVALID
    [[ -z "$buttonID" || "$buttonID" == "INVALID" ]] && return 0

    local buttID=${buttonID// /} # remove all spaces

    # 3. v2 detection: field 3 is a UTC epoch-ms (>= 10^12), not millis()
    local f_hdr f_code f_ts f_recv
    read -r f_hdr f_code f_ts f_recv _ <<< "$button $raw_line"
    # Receivers terminate lines with CRLF. Strip the stray CR from each field, or
    # the receiver id keeps a trailing \r — harmless while it resolves in
    # receivers.config, but it pollutes the fusion record ("via=nodeMCU-0^M@v1")
    # whenever the id is unmapped and the raw id is used verbatim.
    f_hdr=${f_hdr%"$CR"}; f_code=${f_code%"$CR"}
    f_ts=${f_ts%"$CR"};   f_recv=${f_recv%"$CR"}
    local is_epoch=0
    if [[ "$f_hdr" == "$RFXCOM_HEADER" ]]; then
        case "$f_ts" in
            ''|*[!0-9]*) : ;;
            *) (( ${#f_ts} >= 13 )) && is_epoch=1 ;;
        esac
    fi

    local now; now=$(now_ms)

    # 4. Fusion: is this another receiver's view of the press we already have?
    if [[ -n "$FUSION_KEY" && "$buttID" == "$FUSION_KEY" ]] \
       && (( now - FUSION_T0 <= FUSION_WINDOW_MS )); then
        local where; where="$(receiver_label "$f_recv")"
        if (( is_epoch )) && [[ -n "$FUSION_EPOCH" ]]; then
            local skew=$(( f_ts - FUSION_EPOCH ))
            (( skew < 0 )) && skew=$(( -skew ))
            echo "fusing (recv=$where skew=${skew}ms lag=$(( now - f_ts ))ms n=$(( FUSION_COUNT + 1 )))"
            FUSION_SEEN="${FUSION_SEEN:+$FUSION_SEEN,}$where@${skew}ms"
        else
            echo "fusing (recv=$where legacy-stamp n=$(( FUSION_COUNT + 1 )))"
            FUSION_SEEN="${FUSION_SEEN:+$FUSION_SEEN,}$where@v1"
        fi
        FUSION_COUNT=$(( FUSION_COUNT + 1 ))
        return 0   # never forward a duplicate view of the same press
    fi

    # A different event: close (and log) the previous group.
    flush_fusion

    if (( is_epoch )); then
        FUSION_KEY="$buttID"
        FUSION_T0=$now
        FUSION_EPOCH="$f_ts"
        FUSION_COUNT=1
        FUSION_SEEN="$(receiver_label "$f_recv")@0ms"
        echo "press start (recv=$(receiver_label "$f_recv") epoch=$f_ts lag=$(( now - f_ts ))ms)"
    fi

    # 5. Debounce / forwarding gate
    local window=$DEBOUNCE_TIME
    if (( is_epoch )) && (( FUSION_ENABLED )); then
        window=$FUSION_WINDOW_MS
    fi

    echo "$buttID =? $last_buttID"
    if [[ $buttID == $last_buttID ]]; then
        echo "$buttID == $last_buttID"
        if (( now - last_time < window )); then
            echo "debouncing $buttonID"
            return 0   # code already received, ignoring this code
        fi
    fi

    echo "sending $buttonID to FIFO"
    echo "$buttonID" > "$FIFO_PATH" # send code to FIFO to get executed
    last_buttID="$buttID"
    last_time="$now"
    (( is_epoch )) && FUSION_FWD=1

    # # 4. Optional: check that this buttonID exists in config
    # ... (unchanged)
    return 0
}

handle_port() {
    local port=$1
    echo "=== listening: socat -u TCP-LISTEN:$port,reuseaddr,fork (pid $$) ==="
    socat -u TCP-LISTEN:$port,reuseaddr,fork STDOUT | while read -r button raw_line; do
        process_line "$button" "$raw_line"
    done
}

# Launch listeners (skipped when sourced, e.g. by the unit test)
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    handle_port 1234 &
    handle_port 5678 &

    wait
fi
