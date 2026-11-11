#!/usr/bin/env python3
"""
Generate the wall-panel UI sounds in ../sounds/.

Usage:  python3 tools/make-sounds.py

The tones are plain 16-bit mono PCM WAVs so that every browser - including the
old iOS 9/12 Safari on the wall panel - can play them through an <audio>
element. They are played that way on purpose: on iOS an AudioContext runs in
the "ambient" audio session and is silenced by the hardware mute switch,
while media elements use the "playback" session and stay audible.

Design notes:
  * peak amplitude is close to full scale: iOS ignores HTMLMediaElement.volume,
    so the file itself is the only volume control we have.
  * every blip starts with a very short noise transient. It gives the sound a
    crisp "click" attack, which is what makes it readable as "the press was
    detected" even at low media volume.
  * envelope: fast attack, exponential decay, so a blip is a tick and not a beep.
"""

import math
import os
import random
import struct
import wave

RATE = 22050
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sounds")


def blip(freq, start, duration, peak, samples, transient=0.35):
    """Add one enveloped sine blip (plus a click transient) to `samples`."""
    from_i = int(start * RATE)
    count = int(duration * RATE)
    for i in range(count):
        t = i / RATE
        attack = min(1.0, t / 0.004)
        decay = math.exp(-4.0 * t / duration)
        value = math.sin(2 * math.pi * freq * t) * attack * decay * peak

        # 4 ms noise transient at the front: the "click" that carries the
        # press feedback.
        if t < 0.004:
            value += random.uniform(-1.0, 1.0) * transient * peak * (1.0 - t / 0.004)

        idx = from_i + i
        if idx < len(samples):
            samples[idx] += value


def build(spec, length, peak):
    samples = [0.0] * int(length * RATE)
    for freq, start, duration in spec:
        blip(freq, start, duration, peak, samples)
    return samples


def write(name, samples, normalize=0.95):
    path = os.path.join(OUT_DIR, name)

    # Normalise to just under full scale: iOS ignores HTMLMediaElement.volume,
    # so the file's own amplitude is the only volume control we have.
    if normalize:
        peak = max(abs(v) for v in samples) or 1.0
        scale = normalize / peak
        samples = [v * scale for v in samples]

    frames = bytearray()
    for v in samples:
        v = max(-1.0, min(1.0, v))
        frames += struct.pack("<h", int(v * 32767))
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(frames))
    print("%-16s %6d bytes  %.2fs" % (name, os.path.getsize(path), len(samples) / RATE))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    random.seed(20261111)  # reproducible files

    peak = 0.92

    # Switching ON: rising pair. Switching OFF: the same pair, falling.
    write("on.wav", build([(880, 0, 0.07), (1319, 0.075, 0.09)], 0.19, peak))
    write("off.wav", build([(1319, 0, 0.07), (880, 0.075, 0.09)], 0.19, peak))

    # Command rejected by the server: a low, slightly longer buzz.
    write("error.wav", build([(196, 0, 0.20)], 0.22, peak))

    # 100 ms of silence: used once to activate the iOS playback session, so
    # the first real press is not delayed by session start-up.
    write("silence.wav", [0.0] * int(0.10 * RATE), normalize=0)

    # 2 s tone for setting the media volume: start it, then drag the iPad's
    # volume slider in Control Center while it plays.
    tone = []
    count = int(2.0 * RATE)
    for i in range(count):
        t = i / RATE
        env = min(1.0, t / 0.05) * min(1.0, (2.0 - t) / 0.05)
        tone.append(math.sin(2 * math.pi * 440 * t) * env * 0.7)
    write("test-loop.wav", tone)


if __name__ == "__main__":
    main()
