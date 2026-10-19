#!/usr/bin/env python3
"""serialdiag.py — is the USB-serial *driver* alive, or is your firmware silent?

Why this exists: on macOS a CH340 USB-serial tty can end up in a state where the
device node still exists (and even shows up in `ioreg`) but the driver refuses
every termios change. The symptom is a capture script dying with
`termios.error: (22, 'Invalid argument')` on `tcsetattr`, or `stty ... 115200`
failing with the same. It typically happens after unplugging/replugging the board
while a process still holds the port (seen 2026-10-19 with the laundry unit's
ESP8266). It looks exactly like a firmware fault, and it is not — **a physical
unplug/replug of the USB cable clears it**; nothing on the software side can
(IOSSIOSPEED returns `Device error` too).

So: before you suspect the sketch, run this. Interpretation:
  - `tcgetattr OK` + `tcsetattr … OK`  → driver fine; silence is real (firmware/RF).
  - `tcgetattr OK` + every `tcsetattr` FAILED → driver wedged ⇒ replug the USB.
  - `open failed` / no candidate ports     → board not attached at all.

Usage: python3 macos/serialdiag.py [/dev/cu.usbserial-XXXX]
Exit: 0 = driver usable, 1 = wedged / unusable.
"""
import os
import sys
import termios

CANDIDATES = (
    "/dev/cu.usbserial-110",
    "/dev/cu.usbserial-210",
    "/dev/cu.usbserial-0001",
    "/dev/cu.wchusbserial110",
    "/dev/cu.wchusbserial210",
)
SPEEDS = (("9600", termios.B9600), ("115200", termios.B115200))


def check(path):
    """Return True if the port opened and accepted every speed."""
    print("\n===", path)
    if not os.path.exists(path):
        print("  does not exist (board detached?)")
        return False
    try:
        fd = os.open(path, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    except OSError as exc:
        print("  open failed:", exc)
        return False

    try:
        base = termios.tcgetattr(fd)
        print("  tcgetattr OK  cflag=%#x ispeed=%r" % (base[2], base[4]))
    except Exception as exc:
        print("  tcgetattr FAILED:", type(exc).__name__, exc)
        os.close(fd)
        return False

    ok = True
    for name, speed in SPEEDS:
        attrs = list(base)
        attrs[0] = 0                                        # iflag: raw
        attrs[1] = 0                                        # oflag: raw
        attrs[2] = termios.CS8 | termios.CREAD | termios.CLOCAL
        attrs[3] = 0                                        # lflag: raw
        attrs[4] = speed
        attrs[5] = speed
        attrs[6][termios.VMIN] = 0
        attrs[6][termios.VTIME] = 1
        try:
            termios.tcsetattr(fd, termios.TCSANOW, attrs)
            print("  tcsetattr %-6s OK" % name)
        except Exception as exc:
            print("  tcsetattr %-6s FAILED: %s %s" % (name, type(exc).__name__, exc))
            ok = False

    try:
        data = os.read(fd, 256)
        print("  read -> %d bytes %r" % (len(data), data[:48]))
    except BlockingIOError:
        print("  read -> no data pending (normal when idle)")
    except Exception as exc:
        print("  read failed:", type(exc).__name__, exc)

    os.close(fd)
    return ok


def main():
    ports = sys.argv[1:] or [p for p in CANDIDATES if os.path.exists(p)]
    if not ports:
        print("no candidate USB-serial port found — the board is not attached")
        print("(checked: %s)" % ", ".join(CANDIDATES))
        return 1

    results = [check(p) for p in ports]
    usable = any(results)
    print()
    if usable:
        print("VERDICT: driver usable — silence on the wire is real (firmware / RF input).")
        return 0
    print("VERDICT: port unusable — UNPLUG and REPLUG the USB cable, then retry.")
    print("         (software cannot clear this: IOSSIOSPEED fails with 'Device error')")
    return 1


if __name__ == "__main__":
    sys.exit(main())
