import { A4_RANGE, TOLERANCE_RANGE, type Settings as SettingsData } from '../state/storage';
import { Sheet } from './Sheet';
import { Stepper } from './Stepper';
import type { AudioInfo } from './useTuner';

interface SettingsProps {
  settings: SettingsData;
  audioInfo: AudioInfo;
  onChange(patch: Partial<SettingsData>): void;
  onClose(): void;
}

const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

export function Settings({ settings, audioInfo, onChange, onClose }: SettingsProps) {
  return (
    <Sheet title="Settings" onClose={onClose}>
      <div class="setting-row">
        <div>
          <h3>Reference pitch</h3>
          <p class="muted">Frequency of A4</p>
        </div>
        <Stepper
          label="Reference pitch"
          value={settings.a4}
          min={A4_RANGE.min}
          max={A4_RANGE.max}
          onChange={(a4) => onChange({ a4 })}
          format={(v) => `${v} Hz`}
        />
      </div>

      <div class="setting-row">
        <div>
          <h3>In-tune tolerance</h3>
          <p class="muted">How close counts as tuned</p>
        </div>
        <Stepper
          label="Tolerance"
          value={settings.toleranceCents}
          min={TOLERANCE_RANGE.min}
          max={TOLERANCE_RANGE.max}
          onChange={(toleranceCents) => onChange({ toleranceCents })}
          format={(v) => `±${v}¢`}
        />
      </div>

      <div class="setting-row">
        <div>
          <h3>Note names</h3>
        </div>
        <div class="segmented" role="radiogroup" aria-label="Note names">
          {[false, true].map((flats) => (
            <button
              key={String(flats)}
              type="button"
              role="radio"
              aria-checked={settings.useFlats === flats}
              class={settings.useFlats === flats ? 'segment selected' : 'segment'}
              onClick={() => onChange({ useFlats: flats })}
            >
              {flats ? 'Flats ♭' : 'Sharps ♯'}
            </button>
          ))}
        </div>
      </div>

      <div class="setting-row">
        <div>
          <h3>Keep screen on</h3>
          <p class="muted">{wakeLockSupported ? 'While listening' : 'Not supported in this browser'}</p>
        </div>
        <button
          type="button"
          role="switch"
          class="switch"
          aria-label="Keep screen on"
          aria-checked={settings.keepAwake}
          disabled={!wakeLockSupported}
          onClick={() => onChange({ keepAwake: !settings.keepAwake })}
        />
      </div>

      <p class="about muted">
        Audio:{' '}
        {audioInfo.engine
          ? `${audioInfo.engine === 'worklet' ? 'AudioWorklet' : 'AnalyserNode fallback'} · ${audioInfo.sampleRate} Hz`
          : 'not started'}
      </p>
    </Sheet>
  );
}
