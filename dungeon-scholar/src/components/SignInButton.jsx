import React, { useState } from 'react';
import { Github } from 'lucide-react';
import { signInWithGitHub, isSupabaseConfigured } from '../services/supabase.js';

export function SignInButton() {
  const [busy, setBusy] = useState(false);

  if (!isSupabaseConfigured()) return null;

  const onClick = async () => {
    setBusy(true);
    try {
      await signInWithGitHub();
      setTimeout(() => setBusy(false), 4000);
    } catch (err) {
      console.error('Sign-in failed:', err);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={onClick}
        disabled={busy}
        className="px-4 py-2 rounded flex items-center gap-2 text-sm border-2 border-purple-700 text-purple-200 hover:bg-purple-900/30 italic disabled:opacity-60"
        style={{ background: 'rgba(31, 12, 41, 0.7)' }}
      >
        <Github className="w-4 h-4" /> {busy ? 'Connecting…' : 'Sign in with GitHub to sync'}
      </button>
      <span className="text-[11px] text-amber-700 italic pl-1">
        Optional — your progress is already saved on this device.
      </span>
    </div>
  );
}
