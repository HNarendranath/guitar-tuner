import { describe, expect, it } from 'vitest';
import { INPUT_LOWPASS_HZ } from '../src/audio/protocol';
import { DEFAULT_YIN_OPTIONS, YinDetector, rms } from '../src/audio/yin';
import { cents } from '../src/music/note';
import { DEFAULT_SENSITIVITY, SENSITIVITY_LEVELS, sensitivityProfile } from '../src/tuner/sensitivity';
import { BUFFER, biquadLowpass, lowpassNoise, synth } from './signals';

const SR = 48000;
const SETTLE = 1000;
const LEVELS = SENSITIVITY_LEVELS.map((_, i) => i + 1);
const GUITARISH = [1, 0.6, 0.4, 0.25, 0.15];

/** A note, plus white noise at a broadband SNR, through the app's input low-pass: what the detector sees. */
function captured(freq: number, harmonics: number[], seed: number, snrDb: number | null = null): Float32Array {
  const length = BUFFER + SETTLE;
  const tone = synth(freq, SR, { harmonics, amplitude: 1, seed, length });
  let mixed = tone;
  if (snrDb !== null) {
    const noise = lowpassNoise(null, rms(tone) / 10 ** (snrDb / 20), seed + 1000, length);
    mixed = tone.map((v, i) => v + noise[i]!);
  }
  return biquadLowpass(mixed, INPUT_LOWPASS_HZ, SR).subarray(SETTLE);
}

const detectorFor = (level: number) => new YinDetector(BUFFER, SR, { threshold: sensitivityProfile(level).yinThreshold });

describe('sensitivity levels', () => {
  it('increase the threshold and smoothing step by step, clamping out-of-range input', () => {
    for (let i = 1; i < SENSITIVITY_LEVELS.length; i++) {
      expect(SENSITIVITY_LEVELS[i]!.yinThreshold).toBeGreaterThan(SENSITIVITY_LEVELS[i - 1]!.yinThreshold);
      expect(SENSITIVITY_LEVELS[i]!.smoothing).toBeGreaterThanOrEqual(SENSITIVITY_LEVELS[i - 1]!.smoothing);
    }
    expect(sensitivityProfile(0)).toBe(SENSITIVITY_LEVELS[0]);
    expect(sensitivityProfile(99)).toBe(SENSITIVITY_LEVELS[SENSITIVITY_LEVELS.length - 1]);
    expect(sensitivityProfile(Number.NaN)).toBe(SENSITIVITY_LEVELS[DEFAULT_SENSITIVITY - 1]);
  });

  it('keeps level 1 equal to the original detector settings', () => {
    expect(sensitivityProfile(1)).toEqual({ yinThreshold: DEFAULT_YIN_OPTIONS.threshold, smoothing: 5 });
  });

  // From a threshold of ~0.4, a note whose 2nd harmonic dominates starts reading an octave high.
  it.each(LEVELS)('level %i reads clean, harmonic-rich notes at the right octave', (level) => {
    const detector = detectorFor(level);
    const notes: [number, number[]][] = [
      [110, [0.4, 1, 0.3, 0.5, 0.2]], // strong 2nd harmonic
      [82.41, [0.1, 1, 0.6, 0.6, 0.3]], // nearly missing fundamental
      [329.63, [1, 0.9, 0.7, 0.5]], // bright
    ];
    for (const [freq, harmonics] of notes) {
      for (let seed = 1; seed <= 5; seed++) {
        const result = detector.detect(captured(freq, harmonics, seed));
        expect(Math.abs(cents(result!.frequency, freq)), `${freq} Hz seed ${seed}`).toBeLessThan(1);
      }
    }
  });

  it('reaches noisier (more distant) notes at higher levels', () => {
    // −6 dB broadband SNR is just beyond level 1's reach.
    const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
    const rightString = LEVELS.map((level) => {
      const detector = detectorFor(level);
      return seeds.filter((seed) => {
        const result = detector.detect(captured(110, GUITARISH, seed, -6));
        return result !== null && Math.abs(cents(result.frequency, 110)) < 50;
      }).length;
    });
    expect(rightString[0]).toBeLessThanOrEqual(4);
    expect(rightString[rightString.length - 1]).toBeGreaterThanOrEqual(16);
  });

  it('does not read an octave low at the edge of the highest level (subharmonic guard)', () => {
    // −9 dB SNR is the edge of level 5's reach, where noise can lift the true period's dip just
    // above the threshold while the dip at twice the period stays below it.
    const { yinThreshold } = sensitivityProfile(SENSITIVITY_LEVELS.length);
    const octaveLow = (subharmonicMargin: number) => {
      const detector = new YinDetector(BUFFER, SR, { threshold: yinThreshold, subharmonicMargin });
      let count = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const result = detector.detect(captured(329.63, [1, 0.5, 0.3], seed, -9));
        if (result && cents(result.frequency, 329.63) < -600) count++;
      }
      return count;
    };
    expect(octaveLow(0)).toBeGreaterThan(0); // the failure the guard exists for
    expect(octaveLow(DEFAULT_YIN_OPTIONS.subharmonicMargin)).toBe(0);
  });
});
