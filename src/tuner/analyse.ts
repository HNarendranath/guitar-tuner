import { cents, nearestNote, type Note } from '../music/note';

/** One analysis hop from the pitch detector. */
export interface PitchFrame {
  frequency: number | null;
  clarity: number;
  rms: number;
}

export type TargetMode = 'auto' | 'manual';

export interface AnalyserConfig {
  /** Target frequencies (capo and A4 already applied), low → high. */
  targets: readonly number[];
  mode: TargetMode;
  /** Target string in manual mode. */
  manualIndex: number;
  toleranceCents: number;
  a4: number;
  /** Median filter length, in frames (set by the sensitivity level). */
  smoothing: number;
}

export interface AnalyserOptions {
  /** Frames quieter than this are treated as silence. */
  rmsThreshold: number;
  /** Keep showing the last reading this long after the signal drops out. */
  holdMs: number;
  /** A silence longer than this starts a fresh smoothing window (new pluck). */
  gapResetMs: number;
  /** How long a string must stay in (or out of) tune before its tuned mark changes. */
  tunedHoldMs: number;
}

export const DEFAULT_ANALYSER_OPTIONS: AnalyserOptions = {
  // −90 dBFS: only rejects (near-)digital silence. With auto-gain off, a phone mic can hear an
  // unplugged electric guitar at −70 dBFS or below. YIN's periodicity check is what rejects noise
  // (broadband and low-frequency rumble yield no pitch; see yin.test.ts), so a level gate any higher
  // only throws away quiet strings.
  rmsThreshold: 0.00003,
  holdMs: 1000,
  gapResetMs: 200,
  tunedHoldMs: 300,
};

export interface TunerReading {
  /** Smoothed detected frequency. */
  frequency: number;
  /** Nearest chromatic note to the detected pitch. */
  note: Note;
  stringIndex: number;
  targetFrequency: number;
  /** Offset from the target string; positive = sharp. */
  cents: number;
  inTune: boolean;
}

export interface TunerState {
  reading: TunerReading | null;
  /** Per string: has it been held within tolerance? */
  tuned: readonly boolean[];
  /** Index of a string that became tuned on this frame (for haptics), otherwise null. */
  justTuned: number | null;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Index of the target closest to `freq` in cents (first wins on a tie), or -1 if there are none. */
export function nearestStringIndex(freq: number, targets: readonly number[]): number {
  let best = -1;
  let bestDistance = Infinity;
  targets.forEach((t, i) => {
    const distance = Math.abs(cents(freq, t));
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  });
  return best;
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Turns the raw frame stream into what the UI shows: gating, median smoothing, target selection,
 * cents offset and debounced "tuned" marks. Pure and clock-injected so it can be tested without audio.
 */
export class TuningAnalyser {
  private config: AnalyserConfig;
  private readonly options: AnalyserOptions;
  private history: number[] = [];
  private lastValidAt = -Infinity;
  private streak: { index: number; inTune: boolean; since: number } | null = null;
  private state: TunerState;

  constructor(config: AnalyserConfig, options: Partial<AnalyserOptions> = {}) {
    this.config = config;
    this.options = { ...DEFAULT_ANALYSER_OPTIONS, ...options };
    this.state = { reading: null, tuned: config.targets.map(() => false), justTuned: null };
  }

  get current(): TunerState {
    return this.state;
  }

  /** Applies new targets/mode/tolerance. Changing the target pitches clears the tuned marks. */
  configure(config: AnalyserConfig): TunerState {
    const targetsChanged = !sameNumbers(config.targets, this.config.targets);
    this.config = config;
    this.streak = null;
    const { reading } = this.state;
    this.state = {
      reading: reading && config.targets.length > 0 ? this.evaluate(reading.frequency) : null,
      tuned: targetsChanged ? config.targets.map(() => false) : this.state.tuned,
      justTuned: null,
    };
    return this.state;
  }

  /** Clears the reading and smoothing history (e.g. when the mic stops). Tuned marks are kept. */
  reset(): TunerState {
    this.history = [];
    this.lastValidAt = -Infinity;
    this.streak = null;
    this.state = { reading: null, tuned: this.state.tuned, justTuned: null };
    return this.state;
  }

  /**
   * Feeds one detector frame. Returns the same object when nothing visible changed,
   * so callers can skip re-rendering.
   */
  push(frame: PitchFrame, now: number): TunerState {
    const freq = frame.frequency;
    if (freq === null || frame.rms < this.options.rmsThreshold || this.config.targets.length === 0) {
      this.streak = null;
      const expired = this.state.reading !== null && now - this.lastValidAt > this.options.holdMs;
      if (expired || this.state.justTuned !== null) {
        this.state = { reading: expired ? null : this.state.reading, tuned: this.state.tuned, justTuned: null };
      }
      return this.state;
    }

    if (now - this.lastValidAt > this.options.gapResetMs) this.history = [];
    this.lastValidAt = now;
    this.history.push(freq);
    // `while`, not `if`: the window can shrink when the sensitivity level changes.
    while (this.history.length > Math.max(1, this.config.smoothing)) this.history.shift();
    const reading = this.evaluate(median(this.history));

    let tuned = this.state.tuned;
    let justTuned: number | null = null;
    const streak = this.streak;
    if (!streak || streak.index !== reading.stringIndex || streak.inTune !== reading.inTune) {
      this.streak = { index: reading.stringIndex, inTune: reading.inTune, since: now };
    } else if (now - streak.since >= this.options.tunedHoldMs && tuned[streak.index] !== streak.inTune) {
      const next = tuned.slice();
      next[streak.index] = streak.inTune;
      tuned = next;
      if (streak.inTune) justTuned = streak.index;
    }

    this.state = { reading, tuned, justTuned };
    return this.state;
  }

  private evaluate(freq: number): TunerReading {
    const { targets, mode, manualIndex, toleranceCents, a4 } = this.config;
    const index =
      mode === 'manual' ? Math.min(targets.length - 1, Math.max(0, manualIndex)) : nearestStringIndex(freq, targets);
    const target = targets[index]!;
    const offset = cents(freq, target);
    return {
      frequency: freq,
      note: nearestNote(freq, a4).note,
      stringIndex: index,
      targetFrequency: target,
      cents: offset,
      inTune: Math.abs(offset) <= toleranceCents,
    };
  }
}
