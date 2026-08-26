#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 44100;
const outDir = join(dirname(fileURLToPath(import.meta.url)), "../public/assets/sfx");
mkdirSync(outDir, { recursive: true });

function writeWav(name, samples) {
  const pcm = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm.writeInt16LE((s * 32767) | 0, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  writeFileSync(join(outDir, name), Buffer.concat([header, pcm]));
}

function alloc(seconds) {
  return new Float64Array(Math.max(1, Math.round(seconds * SAMPLE_RATE)));
}

function mix(tracks) {
  const len = Math.max(...tracks.map((t) => t.length));
  const out = new Float64Array(len);
  for (const track of tracks) {
    for (let i = 0; i < track.length; i += 1) out[i] += track[i];
  }
  let peak = 0.0001;
  for (const sample of out) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0.92 ? 0.92 / peak : 1;
  if (gain !== 1) {
    for (let i = 0; i < out.length; i += 1) out[i] *= gain;
  }
  return out;
}

function env(t, attack, decay, sustain, release, duration) {
  if (t < 0 || t >= duration) return 0;
  if (t < attack) return t / Math.max(attack, 1e-4);
  if (t < attack + decay) {
    const u = (t - attack) / Math.max(decay, 1e-4);
    return 1 - u * (1 - sustain);
  }
  if (t < duration - release) return sustain;
  return sustain * (1 - (t - (duration - release)) / Math.max(release, 1e-4));
}

function expDecay(t, time) {
  return Math.exp(-t / Math.max(time, 1e-4));
}

function sine(phase) {
  return Math.sin(phase);
}

function square(phase) {
  return Math.sin(phase) > 0 ? 1 : -1;
}

function triangle(phase) {
  const u = ((phase / (Math.PI * 2)) % 1 + 1) % 1;
  return u < 0.5 ? u * 4 - 1 : 3 - u * 4;
}

function noise() {
  return Math.random() * 2 - 1;
}

function tone({
  duration,
  freq,
  freqEnd = freq,
  type = "sine",
  attack = 0.004,
  decay = 0.04,
  sustain = 0.35,
  release = 0.08,
  gain = 0.5,
  delay = 0,
}) {
  const out = alloc(delay + duration);
  let phase = 0;
  const wave = type === "square" ? square : type === "triangle" ? triangle : sine;
  for (let i = 0; i < out.length; i += 1) {
    const t = i / SAMPLE_RATE - delay;
    if (t < 0) continue;
    const u = t / duration;
    const f = freq + (freqEnd - freq) * u;
    phase += (Math.PI * 2 * f) / SAMPLE_RATE;
    out[i] = wave(phase) * env(t, attack, decay, sustain, release, duration) * gain;
  }
  return out;
}

function noiseBurst({
  duration,
  attack = 0.001,
  decay = 0.08,
  gain = 0.4,
  delay = 0,
  color = 0.35,
}) {
  const out = alloc(delay + duration);
  let prev = 0;
  for (let i = 0; i < out.length; i += 1) {
    const t = i / SAMPLE_RATE - delay;
    if (t < 0) continue;
    const white = noise();
    prev = prev * color + white * (1 - color);
    out[i] = prev * env(t, attack, decay, 0.12, duration * 0.35, duration) * gain;
  }
  return out;
}

function ping(freq, duration, gain, delay = 0) {
  return tone({
    duration,
    freq,
    freqEnd: freq * 0.86,
    type: "sine",
    attack: 0.002,
    decay: 0.05,
    sustain: 0.2,
    release: duration * 0.7,
    gain,
    delay,
  });
}

function overlay(target, source, atSeconds) {
  const start = Math.round(atSeconds * SAMPLE_RATE);
  for (let i = 0; i < source.length && start + i < target.length; i += 1) {
    target[start + i] += source[i];
  }
}

function dull(samples, amount = 0.82) {
  const out = new Float64Array(samples.length);
  let prev = 0;
  for (let i = 0; i < samples.length; i += 1) {
    prev = prev * amount + samples[i] * (1 - amount);
    out[i] = prev * 1.15;
  }
  return out;
}

function footstep({ delay = 0, pitch = 1 }) {
  return mix([
    tone({
      duration: 0.12,
      freq: 88 * pitch,
      freqEnd: 46 * pitch,
      type: "sine",
      attack: 0.008,
      decay: 0.05,
      sustain: 0.1,
      release: 0.05,
      gain: 0.2,
      delay,
    }),
    tone({
      duration: 0.07,
      freq: 148 * pitch,
      freqEnd: 78 * pitch,
      type: "triangle",
      attack: 0.006,
      decay: 0.03,
      sustain: 0.06,
      release: 0.03,
      gain: 0.07,
      delay,
    }),
    noiseBurst({
      duration: 0.055,
      attack: 0.006,
      decay: 0.035,
      gain: 0.08,
      color: 0.9,
      delay,
    }),
  ]);
}

function makeMusic() {
  const bpm = 128;
  const beat = 60 / bpm;
  const duration = 16 * beat;
  const out = alloc(duration);
  const melody = [
    523.25, 659.25, 783.99, 659.25, 880.0, 783.99, 659.25, 523.25,
    587.33, 659.25, 783.99, 880.0, 783.99, 659.25, 587.33, 523.25,
    523.25, 392.0, 659.25, 523.25, 783.99, 659.25, 587.33, 523.25,
    392.0, 523.25, 659.25, 783.99, 659.25, 587.33, 523.25, 392.0,
  ];
  const bass = [130.81, 130.81, 196.0, 196.0, 220.0, 220.0, 196.0, 196.0];

  for (let i = 0; i < melody.length; i += 1) {
    overlay(
      out,
      tone({
        duration: beat * 0.42,
        freq: melody[i],
        type: "triangle",
        attack: 0.008,
        decay: 0.05,
        sustain: 0.18,
        release: 0.08,
        gain: 0.09,
      }),
      i * (beat * 0.5),
    );
  }

  for (let i = 0; i < 16; i += 1) {
    overlay(
      out,
      tone({
        duration: beat * 0.7,
        freq: bass[i % bass.length],
        type: "sine",
        attack: 0.01,
        decay: 0.12,
        sustain: 0.25,
        release: 0.18,
        gain: 0.16,
      }),
      i * beat,
    );
    overlay(out, noiseBurst({ duration: 0.035, gain: i % 2 === 0 ? 0.14 : 0.06, color: 0.2 }), i * beat);
    overlay(out, noiseBurst({ duration: 0.02, gain: 0.05, color: 0.05 }), i * beat + beat * 0.5);
  }

  let peak = 0.0001;
  for (const sample of out) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0.85 ? 0.85 / peak : 1;
  if (gain !== 1) {
    for (let i = 0; i < out.length; i += 1) out[i] *= gain;
  }
  return out;
}

const files = {
  "jump.wav": mix([
    tone({ duration: 0.22, freq: 220, freqEnd: 520, type: "sine", attack: 0.006, decay: 0.06, sustain: 0.2, release: 0.12, gain: 0.22 }),
    tone({ duration: 0.18, freq: 320, freqEnd: 640, type: "triangle", attack: 0.005, decay: 0.05, sustain: 0.15, release: 0.1, gain: 0.2 }),
    noiseBurst({ duration: 0.07, gain: 0.1, color: 0.72 }),
  ]),
  "jump-air.wav": mix([
    tone({ duration: 0.16, freq: 360, freqEnd: 720, type: "sine", attack: 0.005, decay: 0.04, sustain: 0.12, release: 0.08, gain: 0.2 }),
    tone({ duration: 0.12, freq: 540, freqEnd: 880, type: "triangle", attack: 0.004, decay: 0.03, sustain: 0.1, release: 0.07, gain: 0.1 }),
    noiseBurst({ duration: 0.05, gain: 0.08, color: 0.65 }),
  ]),
  "land.wav": mix([
    tone({ duration: 0.18, freq: 140, freqEnd: 70, type: "sine", attack: 0.002, decay: 0.06, sustain: 0.18, release: 0.08, gain: 0.4 }),
    tone({ duration: 0.12, freq: 90, freqEnd: 50, type: "triangle", attack: 0.001, decay: 0.05, sustain: 0.1, release: 0.05, gain: 0.22 }),
    noiseBurst({ duration: 0.1, gain: 0.28, color: 0.7 }),
  ]),
  "platform-drop.wav": mix([
    tone({ duration: 0.2, freq: 280, freqEnd: 110, type: "sine", attack: 0.01, decay: 0.08, sustain: 0.15, release: 0.1, gain: 0.22 }),
    noiseBurst({ duration: 0.16, gain: 0.16, color: 0.45 }),
  ]),
  "slap-hit-light.wav": mix([
    noiseBurst({ duration: 0.09, gain: 0.42, color: 0.4 }),
    tone({ duration: 0.12, freq: 200, freqEnd: 85, type: "sine", attack: 0.002, decay: 0.04, sustain: 0.12, release: 0.06, gain: 0.32 }),
    tone({ duration: 0.08, freq: 520, freqEnd: 260, type: "triangle", attack: 0.002, decay: 0.03, sustain: 0.08, release: 0.04, gain: 0.08 }),
  ]),
  "slap-hit-heavy.wav": mix([
    noiseBurst({ duration: 0.14, gain: 0.5, color: 0.42 }),
    tone({ duration: 0.22, freq: 130, freqEnd: 52, type: "sine", attack: 0.002, decay: 0.07, sustain: 0.2, release: 0.1, gain: 0.48 }),
    tone({ duration: 0.12, freq: 70, freqEnd: 40, type: "triangle", attack: 0.002, decay: 0.05, sustain: 0.15, release: 0.06, gain: 0.28 }),
    ping(880, 0.1, 0.06),
  ]),
  "hit.wav": mix([
    noiseBurst({ duration: 0.12, gain: 0.32, color: 0.55 }),
    tone({ duration: 0.16, freq: 170, freqEnd: 68, type: "sine", attack: 0.002, decay: 0.05, sustain: 0.15, release: 0.08, gain: 0.32 }),
    tone({ duration: 0.1, freq: 360, freqEnd: 150, type: "triangle", attack: 0.002, decay: 0.03, sustain: 0.06, release: 0.05, gain: 0.06 }),
  ]),
  "ko.wav": mix([
    tone({ duration: 0.7, freq: 260, freqEnd: 48, type: "sine", attack: 0.01, decay: 0.18, sustain: 0.25, release: 0.3, gain: 0.45 }),
    tone({ duration: 0.55, freq: 130, freqEnd: 32, type: "triangle", attack: 0.008, decay: 0.16, sustain: 0.18, release: 0.22, gain: 0.3 }),
    noiseBurst({ duration: 0.28, gain: 0.35, color: 0.5 }),
    ping(640, 0.22, 0.1, 0.05),
  ]),
  "respawn.wav": mix([
    tone({ duration: 0.45, freq: 180, freqEnd: 720, type: "sine", attack: 0.02, decay: 0.1, sustain: 0.25, release: 0.18, gain: 0.22 }),
    ping(880, 0.28, 0.16, 0.08),
    ping(1320, 0.22, 0.12, 0.16),
    noiseBurst({ duration: 0.2, gain: 0.12, color: 0.3, delay: 0.02 }),
  ]),
  "countdown.wav": mix([
    tone({ duration: 0.14, freq: 620, type: "sine", attack: 0.004, decay: 0.04, sustain: 0.15, release: 0.07, gain: 0.18 }),
    ping(880, 0.14, 0.12),
  ]),
  "fight.wav": mix([
    tone({ duration: 0.28, freq: 196, freqEnd: 330, type: "sine", attack: 0.008, decay: 0.08, sustain: 0.2, release: 0.12, gain: 0.2 }),
    ping(523, 0.22, 0.14),
    ping(784, 0.18, 0.1, 0.04),
    noiseBurst({ duration: 0.1, gain: 0.1, color: 0.45 }),
  ]),
  "ui-slap.wav": mix([
    noiseBurst({ duration: 0.08, gain: 0.42, color: 0.35 }),
    tone({ duration: 0.11, freq: 220, freqEnd: 90, type: "sine", attack: 0.002, decay: 0.04, sustain: 0.1, release: 0.05, gain: 0.38 }),
    tone({ duration: 0.07, freq: 640, freqEnd: 280, type: "triangle", attack: 0.002, decay: 0.025, sustain: 0.05, release: 0.03, gain: 0.08 }),
  ]),
  "ui-shatter.wav": mix([
    noiseBurst({ duration: 0.12, gain: 0.38, color: 0.28 }),
    ping(1480, 0.28, 0.08),
    ping(1760, 0.22, 0.07, 0.03),
    ping(1180, 0.2, 0.06, 0.07),
    ping(980, 0.18, 0.05, 0.12),
    tone({ duration: 0.2, freq: 280, freqEnd: 110, type: "triangle", attack: 0.002, decay: 0.05, sustain: 0.08, release: 0.1, gain: 0.1 }),
  ]),
  "run.wav": dull(
    mix([
      alloc(0.52),
      footstep({ delay: 0.02, pitch: 1 }),
      footstep({ delay: 0.28, pitch: 0.9 }),
    ]),
    0.88,
  ),
  "music.wav": makeMusic(),
};

for (const [name, samples] of Object.entries(files)) {
  writeWav(name, samples);
}

for (const [from, to] of [
  ["slap_charge.wav", "slap-charge.wav"],
  ["slap_swing.wav", "slap-swing.wav"],
]) {
  const src = join(outDir, from);
  const dest = join(outDir, to);
  if (existsSync(src) && !existsSync(dest)) copyFileSync(src, dest);
}

console.log(`Wrote ${Object.keys(files).length} sfx wavs to ${outDir}`);
