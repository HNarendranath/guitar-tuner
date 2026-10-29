import type { RefObject } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_ANALYSER_OPTIONS, type PitchFrame } from '../tuner/analyse';
import type { AudioInfo } from './useTuner';

const FLOOR_DB = -100;
const toDb = (rms: number) => (rms > 0 ? 20 * Math.log10(rms) : -Infinity);
const GATE_DB = toDb(DEFAULT_ANALYSER_OPTIONS.rmsThreshold);
const meterPercent = (db: number) => `${Math.max(0, Math.min(100, ((db - FLOOR_DB) / -FLOOR_DB) * 100))}%`;

const PROCESSING = [
  ['noiseSuppression', 'Noise suppression'],
  ['echoCancellation', 'Echo cancellation'],
  ['autoGainControl', 'Auto gain'],
] as const;

interface DiagnosticsProps {
  audioInfo: AudioInfo;
  lastFrameRef: RefObject<PitchFrame | null>;
  listening: boolean;
}

/** Live view of the raw mic input, for working out why a note isn't registering on a given device. */
export function Diagnostics({ audioInfo, lastFrameRef, listening }: DiagnosticsProps) {
  const [frame, setFrame] = useState<PitchFrame | null>(null);

  useEffect(() => {
    if (!listening) return;
    const id = setInterval(() => setFrame(lastFrameRef.current), 100);
    return () => clearInterval(id);
  }, [listening, lastFrameRef]);

  const { engine, sampleRate, processing } = audioInfo;
  if (!listening || !engine) return <p class="muted">Start the tuner to see live input diagnostics.</p>;

  const db = frame ? toDb(frame.rms) : -Infinity;
  const stillOn = PROCESSING.filter(([key]) => processing?.[key] === true).map(([, label]) => label.toLowerCase());

  return (
    <div class="diagnostics">
      <div class="diag-row">
        <span>Input level</span>
        <span>{Number.isFinite(db) ? `${db.toFixed(0)} dBFS` : '—'}</span>
      </div>
      <div class="level-meter" aria-hidden="true">
        <div class={db >= GATE_DB ? 'level-fill' : 'level-fill below-gate'} style={{ width: meterPercent(db) }} />
        <div class="level-gate" style={{ left: meterPercent(GATE_DB) }} />
      </div>
      <div class="diag-row">
        <span>Detected pitch</span>
        <span>{frame?.frequency ? `${frame.frequency.toFixed(1)} Hz · clarity ${frame.clarity.toFixed(2)}` : 'none'}</span>
      </div>
      <div class="diag-row">
        <span>Audio engine</span>
        <span>
          {engine === 'worklet' ? 'AudioWorklet' : 'AnalyserNode'} · {sampleRate} Hz
        </span>
      </div>
      {PROCESSING.map(([key, label]) => (
        <div class="diag-row" key={key}>
          <span>{label}</span>
          <span class={processing?.[key] ? 'diag-warn' : undefined}>
            {processing?.[key] === undefined ? 'not reported' : processing[key] ? 'ON' : 'off'}
          </span>
        </div>
      ))}
      {stillOn.length > 0 && (
        <p class="diag-note diag-warn">
          The browser kept {stillOn.join(' and ')} on despite the request to disable it. That can fade out sustained
          notes — try another browser.
        </p>
      )}
      <p class="diag-note muted">
        A pluck should lift the level at least 15 dB above where it sits in silence; the bigger the jump, the steadier
        the reading. Unplugged electric guitars are very quiet: hold the bottom edge of the phone (where the mic is) a
        few centimetres from the strings, or rest the phone on the guitar’s body.
      </p>
      <p class="diag-note muted">
        If speech registers but held notes fade out, the device may be filtering them: on iPhone, open Control Center
        while listening and, if a Mic Mode button appears, set it to Standard.
      </p>
    </div>
  );
}
