#!/usr/bin/env python3
"""rf-frame-check.py — prove (or disprove) that receivers frame each line correctly.

WHY THIS EXISTS
    `.77` has no `tcpdump` and this is the only way to look at the wire there. The
    receivers talk to `.77:1234` through ONE shared pipe (`socat -u ...,fork STDOUT`),
    so if a receiver emits a message payload and its "\\r\\n" terminator as two TCP
    segments, the chunks of two receivers can interleave and the later message is
    silently dropped by the positional parser (~13 % of receptions, fixed in firmware
    v2.2 by `sendLine()`, see DOCs/RF-EVENT-FUSION.md section 7).

    This script reads raw Ethernet frames (root, no dependencies, no tcpdump) and
    reports, per TCP segment, whether a `0A1400a` message arrived COMPLETE in one
    segment, SPLIT (no terminator yet -> the old bug) or MERGED (two messages in one
    segment -> a v1-era split line that landed inside another).

USAGE (on .77, as root)
    /tmp/rf-frame-check.py                 # 30 s on TCP 1234 (the receiver link)
    /tmp/rf-frame-check.py -t 60           # longer window
    /tmp/rf-frame-check.py --udp 8266      # dump the OTA handshake instead
    /tmp/rf-frame-check.py --iface end0    # override auto-detected interface

    Exit status: 0 = clean, 1 = at least one SPLIT/MERGED segment (a framing bug).

NOTE: a receiver only transmits on a real button press, so you need a press during
the window (or reset a board on USB to catch its `<rx-id> connected` hello, which
uses the same `sendLine()` path).
"""
import argparse
import socket
import struct
import sys
import time

TCP, UDP = 6, 17


def default_iface():
    """Interface carrying the default route (end0 on .77)."""
    try:
        with open("/proc/net/route") as fh:
            for line in fh:
                f = line.split()
                if len(f) > 3 and f[1] == "00000000" and int(f[3], 16) & 2:
                    return f[0]
    except OSError:
        pass
    return "eth0"


def frames(iface, want_proto):
    """Yield (proto, src, dst, sport, dport, payload) for matching IPv4 frames."""
    sock = socket.socket(socket.AF_PACKET, socket.SOCK_RAW, socket.ntohs(0x0003))
    sock.bind((iface, 0))
    sock.settimeout(1.0)
    while True:
        try:
            data, _ = sock.recvfrom(65535)
        except socket.timeout:
            yield None
            continue
        if len(data) < 34:
            continue
        off, proto = 14, struct.unpack("!H", data[12:14])[0]
        if proto == 0x8100:  # 802.1Q
            proto = struct.unpack("!H", data[16:18])[0]
            off = 18
        if proto != 0x0800:
            continue
        ip = data[off:]
        if len(ip) < 20 or ip[9] != want_proto:
            continue
        # Trust the IP total length: tiny frames carry Ethernet padding (zeros).
        ip = ip[: struct.unpack("!H", ip[2:4])[0]]
        ihl = (ip[0] & 0x0F) * 4
        src, dst = socket.inet_ntoa(ip[12:16]), socket.inet_ntoa(ip[16:20])
        if want_proto == TCP:
            seg = ip[ihl:]
            if len(seg) < 20:
                continue
            sport, dport = struct.unpack("!HH", seg[0:4])
            doff = (seg[12] >> 4) * 4
            yield TCP, src, dst, sport, dport, seg[doff:], seg[13]
        else:
            seg = ip[ihl:]
            if len(seg) < 8:
                continue
            sport, dport, ulen = struct.unpack("!HHH", seg[0:6])
            yield UDP, src, dst, sport, dport, seg[8:ulen if ulen >= 8 else len(seg)], 0


def stamp():
    return time.strftime("%H:%M:%S") + f".{int(time.time() * 1000) % 1000:03d}"


def main():
    ap = argparse.ArgumentParser(description="Check receiver line framing on the wire.")
    ap.add_argument("-t", "--seconds", type=float, default=30.0)
    ap.add_argument("-p", "--port", type=int, default=1234)
    ap.add_argument("--udp", type=int, metavar="PORT",
                    help="sniff UDP instead (e.g. 8266 for the OTA handshake)")
    ap.add_argument("--iface", default=None)
    ap.add_argument("-q", "--quiet", action="store_true",
                    help="only print the summary + problems")
    args = ap.parse_args()

    iface = args.iface or default_iface()
    proto = UDP if args.udp else TCP
    port = args.udp or args.port
    verb = "udp" if proto == UDP else "tcp"
    print(f"# sniffing {iface} {verb}/{port} for {args.seconds:.0f}s "
          f"(ctrl-C to stop early)", flush=True)

    end = time.time() + args.seconds
    seen = complete = split = merged = 0
    problems = []
    reader = frames(iface, proto)
    while time.time() < end:
        for frame in reader:
            if frame is None:  # 1 s idle tick
                break
            _p, src, dst, sport, dport, payload, _flags = frame
            if port not in (sport, dport) or not payload:
                continue
            seen += 1
            if proto == UDP:
                print(f"{stamp()} {src}:{sport} -> {dst}:{dport} len={len(payload)} {payload!r}",
                      flush=True)
                continue
            # TCP: classify the framing of RF lines.
            n_msgs = payload.count(b"0A1400a")
            verdict = ""
            if n_msgs > 1:
                merged += 1
                verdict = "  <<< MERGED (two messages in one segment)"
            elif n_msgs == 1:
                if payload.rstrip(b"\r\n") and payload.endswith((b"\n",)):
                    complete += 1
                    verdict = "  ok (complete line)"
                else:
                    split += 1
                    verdict = "  <<< SPLIT (message without its terminator)"
            if problems is None:
                problems = []
            if verdict.startswith("  <<<"):
                problems.append(f"{stamp()} {src}:{sport} len={len(payload)} {verdict.strip()}")
            if not args.quiet or verdict.startswith("  <<<"):
                print(f"{stamp()} {src}:{sport} -> {dst}:{dport} len={len(payload)} "
                      f"{payload!r}{verdict}", flush=True)

    if proto == UDP:
        print(f"# {seen} udp payload(s)")
        return 0

    print(f"\n# segments with payload: {seen}   complete-line: {complete}   "
          f"split: {split}   merged: {merged}")
    for p in problems:
        print("# PROBLEM " + p)
    if split or merged:
        print("# VERDICT: framing bug present — each line must be ONE write() "
              "(firmware sendLine(), see DOCs/RF-EVENT-FUSION.md section 7)")
        return 1
    print("# VERDICT: clean (no split/merged RF lines seen)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
