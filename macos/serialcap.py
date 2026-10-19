#!/usr/bin/env python3
"""serialcap.py PORT OUTFILE SECONDS — stream the ESP's serial output to a file, unbuffered.

Unlike serialid.py (which collects and prints at the end) this flushes every chunk,
so the file can be read while the capture is still running. Deliberately does NOT
toggle DTR/RTS: we want the running firmware's output, not a reset.
"""
import os, sys, time, termios

PORT = sys.argv[1] if len(sys.argv) > 1 else "/dev/cu.usbserial-0001"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/press-serial.log"
SECS = float(sys.argv[3]) if len(sys.argv) > 3 else 900.0

f = open(OUT, "wb", 0)
fd = os.open(PORT, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
attrs = termios.tcgetattr(fd)
attrs[0] = 0
attrs[1] = 0
attrs[2] = termios.CS8 | termios.CREAD | termios.CLOCAL
attrs[3] = 0
attrs[4] = termios.B115200
attrs[5] = termios.B115200
attrs[6][termios.VMIN] = 0
attrs[6][termios.VTIME] = 1
termios.tcsetattr(fd, termios.TCSANOW, attrs)
f.write(b"# capture started %s for %.0fs\n" % (time.strftime("%H:%M:%S").encode(), SECS))

end = time.time() + SECS
while time.time() < end:
    try:
        b = os.read(fd, 4096)
    except (BlockingIOError, OSError):
        b = b""
    if b:
        f.write(b)
        f.flush()
    else:
        time.sleep(0.05)

f.write(b"\n# capture ended %s\n" % time.strftime("%H:%M:%S").encode())
f.close()
os.close(fd)