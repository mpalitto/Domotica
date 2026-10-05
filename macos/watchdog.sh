#!/usr/bin/env bash
# watchdog.sh — silent-until-broken domotica health check.
#
# Scheduled by hermes (~/.hermes/cron/jobs.json), NOT by system cron:
#   - "Domotica Morning Health Report"   0 8 * * *  -> ./watchdog.sh
#   - "Domotica Extended Health Report"  on-demand  -> ./watchdog.sh --verbose
#
# This script only PRINTS to stdout; hermes is what sends the Telegram
# message. Prints only when there is BAD NEWS (errors > 0). Does NOT report
# recovery or healthy transitions.
#
# State is persisted in WATCH_STATE_FILE so it can spam you once per problem,
# then go quiet until it changes again.
#
# Extended / full report:
#   ./watchdog.sh --verbose      # print EVERY test (pass + fail) with a
#                                # per-test summary; counts still reported.
#   ./watchdog.sh --json         # machine-readable single line for callers.
#
# Exit codes: 0 = healthy (nothing printed), 1 = had errors (bad news printed).

set -u

# Resolve our own directory so sibling scripts (device_state.py) are found
# regardless of where this repo is checked out.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---- config -------------------------------------------------------------
GW="192.168.1.1"; SRV="192.168.1.77"; PROXY="192.168.1.11"; PVE="192.168.1.33"
STATE_FILE="${WATCH_STATE_FILE:-/Users/matteo/.local/state/domotica-watchdog.state}"
MARKER="${MARKER:-}"   # optional: "error" | "warning" | "ok" to force a level
ALERT_LEVEL="${ALERT_LEVEL:-error}"   # only alert when errors>=ALERT_LEVEL
VERBOSE=0; AS_JSON=0
for a in "$@"; do
  case "$a" in
    --verbose) VERBOSE=1 ;;
    --json)    AS_JSON=1 ;;
    *) : ;;
  esac
done

SSH="ssh -o BatchMode=yes -o ConnectTimeout=8"
WARN_THRESHOLD="${WARN_THRESHOLD:-3}"  # warnings>=this => still no alert, but log

# ---- helpers ------------------------------------------------------------
errors=0; warnings=0
lines=""        # human-readable detail lines appended to the alert (bad news only)
declare -a TESTS=()   # every individual test: "PASS|<desc>" or "FAIL|<desc>"

mark() { # mark <PASS|FAIL> <description>
  local ok="$1"; local desc="$2"
  TESTS+=("$ok|$desc")
}
note() {   # note <LEVEL> <message>  (records a FAIL test + detail line)
  local lvl="$1"; local msg="$2"
  case "$lvl" in
    error)   errors=$((errors+1)); lines+=$'\n'"  [ERR] $msg"; mark FAIL "$msg";;
    warning) warnings=$((warnings+1)); lines+=$'\n'"  [WRN] $msg"; mark FAIL "$msg";;
  esac
}

ssh_try() { # ssh_try <host> <cmd>
  $SSH "$@" 2>/dev/null
}

