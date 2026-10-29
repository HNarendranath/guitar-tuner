import { describe, expect, it } from 'vitest';
import {
  cents,
  frequency,
  fromMidi,
  midi,
  nearestNote,
  noteName,
  parseNote,
  pitchClassName,
  transpose,
} from '../src/music/note';

const E2 = { pc: 4, octave: 2 };
const A4 = { pc: 9, octave: 4 };
const C4 = { pc: 0, octave: 4 };

describe('midi', () => {
  it('maps reference notes to their MIDI numbers', () => {
    expect(midi(C4)).toBe(60);
    expect(midi(A4)).toBe(69);
    expect(midi(E2)).toBe(40);
  });

  it('round-trips through fromMidi', () => {
    for (let m = 0; m <= 127; m++) expect(midi(fromMidi(m))).toBe(m);
  });
});

describe('frequency', () => {
  it('gives A4 = 440 Hz by default', () => {
    expect(frequency(A4)).toBe(440);
  });

  it('gives E2 ≈ 82.41 Hz', () => {
    expect(frequency(E2)).toBeCloseTo(82.4069, 3);
  });

  it('scales with the A4 reference', () => {
    expect(frequency(A4, 442)).toBe(442);
    expect(frequency(E2, 432)).toBeCloseTo(82.4069 * (432 / 440), 3);
  });
});

describe('transpose', () => {
  it('crosses octave boundaries correctly', () => {
    expect(transpose({ pc: 11, octave: 2 }, 1)).toEqual({ pc: 0, octave: 3 });
    expect(transpose({ pc: 0, octave: 3 }, -1)).toEqual({ pc: 11, octave: 2 });
    expect(transpose(E2, 12)).toEqual({ pc: 4, octave: 3 });
    expect(transpose(E2, 0)).toEqual(E2);
  });
});

describe('names', () => {
  it('uses sharps or flats', () => {
    expect(noteName({ pc: 1, octave: 3 })).toBe('C♯3');
    expect(noteName({ pc: 1, octave: 3 }, true)).toBe('D♭3');
    expect(pitchClassName(10, true)).toBe('B♭');
    expect(pitchClassName(4)).toBe('E');
  });

  it('parses note names', () => {
    expect(parseNote('E2')).toEqual(E2);
    expect(parseNote('F#3')).toEqual({ pc: 6, octave: 3 });
    expect(parseNote('Bb2')).toEqual({ pc: 10, octave: 2 });
    expect(parseNote('E♭4')).toEqual({ pc: 3, octave: 4 });
    expect(parseNote('Cb4')).toEqual({ pc: 11, octave: 3 });
    expect(parseNote('B#3')).toEqual({ pc: 0, octave: 4 });
    expect(parseNote('H2')).toBeNull();
    expect(parseNote('E')).toBeNull();
  });
});

describe('cents', () => {
  it('measures intervals', () => {
    expect(cents(440, 440)).toBe(0);
    expect(cents(880, 440)).toBeCloseTo(1200, 10);
    expect(cents(220, 440)).toBeCloseTo(-1200, 10);
  });

  it('finds the nearest note', () => {
    const { note, cents: off } = nearestNote(445);
    expect(note).toEqual(A4);
    expect(off).toBeCloseTo(19.56, 2);
    expect(nearestNote(82.41).note).toEqual(E2);
  });
});
