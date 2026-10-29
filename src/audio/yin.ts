import { FFT } from './fft';

/**
 * YIN pitch detection (de Cheveigné & Kawahara, 2002). Pure TypeScript with no DOM/Web Audio
 * dependencies, so it runs in the AudioWorklet, on the main thread and in unit tests.
 */

export interface YinOptions {
  /** CMNDF threshold for accepting a period candidate (lower = stricter). */
  threshold: number;
  minFrequency: number;
  maxFrequency: number;
}

export interface PitchEstimate {
  frequency: number;
  /** 1 − CMNDF at the chosen period: close to 1 for a clean periodic tone, near 0 for noise. */
  clarity: number;
}

export const DEFAULT_YIN_OPTIONS: YinOptions = {
  threshold: 0.12,
  minFrequency: 50,
  maxFrequency: 1000,
};

export function rms(buffer: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return buffer.length > 0 ? Math.sqrt(sum / buffer.length) : 0;
}

/** Vertex offset (−1…1) of the parabola through three equally spaced points around a minimum. */
function parabolicOffset(left: number, centre: number, right: number): number {
  const denom = left - 2 * centre + right;
  if (denom <= 0) return 0;
  return Math.max(-1, Math.min(1, (0.5 * (left - right)) / denom));
}

/** Preallocates all working buffers for a fixed buffer size and sample rate (no GC on the audio thread). */
export class YinDetector {
  readonly options: YinOptions;
  /** Shortest and longest period searched, in samples. */
  readonly tauMin: number;
  readonly tauMax: number;
  /** Integration window W: d(τ) compares x[0, W) with x[τ, τ + W). */
  readonly window: number;

  private readonly fft: FFT;
  private readonly aRe: Float64Array;
  private readonly aIm: Float64Array;
  private readonly bRe: Float64Array;
  private readonly bIm: Float64Array;
  private readonly energy: Float64Array;
  private readonly diff: Float64Array;
  private readonly cmndf: Float64Array;

  constructor(
    readonly bufferSize: number,
    readonly sampleRate: number,
    options: Partial<YinOptions> = {},
  ) {
    this.options = { ...DEFAULT_YIN_OPTIONS, ...options };
    this.tauMin = Math.max(2, Math.floor(sampleRate / this.options.maxFrequency));
    this.tauMax = Math.min(Math.ceil(sampleRate / this.options.minFrequency), Math.floor(bufferSize / 2));
    this.window = bufferSize - this.tauMax;

    // Linear (non-circular) correlation for lags 0…tauMax only needs an FFT of at least bufferSize,
    // because the first operand is zero beyond W and W + tauMax = bufferSize.
    let fftSize = 2;
    while (fftSize < bufferSize) fftSize *= 2;
    this.fft = new FFT(fftSize);
    this.aRe = new Float64Array(fftSize);
    this.aIm = new Float64Array(fftSize);
    this.bRe = new Float64Array(fftSize);
    this.bIm = new Float64Array(fftSize);
    this.energy = new Float64Array(bufferSize + 1);
    this.diff = new Float64Array(this.tauMax + 1);
    this.cmndf = new Float64Array(this.tauMax + 1);
  }

  /**
   * YIN step 2, the difference function d(τ) = Σ_{j<W} (x_j − x_{j+τ})² for τ = 0…tauMax.
   * Expanded as E(0) + E(τ) − 2·r(τ), with the energies from a prefix sum and the
   * cross-correlation r(τ) from an FFT: O(N log N) instead of O(N·tauMax).
   * The returned array is reused by the next call.
   */
  difference(buffer: ArrayLike<number>): Float64Array {
    const { bufferSize: n, window: w, tauMax, aRe, aIm, bRe, bIm, energy, diff } = this;
    const size = this.fft.size;

    energy[0] = 0;
    for (let i = 0; i < n; i++) energy[i + 1] = energy[i] + buffer[i] * buffer[i];

    aRe.fill(0);
    aIm.fill(0);
    bRe.fill(0);
    bIm.fill(0);
    for (let i = 0; i < w; i++) aRe[i] = buffer[i];
    for (let i = 0; i < n; i++) bRe[i] = buffer[i];
    this.fft.transform(aRe, aIm);
    this.fft.transform(bRe, bIm);

    // r = IFFT(conj(A) · B)
    for (let k = 0; k < size; k++) {
      const ar = aRe[k];
      const ai = -aIm[k];
      const br = bRe[k];
      const bi = bIm[k];
      aRe[k] = ar * br - ai * bi;
      aIm[k] = ar * bi + ai * br;
    }
    this.fft.transform(aRe, aIm, true);

    const e0 = energy[w];
    for (let tau = 0; tau <= tauMax; tau++) {
      const r = aRe[tau] / size;
      const eTau = energy[tau + w] - energy[tau];
      diff[tau] = Math.max(0, e0 + eTau - 2 * r);
    }
    return diff;
  }

  /** Returns the detected fundamental, or null if no sufficiently periodic signal is found. */
  detect(buffer: ArrayLike<number>): PitchEstimate | null {
    const d = this.difference(buffer);
    const { cmndf, tauMin, tauMax } = this;

    // Step 3: cumulative mean normalised difference.
    cmndf[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      running += d[tau];
      cmndf[tau] = running > 0 ? (d[tau] * tau) / running : 1;
    }

    // Step 4: first dip below the threshold, then walk down to its local minimum.
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (cmndf[t] < this.options.threshold) {
        while (t + 1 <= tauMax && cmndf[t + 1] < cmndf[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) return null;

    // Step 5: parabolic interpolation on the raw difference function, whose minimum sits at the true period.
    const period = tau < tauMax ? tau + parabolicOffset(d[tau - 1], d[tau], d[tau + 1]) : tau;
    return { frequency: this.sampleRate / period, clarity: 1 - cmndf[tau] };
  }
}
