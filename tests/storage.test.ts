import { describe, expect, it } from 'vitest';
import { STANDARD } from '../src/music/presets';
import {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  defaultPersistedState,
  loadState,
  parseState,
  saveState,
  type KeyValueStore,
  type PersistedState,
} from '../src/state/storage';
import { initialState, reducer, toPersisted, type AppState } from '../src/state/store';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

const custom = { id: 'custom:1', name: 'Open D', strings: STANDARD.strings.map((s) => ({ ...s })) };

const valid: PersistedState = {
  version: 1,
  customTunings: [custom],
  settings: { a4: 442, toleranceCents: 3, useFlats: true, keepAwake: false },
  lastTuningId: 'custom:1',
  lastCapo: 4,
};

describe('storage', () => {
  it('returns defaults when nothing is stored or storage is unavailable', () => {
    expect(loadState(new MemoryStore())).toEqual(defaultPersistedState());
    expect(loadState(null)).toEqual(defaultPersistedState());
  });

  it('round-trips a saved state', () => {
    const store = new MemoryStore();
    expect(saveState(store, valid)).toBe(true);
    expect(loadState(store)).toEqual(valid);
  });

  it('survives corrupt JSON, wrong versions and wrong shapes', () => {
    const store = new MemoryStore();
    for (const raw of ['{not json', 'null', '[]', '"x"', JSON.stringify({ ...valid, version: 2 })]) {
      store.setItem(STORAGE_KEY, raw);
      expect(loadState(store)).toEqual(defaultPersistedState());
    }
  });

  it('keeps valid tunings and drops invalid or duplicate ones', () => {
    const state = parseState({
      ...valid,
      customTunings: [
        custom,
        custom,
        { id: 'preset:standard', name: 'Hijack', strings: custom.strings },
        { id: 'custom:2', name: 'Bad note', strings: [{ pc: 12, octave: 2 }] },
        { id: 'custom:3', name: 'No strings', strings: [] },
        { id: 'custom:4', name: '   ', strings: [{ pc: 4, octave: 2 }] },
        'garbage',
      ],
    });
    expect(state.customTunings.map((t) => t.id)).toEqual(['custom:1', 'custom:4']);
    expect(state.customTunings[1]!.name).toBe('Custom tuning');
  });

  it('clamps or defaults individual settings', () => {
    const state = parseState({ ...valid, settings: { a4: 500, toleranceCents: 'x', useFlats: 1 }, lastCapo: 99 });
    expect(state.settings).toEqual({ ...DEFAULT_SETTINGS, a4: 450 });
    expect(state.lastCapo).toBe(12);
  });

  it('reports failure when storage throws (quota / private mode)', () => {
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(saveState(throwing, valid)).toBe(false);
    expect(loadState(throwing)).toEqual(defaultPersistedState());
  });
});

describe('store', () => {
  const base = (): AppState => initialState(valid);

  it('restores the last tuning and capo, falling back to Standard for unknown ids', () => {
    expect(base()).toMatchObject({ tuningId: 'custom:1', capo: 4, mode: 'auto' });
    expect(initialState({ ...valid, lastTuningId: 'custom:gone' }).tuningId).toBe(STANDARD.id);
    expect(toPersisted(base())).toEqual(valid);
  });

  it('selects only known tunings', () => {
    expect(reducer(base(), { type: 'selectTuning', id: 'preset:dadgad' }).tuningId).toBe('preset:dadgad');
    const state = base();
    expect(reducer(state, { type: 'selectTuning', id: 'nope' })).toBe(state);
  });

  it('clamps the capo', () => {
    expect(reducer(base(), { type: 'setCapo', capo: 13 }).capo).toBe(12);
    expect(reducer(base(), { type: 'setCapo', capo: -1 }).capo).toBe(0);
  });

  it('creates, updates and deletes custom tunings', () => {
    const added = reducer(base(), { type: 'saveTuning', tuning: { ...custom, id: 'custom:2', name: 'New' } });
    expect(added.customTunings).toHaveLength(2);
    expect(added.tuningId).toBe('custom:2');

    const renamed = reducer(added, { type: 'saveTuning', tuning: { ...custom, id: 'custom:2', name: 'Renamed' } });
    expect(renamed.customTunings.map((t) => t.name)).toEqual(['Open D', 'Renamed']);

    const deleted = reducer(renamed, { type: 'deleteTuning', id: 'custom:2' });
    expect(deleted.customTunings).toHaveLength(1);
    expect(deleted.tuningId).toBe(STANDARD.id);
  });

  it('keeps presets read-only', () => {
    const state = base();
    expect(reducer(state, { type: 'deleteTuning', id: STANDARD.id })).toBe(state);
    expect(reducer(state, { type: 'saveTuning', tuning: { ...STANDARD, name: 'Mine' } })).toBe(state);
  });

  it('switches to manual mode when a string is tapped', () => {
    const state = reducer(base(), { type: 'selectString', index: 9 });
    expect(state).toMatchObject({ mode: 'manual', manualString: 5 });
  });

  it('sanitises settings updates', () => {
    expect(reducer(base(), { type: 'updateSettings', settings: { a4: 420 } }).settings.a4).toBe(430);
  });
});
