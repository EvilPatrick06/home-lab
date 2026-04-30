import React from 'react';

function summarize(state) {
  if (!state) return { level: 1, tomes: 0, totalCorrect: 0, totalXp: 0 };
  return {
    level: state.level ?? 1,
    tomes: Array.isArray(state.library) ? state.library.length : 0,
    totalCorrect: state.totalCorrect ?? 0,
    totalXp: state.totalXp ?? 0,
  };
}

function Card({ heading, state, onPick, pickLabel, pickColor }) {
  const s = summarize(state);
  return (
    <div className="flex-1 p-4 rounded border-2 border-amber-700"
         style={{ background: 'rgba(41, 24, 12, 0.7)' }}>
      <div className="text-xs text-amber-700 tracking-[0.3em] mb-2">{heading}</div>
      <div className="text-amber-200 text-lg font-bold italic">Level {s.level}</div>
      <div className="text-sm text-amber-300 mt-2">📚 {s.tomes} tomes</div>
      <div className="text-sm text-amber-300">🎯 {s.totalCorrect} victories</div>
      <div className="text-sm text-amber-300">⭐ {s.totalXp.toLocaleString()} total XP</div>
      <button
        onClick={onPick}
        title="The other side will be replaced."
        className={`mt-4 w-full px-3 py-2 rounded border-2 italic text-sm hover:opacity-90 ${pickColor}`}
      >
        {pickLabel}
      </button>
    </div>
  );
}

export function MergeChooser({ localState, cloudState, onResolve }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
         style={{ background: 'rgba(0,0,0,0.85)' }}>
      <div className="max-w-2xl w-[92%] p-6 rounded border-2 border-amber-600"
           style={{ background: 'rgba(20, 12, 6, 0.97)' }}>
        <h2 className="text-xl font-bold text-amber-300 italic mb-2">
          ⚔ Two Journals Discovered ⚔
        </h2>
        <p className="text-sm text-amber-200/80 italic mb-5">
          Thy progress lives in two places. Choose which to keep — the other will be replaced.
        </p>
        <div className="flex flex-col md:flex-row gap-3">
          <Card
            heading="THIS DEVICE"
            state={localState}
            pickLabel="Use this device's progress"
            pickColor="border-amber-700 text-amber-200 bg-amber-900/30"
            onPick={() => onResolve('local')}
          />
          <Card
            heading="YOUR CLOUD"
            state={cloudState}
            pickLabel="Use my cloud progress"
            pickColor="border-purple-700 text-purple-200 bg-purple-900/30"
            onPick={() => onResolve('cloud')}
          />
        </div>
        <button
          onClick={() => onResolve('cancel')}
          className="mt-5 w-full px-3 py-2 rounded border-2 border-stone-700 text-stone-300 italic text-sm hover:bg-stone-900/40"
        >
          Cancel sign-in (keep this device unchanged)
        </button>
      </div>
    </div>
  );
}
