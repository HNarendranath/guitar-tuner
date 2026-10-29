import type { MicError } from '../audio/mic';
import { MicIcon } from './icons';
import type { TunerStatus } from './useTuner';

const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

function errorHelp(error: MicError): { title: string; body: string } {
  switch (error.kind) {
    case 'denied':
      return {
        title: 'Microphone access is blocked',
        body: isIOS
          ? 'In Safari, tap the page menu (ᴀA) › Website Settings › Microphone › Allow, or check Settings › Apps › Safari › Microphone. For the home-screen app, iOS may ask again — choose Allow. Then tap the button to try again.'
          : 'Allow microphone access for this site in your browser’s site settings (usually the icon left of the address), then tap the button to try again.',
      };
    case 'insecure':
      return {
        title: 'A secure connection is needed',
        body: 'Browsers only allow the microphone on https:// pages (or localhost). Open the tuner from its https:// address.',
      };
    case 'no-device':
      return { title: 'No microphone found', body: 'Connect a microphone and try again.' };
    case 'busy':
      return {
        title: 'The microphone is busy',
        body: 'Another app (a call, voice memo or recording) may be using it. Close that app and try again.',
      };
    case 'unsupported':
      return {
        title: 'This browser isn’t supported',
        body: 'Use Safari on iOS 16.4 or later, or a recent version of Chrome, Edge or Firefox.',
      };
    case 'suspended':
      return { title: 'Audio didn’t start', body: 'Tap the button again to start listening.' };
    default:
      return { title: 'Couldn’t start the microphone', body: error.message || 'Please try again.' };
  }
}

interface StartScreenProps {
  status: TunerStatus;
  error: MicError | null;
  onStart(): void;
}

/** iOS only unlocks audio inside a user gesture, so listening always begins with a tap here. */
export function StartScreen({ status, error, onStart }: StartScreenProps) {
  const label = status === 'starting' ? 'Starting…' : status === 'paused' ? 'Tap to resume' : 'Tap to start tuning';
  const help = error ? errorHelp(error) : null;

  return (
    <div class="start">
      <button type="button" class="start-button" onClick={onStart} disabled={status === 'starting'}>
        <MicIcon />
        <span>{label}</span>
      </button>
      {status === 'paused' && <p class="start-note">Paused while the app was in the background.</p>}
      {status === 'idle' && <p class="start-note">Uses your microphone. Nothing is recorded or sent anywhere.</p>}
      {help && (
        <div class="start-error" role="alert">
          <strong>{help.title}</strong>
          <p>{help.body}</p>
        </div>
      )}
    </div>
  );
}
