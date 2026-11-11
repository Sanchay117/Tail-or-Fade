// Composes the film's music in code (no samples, no licences):
//   public/sfx/teaser.wav   24 s, cut with scenes/Teaser.tsx on the same grid
//   public/sfx/bed.wav      64 s loop that sits quietly under the demo
//
// 120 BPM in A minor, so a bar is 2 s or 60 frames.
//   bars 0-1   two tones pull apart, one rising and one falling, over a ticker
//   bars 2-4   the count: bass and a soft kick come in
//   bars 5-7   the build: arpeggio, snare roll and a riser, then half a bar of nothing
//   bar 8      the drop, under the title, and a ring-out to 24 s
//
//   node scripts/music.ts

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 48000;
const BEAT = 0.5;
const BAR = 4 * BEAT;
const DROP = 8 * BAR;
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sfx");
mkdirSync(out, { recursive: true });

type Bus = [Float32Array, Float32Array];
const bus = (seconds: number): Bus => [new Float32Array(Math.ceil(seconds * SR)), new Float32Array(Math.ceil(seconds * SR))];

let seed = 0x7a11fade;
const noise = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) / 0xffffffff) * 2 - 1;
};
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** Adds a mono voice into a bus at `at` seconds, panned -1..1. */
function put(b: Bus, at: number, x: Float32Array, gain: number, pan = 0) {
  const s = Math.round(at * SR);
  const l = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const r = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < x.length && s + i < b[0].length; i++) {
    if (s + i < 0) continue;
    b[0][s + i] += x[i] * l;
    b[1][s + i] += x[i] * r;
  }
}

function lowpass(x: Float32Array, hz: number | ((i: number) => number)) {
  const y = new Float32Array(x.length);
  let z = 0;
  for (let i = 0; i < x.length; i++) {
    const f = typeof hz === "number" ? hz : hz(i);
    const a = 1 - Math.exp((-2 * Math.PI * f) / SR);
    z += a * (x[i] - z);
    y[i] = z;
  }
  return y;
}
function highpass(x: Float32Array, hz: number) {
  const lp = lowpass(x, hz);
  return x.map((v, i) => v - lp[i]);
}

/** Saw with a little detune, softened. */
function saw(freq: number, seconds: number, detune = 0.004) {
  const n = Math.ceil(seconds * SR);
  const y = new Float32Array(n);
  let p1 = 0;
  let p2 = 0.37;
  for (let i = 0; i < n; i++) {
    p1 = (p1 + freq / SR) % 1;
    p2 = (p2 + (freq * (1 + detune)) / SR) % 1;
    y[i] = (p1 * 2 - 1 + (p2 * 2 - 1)) * 0.5;
  }
  return y;
}
function sine(freq: number | ((t: number) => number), seconds: number) {
  const n = Math.ceil(seconds * SR);
  const y = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const f = typeof freq === "number" ? freq : freq(i / SR);
    ph += (2 * Math.PI * f) / SR;
    y[i] = Math.sin(ph);
  }
  return y;
}
/** Attack, then exponential decay. */
function env(x: Float32Array, attack: number, decay: number, sustain = 0, release = 0.05) {
  const a = attack * SR;
  const rel = release * SR;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    let g = i < a ? i / a : sustain + (1 - sustain) * Math.exp(-(t - attack) / decay);
    if (i > x.length - rel) g *= (x.length - i) / rel;
    x[i] *= g;
  }
  return x;
}

