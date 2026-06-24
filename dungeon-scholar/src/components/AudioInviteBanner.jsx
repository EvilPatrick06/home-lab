import { useState } from 'react';
import { getAudioSettings, playSfx, setMuted } from '../audio/sound.js';

// PHASE-19 19F (L16): one-time, dismissible banner surfacing the muted-by-default
// procedural audio. Never auto-plays — sound starts only on the explicit
// "Enable sound" click (which is also the user gesture AudioContext resume needs).
const DISMISS_KEY = 'dungeon-scholar-audio-invite-dismissed';

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}
function writeDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* quota / private mode — best effort */
  }
}

export function AudioInviteBanner() {
  const [hidden, setHidden] = useState(() => readDismissed());
  // Already opted in via Bardic Settings ⇒ nothing to invite.
  if (hidden || getAudioSettings().muted === false) return null;

  const enable = () => {
    setMuted(false);
    playSfx('click');
    writeDismissed();
    setHidden(true);
  };
  const dismiss = () => {
    writeDismissed();
    setHidden(true);
  };

  return (
    <div
      role="region"
      aria-label="Audio invitation"
      className="flex items-center gap-3 flex-wrap px-4 py-2 rounded-sm border-2 border-amber-700 text-sm italic text-amber-200"
      style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
    >
      <span className="flex-1">
        🔊 Wake the bards? This realm has procedural music + sound effects (currently muted).
      </span>
      <button
        onClick={enable}
        className="px-3 py-1.5 rounded-sm border-2 border-amber-400 text-amber-100 hover:bg-amber-900/30"
      >
        Enable sound
      </button>
      <button
        onClick={dismiss}
        className="px-3 py-1.5 rounded-sm border-2 border-stone-700 text-stone-300 hover:bg-stone-900/40"
      >
        Not now
      </button>
    </div>
  );
}
