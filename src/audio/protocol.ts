import type { YinOptions } from './yin';

/** Shared between the main thread and the AudioWorklet (which is bundled separately). */
export const PITCH_PROCESSOR_NAME = 'pitch-processor';

/** ~85 ms window at 48 kHz: several periods of the lowest string. */
export const BUFFER_SIZE = 4096;
/** ~21 ms between estimates at 48 kHz. */
export const HOP_SIZE = 1024;

export interface PitchProcessorOptions {
  bufferSize: number;
  hopSize: number;
  yin?: Partial<YinOptions>;
}