function kick(gain = 1) {
  const x = env(sine((t) => 48 + 110 * Math.exp(-t * 30), 0.5), 0.002, 0.16);
  return x.map((v) => Math.tanh(v * 1.6) * gain);
}
function hat(open = false) {
  const n = new Float32Array(Math.ceil((open ? 0.22 : 0.05) * SR)).map(noise);
  return env(highpass(n, 7000), 0.001, open ? 0.08 : 0.018);
}
function clap() {
  const n = new Float32Array(Math.ceil(0.25 * SR)).map(noise);
  const x = env(lowpass(highpass(n, 900), 5000), 0.003, 0.07);
  return x;
}
function pluck(note: number, seconds = 0.35) {
  const x = saw(midi(note), seconds, 0.006);
  return env(lowpass(x, (i) => 600 + 4200 * Math.exp(-i / SR / 0.07)), 0.003, 0.12);
}
function bass(note: number, seconds: number) {
  const x = saw(midi(note), seconds, 0.002);
  const s = sine(midi(note - 12), seconds);
  const y = lowpass(x, 520).map((v, i) => v * 0.8 + s[i] * 0.6);
  return env(y, 0.004, 0.2, 0.55, 0.04);
}
function pad(notes: number[], seconds: number) {
  const y = new Float32Array(Math.ceil(seconds * SR));
  for (const n of notes) {
    const x = saw(midi(n), seconds, 0.007);
    for (let i = 0; i < y.length; i++) y[i] += x[i] / notes.length;
  }
  const f = lowpass(y, 1400);
  const a = Math.min(1.2, seconds / 3) * SR;
  const r = Math.min(1.5, seconds / 3) * SR;
  return f.map((v, i) => v * Math.min(1, i / a, (f.length - i) / r));
}
function riser(seconds: number) {
  const n = new Float32Array(Math.ceil(seconds * SR)).map(noise);
  const x = lowpass(n, (i) => 300 + 9000 * Math.pow(i / n.length, 2.2));
  return x.map((v, i) => v * Math.pow(i / x.length, 2));
}
function impact() {
  const boom = env(sine((t) => 38 + 70 * Math.exp(-t * 9), 2.4), 0.002, 0.7);
  const air = env(lowpass(new Float32Array(Math.ceil(1.6 * SR)).map(noise), 2400), 0.002, 0.35);
  return boom.map((v, i) => Math.tanh(v * 1.4) + (air[i] ?? 0) * 0.4);
}
/** Two tones pulling apart: one climbs, one falls. */
function split(seconds: number, up: boolean) {
  const x = sine((t) => midi(69) * Math.pow(2, ((up ? 1 : -1) * 7 * t) / seconds / 12), seconds);
  const a = 0.3 * SR;
  return x.map((v, i) => v * Math.min(1, i / a) * Math.min(1, (x.length - i) / (0.6 * SR)));
}

/** Small stereo room: a few feedback combs per side. */
function room(b: Bus, mix = 0.25): Bus {
  const out: Bus = [new Float32Array(b[0]), new Float32Array(b[1])];
  const combs = [[0.0297, 0.0371, 0.0411, 0.0437], [0.0313, 0.0353, 0.0427, 0.0449]];
  for (const side of [0, 1]) {
    for (const d of combs[side]) {
      const len = Math.round(d * SR);
      const buf = new Float32Array(len);
      let k = 0;
      for (let i = 0; i < b[side].length; i++) {
        const y = buf[k];
        buf[k] = b[side][i] * 0.5 + y * 0.78;
        out[side][i] += (y * mix) / 4;
        k = (k + 1) % len;
      }
    }
  }
  return out;
}

function write(name: string, b: Bus, peak = 0.89) {
  let max = 0;
  for (const ch of b) for (const v of ch) max = Math.max(max, Math.abs(v));
  const gain = max > 0 ? peak / max : 1;
  const n = b[0].length;
  const pcm = Buffer.alloc(44 + n * 4);
  pcm.write("RIFF", 0);
  pcm.writeUInt32LE(36 + n * 4, 4);
  pcm.write("WAVEfmt ", 8);
  pcm.writeUInt32LE(16, 16);
  pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(2, 22);
  pcm.writeUInt32LE(SR, 24);
  pcm.writeUInt32LE(SR * 4, 28);
  pcm.writeUInt16LE(4, 32);
  pcm.writeUInt16LE(16, 34);
  pcm.write("data", 36);
  pcm.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b[0][i] * gain)) * 32767), 44 + i * 4);
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, b[1][i] * gain)) * 32767), 46 + i * 4);
  }
  writeFileSync(join(out, `${name}.wav`), pcm);
  console.log(`${name}.wav  ${(n / SR).toFixed(1)} s`);
}

// A minor: Am, F, C, G, as MIDI roots and chords.
const ROOTS = [45, 41, 48, 43];
const CHORDS = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]];

