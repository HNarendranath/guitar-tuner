import type { PitchFrame } from '../tuner/analyse';
import workletUrl from './pitch-worklet.ts?worker&url';
import { BUFFER_SIZE, HOP_SIZE, PITCH_PROCESSOR_NAME, type PitchProcessorOptions } from './protocol';
import { YinDetector, rms } from './yin';

export type MicErrorKind = 'denied' | 'no-device' | 'busy' | 'insecure' | 'unsupported' | 'suspended' | 'aborted' | 'unknown';

export class MicError extends Error {
  constructor(
    readonly kind: MicErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'MicError';
  }
}

export function toMicError(error: unknown): MicError {
  if (error instanceof MicError) return error;
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  const detail = error instanceof Error || error instanceof DOMException ? error.message : String(error);
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return new MicError('denied', detail);
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return new MicError('no-device', detail);
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return new MicError('busy', detail);
    case 'SecurityError':
      return new MicError('insecure', detail);
    default:
      return new MicError('unknown', detail);
  }
}

export type AudioEngine = 'worklet' | 'analyser';

export interface PitchSourceCallbacks {
  onFrame(frame: PitchFrame): void;
  /** The pipeline stopped by itself: audio session interrupted, or the mic track ended. */
  onInterrupted(): void;
}

interface WebkitWindow {
  webkitAudioContext?: typeof AudioContext;
}

const MIC_CONSTRAINTS: MediaStreamConstraints = {
  // Voice processing distorts pitch and gates quiet notes, so turn all of it off.
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  video: false,
};

const RESUME_TIMEOUT_MS = 1500;

/** Resolves when the context is running or the timeout passes (Safari can leave resume() pending forever). */
async function resumeWithTimeout(ctx: AudioContext, pending?: Promise<void>): Promise<void> {
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, RESUME_TIMEOUT_MS));
  await Promise.race([(pending ?? ctx.resume()).catch(() => undefined), timeout]);
}

/** Mic → pitch frames. Uses an AudioWorklet, falling back to polling an AnalyserNode. */
export class PitchSource {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private disconnect: (() => void) | null = null;
  private generation = 0;
  private activeEngine: AudioEngine | null = null;

  constructor(private readonly callbacks: PitchSourceCallbacks) {}

  get engine(): AudioEngine | null {
    return this.activeEngine;
  }

  get sampleRate(): number | null {
    return this.ctx?.sampleRate ?? null;
  }

  /**
   * Starts listening. Call this synchronously from a tap handler: iOS only allows an AudioContext to
   * start inside a user gesture, so the context is created and resumed before anything is awaited.
   */
  async start(): Promise<void> {
    this.stop();
    const token = ++this.generation;

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new MicError('insecure', 'Microphone access requires HTTPS.');
    }
    const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) throw new MicError('unsupported', 'Web Audio is not available.');

    const ctx = new Ctor({ latencyHint: 'interactive' });
    const resuming = ctx.resume();
    let stream: MediaStream | null = null;
    let disconnect: (() => void) | null = null;
    const cleanUp = () => {
      disconnect?.();
      stream?.getTracks().forEach((t) => t.stop());
      void ctx.close().catch(() => undefined);
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
      this.throwIfStale(token);

      await resumeWithTimeout(ctx, resuming);
      if (ctx.state !== 'running') await resumeWithTimeout(ctx);
      this.throwIfStale(token);
      if (ctx.state !== 'running') throw new MicError('suspended', `AudioContext is ${ctx.state}.`);

      const source = ctx.createMediaStreamSource(stream);
      disconnect = await this.connectWorklet(ctx, source);
      this.throwIfStale(token);
      this.activeEngine = disconnect ? 'worklet' : 'analyser';
      disconnect ??= this.connectAnalyser(ctx, source);
    } catch (error) {
      cleanUp();
      throw toMicError(error);
    }

    this.ctx = ctx;
    this.stream = stream;
    this.disconnect = disconnect;

    // iOS suspends or "interrupts" the context for calls, Siri, other audio apps and screen lock.
    ctx.onstatechange = () => {
      if (ctx.state !== 'running') this.interrupt(ctx);
    };
    for (const track of stream.getAudioTracks()) track.addEventListener('ended', () => this.interrupt(ctx));
  }

  stop(): void {
    this.generation++;
    const ctx = this.ctx;
    this.ctx = null;
    this.activeEngine = null;
    this.disconnect?.();
    this.disconnect = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (ctx) {
      ctx.onstatechange = null;
      void ctx.close().catch(() => undefined);
    }
  }

  private interrupt(ctx: AudioContext): void {
    if (this.ctx !== ctx) return;
    this.stop();
    this.callbacks.onInterrupted();
  }

  private throwIfStale(token: number): void {
    if (token !== this.generation) throw new MicError('aborted', 'Stopped while starting.');
  }

  private async connectWorklet(ctx: AudioContext, source: MediaStreamAudioSourceNode): Promise<(() => void) | null> {
    if (!ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') return null;
    try {
      await ctx.audioWorklet.addModule(workletUrl);
    } catch (error) {
      console.warn('AudioWorklet unavailable, falling back to AnalyserNode', error);
      return null;
    }
    const processorOptions: PitchProcessorOptions = { bufferSize: BUFFER_SIZE, hopSize: HOP_SIZE };
    const node = new AudioWorkletNode(ctx, PITCH_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
      processorOptions,
    });
    node.port.onmessage = (event: MessageEvent<PitchFrame>) => this.callbacks.onFrame(event.data);
    source.connect(node);
    // The processor only outputs silence, but nodes must reach the destination to be pulled reliably.
    node.connect(ctx.destination);
    return () => {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
    };
  }

  private connectAnalyser(ctx: AudioContext, source: MediaStreamAudioSourceNode): () => void {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = BUFFER_SIZE;
    analyser.smoothingTimeConstant = 0;
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(analyser);
    analyser.connect(mute);
    mute.connect(ctx.destination);

    const detector = new YinDetector(BUFFER_SIZE, ctx.sampleRate);
    const buffer = new Float32Array(BUFFER_SIZE);
    let frameId = 0;
    const tick = () => {
      analyser.getFloatTimeDomainData(buffer);
      const estimate = detector.detect(buffer);
      this.callbacks.onFrame({
        frequency: estimate?.frequency ?? null,
        clarity: estimate?.clarity ?? 0,
        rms: rms(buffer),
      });
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      source.disconnect();
      analyser.disconnect();
      mute.disconnect();
    };
  }
}
