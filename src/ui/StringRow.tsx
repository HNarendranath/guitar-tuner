import { noteName, pitchClassName, type Note } from '../music/note';
import type { TargetMode } from '../tuner/analyse';
import { CheckIcon } from './icons';

interface StringRowProps {
  notes: readonly Note[];
  useFlats: boolean;
  mode: TargetMode;
  /** String currently being measured (auto) or selected (manual), if any. */
  activeIndex: number | null;
  activeInTune: boolean;
  tuned: readonly boolean[];
  onSelectString(index: number): void;
  onModeChange(mode: TargetMode): void;
}

export function StringRow({ notes, useFlats, mode, activeIndex, activeInTune, tuned, onSelectString, onModeChange }: StringRowProps) {
  return (
    <div class="strings">
      <div class="segmented" role="radiogroup" aria-label="String selection">
        {(['auto', 'manual'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            class={mode === m ? 'segment selected' : 'segment'}
            onClick={() => onModeChange(m)}
          >
            {m === 'auto' ? 'Auto' : 'Manual'}
          </button>
        ))}
      </div>
      <div class="string-row" role="group" aria-label="Strings, low to high">
        {notes.map((note, i) => {
          const active = i === activeIndex;
          const classes = ['string', active && 'active', active && activeInTune && 'in-tune', tuned[i] && 'tuned']
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={i}
              type="button"
              class={classes}
              aria-pressed={mode === 'manual' && active}
              aria-label={`String ${notes.length - i}, ${noteName(note, useFlats)}${tuned[i] ? ', tuned' : ''}`}
              onClick={() => onSelectString(i)}
            >
              <span class="string-note">{pitchClassName(note.pc, useFlats)}</span>
              <span class="string-octave">{note.octave}</span>
              {tuned[i] && (
                <span class="string-check">
                  <CheckIcon />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
