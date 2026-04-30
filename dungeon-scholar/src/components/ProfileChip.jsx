import React from 'react';
import { SyncStatusDot } from './SyncStatusDot.jsx';

export function ProfileChip({ user, syncStatus, onOpen }) {
  if (!user) return null;
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-2 px-2 py-1 rounded border border-amber-800 hover:bg-amber-900/20 italic"
      title="Account"
    >
      {user.avatarUrl && (
        <img
          src={user.avatarUrl}
          alt=""
          className="w-6 h-6 rounded-full border border-amber-700"
        />
      )}
      <span className="text-sm text-amber-200">@{user.githubLogin || 'scholar'}</span>
      <SyncStatusDot status={syncStatus} />
    </button>
  );
}
