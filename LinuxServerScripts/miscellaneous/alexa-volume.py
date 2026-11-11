#!/usr/bin/env python3
"""alexa-volume — read (and optionally set) the volume of Alexa devices.

Uses the same refresh token already stored by alexacli in
~/.alexa-cli/config.json (cookie exchange via api.amazon.com, no client id),
then queries the unofficial endpoint
    GET https://layla.amazon.com/api/devices/deviceType/dsn/audio/v1/allDeviceVolumes

Usage:
    alexa-volume                  # table of every device that reports a volume
    alexa-volume living           # only that device (name or serial)
    alexa-volume living --set 4   # set it (Alexa's 0-10 scale), then re-read
    alexa-volume --json           # machine-readable

Note the two scales: the API reports speakerVolume 0-100 (percent), while
Alexa's own "volume N" utterance accepts 0-10. --set takes the 0-10 value.

Exit codes: 0 ok, 1 auth/API error, 2 device not found.
"""
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request

CONFIG = os.environ.get("ALEXA_CLI_CONFIG", os.path.expanduser("~/.alexa-cli/config.json"))
ALEXACLI = os.environ.get("ALEXACLI", "/usr/local/bin/alexacli")
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120 Safari/537.36"
)


def cookies_for(refresh_token, domain):
    """Exchange the refresh token for the web session cookies (same as alexacli)."""
    data = urllib.parse.urlencode(
        {
            "app_name": "Amazon Alexa",
            "requested_token_type": "auth_cookies",
            "source_token_type": "refresh_token",
            "source_token": refresh_token,
            "domain": "." + domain,
        }
    ).encode()
    req = urllib.request.Request(
        "https://api.amazon.com/ap/exchangetoken/cookies",
        data=data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "x-amzn-identity-auth-domain": "api." + domain,
        },
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        payload = json.load(r)
    cookies = {}
    for _dom, entries in payload["response"]["tokens"]["cookies"].items():
        for c in entries:
            cookies[c["Name"]] = c["Value"]
    if not cookies:
        raise RuntimeError("token exchange returned no cookies")
    return cookies


class Api:
    def __init__(self, cookies):
        self.headers = {
            "Cookie": "; ".join(f"{k}={v}" for k, v in cookies.items()),
            "User-Agent": UA,
            "Accept": "application/json",
        }
        self.base = self._pick_base()

    def get(self, path):
        url = self.base + path
        req = urllib.request.Request(url, headers=self.headers)
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)

    def _pick_base(self):
        # alexacli uses layla.amazon.com for .com accounts; keep a fallback list.
        candidates = ["https://layla.amazon.com", "https://alexa.amazon.com"]
        for base in candidates:
            try:
                self.get_abs(base + "/api/devices/deviceType/dsn/audio/v1/allDeviceVolumes")
                return base
            except Exception:  # noqa: BLE001 - try the next host
                continue
        raise RuntimeError("no Alexa endpoint answered (check the refresh token)")

    def get_abs(self, url):
        req = urllib.request.Request(url, headers=self.headers)
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)


def collect(api):
    devices = api.get("/api/devices-v2/device?cached=true").get("devices", [])
    names = {d.get("serialNumber"): d.get("accountName") for d in devices}
    families = {d.get("serialNumber"): d.get("deviceFamily") for d in devices}
    online = {d.get("serialNumber"): d.get("online") for d in devices}
    vols = api.get("/api/devices/deviceType/dsn/audio/v1/allDeviceVolumes").get("volumes", [])
    rows = []
    for v in vols:
        dsn = v.get("dsn")
        rows.append(
            {
                "name": names.get(dsn),
                "serial": dsn,
                "family": families.get(dsn),
                "online": online.get(dsn),
                "volume": v.get("speakerVolume"),
                "muted": v.get("speakerMuted"),
                "alert_volume": v.get("alertVolume"),
            }
        )
    rows.sort(key=lambda r: (r["family"] != "ECHO", r["name"] or ""))
    return rows


def set_volume(device, level):
    subprocess.run([ALEXACLI, "command", f"volume {level}", "-d", device], check=True)


def main(argv):
    want_json = "--json" in argv
    set_to = None
    args = []
    it = iter(argv)
    for a in it:
        if a == "--set":
            try:
                set_to = int(next(it))
            except (StopIteration, ValueError):
                print("--set needs a number 0-100", file=sys.stderr)
                return 2
        elif a.startswith("--set="):
            set_to = int(a.split("=", 1)[1])
        elif a in ("-h", "--help"):
            print(__doc__)
            return 0
        elif not a.startswith("-"):
            args.append(a)

    cfg = json.load(open(CONFIG))
    domain = cfg.get("amazon_domain", "amazon.com")
    api = Api(cookies_for(cfg["refresh_token"], domain))
    rows = collect(api)

    if set_to is not None:
        if not args:
            print("--set needs a device (name or serial)", file=sys.stderr)
            return 2
        if not 0 <= set_to <= 10:
            print("volume must be 0-10 (Alexa's own scale; the API value is percent)", file=sys.stderr)
            return 2
        target = args[0]
        row = next((r for r in rows if target in (r["name"], r["serial"])), None)
        if row is None:
            print(f"device not found: {target}", file=sys.stderr)
            return 2
        set_volume(row["name"] or row["serial"], set_to)
        time.sleep(2)
        rows = collect(api)

    if args:
        rows = [r for r in rows if args[0] in (r["name"], r["serial"])]
        if not rows:
            print(f"device not found or reports no volume: {args[0]}", file=sys.stderr)
            return 2

    if want_json:
        print(json.dumps({"data": rows, "success": True}, indent=2))
        return 0

    for r in rows:
        state = "muted" if r["muted"] else "unmuted"
        vol = r["volume"]
        level = "-" if vol is None else f"{vol / 10:g}/10"
        print(
            f"{(r['name'] or '?'):<28} {r['serial']:<34} {str(r['family'] or '?'):<8} "
            f"volume {str(vol):>3} ({level})  {state}"
        )
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception as exc:  # noqa: BLE001 - CLI tool: report, don't traceback
        print(f"alexa-volume: {exc}", file=sys.stderr)
        sys.exit(1)
