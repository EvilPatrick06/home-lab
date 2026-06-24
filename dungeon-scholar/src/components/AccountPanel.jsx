import { Bell, CloudOff, Download, LogOut, RotateCcw, Trash2, Upload } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { useDialogA11y } from '../hooks/useDialogA11y.js';
import { deleteAccount, deleteCloudSave } from '../services/cloudSync.js';
import { logError } from '../services/logger.js';
import { notificationPermission, notificationsSupported, requestStudyReminders } from '../services/notifications.js';
import { exportSaveText, listSnapshots, parseImportedSave, restoreSnapshot } from '../services/persistence.js';
import { signOut } from '../services/supabase.js';
import { todayDateStr } from '../utils/date.js';

function relativeTimeFrom(date) {
  if (!date) return 'never';
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  return `${Math.floor(sec / 3600)} hr ago`;
}

export function AccountPanel({
  user,
  syncStatus,
  lastSyncedAt,
  onClose,
  onAfterDeleteCloud,
  onAfterDeleteAccount,
  onResetProgress,
  playerState,
  onImportSave,
}) {
  const [confirmKind, setConfirmKind] = useState(null);
  const [typedConfirm, setTypedConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const [importErr, setImportErr] = useState('');
  const [remindMsg, setRemindMsg] = useState('');
  const [showSnaps, setShowSnaps] = useState(false);
  const [snaps, setSnaps] = useState([]);
  const [snapConfirm, setSnapConfirm] = useState(null); // key pending restore confirm

  // S12: export the player save to a portable JSON file (reuses the Blob +
  // object-URL download pattern from ShareTomeModal).
  const doExportJournal = () => {
    try {
      const blob = new Blob([exportSaveText(playerState)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dungeon-scholar-save-${todayDateStr()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setImportErr('Could not export the journal.');
    }
  };

  const openSnapshots = () => {
    setSnaps(listSnapshots());
    setSnapConfirm(null);
    setShowSnaps((v) => !v);
  };
  const doRestoreSnapshot = (key) => {
    const state = restoreSnapshot(key);
    if (!state) {
      setImportErr('That snapshot could not be read.');
      return;
    }
    setImportErr('');
    onImportSave?.(state);
    onClose();
  };
  const snapLabel = (snap) => {
    const when = new Date(snap.ts);
    const stamp = Number.isNaN(when.getTime()) ? 'unknown time' : when.toLocaleString();
    return snap.reason === 'pre-reset' ? `${stamp} — before a reset` : stamp;
  };
  const doImportJournal = (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = parseImportedSave(String(reader.result || ''));
      if (!res.ok) {
        setImportErr(res.error);
        return;
      }
      setImportErr('');
      onImportSave?.(res.state);
      onClose();
    };
    reader.onerror = () => setImportErr('Could not read that file.');
    reader.readAsText(file);
  };
  // 19A: hook called before the early return (hooks must be unconditional);
  // `active: !!user` arms the trap only while the panel is actually rendered.
  const panelRef = useDialogA11y({ onClose, active: !!user });

  if (!user) return null;

  const doSignOut = async () => {
    setBusy(true);
    await signOut();
    onClose();
  };

  const doDeleteCloud = async () => {
    setBusy(true);
    try {
      await deleteCloudSave(user.id);
      onAfterDeleteCloud?.();
      setConfirmKind(null);
    } catch (err) {
      logError('Delete cloud save failed', err);
    }
    setBusy(false);
  };

  const doDeleteAccount = async () => {
    setBusy(true);
    try {
      await deleteAccount(user.id);
      await signOut();
      onAfterDeleteAccount?.();
      onClose();
    } catch (err) {
      logError('Delete account failed', err);
    }
    setBusy(false);
  };

  const statusText =
    {
      idle: lastSyncedAt ? `Synced ${relativeTimeFrom(lastSyncedAt)}` : 'Synced',
      saving: 'Saving…',
      error: 'Sync error — will retry',
      offline: 'Offline — will retry',
    }[syncStatus] || 'Synced';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)' }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Account panel"
        className="max-w-md w-[92%] p-6 rounded-sm border-2 border-amber-600"
        style={{ background: 'rgba(var(--surface-modal, 20, 12, 6), 0.97)' }}
      >
        <div className="flex items-center gap-3 mb-4">
          {user.avatarUrl && (
            <img src={user.avatarUrl} alt="" className="w-12 h-12 rounded-full border-2 border-amber-700" />
          )}
          <div>
            <div className="text-lg italic text-amber-200">@{user.githubLogin}</div>
            <div className="text-xs text-amber-700 italic">{statusText}</div>
          </div>
        </div>

        {!confirmKind && (
          <div className="flex flex-col gap-3">
            <button
              onClick={doSignOut}
              disabled={busy}
              className="w-full px-3 py-2 rounded-sm border-2 border-amber-700 text-amber-200 italic text-sm hover:bg-amber-900/30 flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
            {/* Phase 46e: surface the safer "Begin Anew" reset above the
                destructive cloud/account options. Hearth has the same
                action buried at the bottom — promoting it here means
                users see the local-only alternative before reaching for
                the irreversible cloud/account deletions. */}
            {onResetProgress && (
              <button
                onClick={() => {
                  onClose();
                  onResetProgress();
                }}
                disabled={busy}
                className="w-full px-3 py-2 rounded-sm border-2 border-amber-700 text-amber-200 italic text-sm hover:bg-amber-900/30 flex items-center gap-2"
                title="Reset local progress only — cloud save is untouched. Confirmation required."
              >
                <RotateCcw className="w-4 h-4" /> Begin Anew (reset local progress)
              </button>
            )}
            <div className="h-px bg-amber-900/40 my-1" />
            <div className="text-[10px] uppercase tracking-wider italic text-amber-500/80 font-bold">Backup</div>
            <button
              onClick={doExportJournal}
              disabled={busy || !playerState}
              className="w-full px-3 py-2 rounded-sm border-2 border-amber-700 text-amber-200 italic text-sm hover:bg-amber-900/30 flex items-center gap-2"
              title="Download thy save as a portable JSON file"
            >
              <Download className="w-4 h-4" /> Export journal (backup file)
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="w-full px-3 py-2 rounded-sm border-2 border-amber-700 text-amber-200 italic text-sm hover:bg-amber-900/30 flex items-center gap-2"
              title="Restore a previously exported journal file"
            >
              <Upload className="w-4 h-4" /> Import journal
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={doImportJournal}
              className="hidden"
            />
            {/* I1: restore from a local autosave snapshot (no cloud needed). */}
            <button
              onClick={openSnapshots}
              disabled={busy}
              className="w-full px-3 py-2 rounded-sm border-2 border-amber-700 text-amber-200 italic text-sm hover:bg-amber-900/30 flex items-center gap-2"
              title="Roll back to one of the last few autosaved snapshots"
              aria-expanded={showSnaps}
            >
              <RotateCcw className="w-4 h-4" /> Restore a recent snapshot
            </button>
            {showSnaps && (
              <div className="flex flex-col gap-1 pl-1 border-l-2 border-amber-900/40">
                {snaps.length === 0 ? (
                  <div className="text-xs italic text-amber-700">
                    No snapshots saved yet — they accumulate as thou playest.
                  </div>
                ) : (
                  snaps.map((snap) => (
                    <div key={snap.key} className="flex items-center justify-between gap-2">
                      <span className="text-xs italic text-amber-200/80 truncate">{snapLabel(snap)}</span>
                      {snapConfirm === snap.key ? (
                        <span className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => doRestoreSnapshot(snap.key)}
                            className="text-[11px] px-2 py-0.5 rounded-sm border border-amber-500 text-amber-100 hover:bg-amber-900/40"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setSnapConfirm(null)}
                            className="text-[11px] px-2 py-0.5 rounded-sm border border-amber-800 text-amber-400 hover:bg-amber-900/30"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setSnapConfirm(snap.key)}
                          className="text-[11px] px-2 py-0.5 rounded-sm border border-amber-700 text-amber-200 hover:bg-amber-900/30 shrink-0"
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  ))
                )}
                <div className="text-[10px] italic text-amber-700/80">
                  Restoring overwrites thy current progress with the chosen snapshot.
                </div>
              </div>
            )}
            {importErr && <div className="text-xs italic text-red-300">✗ {importErr}</div>}
            {notificationsSupported() && (
              <button
                onClick={async () => {
                  const ok = await requestStudyReminders();
                  setRemindMsg(
                    ok
                      ? 'Study reminders enabled — thou shalt be nudged when scrolls are due.'
                      : notificationPermission() === 'denied'
                        ? 'Reminders blocked in browser settings.'
                        : 'Reminders not enabled.',
                  );
                }}
                disabled={busy}
                className="w-full px-3 py-2 rounded-sm border-2 border-amber-700 text-amber-200 italic text-sm hover:bg-amber-900/30 flex items-center gap-2"
                title="Opt in to local study reminders (no account or server needed)"
              >
                <Bell className="w-4 h-4" /> Enable study reminders
              </button>
            )}
            {remindMsg && <div className="text-xs italic text-amber-300">{remindMsg}</div>}
            <div className="h-px bg-amber-900/40 my-1" />
            <div className="text-[10px] uppercase tracking-wider italic text-red-400/80 font-bold">
              ⚠ Destructive · cloud
            </div>
            <button
              onClick={() => setConfirmKind('cloud')}
              disabled={busy}
              className="w-full px-3 py-2 rounded-sm border-2 border-orange-700 text-orange-200 italic text-sm hover:bg-orange-900/30 flex items-center gap-2"
            >
              <CloudOff className="w-4 h-4" /> Delete cloud save (keep this device)
            </button>
            <button
              onClick={() => setConfirmKind('account')}
              disabled={busy}
              className="w-full px-3 py-2 rounded-sm border-2 border-red-800 text-red-300 italic text-sm hover:bg-red-900/30 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Delete account
            </button>
            <button onClick={onClose} className="mt-2 text-xs text-amber-700 italic hover:text-amber-500">
              Close
            </button>
          </div>
        )}

        {confirmKind === 'cloud' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-amber-200 italic">
              This wipes thy cloud save. Local progress remains. Thou mayest re-sync from this device afterward.
            </p>
            <button
              onClick={doDeleteCloud}
              disabled={busy}
              className="w-full px-3 py-2 rounded-sm border-2 border-orange-700 text-orange-200 italic text-sm hover:bg-orange-900/30"
            >
              Yes, delete cloud save
            </button>
            <button onClick={() => setConfirmKind(null)} className="text-xs text-amber-700 italic hover:text-amber-500">
              Cancel
            </button>
          </div>
        )}

        {confirmKind === 'account' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-amber-200 italic">
              This deletes thy account and cloud save. Local progress remains. Type{' '}
              <code className="text-red-300">{user.githubLogin}</code> to confirm.
            </p>
            <input
              value={typedConfirm}
              onChange={(e) => setTypedConfirm(e.target.value)}
              className="px-2 py-1 rounded-sm border border-red-700 bg-red-900/30 text-red-100 text-sm italic"
            />
            <button
              onClick={doDeleteAccount}
              disabled={busy || typedConfirm !== user.githubLogin}
              className="w-full px-3 py-2 rounded-sm border-2 border-red-800 text-red-300 italic text-sm hover:bg-red-900/30 disabled:opacity-50"
            >
              Permanently delete account
            </button>
            <button
              onClick={() => {
                setConfirmKind(null);
                setTypedConfirm('');
              }}
              className="text-xs text-amber-700 italic hover:text-amber-500"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
