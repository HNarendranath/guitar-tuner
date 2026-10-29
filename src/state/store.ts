import { PRESETS, STANDARD, isPresetId } from '../music/presets';
import { clampCapo, type Tuning } from '../music/tuning';
import type { TargetMode } from '../tuner/analyse';
import { SCHEMA_VERSION, parseSettings, parseTuning, type PersistedState, type Settings } from './storage';

export interface AppState {
  customTunings: readonly Tuning[];
  settings: Settings;
  tuningId: string;
  capo: number;
  mode: TargetMode;
  /** Target string index in manual mode. */
  manualString: number;
}

export type Action =
  | { type: 'selectTuning'; id: string }
  | { type: 'setCapo'; capo: number }
  /** Creates or updates a custom tuning and selects it. */
  | { type: 'saveTuning'; tuning: Tuning }
  | { type: 'deleteTuning'; id: string }
  | { type: 'setMode'; mode: TargetMode }
  /** Tapping a string: switches to manual mode targeting it. */
  | { type: 'selectString'; index: number }
  | { type: 'updateSettings'; settings: Partial<Settings> };

export function findTuning(state: Pick<AppState, 'customTunings'>, id: string): Tuning | undefined {
  return PRESETS.find((p) => p.id === id) ?? state.customTunings.find((t) => t.id === id);
}

export function currentTuning(state: AppState): Tuning {
  return findTuning(state, state.tuningId) ?? STANDARD;
}

export function initialState(persisted: PersistedState): AppState {
  const { customTunings, settings, lastTuningId, lastCapo } = persisted;
  return {
    customTunings,
    settings,
    tuningId: findTuning({ customTunings }, lastTuningId) ? lastTuningId : STANDARD.id,
    capo: clampCapo(lastCapo),
    mode: 'auto',
    manualString: 0,
  };
}

export function toPersisted(state: AppState): PersistedState {
  return {
    version: SCHEMA_VERSION,
    customTunings: [...state.customTunings],
    settings: state.settings,
    lastTuningId: state.tuningId,
    lastCapo: state.capo,
  };
}

export function newTuningId(): string {
  const uuid =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `custom:${uuid}`;
}

/** An unsaved custom copy of `source` (presets are read-only, so editing one starts here). */
export function draftFrom(source: Tuning, name: string): Tuning {
  return { id: newTuningId(), name, strings: [...source.strings] };
}

function clampString(index: number, tuning: Tuning): number {
  return Math.min(tuning.strings.length - 1, Math.max(0, Math.round(index)));
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'selectTuning': {
      const tuning = findTuning(state, action.id);
      if (!tuning) return state;
      return { ...state, tuningId: tuning.id, manualString: clampString(state.manualString, tuning) };
    }
    case 'setCapo':
      return { ...state, capo: clampCapo(action.capo) };
    case 'saveTuning': {
      const tuning = parseTuning(action.tuning);
      if (!tuning) return state;
      const exists = state.customTunings.some((t) => t.id === tuning.id);
      const customTunings = exists
        ? state.customTunings.map((t) => (t.id === tuning.id ? tuning : t))
        : [...state.customTunings, tuning];
      return { ...state, customTunings, tuningId: tuning.id, manualString: clampString(state.manualString, tuning) };
    }
    case 'deleteTuning': {
      if (isPresetId(action.id)) return state;
      return {
        ...state,
        customTunings: state.customTunings.filter((t) => t.id !== action.id),
        tuningId: state.tuningId === action.id ? STANDARD.id : state.tuningId,
      };
    }
    case 'setMode':
      return { ...state, mode: action.mode };
    case 'selectString':
      return { ...state, mode: 'manual', manualString: clampString(action.index, currentTuning(state)) };
    case 'updateSettings':
      return { ...state, settings: parseSettings({ ...state.settings, ...action.settings }) };
  }
}
