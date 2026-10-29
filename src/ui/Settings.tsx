import type { RefObject } from 'preact';
import { A4_RANGE, TOLERANCE_RANGE, type Settings as SettingsData } from '../state/storage';
import type { PitchFrame } from '../tuner/analyse';
import { SENSITIVITY_RANGE } from '../tuner/sensitivity';
import { Diagnostics } from './Diagnostics';
import { Sheet } from './Sheet';
import { Stepper } from './Stepper';
import type { AudioInfo } from './useTuner';

interface SettingsProps {
  settings: SettingsData;
  audioInfo: AudioInfo;
  lastFrameRef: RefObject<PitchFrame | null>;
  listening: boolean;
  onChange(patch: Partial<SettingsData>): void;
  onClose(): void;
}

const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

export function Settings({ settings, audioInfo, lastFrameRef, listening, onChange, onClose }: SettingsProps) {
  return (
    <Sheet title="Settings" onClose={onClose}>
      <div class="setting-row stacked">
        <div class="setting-heading">
          <h3>Mic sensitivity</h3>
          <span class="setting-value">
            {settings.sensitivity} / {SENSITIVITY_RANGE.max}
          </span>
        </div>
        <input
          type="range"
          class="slider"
          aria-label="Mic sensitivity"
          aria-valuetext={`${settings.sensitivity} of ${SENSITIVITY_RANGE.max}`}
          min={SENSITIVITY_RANGE.min}
          max={SENSITIVITY_RANGE.max}
          step={1}
          value={settings.sensitivity}
          onInput={(e) => onChange({ sensitivity: Number(e.currentTarget.value) })}
        />
        <div class="slider-labels" aria-hidden="true">
          <span>Steadier</span>
          <span>Hears further</span>
        </div>
        <p class="muted">
          Raise it if you have to hold the phone very close. Higher settings hear quieter, more distant guitars, at the
          cost of a slightly slower, less steady needle.
        </p>
      </div>

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

      <section class="sheet-section">
        <h3>Diagnostics</h3>
        <Diagnostics audioInfo={audioInfo} lastFrameRef={lastFrameRef} listening={listening} />
      </section>
    </Sheet>
  );
}