# emit_report <level> <errors> <warnings>
# Prints the extended report (all tests) when --verbose, else stays silent
# unless there is bad news. In --json mode prints one compact line.
emit_report() {
  local level="$1" errs="$2" warns="$3"
  local total=$(( ${#TESTS[@] } ))
  local passed=0
  local detail=""
  for t in "${TESTS[@]}"; do
    local ok="${t%%|*}"; local desc="${t#*|}"
    if [ "$ok" = "PASS" ]; then passed=$((passed+1)); fi
    # build per-line detail only when verbose
    if [ "$VERBOSE" -eq 1 ]; then
      if [ "$ok" = "PASS" ]; then
        detail+="  ✓ $desc"$'\n'
      else
        detail+="  ✗ $desc"$'\n'
      fi
    fi
  done

  if [ "$AS_JSON" -eq 1 ]; then
    # one compact line: level, counts, totals, pass list, fail list
    local fails="" pas=""
    for t in "${TESTS[@]}"; do
      local ok="${t%%|*}"; local desc="${t#*|}"
      if [ "$ok" = "FAIL" ]; then fails+="$desc; "; else pas+="$desc; "; fi
    done
    printf '{"level":"%s","errors":%s,"warnings":%s,"tests_total":%s,"tests_passed":%s,"tests_failed":%s,"passed":"%s","failed":"%s"}\n' \
      "$level" "$errs" "$warns" "$total" "$passed" "$((total-passed))" "$pas" "$fails"
    return 0
  fi

  # human mode
  if [ "$VERBOSE" -eq 1 ]; then
    echo "=== domotica full health report ($level): $errs error(s), $warns warning(s) — $passed/$total tests passed ==="
    if [ -n "$detail" ]; then printf '%s' "$detail"; fi
    return 0
  fi

  # non-verbose: only emit when there is bad news (unchanged behaviour)
  if [ "$errs" -ge 1 ] || [ "$warns" -ge 1 ]; then
    echo "=== watchdog: level=$level errors=$errs warnings=$warns ==="
    printf '%s' "$lines"
  fi
}

# ---- 1. nodes reachable -------------------------------------------------
for ip in "$GW" "$SRV" "$PROXY" "$PVE"; do
  if ping -c1 -W2 "$ip" >/dev/null 2>&1; then
    mark PASS "node $ip reachable"
  else
    note error "node $ip unreachable"
  fi
done

# ---- 2. core processes on .77 ------------------------------------------
procs_on_srv="managerLayer.js buttonPressReceiver arduino433tx WEBserver-port3000"
for p in $procs_on_srv; do
  if ssh_try "root@$SRV" "pgrep -f '$p' >/dev/null 2>&1"; then
    mark PASS "process '$p' running on $SRV"
  else
    note error "process '$p' down on $SRV"
  fi
done

# ---- 3. proxy service on .11 -------------------------------------------
if ssh_try "root@$PROXY" "systemctl is-active ewelink-proxy.service >/dev/null 2>&1"; then
  mark PASS "ewelink-proxy.service active on $PROXY"
else
  note error "ewelink-proxy.service down on $PROXY"
fi

# ---- 4. listening TCP ports ---------------------------------------------
# Complements section 2: a process can be alive with its socket gone (hung
# event loop, failed bind), which pgrep alone will not catch.
# One SSH round trip per host, then match the ports locally.
#
# 1212 (PIR) is deliberately NOT checked: that project is retired and is not
# started at boot (see rc.local on .77). Checking it would report an error
# every morning for something never meant to run.
check_ports() { # check_ports <host> <port:service> ...
  local host="$1"; shift
  local out
  out=$(ssh_try "root@$host" "ss -tln 2>/dev/null")
  if [ -z "$out" ]; then
    note error "could not read listening ports on $host"
    return
  fi
  local pair port svc
  for pair in "$@"; do
    port="${pair%%:*}"; svc="${pair#*:}"
    if echo "$out" | grep -q ":${port} "; then
      mark PASS "port $port ($svc) listening on $host"
    else
      note error "port $port ($svc) NOT listening on $host"
    fi
  done
}

check_ports "$SRV" \
  "1234:RF receivers" "5678:KINETIC receivers" "7777:ManagerLayer" \
  "12345:Current sensor" "12346:Display"
check_ports "$PROXY" "3000:eWeLink API"

# ---- 5. disk / RAM headroom --------------------------------------------
for ip in "$SRV" "$PROXY"; do
  disk=$(ssh_try "root@${ip}" "df -P / | awk 'NR==2{print \$5}' | tr -d '%'")
  mem=$(ssh_try "root@${ip}" "free | awk '/^Mem:/{print int(\$3/\$2*100)}'" 2>/dev/null)
  if [ -n "$disk" ] && [ "$disk" -ge 90 ]; then
    note error "disk / at ${disk}% on $ip"
  else
    mark PASS "disk / on $ip ${disk:-?}% (<90)"
  fi
  if [ -n "$mem" ] && [ "$mem" -ge 90 ]; then
    note error "RAM at ${mem}% on $ip"
  else
    mark PASS "RAM on $ip ${mem:-?}% (<90)"
  fi
done

# ---- 6. SONOFF device connectivity -------------------------------------
# fully dead = cloud AND local off -> error
# local off but cloud on = WiFi radio dead, RF fallback active -> warning
stats=$(ssh_try "root@${PROXY}" "curl -s http://localhost:3000/devices 2>/dev/null" | python3 "$SCRIPT_DIR/device_state.py" 2>/dev/null)
dead=$(echo "$stats" | awk '/^DEAD/ { $1=""; print }' | sed 's/^ //')
local_off=$(echo "$stats" | awk '/^OFF/ { $1=""; print }' | sed 's/^ //')
if [ -n "$dead" ]; then
  note error "fully-off SONOFF devices: $dead"
else
  mark PASS "no fully-off SONOFF devices"
fi
# one warning per local-off device (WiFi radio dead, RF fallback active)
for d in $local_off; do note warning "local-off SONOFF (RF fallback only): $d"; done

# ---- decide -------------------------------------------------------------
level="ok"
[ "$errors" -ge 1 ] && level="error"
[ "$warnings" -ge 1 ] && [ "$level" != "error" ] && level="warning"

# Force a level if MARKER set (used by tests)
[ -n "$MARKER" ] && level="$MARKER"

# ---- persist last state, decide whether to alert -----------------------
last_level="ok"; [ -f "$STATE_FILE" ] && last_level="$(cat "$STATE_FILE" 2>/dev/null)"

# Only alert on bad news, and only when the situation is NEW or worse
# than what we last told the user about.
should_alert=0
if [ "$level" != "ok" ]; then
  if [ "$last_level" != "$level" ] || [ -n "$MARKER" ]; then
    should_alert=1
  fi
fi

# write state (so next run knows)
mkdir -p "$(dirname "$STATE_FILE")" 2>/dev/null
echo "$level" > "$STATE_FILE" 2>/dev/null

if [ "$VERBOSE" -eq 1 ] || [ "$AS_JSON" -eq 1 ]; then
  # extended report path: always emit the requested detail, never "silent"
  emit_report "$level" "$errors" "$warnings"
  # exit 0 unless there were hard errors (so it can't be read as a crash)
  [ "$errors" -ge 1 ] && exit 1 || exit 0
fi

if [ "$should_alert" -eq 1 ]; then
  if [ -n "$MARKER" ]; then
    # test mode: just print, do not deliver
    echo "=== watchdog: level=$level errors=$errors warnings=$warnings ==="
    echo -e "$lines"
    exit 0
  fi
  subject="🚨 domotica alert ($level): $errors error(s), $warnings warning(s)"
  # one-shot alert via cron job; here we just print so the cron wrapper can deliver it
  printf '%s\n%s\n' "$subject" "$lines"
  [ "$errors" -ge 1 ] && exit 1 || exit 0
fi

# healthy: stay silent
exit 0