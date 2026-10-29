import { midi, pitchClassName, transpose, type Note } from './note';

/** Strings are ordered low → high (string 6 first on a guitar). */
export interface Tuning {
  readonly id: string;
  readonly name: string;
  readonly strings: readonly Note[];
}

export const MAX_CAPO = 12;

/** Semitone distance from standard beyond which a string gets a tension warning. */
export const TENSION_WARNING_SEMITONES = 4;

export function clampCapo(capo: number): number {
  if (!Number.isFinite(capo)) return 0;
  return Math.min(MAX_CAPO, Math.max(0, Math.round(capo)));
}

/** Target notes with a capo on fret `capo`: every string moves up by that many semitones. */
export function withCapo(strings: readonly Note[], capo: number): Note[] {
  const n = clampCapo(capo);
  return strings.map((s) => transpose(s, n));
}

export function tuningLabel(name: string, capo: number): string {
  const n = clampCapo(capo);
  return n === 0 ? name : `${name} · Capo ${n}`;
}

/** e.g. "E A D G B E" */
export function formatStrings(strings: readonly Note[], useFlats = false): string {
  return strings.map((s) => pitchClassName(s.pc, useFlats)).join(' ');
}

/**
 * For each string, the semitone offset from the matching `reference` string when it exceeds
 * `TENSION_WARNING_SEMITONES` (positive = higher), otherwise null. Strings without a
 * reference counterpart are never flagged.
 */
export function tensionWarnings(strings: readonly Note[], reference: readonly Note[]): (number | null)[] {
  return strings.map((s, i) => {
    const ref = reference[i];
    if (!ref) return null;
    const diff = midi(s) - midi(ref);
    return Math.abs(diff) > TENSION_WARNING_SEMITONES ? diff : null;
  });
}
