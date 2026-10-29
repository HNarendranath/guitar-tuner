import { useCallback, useEffect, useMemo, useReducer, useState } from 'preact/hooks';
import { frequency } from '../music/note';
import { STANDARD } from '../music/presets';
import { formatStrings, tuningLabel, withCapo, type Tuning } from '../music/tuning';
import { loadState, saveState, type KeyValueStore } from '../state/storage';
import { currentTuning, draftFrom, initialState, reducer, toPersisted } from '../state/store';
import { sensitivityProfile } from '../tuner/sensitivity';
import { Announcer } from './Announcer';
import { Gauge } from './Gauge';
import { ChevronDownIcon, GearIcon } from './icons';
import { Readout } from './Readout';
import { Settings } from './Settings';
import { StartScreen } from './StartScreen';
import { StringRow } from './StringRow';
import { TuningEditor } from './TuningEditor';
import { TuningPicker } from './TuningPicker';
import { useTuner } from './useTuner';

type SheetState =
  | { kind: 'picker' }
  | { kind: 'settings' }
  | { kind: 'editor'; draft: Tuning; isNew: boolean }
  | null;

/** localStorage can throw on access in some privacy modes. */
function browserStorage(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function App() {
  const [state, dispatch] = useReducer(reducer, null, () => initialState(loadState(browserStorage())));
  const { settings, capo, mode, manualString, customTunings, tuningId } = state;

  useEffect(() => {
    saveState(browserStorage(), toPersisted(state));
  }, [customTunings, settings, tuningId, capo]);

  const tuning = currentTuning(state);
  const notes = useMemo(() => withCapo(tuning.strings, capo), [tuning, capo]);
  const targets = useMemo(() => notes.map((n) => frequency(n, settings.a4)), [notes, settings.a4]);

  const { yinThreshold, smoothing } = sensitivityProfile(settings.sensitivity);
  const { state: tuner, status, error, audioInfo, lastFrameRef, start } = useTuner(
    { targets, mode, manualIndex: manualString, toleranceCents: settings.toleranceCents, a4: settings.a4, smoothing },
    { keepAwake: settings.keepAwake, yinThreshold },
  );

  const [sheet, setSheet] = useState<SheetState>(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  const openPicker = useCallback(() => setSheet({ kind: 'picker' }), []);

  const { reading } = tuner;
  const listening = status === 'listening';
  const activeIndex = reading ? reading.stringIndex : mode === 'manual' ? manualString : null;
  const label = tuningLabel(tuning.name, capo);

  return (
    <div class="app">
      <header class="topbar">
        <button
          type="button"
          class="tuning-button"
          aria-label={`Tuning: ${label}. Change tuning or capo`}
          onClick={openPicker}
        >
          <span class="tuning-title">
            <span class="tuning-name">{tuning.name}</span>
            {capo > 0 && <span class="capo-badge">Capo {capo}</span>}
            <ChevronDownIcon />
          </span>
          <span class="tuning-notes">{formatStrings(notes, settings.useFlats)}</span>
        </button>
        <button type="button" class="icon-button" aria-label="Settings" onClick={() => setSheet({ kind: 'settings' })}>
          <GearIcon />
        </button>
      </header>

      <main class="stage">
        {listening ? (
          <>
            <Gauge cents={reading?.cents ?? null} toleranceCents={settings.toleranceCents} />
            <Readout
              reading={reading}
              targetNote={reading ? (notes[reading.stringIndex] ?? null) : null}
              idleTarget={mode === 'manual' ? (notes[manualString] ?? null) : null}
              useFlats={settings.useFlats}
            />
          </>
        ) : (
          <StartScreen status={status} error={error} onStart={start} />
        )}
      </main>

      <footer class="footer">
        <StringRow
          notes={notes}
          useFlats={settings.useFlats}
          mode={mode}
          activeIndex={activeIndex}
          activeInTune={reading?.inTune ?? false}
          tuned={tuner.tuned}
          onSelectString={(index) => dispatch({ type: 'selectString', index })}
          onModeChange={(next) => dispatch({ type: 'setMode', mode: next })}
        />
      </footer>

      <Announcer reading={reading} notes={notes} useFlats={settings.useFlats} active={listening} />

      {sheet?.kind === 'picker' && (
        <TuningPicker
          customTunings={customTunings}
          selectedId={tuning.id}
          capo={capo}
          useFlats={settings.useFlats}
          onSelect={(id) => {
            dispatch({ type: 'selectTuning', id });
            closeSheet();
          }}
          onCapoChange={(n) => dispatch({ type: 'setCapo', capo: n })}
          onNew={() => setSheet({ kind: 'editor', draft: draftFrom(STANDARD, 'My tuning'), isNew: true })}
          onEdit={(t) => setSheet({ kind: 'editor', draft: t, isNew: false })}
          onDuplicate={(t) => setSheet({ kind: 'editor', draft: draftFrom(t, `${t.name} (copy)`), isNew: true })}
          onDelete={(id) => dispatch({ type: 'deleteTuning', id })}
          onClose={closeSheet}
        />
      )}

      {sheet?.kind === 'editor' && (
        <TuningEditor
          draft={sheet.draft}
          isNew={sheet.isNew}
          useFlats={settings.useFlats}
          a4={settings.a4}
          onSave={(t) => {
            dispatch({ type: 'saveTuning', tuning: t });
            closeSheet();
          }}
          onCancel={openPicker}
        />
      )}

      {sheet?.kind === 'settings' && (
        <Settings
          settings={settings}
          audioInfo={audioInfo}
          lastFrameRef={lastFrameRef}
          listening={listening}
          onChange={(patch) => dispatch({ type: 'updateSettings', settings: patch })}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}
