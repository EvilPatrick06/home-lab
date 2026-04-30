import React from 'react';

const COLORS = {
  idle: '#10b981',
  saving: '#f59e0b',
  error: '#ef4444',
  offline: '#ef4444',
};

const TITLES = {
  idle: 'Synced',
  saving: 'Saving…',
  error: 'Sync error — will retry',
  offline: 'Offline — will retry',
};

export function SyncStatusDot({ status }) {
  const color = COLORS[status] || COLORS.idle;
  const title = TITLES[status] || TITLES.idle;
  const pulse = status === 'saving';
  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-block w-2 h-2 rounded-full ${pulse ? 'animate-pulse' : ''}`}
      style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
    />
  );
}
