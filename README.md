# Guitar Tuner PWA

A chromatic guitar tuner that installs to the iPhone home screen and works offline.
Presets (Standard, Drop D, Half-step down, DADGAD, Open G), a capo modifier (0–12) on any tuning,
and custom tunings saved on the device.

Stack: Vite 8 · TypeScript 7 (strict) · Preact 11 · vite-plugin-pwa · Vitest. No other runtime dependencies.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:5173 (mic works on localhost without HTTPS) |
| `npm run dev:phone` | Dev server over HTTPS on your LAN, for testing on an iPhone (see below) |
| `npm run preview:phone` | Same, serving the production build |
| `npm test` | Unit tests (music model, YIN, analysis, storage/state) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Type-check + production build to `dist/` (includes service worker + manifest) |
| `npm run preview` | Serve the production build locally |
| `npm run icons` | Regenerate `public/icons/*.png` (dependency-free script) |

## Testing on an iPhone

`getUserMedia` needs HTTPS, so plain `npm run dev -- --host` over LAN HTTP won't get the mic.

1. Put the phone on the same Wi-Fi as the PC and run `npm run dev:phone`.
   It uses `@vitejs/plugin-basic-ssl` (a self-signed cert) and prints a `Network: https://192.168.x.x:5173/` URL.
2. Open that URL in Safari. At "This Connection Is Not Private", tap **Show Details** › **visit this website** › **Visit Website**.
3. If the page doesn't load, allow Node.js on private networks in Windows Firewall (Windows asks the first time).

Service workers won't register over a self-signed cert, so offline mode and Add to Home Screen need a real
deployment. Netlify/Vercel deploy previews or a tunnel (`cloudflared tunnel --url http://localhost:5173`) work for that.

## Deploying

- **Netlify / Vercel**: build command `npm run build`, publish directory `dist`.
- **GitHub Pages** (project site): `npm run build -- --base=/<repo-name>/` and publish `dist`.

To install: open the URL in Safari → Share → **Add to Home Screen**.

## How it works

```
src/
  music/      note model, tunings, capo, presets           (pure, unit-tested)
  audio/
    yin.ts    YIN pitch detector, FFT-based difference fn  (pure, unit-tested)
    fft.ts    radix-2 FFT
    pitch-worklet.ts  AudioWorkletProcessor: 4096-sample window, 1024 hop, posts {frequency, clarity, rms}
    mic.ts    getUserMedia + AudioContext lifecycle; AnalyserNode fallback if AudioWorklet is unavailable
  tuner/      analyse.ts: RMS gate, median-of-5 smoothing, nearest-string / manual target, cents, tuned marks
  state/      storage.ts (versioned localStorage schema, validation) + store.ts (reducer)
  ui/         Preact components; useTuner.ts wires mic → analyser, visibility pause, wake lock, haptics
```

Notes:

- **YIN** computes the difference function via FFT cross-correlation (O(N log N), ~0.4 ms per frame on a desktop)
  so the audio thread stays light on a phone. On synthetic tones it is accurate to well under ±0.1 cent.
- **Detection range is 50–1000 Hz** (slightly wider than the low E, to cover drop tunings down to A1).
  The custom tuning editor warns if a string falls outside it.
- **iOS audio unlock**: the AudioContext is created and resumed synchronously inside the "Tap to start" handler,
  before `getUserMedia` is awaited. Mic processing (echo cancellation, noise suppression, AGC) is turned off.
- **Backgrounding**: when the page is hidden, the mic is released; returning shows "Tap to resume" (iOS requires a new gesture).
  AudioContext interruptions (calls, Siri) and ended mic tracks do the same.
- **Storage**: `localStorage["guitar-tuner"] = { version: 1, customTunings, settings, lastTuningId, lastCapo }`.
  Missing, corrupt or unknown-version data falls back to defaults; invalid tunings are dropped individually.

## Real-device checklist (milestone 10)

Run each in **Safari** and in the **home-screen app**, with a real guitar and a reference tuner:

- [ ] All six standard strings read within ±2 cents of the reference tuner.
- [ ] Settings › Audio shows `AudioWorklet` and the sample rate (expect 48000 Hz). A sharp/flat offset of ~147 cents
      on every string would point to a sample-rate mismatch between the mic and the AudioContext.
- [ ] The needle is steady on a sustained note and follows a new string quickly.
- [ ] Deny the mic permission → clear instructions appear; allow it → tap again and it starts.
- [ ] Lock the screen / switch apps → "Tap to resume" on return, and it resumes.
- [ ] Screen stays on while listening (Wake Lock, iOS 16.4+ in Safari; home-screen apps need a recent iOS).
- [ ] Airplane mode after the first visit → the app still launches and tunes.
- [ ] Capo, custom tunings and settings persist after closing and reopening the app.
- [ ] Safe areas: nothing is hidden under the notch / Dynamic Island or the home indicator.
