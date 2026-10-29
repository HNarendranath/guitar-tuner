import type { Note } from '../music/note';
import { STANDARD, isPresetId } from '../music/presets';
import { clampCapo, type Tuning } from '../music/tuning';
import { DEFAULT_SENSITIVITY, SENSITIVITY_RANGE } from '../tuner/sensitivity';

export const STORAGE_KEY = 'guitar-tuner';
export const SCHEMA_VERSION = 1;

export interface Settings {
  /** Reference pitch for A4 in Hz. */
  a4: number;
  /** ± cents counted as in tune. */
  toleranceCents: number;
  useFlats: boolean;
  /** Hold a screen wake lock while listening. */
  keepAwake: boolean;
  /** Mic sensitivity level, 1 (steadiest) … 5 (picks up quietest / most distant). */
  sensitivity: number;
}

export const A4_RANGE = { min: 430, max: 450 } as const;
export const TOLERANCE_RANGE = { min: 1, max: 10 } as const;
export const OCTAVE_RANGE = { min: 0, max: 8 } as const;
export const MAX_STRINGS = 12;
export const MAX_NAME_LENGTH = 40;

export const DEFAULT_SETTINGS: Settings = {
  a4: 440,
  toleranceCents: 5,
  useFlats: false,
  keepAwake: true,
  sensitivity: DEFAULT_SENSITIVITY,
};

export interface PersistedState {
  version: typeof SCHEMA_VERSION;
  customTunings: Tuning[];
  settings: Settings;
  lastTuningId: string;
  lastCapo: number;
}

/** The subset of the Web Storage API we use, so tests can pass a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultPersistedState(): PersistedState {
  return {
    version: SCHEMA_VERSION,
    customTunings: [],
    settings: { ...DEFAULT_SETTINGS },
    lastTuningId: STANDARD.id,
    lastCapo: 0,
  };
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (v: unknown): v is UnknownRecord => typeof v === 'object' && v !== null && !Array.isArray(v);

const isIntIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

const numberIn = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

/** Validates settings, clamping numbers into range and falling back to defaults per field. */
export function parseSettings(data: unknown): Settings {
  const s = isRecord(data) ? data : {};
  return {
    a4: numberIn(s.a4, A4_RANGE.min, A4_RANGE.max, DEFAULT_SETTINGS.a4),
    toleranceCents: numberIn(s.toleranceCents, TOLERANCE_RANGE.min, TOLERANCE_RANGE.max, DEFAULT_SETTINGS.toleranceCents),
    useFlats: typeof s.useFlats === 'boolean' ? s.useFlats : DEFAULT_SETTINGS.useFlats,
    keepAwake: typeof s.keepAwake === 'boolean' ? s.keepAwake : DEFAULT_SETTINGS.keepAwake,
    sensitivity: Math.round(
      numberIn(s.sensitivity, SENSITIVITY_RANGE.min, SENSITIVITY_RANGE.max, DEFAULT_SETTINGS.sensitivity),
    ),
  };
}

function parseNote(data: unknown): Note | null {
  if (!isRecord(data) || !isIntIn(data.pc, 0, 11) || !isIntIn(data.octave, OCTAVE_RANGE.min, OCTAVE_RANGE.max)) {
    return null;
  }
  return { pc: data.pc, octave: data.octave };
}

/** Returns a valid custom tuning, or null if the data can't be trusted. */
export function parseTuning(data: unknown): Tuning | null {
  if (!isRecord(data) || typeof data.id !== 'string' || data.id === '' || isPresetId(data.id)) return null;
  if (!Array.isArray(data.strings) || data.strings.length === 0 || data.strings.length > MAX_STRINGS) return null;
  const strings = data.strings.map(parseNote);
  if (strings.some((s) => s === null)) return null;
  const name = typeof data.name === 'string' ? data.name.trim().slice(0, MAX_NAME_LENGTH) : '';
  return { id: data.id, name: name || 'Custom tuning', strings: strings as Note[] };
}

/** Validates stored data; anything missing or corrupt falls back to defaults rather than throwing. */
export function parseState(data: unknown): PersistedState {
  const defaults = defaultPersistedState();
  if (!isRecord(data) || data.version !== SCHEMA_VERSION) return defaults;

  const seen = new Set<string>();
  const customTunings = (Array.isArray(data.customTunings) ? data.customTunings : []).flatMap((t) => {
    const tuning = parseTuning(t);
    if (!tuning || seen.has(tuning.id)) return [];
    seen.add(tuning.id);
    return [tuning];
  });

  return {
    version: SCHEMA_VERSION,
    customTunings,
    settings: parseSettings(data.settings),
    lastTuningId: typeof data.lastTuningId === 'string' ? data.lastTuningId : defaults.lastTuningId,
    lastCapo: typeof data.lastCapo === 'number' ? clampCapo(data.lastCapo) : defaults.lastCapo,
  };
}

export function loadState(store: KeyValueStore | null | undefined): PersistedState {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    return raw ? parseState(JSON.parse(raw)) : defaultPersistedState();
  } catch {
    return defaultPersistedState();
  }
}

/** Returns false if storage is unavailable or full (e.g. some private-browsing modes). */
export function saveState(store: KeyValueStore | null | undefined, state: PersistedState): boolean {
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
