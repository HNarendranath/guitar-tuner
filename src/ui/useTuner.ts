import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { MicError, PitchSource, toMicError, type AudioEngine } from '../audio/mic';
import { TuningAnalyser, type AnalyserConfig, type TunerState } from '../tuner/analyse';

/** idle → starting → listening; paused after backgrounding/interruption (needs a tap to resume). */
export type TunerStatus = 'idle' | 'starting' | 'listening' | 'paused' | 'error';

export interface AudioInfo {
  engine: AudioEngine | null;
  sampleRate: number | null;
}

export function useTuner(config: AnalyserConfig, keepAwake: boolean) {
  const analyserRef = useRef<TuningAnalyser | null>(null);
  analyserRef.current ??= new TuningAnalyser(config);
  const analyser = analyserRef.current;

  const sourceRef = useRef<PitchSource | null>(null);
  const [state, setState] = useState<TunerState>(analyser.current);
  const [status, setStatus] = useState<TunerStatus>('idle');
  const [error, setError] = useState<MicError | null>(null);
  const [audioInfo, setAudioInfo] = useState<AudioInfo>({ engine: null, sampleRate: null });

  const { targets, mode, manualIndex, toleranceCents, a4 } = config;
  useEffect(() => {
    setState(analyser.configure({ targets, mode, manualIndex, toleranceCents, a4 }));
  }, [analyser, targets, mode, manualIndex, toleranceCents, a4]);

  const stop = useCallback(
    (next: TunerStatus) => {
      sourceRef.current?.stop();
      sourceRef.current = null;
      setState(analyser.reset());
      setStatus(next);
    },
    [analyser],
  );

  /** Must run synchronously inside the tap handler (iOS audio unlock). */
  const start = useCallback(() => {
    if (sourceRef.current) return;
    const source = new PitchSource({
      onFrame: (frame) => {
        const next = analyser.push(frame, performance.now());
        if (next.justTuned !== null) navigator.vibrate?.(40);
        setState(next);
      },
      onInterrupted: () => {
        if (sourceRef.current === source) stop('paused');
      },
    });
    sourceRef.current = source;
    setError(null);
    setStatus('starting');
    source.start().then(
      () => {
        if (sourceRef.current !== source) return;
        setAudioInfo({ engine: source.engine, sampleRate: source.sampleRate });
        setStatus('listening');
      },
      (reason: unknown) => {
        if (sourceRef.current !== source) return;
        sourceRef.current = null;
        const micError = toMicError(reason);
        if (micError.kind === 'aborted') return;
        setError(micError);
        setStatus('error');
      },
    );
  }, [analyser, stop]);

  // Release the mic whenever the app is hidden (home button, app switcher, screen lock).
  // iOS needs a fresh tap to restart audio, so we show "Tap to resume" when it comes back.
  useEffect(() => {
    const pause = () => {
      if (sourceRef.current) stop('paused');
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', pause);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', pause);
      sourceRef.current?.stop();
      sourceRef.current = null;
    };
  }, [stop]);

  // Keep the screen on while listening. The browser releases the lock when the page is hidden.
  useEffect(() => {
    if (status !== 'listening' || !keepAwake || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    navigator.wakeLock.request('screen').then(
      (sentinel) => {
        if (cancelled) void sentinel.release();
        else lock = sentinel;
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
      void lock?.release().catch(() => undefined);
    };
  }, [status, keepAwake]);

  return { state, status, error, audioInfo, start };
}
