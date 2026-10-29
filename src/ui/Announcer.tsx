import { useEffect, useRef, useState } from 'preact/hooks';
import { noteName, type Note } from '../music/note';
import type { TunerReading } from '../tuner/analyse';

const INTERVAL_MS = 2000;

export function describeReading(reading: TunerReading | null, notes: readonly Note[], useFlats: boolean): string {
  const note = reading && notes[reading.stringIndex];
  if (!reading || !note) return '';
  const offset = Math.abs(Math.round(reading.cents));
  const status = reading.inTune ? 'in tune' : `${offset} ${offset === 1 ? 'cent' : 'cents'} ${reading.cents < 0 ? 'flat' : 'sharp'}`;
  return `${noteName(note, useFlats)} string, ${status}`;
}

interface AnnouncerProps {
  reading: TunerReading | null;
  notes: readonly Note[];
  useFlats: boolean;
  active: boolean;
}

/** Screen-reader live region, throttled so VoiceOver isn't flooded at ~50 updates a second. */
export function Announcer({ reading, notes, useFlats, active }: AnnouncerProps) {
  const [text, setText] = useState('');
  const latest = useRef('');
  latest.current = describeReading(reading, notes, useFlats);

  useEffect(() => {
    if (!active) {
      setText('');
      return;
    }
    const id = setInterval(() => {
      const next = latest.current;
      if (next) setText(next);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [active]);

  return (
    <div class="sr-only" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}
