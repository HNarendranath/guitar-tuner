import type { PitchFrame } from '../tuner/analyse';
import { PITCH_PROCESSOR_NAME, type PitchProcessorOptions } from './protocol';
import { YinDetector, rms } from './yin';

// AudioWorkletGlobalScope members, which aren't part of lib.dom.
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: AudioWorkletNodeOptions);
}
declare function registerProcessor(
  name: string,
  processorCtor: new (options: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void;

/** Collects mic samples into a sliding window and posts a YIN estimate every hop. */
class PitchProcessor extends AudioWorkletProcessor {
  private readonly ring: Float32Array;
  private readonly window: Float32Array;
  private readonly hopSize: number;
  private readonly detector: YinDetector;
  private writeIndex = 0;
  private filled = 0;
  private sinceLastHop = 0;

  constructor(options: AudioWorkletNodeOptions) {
    super(options);
    const { bufferSize, hopSize, yin } = options.processorOptions as PitchProcessorOptions;
    this.ring = new Float32Array(bufferSize);
    this.window = new Float32Array(bufferSize);
    this.hopSize = hopSize;
    this.detector = new YinDetector(bufferSize, sampleRate, yin);
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    if (!input) return true;

    const { ring } = this;
    for (let i = 0; i < input.length; i++) {
      ring[this.writeIndex] = input[i];
      this.writeIndex = (this.writeIndex + 1) % ring.length;
    }
    this.filled = Math.min(ring.length, this.filled + input.length);
    this.sinceLastHop += input.length;

    if (this.filled === ring.length && this.sinceLastHop >= this.hopSize) {
      this.sinceLastHop = 0;
      // Unroll the ring so the oldest sample comes first.
      const tail = ring.subarray(this.writeIndex);
      this.window.set(tail);
      this.window.set(ring.subarray(0, this.writeIndex), tail.length);

      const estimate = this.detector.detect(this.window);
      const frame: PitchFrame = {
        frequency: estimate?.frequency ?? null,
        clarity: estimate?.clarity ?? 0,
        rms: rms(this.window),
      };
      this.port.postMessage(frame);
    }
    // Outputs stay silent (zero-filled); returning true keeps the processor alive.
    return true;
  }
}

registerProcessor(PITCH_PROCESSOR_NAME, PitchProcessor);
