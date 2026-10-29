/** A pitch class (0 = C … 11 = B) in scientific-pitch-notation octave (A4 = 440 Hz, C4 = MIDI 60). */
export interface Note {
  readonly pc: number;
  readonly octave: number;
}

export const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;
export const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'] as const;

export const DEFAULT_A4 = 440;

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

export function midi(note: Note): number {
  return (note.octave + 1) * 12 + note.pc;
}

export function fromMidi(m: number): Note {
  return { pc: mod12(m), octave: Math.floor(m / 12) - 1 };
}

export function frequency(note: Note, a4 = DEFAULT_A4): number {
  return a4 * 2 ** ((midi(note) - 69) / 12);
}

export function transpose(note: Note, semitones: number): Note {
  return fromMidi(midi(note) + semitones);
}

export function pitchClassName(pc: number, useFlats = false): string {
  return (useFlats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)]!;
}

export function noteName(note: Note, useFlats = false): string {
  return pitchClassName(note.pc, useFlats) + note.octave;
}

/** Signed distance in cents from `reference` to `freq` (positive = sharp). */
export function cents(freq: number, reference: number): number {
  return 1200 * Math.log2(freq / reference);
}

/** The closest equal-tempered note to `freq`, and how far `freq` is from it. */
export function nearestNote(freq: number, a4 = DEFAULT_A4): { note: Note; cents: number } {
  const exact = 69 + 12 * Math.log2(freq / a4);
  const m = Math.round(exact);
  return { note: fromMidi(m), cents: (exact - m) * 100 };
}

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Parses names like "E2", "F#3", "Bb2", "C♯4", "E♭4". Returns null if invalid. */
export function parseNote(text: string): Note | null {
  const match = /^([A-Ga-g])([#♯b♭]?)(-?\d+)$/.exec(text.trim());
  if (!match) return null;
  const [, letter, accidental, octave] = match;
  let pc = LETTER_PC[letter!.toUpperCase()]!;
  if (accidental === '#' || accidental === '♯') pc += 1;
  if (accidental === 'b' || accidental === '♭') pc -= 1;
  // B#3 is C4 and Cb4 is B3: normalise through MIDI so the octave stays correct.
  return fromMidi((Number(octave) + 1) * 12 + pc);
}
