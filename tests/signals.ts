// Synthetic test signals shared by the detector tests (not a test file itself).
import { rms } from '../src/audio/yin';

export const BUFFER = 4096;

/** Deterministic PRNG (mulberry32) so failures are reproducible. */
export function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SynthOptions {
  harmonics?: number[];
  amplitude?: number;
  decaySeconds?: number;
  seed?: number;
  length?: number;
}

/** Sum of harmonics with random (seeded) phases. */
export function synth(
  freq: number,
  sampleRate: number,
  { harmonics = [1], amplitude = 0.5, decaySeconds, seed = 1, length = BUFFER }: SynthOptions = {},
): Float32Array {
  const rand = random(seed);
  const phases = harmonics.map(() => rand() * 2 * Math.PI);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    let v = 0;
    harmonics.forEach((a, k) => {
      v += a * Math.sin(2 * Math.PI * freq * (k + 1) * t + phases[k]!);
    });
    const env = decaySeconds ? Math.exp(-t / decaySeconds) : 1;
    out[i] = amplitude * env * v;
  }
  return out;
}

/** Gaussian noise at the given RMS, optionally through a 2-pole low-pass at `cutoffHz` (null = white). */
export function lowpassNoise(cutoffHz: number | null, rmsLevel: number, seed: number, length = BUFFER): Float32Array {
  const rand = random(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const settle = 2000;
  const x = Float32Array.from({ length: length + settle }, gauss);
  if (cutoffHz !== null) {
    const a = Math.exp((-2 * Math.PI * cutoffHz) / 48000);
    for (let pass = 0; pass < 2; pass++) {
      let y = 0;
      for (let i = 0; i < x.length; i++) x[i] = y = (1 - a) * x[i]! + a * y;
    }
  }
  const out = x.subarray(settle);
  const scale = rmsLevel / rms(out);
  return out.map((v) => v * scale);
}

/** RBJ-cookbook 2-pole low-pass, the same design as the Web Audio BiquadFilterNode used in mic.ts. */
export function biquadLowpass(x: Float32Array, cutoffHz: number, sampleRate: number, q = Math.SQRT1_2): Float32Array {
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  const [a0, a1, a2] = [1 + alpha, -2 * cos, 1 - alpha];
  const out = new Float32Array(x.length);
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i]! + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    [x2, x1, y2, y1] = [x1, x[i]!, y1, y];
    out[i] = y;
  }
  return out;
}
