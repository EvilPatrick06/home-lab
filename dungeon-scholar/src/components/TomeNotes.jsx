import { useEffect, useState } from 'react';
import { ScrollText, X, Lock, Unlock, Save, Trash2, AlertTriangle } from 'lucide-react';
import { encryptPayload, decryptPayload, clearKeyCache } from '../services/notesCrypto.js';
import { useDialogA11y } from './useDialogA11y.js';

// Phase 40F: per-tome encrypted private notes modal.
//
// Three view states, driven by `tome.notes` (the at-rest encryptPayload blob)
// and whether the user has unlocked it this session:
//   - create:   no tome.notes yet → set a passphrase (+ confirm) and inscribe.
//   - locked:   tome.notes present, not yet decrypted → enter passphrase.
//   - unlocked: plaintext + passphrase held in component state → edit/save/lock.
//
// Plaintext and the passphrase live ONLY in component state. They are wiped on
// unmount, on Lock, and on close — never logged, never persisted. The `notes`
// the parent stores is exactly the encryptPayload result (encrypted at rest in
// localStorage and the cloud blob; rides the existing sync untouched).

const MODAL_SHELL_STYLE = {
  background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.97) 0%, rgba(10, 6, 4, 0.99) 100%)',
  border: '3px double rgba(245, 158, 11, 0.6)',
  boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)',
};

const FIELD_STYLE = {
  background: 'rgba(10, 6, 4, 0.7)',
  borderColor: 'rgba(120, 53, 15, 0.7)',
};

