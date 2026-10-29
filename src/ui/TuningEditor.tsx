import { useState } from 'preact/hooks';
import { DEFAULT_YIN_OPTIONS } from '../audio/yin';
import { frequency, pitchClassName, type Note } from '../music/note';
import { STANDARD } from '../music/presets';
import { tensionWarnings, type Tuning } from '../music/tuning';
import { MAX_NAME_LENGTH, OCTAVE_RANGE } from '../state/storage';
import { WarningIcon } from './icons';
import { Sheet } from './Sheet';
import { Stepper } from './Stepper';

interface TuningEditorProps {
  draft: Tuning;
  isNew: boolean;
  useFlats: boolean;
  a4: number;
  onSave(tuning: Tuning): void;
  onCancel(): void;
}

const PITCH_CLASSES = Array.from({ length: 12 }, (_, pc) => pc);
const { minFrequency, maxFrequency } = DEFAULT_YIN_OPTIONS;

export function TuningEditor({ draft, isNew, useFlats, a4, onSave, onCancel }: TuningEditorProps) {
  const [name, setName] = useState(draft.name);
  const [strings, setStrings] = useState<Note[]>(() => [...draft.strings]);
  const warnings = tensionWarnings(strings, STANDARD.strings);

  const update = (index: number, note: Note) => setStrings((prev) => prev.map((s, i) => (i === index ? note : s)));
  const save = () => onSave({ id: draft.id, name: name.trim() || 'Custom tuning', strings });

  return (
    <Sheet
      title={isNew ? 'New tuning' : 'Edit tuning'}
      onClose={onCancel}
      headerAction={
        <button type="button" class="text-button" onClick={onCancel}>
          Cancel
        </button>
      }
      footer={
        <button type="button" class="primary-button" onClick={save}>
          Save tuning
        </button>
      }
    >
      <label class="field">
        <span>Name</span>
        <input
          type="text"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          placeholder="My tuning"
          autocomplete="off"
          onInput={(e) => setName(e.currentTarget.value)}
        />
      </label>

      <p class="muted">Strings from lowest (6) to highest (1).</p>
      <ol class="editor-strings">
        {strings.map((s, i) => {
          const number = strings.length - i;
          const warning = warnings[i];
          const hz = frequency(s, a4);
          return (
            <li key={i} class="editor-row">
              <span class="editor-number" aria-hidden="true">
                {number}
              </span>
              <select
                class="editor-note"
                aria-label={`String ${number} note`}
                value={String(s.pc)}
                onChange={(e) => update(i, { ...s, pc: Number(e.currentTarget.value) })}
              >
                {PITCH_CLASSES.map((pc) => (
                  <option key={pc} value={String(pc)}>
                    {pitchClassName(pc, useFlats)}
                  </option>
                ))}
              </select>
              <Stepper
                label={`String ${number} octave`}
                value={s.octave}
                min={OCTAVE_RANGE.min}
                max={OCTAVE_RANGE.max}
                onChange={(octave) => update(i, { ...s, octave })}
              />
              <span class="editor-hz">{hz.toFixed(1)} Hz</span>
              {warning != null && (
                <p class="editor-warning">
                  <WarningIcon />
                  {Math.abs(warning)} semitones {warning > 0 ? 'above' : 'below'} standard — check string tension
                </p>
              )}
              {(hz < minFrequency || hz > maxFrequency) && (
                <p class="editor-warning">
                  <WarningIcon />
                  Outside the range the tuner can detect ({minFrequency}–{maxFrequency} Hz)
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </Sheet>
  );
}
