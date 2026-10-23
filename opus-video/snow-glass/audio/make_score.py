#!/usr/bin/env python3
"""Snow Glass — score.

Everything here is synthesized with numpy: a warm pad, a slow pair of bells,
wind made from filtered noise, and glass chimes that land exactly on the frames
where a snowflake hits the pane. Rendered to audio/score.wav, then normalised by
the skill's audio_tools.py.

  python3 make_score.py audio/score.wav
"""
import sys
import wave

import numpy as np

SR = 48000
DUR = 12.0
N = int(DUR * SR)
t = np.arange(N) / SR

# ---------------------------------------------------------------- helpers
def env(n, attack, decay, curve=1.0):
    x = np.arange(n) / SR
    a = np.minimum(1.0, x / max(attack, 1e-4))
    d = np.exp(-(x / decay) ** curve)
    return a * d


def place(buf, sig, at, gain=1.0):
    i = int(at * SR)
    if i >= len(buf):
        return
    n = min(len(sig), len(buf) - i)
    buf[i:i + n] += sig[:n] * gain


def sine(f, n, phase=0.0):
    return np.sin(2 * np.pi * f * np.arange(n) / SR + phase)


def pinkish(n, seed):
    """Noise shaped to a softer, pinker spectrum with a one-pole lowpass."""
    rng = np.random.default_rng(seed)
    x = rng.standard_normal(n)
    y = np.zeros_like(x)
    a = 0.985
    acc = 0.0
    for i in range(0, n, 4096):                     # block loop keeps it quick
        blk = x[i:i + 4096]
        out = np.empty_like(blk)
        for j, v in enumerate(blk):
            acc = a * acc + (1 - a) * v
            out[j] = acc
        y[i:i + blk.size] = out
    return y / (np.abs(y).max() or 1)


def bell(f, dur, decay=1.4, bright=0.35):
    n = int(dur * SR)
    sig = (sine(f, n) * 1.0
           + sine(f * 2.0, n) * bright * 0.5
           + sine(f * 3.01, n) * bright * 0.22
           + sine(f * 4.98, n) * bright * 0.10)
    return sig * env(n, 0.004, decay, 1.2)


def reverb_ir(seconds=2.6, seed=7):
    n = int(seconds * SR)
    rng = np.random.default_rng(seed)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (0.42 * SR))
    # soften the tail: one gentle lowpass pass over the IR
    k = np.exp(-2 * np.pi * 5200 / SR)
    acc = 0.0
    out = np.empty(n)
    for i, v in enumerate(ir):
        acc = k * acc + (1 - k) * v
        out[i] = acc
    out[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    return out / (np.abs(out).max() or 1)


def reverb(sig, wet=0.32):
    ir = reverb_ir()
    n = len(sig) + len(ir) - 1
    size = 1 << int(np.ceil(np.log2(n)))
    rev = np.fft.irfft(np.fft.rfft(sig, size) * np.fft.rfft(ir, size), size)[:n]
    rev = rev / (np.abs(rev).max() or 1) * (np.abs(sig).max() or 1)
    dry = np.zeros(n)
    dry[:len(sig)] = sig
    return dry * (1 - wet) + rev * wet


# ---------------------------------------------------------------- 1. pad
# Fmaj9 -> Am7 -> Dm9 : three slow chords, no drums, nothing quantised.
CHORDS = [
    (0.0, 4.4, [87.31, 130.81, 174.61, 220.00, 261.63]),      # F  A  C  E  F
    (4.0, 8.6, [110.00, 164.81, 220.00, 261.63, 329.63]),     # A  E  C  E  A
    (8.0, 12.6, [73.42, 110.00, 146.83, 220.00, 293.66]),     # D  A  D  A  D
]
pad = np.zeros(N)
for start, end, freqs in CHORDS:
    n = int((end - start) * SR)
    x = np.arange(n) / SR
    seg = np.zeros(n)
    for i, f in enumerate(freqs):
        wobble = 1.0 + 0.0016 * np.sin(2 * np.pi * (0.21 + i * 0.07) * x + i)
        amp = 0.55 - i * 0.07
        seg += np.sin(2 * np.pi * f * x * wobble) * amp
        seg += np.sin(2 * np.pi * f * 2.002 * x * wobble) * amp * 0.12
        seg += np.sin(2 * np.pi * f * 0.5 * x) * amp * 0.30
    fade = np.minimum(1, x / 1.5) * np.minimum(1, np.maximum(0, (n / SR - x) / 1.8))
    place(pad, seg * fade, start, 0.30)

# ---------------------------------------------------------------- 2. wind
w = pinkish(N, 11)
gust = 0.5 + 0.5 * np.sin(2 * np.pi * 0.075 * t - 0.8)
gust = 0.35 + 0.65 * gust ** 2
wind = w * gust
# a second, airier band with a slow wide sweep
w2 = pinkish(N, 23)
wind += w2 * 0.5 * (0.55 + 0.45 * np.sin(2 * np.pi * 0.043 * t + 2.1)) ** 2
wind *= 0.05
wind *= np.minimum(1, t / 2.0)                       # the wind arrives with the frame
wind *= np.minimum(1, np.maximum(0, (DUR - t) / 1.2))

# ---------------------------------------------------------------- 3. bells
# Two voices that answer each other, in the key of the pad.
bells = np.zeros(N)
NOTES = [
    (0.9, 523.25, 0.30), (1.9, 659.25, 0.22), (3.1, 783.99, 0.26),
    (4.6, 880.00, 0.24), (6.0, 659.25, 0.22), (7.3, 587.33, 0.26),
    (8.6, 523.25, 0.24), (10.0, 440.00, 0.30),
]
for at, f, g in NOTES:
    place(bells, bell(f, 3.4, 1.5, 0.30), at, g)

# ---------------------------------------------------------------- 4. glass chimes
# These land on the frames where a flake touches the pane (see ON_GLASS in
# scene/lib.js), so the picture and the sound share one timeline.
chimes = np.zeros(N)
HITS = [2.4, 3.3, 4.4, 5.3, 6.4, 7.2, 8.1, 8.9]
SCALE = [1046.50, 1174.66, 1318.51, 1396.91, 1567.98, 1760.00]
for i, at in enumerate(HITS):
    f = SCALE[i % len(SCALE)] * (2 if i % 3 == 2 else 1)
    place(chimes, bell(f, 1.8, 0.55, 0.55), at, 0.22 + 0.03 * (i % 3))

# panel + card arrivals: a soft low thump, no click
thumps = np.zeros(N)
for at, g in ((0.32, 0.26), (5.9, 0.20)):
    n = int(0.55 * SR)
    x = np.arange(n) / SR
    f = 120 * np.exp(-x * 5.5) + 46
    thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.004, 0.14)
    place(thumps, thump, at, g)

# ---------------------------------------------------------------- mix
music = pad + bells + chimes + thumps
music = reverb(music, wet=0.36)[:N]
while len(music) < N:
    music = np.pad(music, (0, N - len(music)))
mix = music * 1.0 + wind * 0.55
mix *= np.minimum(1, np.minimum(t / 0.35, (DUR - t) / 0.9).clip(0, 1))
mix = np.tanh(mix * 1.05) * 0.92
mix = mix / (np.abs(mix).max() or 1) * 0.80

out = sys.argv[1] if len(sys.argv) > 1 else "audio/score.wav"
import os
os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
with wave.open(out, "wb") as fh:
    fh.setnchannels(1)
    fh.setsampwidth(2)
    fh.setframerate(SR)
    fh.writeframes((mix * 32767).astype(np.int16).tobytes())
print(f"{out}: {DUR}s, {SR} Hz mono")
