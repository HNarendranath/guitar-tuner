import { noteName, pitchClassName, type Note } from '../music/note';
import type { TunerReading } from '../tuner/analyse';
import { CheckIcon } from './icons';

interface ReadoutProps {
  reading: TunerReading | null;
  /** The string being tuned when there's no reading yet (manual mode), else null. */
  idleTarget: Note | null;
  targetNote: Note | null;
  useFlats: boolean;
}

function NoteName({ note, useFlats }: { note: Note; useFlats: boolean }) {
  return (
    <span class="readout-note">
      {pitchClassName(note.pc, useFlats)}
      <sub>{note.octave}</sub>
    </span>
  );
}

export function Readout({ reading, idleTarget, targetNote, useFlats }: ReadoutProps) {
  if (!reading || !targetNote) {
    return (
      <div class="readout readout-idle">
        {idleTarget ? <NoteName note={idleTarget} useFlats={useFlats} /> : <span class="readout-note">–</span>}
        <p class="readout-hint">{idleTarget ? 'Play this string' : 'Play a string'}</p>
        <p class="readout-detail">&nbsp;</p>
      </div>
    );
  }

  const rounded = Math.round(reading.cents);
  const centsText = `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}${Math.abs(rounded)}¢`;
  const hint = reading.inTune ? (
    <>
      <CheckIcon /> In tune
    </>
  ) : reading.cents < 0 ? (
    'Flat · tune up'
  ) : (
    'Sharp · tune down'
  );

  return (
    <div class={`readout ${reading.inTune ? 'readout-in-tune' : ''}`}>
      <NoteName note={targetNote} useFlats={useFlats} />
      <p class="readout-hint">
        <span class="readout-cents">{centsText}</span> {hint}
      </p>
      <p class="readout-detail">
        Heard {noteName(reading.note, useFlats)} · {reading.frequency.toFixed(1)} Hz → {reading.targetFrequency.toFixed(1)} Hz
      </p>
    </div>
  );
}
