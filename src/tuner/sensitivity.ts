/**
 * Mic sensitivity: how noisy a note may be and still be read. Each level pairs a YIN threshold
 * (higher accepts noisier, more distant notes) with a longer median filter to steady the noisier
 * readings that come with it, at the cost of a slightly slower needle.
 *
 * Tuned by simulating sustained strings in white noise through the full pipeline: each step up
 * reaches ~1–1.5 dB lower signal-to-noise. Thresholds stay at or below 0.35 because from 0.4 a clean
 * note with a strong second harmonic starts reading an octave high.
 */
export interface SensitivityProfile {
  yinThreshold: number;
  /** Median filter length, in frames. */
  smoothing: number;
}

export const SENSITIVITY_LEVELS: readonly SensitivityProfile[] = [
  { yinThreshold: 0.15, smoothing: 5 },
  { yinThreshold: 0.2, smoothing: 7 },
  { yinThreshold: 0.25, smoothing: 7 },
  { yinThreshold: 0.3, smoothing: 9 },
  { yinThreshold: 0.35, smoothing: 9 },
];

export const SENSITIVITY_RANGE = { min: 1, max: SENSITIVITY_LEVELS.length } as const;
export const DEFAULT_SENSITIVITY = 3;

/** Profile for a 1-based level; out-of-range values are clamped. */
export function sensitivityProfile(level: number): SensitivityProfile {
  const index = Math.min(SENSITIVITY_RANGE.max, Math.max(SENSITIVITY_RANGE.min, Math.round(level))) - 1;
  return SENSITIVITY_LEVELS[Number.isFinite(index) ? index : DEFAULT_SENSITIVITY - 1]!;
}
