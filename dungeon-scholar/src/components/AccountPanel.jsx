import React, { useState } from 'react';
import { LogOut, CloudOff, Trash2 } from 'lucide-react';
import { signOut } from '../services/supabase.js';
import { deleteCloudSave, deleteAccount } from '../services/cloudSync.js';

function relativeTimeFrom(date) {
  if (!date) return 'never';
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  return `${Math.floor(sec / 3600)} hr ago`;
}

export function AccountPanel({ user, syncStatus, lastSyncedAt, onClose, onAfterDeleteCloud, onAfterDeleteAccount }) {
  const [confirmKind, setConfirmKind] = useState(null);
  const [typedConfirm, setTypedConfirm] = useState('');
  const [busy, setBusy] = useState(false);

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
    } catch (err) { console.error(err); }
    setBusy(false);
  };

  const doDeleteAccount = async () => {
    setBusy(true);
    try {
      await deleteAccount(user.id);
      await signOut();
      onAfterDeleteAccount?.();
      onClose();
    } catch (err) { console.error(err); }
    setBusy(false);
  };

  const statusText = {
    idle: lastSyncedAt ? `Synced ${relativeTimeFrom(lastSyncedAt)}` : 'Synced',
    saving: 'Saving…',
    error: 'Sync error — will retry',
    offline: 'Offline — will retry',
  }[syncStatus] || 'Synced';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)' }}>
      <div className="max-w-md w-[92%] p-6 rounded border-2 border-amber-600" style={{ background: 'rgba(20, 12, 6, 0.97)' }}>
        <div className="flex items-center gap-3 mb-4">
          {user.avatarUrl && <img src={user.avatarUrl} alt="" className="w-12 h-12 rounded-full border-2 border-amber-700" />}
          <div>
            <div className="text-lg italic text-amber-200">@{user.githubLogin}</div>
            <div className="text-xs text-amber-700 italic">{statusText}</div>
          </div>
        </div>

        {!confirmKind && (
          <div className="flex flex-col gap-3">
            <button onClick={doSignOut} disabled={busy} className="w-full px-3 py-2 rounded border-2 border-amber-700 text-amber-200 italic text-sm hover:bg-amber-900/30 flex items-center gap-2">
              <LogOut className="w-4 h-4" /> Sign out
            </button>
            <button onClick={() => setConfirmKind('cloud')} disabled={busy} className="w-full px-3 py-2 rounded border-2 border-orange-700 text-orange-200 italic text-sm hover:bg-orange-900/30 flex items-center gap-2">
              <CloudOff className="w-4 h-4" /> Delete cloud save (keep this device)
            </button>
            <button onClick={() => setConfirmKind('account')} disabled={busy} className="w-full px-3 py-2 rounded border-2 border-red-800 text-red-300 italic text-sm hover:bg-red-900/30 flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Delete account
            </button>
            <button onClick={onClose} className="mt-2 text-xs text-amber-700 italic hover:text-amber-500">Close</button>
          </div>
        )}

        {confirmKind === 'cloud' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-amber-200 italic">
              This wipes thy cloud save. Local progress remains. Thou mayest re-sync from this device afterward.
            </p>
            <button onClick={doDeleteCloud} disabled={busy} className="w-full px-3 py-2 rounded border-2 border-orange-700 text-orange-200 italic text-sm hover:bg-orange-900/30">Yes, delete cloud save</button>
            <button onClick={() => setConfirmKind(null)} className="text-xs text-amber-700 italic hover:text-amber-500">Cancel</button>
          </div>
        )}

        {confirmKind === 'account' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-amber-200 italic">
              This deletes thy account and cloud save. Local progress remains.
              Type <code className="text-red-300">{user.githubLogin}</code> to confirm.
            </p>
            <input value={typedConfirm} onChange={e => setTypedConfirm(e.target.value)} className="px-2 py-1 rounded border border-red-700 bg-red-900/30 text-red-100 text-sm italic" />
            <button
              onClick={doDeleteAccount}
              disabled={busy || typedConfirm !== user.githubLogin}
              className="w-full px-3 py-2 rounded border-2 border-red-800 text-red-300 italic text-sm hover:bg-red-900/30 disabled:opacity-50"
            >
              Permanently delete account
            </button>
            <button onClick={() => { setConfirmKind(null); setTypedConfirm(''); }} className="text-xs text-amber-700 italic hover:text-amber-500">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
