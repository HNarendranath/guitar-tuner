import type { YinOptions } from './yin';

/** Shared between the main thread and the AudioWorklet (which is bundled separately). */
export const PITCH_PROCESSOR_NAME = 'pitch-processor';

/** ~85 ms window at 48 kHz: several periods of the lowest string. */
export const BUFFER_SIZE = 4096;
/** ~21 ms between estimates at 48 kHz. */
export const HOP_SIZE = 1024;

/**
 * Low-pass applied to the mic before detection. Above the highest tracked pitch (1 kHz) it only
 * removes hiss, which improves signal-to-noise by ~11 dB for quiet sources. Filtering never changes
 * a waveform's period, so it can't bias the pitch.
 */
export const INPUT_LOWPASS_HZ = 1500;

export interface PitchProcessorOptions {
  bufferSize: number;
  hopSize: number;
  yin?: Partial<YinOptions>;
}

/** Main thread → worklet messages. */
export type PitchProcessorMessage = { type: 'setThreshold'; threshold: number };
