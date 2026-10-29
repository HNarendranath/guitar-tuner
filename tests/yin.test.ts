import { describe, expect, it } from 'vitest';
import { FFT } from '../src/audio/fft';
import { YinDetector, rms } from '../src/audio/yin';
import { cents } from '../src/music/note';

const BUFFER = 4096;
const SAMPLE_RATES = [44100, 48000];
const STRINGS = [82.41, 110, 146.83, 196, 246.94, 329.63];

/** Deterministic PRNG (mulberry32) so failures are reproducible. */
function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SynthOptions {
  harmonics?: number[];
  amplitude?: number;
  decaySeconds?: number;
  seed?: number;
}

function synth(freq: number, sampleRate: number, { harmonics = [1], amplitude = 0.5, decaySeconds, seed = 1 }: SynthOptions = {}) {
  const rand = random(seed);
  const phases = harmonics.map(() => rand() * 2 * Math.PI);
  const out = new Float32Array(BUFFER);
  for (let i = 0; i < BUFFER; i++) {
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

function naiveDifference(x: Float32Array, window: number, tauMax: number): number[] {
  const d: number[] = [];
  for (let tau = 0; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < window; j++) {
      const diff = x[j]! - x[j + tau]!;
      sum += diff * diff;
    }
    d.push(sum);
  }
  return d;
}

function detectCents(freq: number, sampleRate: number, options?: SynthOptions): number {
  const result = new YinDetector(BUFFER, sampleRate).detect(synth(freq, sampleRate, options));
  expect(result, `no pitch detected for ${freq} Hz @ ${sampleRate}`).not.toBeNull();
  return cents(result!.frequency, freq);
}

describe('FFT', () => {
  it('round-trips forward and inverse transforms', () => {
    const fft = new FFT(64);
    const rand = random(7);
    const re = Float64Array.from({ length: 64 }, () => rand() - 0.5);
    const im = Float64Array.from({ length: 64 }, () => rand() - 0.5);
    const [re0, im0] = [re.slice(), im.slice()];
    fft.transform(re, im);
    fft.transform(re, im, true);
    re.forEach((v, i) => expect(v / 64).toBeCloseTo(re0[i]!, 12));
    im.forEach((v, i) => expect(v / 64).toBeCloseTo(im0[i]!, 12));
  });

  it('puts a pure cosine in the expected bins', () => {
    const n = 32;
    const fft = new FFT(n);
    const re = Float64Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * 3 * i) / n));
    const im = new Float64Array(n);
    fft.transform(re, im);
    re.forEach((v, k) => expect(v).toBeCloseTo(k === 3 || k === n - 3 ? n / 2 : 0, 9));
  });

  it('rejects sizes that are not powers of two', () => {
    expect(() => new FFT(100)).toThrow(RangeError);
  });
});

describe('YIN difference function', () => {
  it('matches the naive O(N·τ) definition', () => {
    const rand = random(42);
    const x = synth(110, 48000, { harmonics: [1, 0.5, 0.3] });
    for (let i = 0; i < x.length; i++) x[i] += (rand() - 0.5) * 0.05;
    const detector = new YinDetector(BUFFER, 48000);
    const fast = detector.difference(x);
    const naive = naiveDifference(x, detector.window, detector.tauMax);
    naive.forEach((v, tau) => expect(fast[tau]).toBeCloseTo(v, 6));
  });
});

describe('YIN pitch detection', () => {
  for (const sampleRate of SAMPLE_RATES) {
    describe(`at ${sampleRate} Hz`, () => {
      it('detects pure sines for every standard string within ±1 cent', () => {
        for (const f of [...STRINGS, 659.26]) expect(Math.abs(detectCents(f, sampleRate))).toBeLessThan(1);
      });

      it('detects sines with harmonics within ±1 cent', () => {
        for (const f of STRINGS) {
          const off = detectCents(f, sampleRate, { harmonics: [1, 0.6, 0.4, 0.25, 0.15], seed: Math.round(f) });
          expect(Math.abs(off)).toBeLessThan(1);
        }
      });

      it('finds the fundamental when it is weaker than the harmonics (no octave error)', () => {
        for (const f of STRINGS) {
          const off = detectCents(f, sampleRate, { harmonics: [0.2, 1, 0.8, 0.5], seed: Math.round(f) });
          expect(Math.abs(off)).toBeLessThan(1);
        }
      });

      it('handles a decaying pluck-like envelope and quiet input', () => {
        expect(Math.abs(detectCents(82.41, sampleRate, { harmonics: [1, 0.5, 0.3], decaySeconds: 0.5 }))).toBeLessThan(1);
        expect(Math.abs(detectCents(196, sampleRate, { amplitude: 0.002 }))).toBeLessThan(1);
      });

      it('detects slightly detuned notes accurately', () => {
        const target = 110;
        for (const offset of [-30, -7, 3, 18]) {
          const f = target * 2 ** (offset / 1200);
          const result = new YinDetector(BUFFER, sampleRate).detect(synth(f, sampleRate, { harmonics: [1, 0.5, 0.3] }));
          expect(cents(result!.frequency, target)).toBeCloseTo(offset, 0);
        }
      });
    });
  }

  it('returns null for silence', () => {
    expect(new YinDetector(BUFFER, 48000).detect(new Float32Array(BUFFER))).toBeNull();
  });

  it('returns null for white noise', () => {
    const rand = random(3);
    const noise = Float32Array.from({ length: BUFFER }, () => rand() * 2 - 1);
    expect(new YinDetector(BUFFER, 48000).detect(noise)).toBeNull();
  });

  it('reports high clarity for a clean tone', () => {
    const result = new YinDetector(BUFFER, 44100).detect(synth(146.83, 44100));
    expect(result!.clarity).toBeGreaterThan(0.95);
  });

  it('works with a non-power-of-two buffer size', () => {
    const x = synth(110, 48000).subarray(0, 3000);
    const result = new YinDetector(3000, 48000).detect(x);
    expect(Math.abs(cents(result!.frequency, 110))).toBeLessThan(1);
  });
});

describe('rms', () => {
  it('computes root-mean-square level', () => {
    expect(rms(new Float32Array(16))).toBe(0);
    expect(rms(Float32Array.from([1, -1, 1, -1]))).toBe(1);
    expect(rms(synth(110, 48000, { amplitude: 1 }))).toBeCloseTo(Math.SQRT1_2, 2);
  });
});
