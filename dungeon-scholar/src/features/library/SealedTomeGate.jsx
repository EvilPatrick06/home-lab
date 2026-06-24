import { ArrowLeft, Loader2, Lock } from 'lucide-react';
import { useState } from 'react';
import { OrnatePanel } from '../../components/ui/OrnatePanel.jsx';

// PHASE-41 41B: unlock prompt for a sealed tome. The active tome's content is
// AES-GCM-encrypted at rest; the player supplies the proctor passphrase to
// decrypt it into in-memory session state. `onUnlock(passphrase)` returns a
// promise of `{ ok, reason? }` — it NEVER throws (App's unlockSealedTome
// catches and converts failures to a value), so we just await and surface the
// reason on failure.
export default function SealedTomeGate({ title, onUnlock, onBack }) {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const attempt = async () => {
    if (busy || !passphrase) return;
    setBusy(true);
    setError('');
    const res = await onUnlock(passphrase);
    if (!res || !res.ok) {
      setError(
        res?.reason === 'wrong-passphrase'
          ? 'That passphrase does not match this seal.'
          : `Unable to unseal this tome${res?.reason ? ` (${res.reason})` : ''}.`,
      );
      setBusy(false);
      return;
    }
    // Success: the parent swaps in the unlocked content; nothing more to do.
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <OrnatePanel color="purple">
        <div className="flex flex-col items-center text-center gap-3">
          <Lock
            className="w-10 h-10 text-purple-300"
            aria-hidden="true"
            style={{ filter: 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.5))' }}
          />
          <h2 className="text-xl font-bold italic text-purple-200">This tome is sealed</h2>
          <p className="text-sm italic text-amber-100/80 truncate max-w-full" title={title}>
            {title}
          </p>
          <p className="text-xs italic text-amber-100/60">
            Its scrolls, riddles, and labs are warded. Speak the proctor&rsquo;s passphrase to break the seal for this
            session.
          </p>

          <label className="block w-full text-left mt-2">
            <span className="text-xs text-amber-300 italic block mb-1">Proctor passphrase</span>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') attempt();
              }}
              autoComplete="off"
              autoFocus
              disabled={busy}
              className="w-full p-2 rounded-sm border-2 focus:outline-hidden italic text-amber-50 disabled:opacity-50"
              style={{ background: 'rgba(var(--surface-deep, 10, 6, 4), 0.7)', borderColor: 'rgba(126, 34, 206, 0.6)' }}
            />
          </label>

          {error && (
            <div
              role="alert"
              className="w-full p-2 rounded-sm text-sm italic"
              style={{
                background: 'rgba(127, 29, 29, 0.5)',
                border: '1px solid rgba(239, 68, 68, 0.7)',
                color: '#fecaca',
              }}
            >
              ✗ {error}
            </div>
          )}

          <button
            onClick={attempt}
            disabled={busy || !passphrase}
            className="w-full py-3 mt-1 font-bold rounded-sm flex items-center justify-center gap-2 text-amber-50 border-2 border-purple-300 italic disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(to bottom, #9333ea 0%, #6b21a8 100%)',
              boxShadow: '0 0 18px rgba(168, 85, 247, 0.5)',
            }}
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Unsealing…
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" aria-hidden="true" /> Unlock
              </>
            )}
          </button>

          <button
            onClick={onBack}
            className="w-full py-2 rounded-sm text-sm border-2 border-amber-700 text-amber-200 italic flex items-center justify-center gap-2"
            style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Return to library
          </button>
        </div>
      </OrnatePanel>
    </div>
  );
}
