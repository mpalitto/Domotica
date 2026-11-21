#!/usr/bin/env python3
"""Cross-check the sONOFF / wall-button / proxy configuration files.

Reads only files from the repo checkout (no network, no SSH):

    config/sONOFF.list     RF code  -> light name   (V lines are lights)
    config/sONOFF.config   deviceID -> alias -> RF code
    config/buttons.config  REMOTE_ID + button N -> alias
    ../iot-controller/map-conf.json           house-map light codes
    <repo>/eWeLink-Proxy/nodejs/core/aliases.json   deviceID -> proxy alias

Checks
  1. every RF code in sONOFF.list exists in sONOFF.config
  2. every buttons.config target is an alias defined in sONOFF.config
     (managerLayer.js silently drops unknown aliases: no WiFi set, no RF)
  3. every non-empty deviceID in sONOFF.config is known to the proxy
     aliases.json and carries the same alias there
  4. no duplicate alias / deviceID / RF code inside sONOFF.config
  5. every map-conf.json light code exists in sONOFF.config

Proxy-only devices (valves, heating, pumps) are reported as INFO, not errors.

Usage:
    tools/check-config.py                 # run from anywhere
    tools/check-config.py --aliases FILE  # override aliases.json path
                                          # (needed on .77: the sparse checkout
                                          #  does not contain eWeLink-Proxy/)

Exit status: 0 = consistent, 1 = problems found.
"""

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = HERE.parent                      # .../button2sONOFF
REPO = BASE.parent.parent               # repo root
DEFAULT_ALIASES = REPO / "eWeLink-Proxy/nodejs/core/aliases.json"
MAP_CONF = REPO / "LinuxServerScripts/iot-controller/map-conf.json"

# Devices that live in the proxy but are deliberately not lights.
NON_LIGHT = {"water-valves", "riscaldamento", "ricircolo", "irrigazione"}

errors, warnings, infos = [], [], []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def info(msg):
    infos.append(msg)


def parse_config(path):
    """deviceID : alias : RFcode : description  ->  list of dicts"""
    rows = []
    for n, raw in enumerate(path.read_text().splitlines(), 1):
        line = raw.split("//")[0].strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split(":")]
        if len(parts) < 4:
            warn(f"{path.name}:{n}: unparsable line: {raw.strip()!r}")
            continue
        devid, alias, rf, desc = parts[0], parts[1], parts[2], ":".join(parts[3:])
        rows.append(dict(line=n, devid=devid, alias=alias, rf=rf, desc=desc))
    return rows


def parse_list(path):
    """V s:CODE #name - description  ->  {code: name} for V lines only"""
    lights = {}
    for n, raw in enumerate(path.read_text().splitlines(), 1):
        line = raw.strip()
        if not line.startswith("V "):
            continue
        m = re.match(r"V\s+s:([0-9A-Fa-f]+)\s+#?\s*(\S*)", line)
        if not m:
            warn(f"{path.name}:{n}: unparsable V line: {raw.strip()!r}")
            continue
        lights[m.group(1).upper()] = m.group(2)
    return lights


def parse_buttons(path):
    """REMOTE_ID # name / button N: alias [...]  ->  list of (code, target, line)"""
    out, remote = [], None
    for n, raw in enumerate(path.read_text().splitlines(), 1):
        line = raw.split("#")[0].strip()
        if not line:
            continue
        if ":" not in line:
            remote = line.split()[0]
            continue
        left, right = (x.strip() for x in line.split(":", 1))
        button = left.split()[-1]
        for target in right.split():
            out.append((f"{remote}{button}", target, n))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--aliases", type=Path, default=DEFAULT_ALIASES,
                    help="path to eWeLink-Proxy aliases.json")
    args = ap.parse_args()

    cfg = parse_config(BASE / "config/sONOFF.config")
    lst = parse_list(BASE / "config/sONOFF.list")
    buttons = parse_buttons(BASE / "config/buttons.config")

    aliases = {}
    if args.aliases.exists():
        aliases = json.loads(args.aliases.read_text())
    else:
        warn(f"proxy aliases not found at {args.aliases} – checks 3/4 skipped "
             f"(pass --aliases)")

    by_alias = {r["alias"]: r for r in cfg}
    by_devid = {r["devid"]: r for r in cfg if r["devid"]}
    cfg_rf = {r["rf"].upper() for r in cfg}

    # 1. sONOFF.list codes must exist in sONOFF.config
    for code, name in lst.items():
        if code not in cfg_rf:
            err(f"sONOFF.list: RF code {code} ({name or '?'}) has no entry in sONOFF.config")
    for r in cfg:
        if r["rf"].upper() not in lst:
            info(f"sONOFF.config: {r['alias']} ({r['rf']}) has no wall-button entry "
                 f"in sONOFF.list (fine for lights with no button)")

    # 2. buttons.config targets must be defined in sONOFF.config
    for code, target, line in buttons:
        if target == "TEST":
            continue
        if target not in by_alias:
            err(f"buttons.config:{line}: button {code} -> {target!r} "
                f"is not an alias in sONOFF.config (press would be dropped)")

    # 3. deviceIDs known to the proxy, same alias
    if aliases:
        for r in cfg:
            if not r["devid"]:
                continue
            got = aliases.get(r["devid"])
            if got is None:
                warn(f"sONOFF.config: {r['alias']} uses deviceID {r['devid']} "
                     f"which the proxy does not know")
            elif got != r["alias"]:
                err(f"alias mismatch for {r['devid']}: sONOFF.config={r['alias']!r} "
                    f"proxy={got!r}")
        for devid, name in aliases.items():
            if devid not in by_devid and name not in NON_LIGHT:
                info(f"proxy: {devid} ({name}) is not mapped in sONOFF.config "
                     f"(no live state in the house map)")

    # 4. duplicates inside sONOFF.config
    for field, label in (("alias", "alias"), ("devid", "deviceID"), ("rf", "RF code")):
        seen = {}
        for r in cfg:
            key = r[field].upper()
            if not key:
                continue
            if key in seen:
                err(f"sONOFF.config: duplicate {label} {r[field]!r} "
                    f"(lines {seen[key]} and {r['line']})")
            seen[key] = r["line"]

    # 5. house-map codes must exist in sONOFF.config
    if MAP_CONF.exists():
        try:
            rooms = json.loads(MAP_CONF.read_text()).get("rooms", [])
            for room in rooms:
                for light in room.get("lights", []):
                    code = (light.get("code") or "").upper()
                    if code and code not in cfg_rf:
                        err(f"map-conf.json: {room.get('name')}/{light.get('name')} "
                            f"code {code} is not in sONOFF.config")
        except (json.JSONDecodeError, AttributeError) as exc:
            warn(f"map-conf.json unreadable: {exc}")
    else:
        info("map-conf.json not found – check 5 skipped")

    # report
    for m in infos:
        print(f"INFO  {m}")
    for m in warnings:
        print(f"WARN  {m}")
    for m in errors:
        print(f"ERROR {m}")

    print(f"\n{len(cfg)} lights, {len(lst)} wall-button codes, "
          f"{len(buttons)} button mappings, {len(aliases)} proxy devices")
    print("OK" if not errors else f"{len(errors)} error(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
