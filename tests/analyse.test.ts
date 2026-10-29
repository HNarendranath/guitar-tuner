import { describe, expect, it } from 'vitest';
import { frequency } from '../src/music/note';
import { STANDARD } from '../src/music/presets';
import { withCapo } from '../src/music/tuning';
import {
  TuningAnalyser,
  median,
  nearestStringIndex,
  type AnalyserConfig,
  type PitchFrame,
  type TunerState,
} from '../src/tuner/analyse';

const TARGETS = STANDARD.strings.map((s) => frequency(s));
const HOP_MS = 21;

const config = (overrides: Partial<AnalyserConfig> = {}): AnalyserConfig => ({
  targets: TARGETS,
  mode: 'auto',
  manualIndex: 0,
  toleranceCents: 5,
  a4: 440,
  ...overrides,
});

const tone = (hz: number, rms = 0.1): PitchFrame => ({ frequency: hz, clarity: 0.95, rms });
const silence: PitchFrame = { frequency: null, clarity: 0, rms: 0.0005 };
const detune = (hz: number, cents: number) => hz * 2 ** (cents / 1200);

/** Feeds frames at a fixed hop starting at `start` ms; returns every state and the end time. */
function feed(analyser: TuningAnalyser, frames: PitchFrame[], start = 0) {
  const states: TunerState[] = [];
  let t = start;
  for (const f of frames) {
    states.push(analyser.push(f, t));
    t += HOP_MS;
  }
  return { states, last: states[states.length - 1]!, end: t };
}

const repeat = <T>(item: T, n: number): T[] => Array.from({ length: n }, () => item);

describe('helpers', () => {
  it('median', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNaN();
  });

  it('nearestStringIndex picks the closest string in cents', () => {
    expect(nearestStringIndex(112, TARGETS)).toBe(1);
    expect(nearestStringIndex(80, TARGETS)).toBe(0);
    expect(nearestStringIndex(1000, TARGETS)).toBe(5);
    // 95.2 Hz is ~250 c above E2 and ~250 c below A2; cents (not Hz) decide.
    expect(nearestStringIndex(detune(TARGETS[0]!, 240), TARGETS)).toBe(0);
    expect(nearestStringIndex(detune(TARGETS[0]!, 260), TARGETS)).toBe(1);
    expect(nearestStringIndex(110, [])).toBe(-1);
  });
});

describe('TuningAnalyser', () => {
  it('reports the nearest string and cents offset in auto mode', () => {
    const { last } = feed(new TuningAnalyser(config()), repeat(tone(108), 5));
    expect(last.reading).toMatchObject({ stringIndex: 1, inTune: false });
    expect(last.reading!.cents).toBeCloseTo(-31.77, 1);
    expect(last.reading!.note).toEqual({ pc: 9, octave: 2 });
  });

  it('targets the selected string in manual mode', () => {
    const { last } = feed(new TuningAnalyser(config({ mode: 'manual', manualIndex: 0 })), repeat(tone(108), 3));
    expect(last.reading!.stringIndex).toBe(0);
    expect(last.reading!.cents).toBeCloseTo(1200 * Math.log2(108 / TARGETS[0]!), 6);
  });

  it('ignores frames below the RMS gate', () => {
    const { last } = feed(new TuningAnalyser(config()), repeat(tone(110, 0.001), 5));
    expect(last.reading).toBeNull();
  });

  it('median-smooths octave errors and outliers', () => {
    const frames = [tone(110), tone(110.2), tone(220), tone(109.9), tone(55), tone(110.1)];
    const { states } = feed(new TuningAnalyser(config()), frames);
    for (const s of states.slice(2)) expect(Math.abs(s.reading!.cents)).toBeLessThan(5);
  });

  it('follows a new string within three frames', () => {
    const analyser = new TuningAnalyser(config());
    const { end } = feed(analyser, repeat(tone(110), 5));
    const { states } = feed(analyser, repeat(tone(146.83), 3), end);
    expect(states[2]!.reading!.stringIndex).toBe(2);
  });

  it('holds the last reading briefly after the note dies away, then clears', () => {
    const analyser = new TuningAnalyser(config());
    const { end } = feed(analyser, repeat(tone(110), 5));
    expect(analyser.push(silence, end + 500).reading).not.toBeNull();
    expect(analyser.push(silence, end + 1100).reading).toBeNull();
  });

  it('starts fresh smoothing after a gap (new pluck)', () => {
    const analyser = new TuningAnalyser(config());
    const { end } = feed(analyser, repeat(tone(110), 5));
    // After 300 ms of silence, a single frame of the new note is shown immediately.
    expect(analyser.push(tone(196), end + 300).reading!.stringIndex).toBe(3);
  });

  it('marks a string tuned after holding within tolerance, and fires justTuned once', () => {
    const analyser = new TuningAnalyser(config());
    const { states, last } = feed(analyser, repeat(tone(detune(110, 2)), 20));
    expect(states[0]!.reading!.inTune).toBe(true);
    expect(states[0]!.tuned[1]).toBe(false);
    expect(last.tuned).toEqual([false, true, false, false, false, false]);
    expect(states.filter((s) => s.justTuned === 1)).toHaveLength(1);
    const tunedAt = states.findIndex((s) => s.tuned[1]);
    expect(tunedAt * HOP_MS).toBeGreaterThanOrEqual(300);
  });

  it('does not mark a string tuned when it only passes through tolerance', () => {
    const frames = [-20, -12, -4, 3, 10, 18].map((c) => tone(detune(110, c)));
    const { last } = feed(new TuningAnalyser(config({}), { smoothing: 1 }), frames);
    expect(last.tuned[1]).toBe(false);
  });

  it('clears a tuned mark once the string is held out of tune', () => {
    const analyser = new TuningAnalyser(config());
    const { end } = feed(analyser, repeat(tone(110), 20));
    expect(analyser.current.tuned[1]).toBe(true);
    const { last } = feed(analyser, repeat(tone(detune(110, -20)), 25), end);
    expect(last.tuned[1]).toBe(false);
  });

  it('respects the configured tolerance', () => {
    const { last } = feed(new TuningAnalyser(config({ toleranceCents: 2 })), repeat(tone(detune(110, 3)), 3));
    expect(last.reading!.inTune).toBe(false);
  });

  it('clears tuned marks when the targets change (e.g. capo), but not for a tolerance change', () => {
    const analyser = new TuningAnalyser(config());
    feed(analyser, repeat(tone(110), 20));
    expect(analyser.configure(config({ toleranceCents: 3 })).tuned[1]).toBe(true);
    const capo2 = withCapo(STANDARD.strings, 2).map((s) => frequency(s));
    const state = analyser.configure(config({ targets: capo2 }));
    expect(state.tuned.every((t) => !t)).toBe(true);
    // The held reading is re-evaluated against the new targets (A2 is now 200 c below B2).
    expect(state.reading!.cents).toBeCloseTo(-200, 0);
  });

  it('returns the same state object while silent so the UI can skip renders', () => {
    const analyser = new TuningAnalyser(config());
    const a = analyser.push(silence, 0);
    expect(analyser.push(silence, 21)).toBe(a);
  });
});
