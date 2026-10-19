#!/usr/bin/env python3
"""serialid.py PORT SECONDS — reset the ESP (DTR/RTS) and print the serial output.

Opening the port alone does not reliably reset these CH340 boards, so this toggles
DTR/RTS to force a boot banner, then prints everything collected. `arduino-cli monitor`
reads zero bytes on these boards. Identify a unit by the banner id, never by the port
(every board here is CH340, so the device path is the same whichever one is plugged in).

See also: serialcap.py (stream, no reset), serialreset.py (reset + stream, flushed).
"""
import os, sys, time, termios, fcntl, struct, errno

PORT = sys.argv[1] if len(sys.argv) > 1 else '/dev/cu.usbserial-0001'
SECS = float(sys.argv[2]) if len(sys.argv) > 2 else 16.0

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
    fcntl.ioctl(fd, TIOCMBIS if on else TIOCMBIC, struct.pack('i', bit))

setbit(TIOCM_DTR, False)
setbit(TIOCM_RTS, True)
time.sleep(0.15)
setbit(TIOCM_RTS, False)
time.sleep(0.1)

out = bytearray()
t0 = time.time()
while time.time() - t0 < SECS:
    try:
        b = os.read(fd, 4096)
    except BlockingIOError:
        b = b''
    except OSError as e:
        if e.errno in (errno.EAGAIN, errno.EWOULDBLOCK):
            b = b''
        else:
            raise
    if b:
        out += b
    else:
        time.sleep(0.03)

os.close(fd)
sys.stdout.write("=== %d bytes from %s ===\n" % (len(out), PORT))
sys.stdout.write(out.decode('utf-8', 'replace'))
