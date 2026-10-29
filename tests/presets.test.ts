import { describe, expect, it } from 'vitest';
import { frequency, noteName, parseNote } from '../src/music/note';
import { PRESETS, STANDARD, findPreset, isPresetId } from '../src/music/presets';
import { clampCapo, formatStrings, tensionWarnings, tuningLabel, withCapo } from '../src/music/tuning';

const names = (notes: readonly { pc: number; octave: number }[]) => notes.map((n) => noteName(n));

describe('presets', () => {
  it('defines standard tuning as E2 A2 D3 G3 B3 E4 with the expected frequencies', () => {
    expect(names(STANDARD.strings)).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    const hz = STANDARD.strings.map((s) => frequency(s));
    const expected = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];
    hz.forEach((f, i) => expect(f).toBeCloseTo(expected[i]!, 2));
  });

  it('has six strings, unique ids and the preset prefix', () => {
    const ids = new Set(PRESETS.map((p) => p.id));
    expect(ids.size).toBe(PRESETS.length);
    for (const p of PRESETS) {
      expect(p.strings).toHaveLength(6);
      expect(isPresetId(p.id)).toBe(true);
      expect(findPreset(p.id)).toBe(p);
    }
  });

  it('formats string names', () => {
    expect(formatStrings(STANDARD.strings)).toBe('E A D G B E');
    expect(formatStrings(findPreset('preset:half-step-down')!.strings, true)).toBe('E♭ A♭ D♭ G♭ B♭ E♭');
  });
});

describe('capo', () => {
  it('capo 2 on standard gives F#2 B2 E3 A3 C#4 F#4', () => {
    expect(names(withCapo(STANDARD.strings, 2))).toEqual(['F♯2', 'B2', 'E3', 'A3', 'C♯4', 'F♯4']);
  });

  it('capo 0 is the identity and capo 12 raises every string an octave, on every preset', () => {
    for (const p of PRESETS) {
      expect(withCapo(p.strings, 0)).toEqual(p.strings);
      withCapo(p.strings, 12).forEach((s, i) => {
        const open = p.strings[i]!;
        expect(s).toEqual({ pc: open.pc, octave: open.octave + 1 });
        expect(frequency(s)).toBeCloseTo(frequency(open) * 2, 9);
      });
    }
  });

  it('shifts every string by exactly N semitones for N = 0…12', () => {
    for (let n = 0; n <= 12; n++) {
      withCapo(STANDARD.strings, n).forEach((s, i) => {
        expect(frequency(s) / frequency(STANDARD.strings[i]!)).toBeCloseTo(2 ** (n / 12), 9);
      });
    }
  });

  it('clamps out-of-range capo values', () => {
    expect(clampCapo(-3)).toBe(0);
    expect(clampCapo(15)).toBe(12);
    expect(clampCapo(Number.NaN)).toBe(0);
    expect(clampCapo(2.6)).toBe(3);
  });

  it('labels tunings with the capo', () => {
    expect(tuningLabel('Standard', 0)).toBe('Standard');
    expect(tuningLabel('Standard', 3)).toBe('Standard · Capo 3');
  });
});

describe('tension warnings', () => {
  const tuning = (spec: string) => spec.split(' ').map((s) => parseNote(s)!);

  it('does not flag standard or common alternate tunings', () => {
    for (const p of PRESETS) expect(tensionWarnings(p.strings, STANDARD.strings).every((w) => w === null)).toBe(true);
  });

  it('flags strings more than 4 semitones from standard', () => {
    const warnings = tensionWarnings(tuning('A1 A2 D3 G3 B3 A4'), STANDARD.strings);
    expect(warnings).toEqual([-7, null, null, null, null, 5]);
  });

  it('ignores strings with no standard counterpart', () => {
    expect(tensionWarnings(tuning('B1 E2 A2 D3 G3 B3 E4'), STANDARD.strings).slice(6)).toEqual([null]);
  });
});
