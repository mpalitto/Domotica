#!/usr/bin/env python3
"""serialreset.py PORT OUTFILE SECONDS — reset the ESP (DTR/RTS) then stream serial
to OUTFILE, flushing every chunk.

Unlike serialcap.py this resets the board first, so the output *starts* with the boot
banner: if the banner lands in the file, the capture path is proven live and any
silence afterwards is real RF silence (not a dead reader).
"""
import os, sys, time, termios, fcntl, struct

PORT = sys.argv[1] if len(sys.argv) > 1 else "/dev/cu.usbserial-210"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/reset-serial.log"
SECS = float(sys.argv[3]) if len(sys.argv) > 3 else 120.0

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

TIOCM_DTR = 0x0002
TIOCM_RTS = 0x0004
TIOCMBIS = 0x8004746c
TIOCMBIC = 0x8004746b


def setbit(bit, on):
    fcntl.ioctl(fd, TIOCMBIS if on else TIOCMBIC, struct.pack("i", bit))


f = open(OUT, "wb", 0)
f.write(b"# reset+stream started %s for %.0fs (DTR/RTS reset to follow)\n"
        % (time.strftime("%H:%M:%S").encode(), SECS))

# reset pulse
setbit(TIOCM_DTR, False)
setbit(TIOCM_RTS, True)
time.sleep(0.15)
setbit(TIOCM_RTS, False)

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

f.write(b"\n# reset+stream ended %s\n" % time.strftime("%H:%M:%S").encode())
f.close()
os.close(fd)
