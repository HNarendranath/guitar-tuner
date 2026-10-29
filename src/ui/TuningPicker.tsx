import { useState } from 'preact/hooks';
import { PRESETS } from '../music/presets';
import { MAX_CAPO, formatStrings, type Tuning } from '../music/tuning';
import { CheckIcon } from './icons';
import { Sheet } from './Sheet';
import { Stepper } from './Stepper';

interface TuningPickerProps {
  customTunings: readonly Tuning[];
  selectedId: string;
  capo: number;
  useFlats: boolean;
  onSelect(id: string): void;
  onCapoChange(capo: number): void;
  onNew(): void;
  onEdit(tuning: Tuning): void;
  onDuplicate(tuning: Tuning): void;
  onDelete(id: string): void;
  onClose(): void;
}

export function TuningPicker(props: TuningPickerProps) {
  const { customTunings, selectedId, capo, useFlats, onClose } = props;
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const row = (tuning: Tuning, custom: boolean) => {
    const selected = tuning.id === selectedId;
    if (confirmingDelete === tuning.id) {
      return (
        <li key={tuning.id} class="tuning-item confirming">
          <span class="tuning-item-text">Delete “{tuning.name}”?</span>
          <div class="tuning-actions">
            <button type="button" class="small-button" onClick={() => setConfirmingDelete(null)}>
              Cancel
            </button>
            <button
              type="button"
              class="small-button danger"
              onClick={() => {
                setConfirmingDelete(null);
                props.onDelete(tuning.id);
              }}
            >
              Delete
            </button>
          </div>
        </li>
      );
    }
    return (
      <li key={tuning.id} class={selected ? 'tuning-item selected' : 'tuning-item'}>
        <button type="button" class="tuning-item-main" aria-current={selected} onClick={() => props.onSelect(tuning.id)}>
          <span class="tuning-item-name">
            {tuning.name}
            {selected && <CheckIcon />}
          </span>
          <span class="tuning-item-notes">{formatStrings(tuning.strings, useFlats)}</span>
        </button>
        <div class="tuning-actions">
          {custom && (
            <button type="button" class="small-button" aria-label={`Edit ${tuning.name}`} onClick={() => props.onEdit(tuning)}>
              Edit
            </button>
          )}
          <button
            type="button"
            class="small-button"
            aria-label={`Duplicate ${tuning.name} as a custom tuning`}
            onClick={() => props.onDuplicate(tuning)}
          >
            Copy
          </button>
          {custom && (
            <button
              type="button"
              class="small-button"
              aria-label={`Delete ${tuning.name}`}
              onClick={() => setConfirmingDelete(tuning.id)}
            >
              Delete
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <Sheet title="Tuning" onClose={onClose}>
      <section class="sheet-section capo-section">
        <div>
          <h3>Capo</h3>
          <p class="muted">Shifts every string up</p>
        </div>
        <Stepper
          label="Capo"
          value={capo}
          min={0}
          max={MAX_CAPO}
          onChange={props.onCapoChange}
          format={(n) => (n === 0 ? 'None' : `Fret ${n}`)}
        />
      </section>

      <section class="sheet-section">
        <h3>Presets</h3>
        <ul class="tuning-list">{PRESETS.map((t) => row(t, false))}</ul>
      </section>

      <section class="sheet-section">
        <h3>Custom</h3>
        {customTunings.length === 0 ? (
          <p class="muted">No custom tunings yet. Create one, or copy a preset to start from it.</p>
        ) : (
          <ul class="tuning-list">{customTunings.map((t) => row(t, true))}</ul>
        )}
        <button type="button" class="primary-button" onClick={props.onNew}>
          New tuning
        </button>
      </section>
    </Sheet>
  );
}