// ---- Teaser ----
{
  const LEN = 24;
  const T = bus(LEN);
  // Bars 0-1: the split and the ticker.
  put(T, 0.2, split(3.6, true), 0.16, -0.6);
  put(T, 0.2, split(3.6, false), 0.16, 0.6);
  for (let s = 0; s < 16; s++) put(T, s * 0.25, hat(), s % 2 ? 0.05 : 0.09, s % 2 ? 0.3 : -0.3);
  put(T, 0, pad(CHORDS[0], 4.4), 0.12);
  // Bars 2-4: the count.
  for (let bar = 2; bar < 5; bar++) {
    const t0 = bar * BAR;
    for (let b = 0; b < 4; b++) put(T, t0 + b * BEAT, kick(b === 0 ? 0.8 : 0.55), 0.55);
    for (let e = 0; e < 8; e++) {
      put(T, t0 + e * 0.25, bass(ROOTS[(bar - 2) % 4], 0.22), 0.18);
      put(T, t0 + e * 0.25 + 0.125, hat(), 0.06, e % 2 ? 0.25 : -0.25);
    }
    put(T, t0, pad(CHORDS[(bar - 2) % 4], BAR + 0.3), 0.1);
  }
  // Bars 5-7: the build.
  const ARP = [57, 60, 64, 69, 64, 60];
  for (let bar = 5; bar < 8; bar++) {
    const t0 = bar * BAR;
    for (let b = 0; b < 4; b++) put(T, t0 + b * BEAT, kick(0.75), bar === 7 && b === 3 ? 0 : 0.6);
    for (let s = 0; s < 16; s++) {
      if (bar === 7 && s >= 12) break;
      put(T, t0 + s * 0.125, pluck(ARP[s % ARP.length] + (bar === 6 ? 2 : bar === 7 ? 3 : 0)), 0.09, s % 2 ? 0.4 : -0.4);
      put(T, t0 + s * 0.125, bass(ROOTS[(bar - 5 + 1) % 4], 0.11), s % 2 ? 0 : 0.14);
    }
    put(T, t0, pad(CHORDS[(bar - 5 + 1) % 4], BAR), 0.1);
  }
  // Snare roll, faster into the gap.
  for (let i = 0; i < 24; i++) {
    const at = 6 * BAR + (i < 8 ? i * 0.25 : 2 + (i - 8) * 0.0938);
    if (at < DROP - BEAT) put(T, at, clap(), 0.05 + i * 0.006);
  }
  put(T, 12, riser(DROP - BEAT / 2 - 12), 0.22);
  // Bar 8: the drop and the ring-out.
  put(T, DROP, impact(), 0.7);
  put(T, DROP, pad([45, 57, 60, 64, 69], 8), 0.22);
  for (let bar = 8; bar < 10; bar++) {
    const t0 = bar * BAR;
    for (let b = 0; b < 4; b++) {
      put(T, t0 + b * BEAT, kick(1), 0.7);
      if (b % 2) put(T, t0 + b * BEAT, clap(), 0.16);
    }
    for (let e = 0; e < 8; e++) {
      put(T, t0 + e * 0.25, bass(bar === 8 ? 45 : 41, 0.2), 0.2);
      put(T, t0 + e * 0.25 + 0.125, hat(e === 7), 0.07, e % 2 ? 0.3 : -0.3);
    }
    for (let s = 0; s < 16; s++) put(T, t0 + s * 0.125, pluck([69, 72, 76, 81][s % 4]), 0.07, s % 2 ? 0.5 : -0.5);
  }
  put(T, 10 * BAR, impact(), 0.35);
  put(T, 10 * BAR, pad([45, 57, 60, 64], 3.8), 0.16);
  write("teaser", room(T, 0.3));
}

// ---- Bed: 32 bars of quiet chords and a soft pulse, looping cleanly ----
{
  const LEN = 64;
  const B = bus(LEN + 2);
  for (let bar = 0; bar < 32; bar++) {
    const t0 = bar * BAR;
    const c = Math.floor(bar / 2) % 4;
    if (bar % 2 === 0) put(B, t0, pad(CHORDS[c], 2 * BAR + 0.6), 0.16);
    for (let e = 0; e < 8; e++) put(B, t0 + e * 0.25 + 0.125, hat(), 0.022, e % 2 ? 0.3 : -0.3);
    for (let b = 0; b < 4; b++) put(B, t0 + b * BEAT, bass(ROOTS[c], 0.4), b % 2 ? 0.05 : 0.08);
    for (let s = 0; s < 8; s++) if ((s + bar) % 3 === 0) put(B, t0 + s * 0.25, pluck(CHORDS[c][s % 3] + 12, 0.3), 0.03, s % 2 ? 0.5 : -0.5);
  }
  // Fold the tail past 64 s back onto the start, so the loop point is seamless.
  const n = LEN * SR;
  for (const ch of B) for (let i = n; i < ch.length; i++) ch[i - n] += ch[i];
  const R = room(B, 0.35);
  write("bed", [R[0].slice(0, n), R[1].slice(0, n)], 0.7);
}
