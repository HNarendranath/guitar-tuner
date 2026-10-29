import { parseNote, type Note } from './note';
import type { Tuning } from './tuning';

function notes(spec: string): Note[] {
  return spec.split(' ').map((name) => {
    const note = parseNote(name);
    if (!note) throw new Error(`Invalid note in preset: ${name}`);
    return note;
  });
}

export const PRESET_ID_PREFIX = 'preset:';

export const PRESETS: readonly Tuning[] = [
  { id: 'preset:standard', name: 'Standard', strings: notes('E2 A2 D3 G3 B3 E4') },
  { id: 'preset:drop-d', name: 'Drop D', strings: notes('D2 A2 D3 G3 B3 E4') },
  { id: 'preset:half-step-down', name: 'Half-step down', strings: notes('Eb2 Ab2 Db3 Gb3 Bb3 Eb4') },
  { id: 'preset:dadgad', name: 'DADGAD', strings: notes('D2 A2 D3 G3 A3 D4') },
  { id: 'preset:open-g', name: 'Open G', strings: notes('D2 G2 D3 G3 B3 D4') },
];

export const STANDARD: Tuning = PRESETS[0]!;

export function isPresetId(id: string): boolean {
  return id.startsWith(PRESET_ID_PREFIX);
}

export function findPreset(id: string): Tuning | undefined {
  return PRESETS.find((p) => p.id === id);
}