export default function TomeNotes({ tome, onSave, onClose }) {
  const panelRef = useDialogA11y({ onClose }); // 19A: dialog semantics + trap + Escape + focus restore

  const hasNotes = !!tome?.notes;
  // mode: 'create' (no notes yet) | 'locked' (notes exist, sealed) | 'unlocked'
  const [mode, setMode] = useState(hasNotes ? 'locked' : 'create');

  // create-flow inputs
  const [createPass, setCreatePass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [createError, setCreateError] = useState('');

  // unlock-flow input
  const [unlockPass, setUnlockPass] = useState('');
  const [unlockError, setUnlockError] = useState('');

  // unlocked state — plaintext + the passphrase that produced it
  const [text, setText] = useState('');
  const [pass, setPass] = useState('');

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // Wipe all secret material when the modal unmounts. Belt-and-suspenders on
  // top of the explicit clears on Lock/close — guarantees nothing lingers.
  useEffect(() => {
    return () => {
      setText('');
      setPass('');
      setCreatePass('');
      setConfirmPass('');
      setUnlockPass('');
      clearKeyCache();
    };
  }, []);

  const title = tome?.data?.metadata?.title || 'this tome';

  const handleCreate = async (e) => {
    e.preventDefault();
    if (busy) return;
    setCreateError('');
    if (!createPass) {
      setCreateError('Choose a passphrase to seal these notes.');
      return;
    }
    if (createPass !== confirmPass) {
      setCreateError('The passphrases do not match.');
      return;
    }
    setBusy(true);
    try {
      const payload = await encryptPayload(createPass, '');
      onSave(payload);
      // Move into the unlocked editor holding the chosen passphrase + empty text.
      setPass(createPass);
      setText('');
      setCreatePass('');
      setConfirmPass('');
      setMode('unlocked');
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async (e) => {
    e.preventDefault();
    if (busy) return;
    setUnlockError('');
    setBusy(true);
    try {
      const plaintext = await decryptPayload(unlockPass, tome.notes);
      setText(plaintext);
      setPass(unlockPass);
      setUnlockPass('');
      setMode('unlocked');
    } catch {
      // decrypt-failed (wrong passphrase / tampered): stay locked.
      setUnlockError('Wrong passphrase — the seal holds.');
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Re-encrypt with the SAME salt/iterations (fresh IV every time) so the
      // unlock passphrase keeps working across saves.
      const payload = await encryptPayload(pass, text, {
        salt: tome.notes?.salt,
        iterations: tome.notes?.iter,
      });
      onSave(payload);
    } finally {
      setBusy(false);
    }
  };

  const handleLock = () => {
    setText('');
    setPass('');
    clearKeyCache();
    setMode('locked');
  };

  const handleDelete = () => {
    onSave(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tome-notes-title"
        className="rounded-sm max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col relative"
        style={MODAL_SHELL_STYLE}
      >
        <div className="p-4 border-b border-amber-700/50 flex justify-between items-center">
          <h3 id="tome-notes-title" className="text-xl font-bold text-amber-300 flex items-center gap-2 italic">
            <ScrollText className="w-5 h-5" aria-hidden="true" /> Private Notes — {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close private notes"
            className="p-3 hover:bg-amber-900/30 rounded-sm text-amber-300"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {mode === 'create' && (
            <form onSubmit={handleCreate}>
              <p className="text-sm text-amber-100/85 mb-3 italic">
                Inscribe private notes for this tome. They are encrypted with a
                passphrase only you hold.
              </p>
              <p className="text-xs mb-4 flex items-start gap-2 italic" style={{ color: '#fca5a5' }}>
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                The passphrase never leaves this device and cannot be recovered — lose it and these notes are gone.
              </p>
              <label className="block mb-3">
                <span className="text-xs text-amber-300 italic block mb-1">Passphrase</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={createPass}
                  onChange={(e) => setCreatePass(e.target.value)}
                  data-autofocus
                  aria-label="Passphrase"
                  className="w-full p-2 rounded-sm border-2 focus:outline-hidden italic text-amber-50"
                  style={FIELD_STYLE}
                />
              </label>
              <label className="block mb-3">
                <span className="text-xs text-amber-300 italic block mb-1">Confirm passphrase</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  aria-label="Confirm passphrase"
                  className="w-full p-2 rounded-sm border-2 focus:outline-hidden italic text-amber-50"
                  style={FIELD_STYLE}
                />
              </label>
              {createError && (
                <p role="alert" className="text-xs mb-3 italic" style={{ color: '#fca5a5' }}>{createError}</p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 font-bold rounded-sm flex items-center justify-center gap-2 text-amber-950 border-2 border-amber-300 italic disabled:opacity-60"
                style={{
                  background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                  boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)',
                }}
              >
                <Lock className="w-4 h-4" aria-hidden="true" /> Inscribe private notes
              </button>
            </form>
          )}

          {mode === 'locked' && (
            <form onSubmit={handleUnlock}>
              <p className="text-sm text-amber-100/85 mb-4 italic">
                These notes are sealed. Enter the passphrase to read or edit them.
              </p>
              <label className="block mb-3">
                <span className="text-xs text-amber-300 italic block mb-1">Passphrase</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={unlockPass}
                  onChange={(e) => setUnlockPass(e.target.value)}
                  data-autofocus
                  aria-label="Passphrase"
                  className="w-full p-2 rounded-sm border-2 focus:outline-hidden italic text-amber-50"
                  style={FIELD_STYLE}
                />
              </label>
              {unlockError && (
                <p role="alert" className="text-xs mb-3 italic" style={{ color: '#fca5a5' }}>{unlockError}</p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 font-bold rounded-sm flex items-center justify-center gap-2 text-amber-950 border-2 border-amber-300 italic disabled:opacity-60"
                style={{
                  background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                  boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)',
                }}
              >
                <Unlock className="w-4 h-4" aria-hidden="true" /> Unlock
              </button>
            </form>
          )}

          {mode === 'unlocked' && (
            <div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-label="Private notes"
                placeholder="Inscribe thy private notes…"
                rows={12}
                className="w-full p-3 rounded-sm border-2 focus:outline-hidden italic text-amber-50 resize-y"
                style={FIELD_STYLE}
              />
            </div>
          )}
        </div>

        {mode === 'unlocked' && (
          <div className="p-4 border-t border-amber-700/50 flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={busy}
                className="flex-1 py-3 font-bold rounded-sm flex items-center justify-center gap-2 text-amber-950 border-2 border-amber-300 italic disabled:opacity-60"
                style={{
                  background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                  boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)',
                }}
              >
                <Save className="w-4 h-4" aria-hidden="true" /> Save
              </button>
              <button
                onClick={handleLock}
                className="px-4 py-3 rounded-sm border-2 border-amber-700 text-amber-200 flex items-center gap-2 hover:bg-amber-900/30 italic"
                style={{ background: 'rgba(41, 24, 12, 0.7)' }}
              >
                <Lock className="w-4 h-4" aria-hidden="true" /> Lock
              </button>
            </div>
            {confirmDelete ? (
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  className="flex-1 py-2 rounded-sm text-sm font-bold border-2 border-red-400 text-red-100 italic"
                  style={{ background: 'linear-gradient(to bottom, #dc2626 0%, #991b1b 100%)' }}
                >
                  Confirm — delete notes forever
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-4 py-2 rounded-sm text-sm border-2 border-amber-700 text-amber-200 italic"
                  style={{ background: 'rgba(41, 24, 12, 0.7)' }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="py-2 rounded-sm text-sm border-2 border-red-800 text-red-300 flex items-center justify-center gap-2 hover:bg-red-900/30 italic"
                style={{ background: 'rgba(41, 12, 12, 0.6)' }}
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" /> Delete notes
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
