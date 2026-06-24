import { useState } from 'react';

// Phase 23 — Ascension. The cycle resets; identity persists. Confirms
// before destruction so the player can't ascend by accident.
function AscensionScreen({ playerState, setScreen, onAscend }) {
  const lvl = playerState.level || 1;
  const REQ = 50;
  const ready = lvl >= REQ;
  const ascensions = playerState.ascensions || 0;
  const tokens = playerState.ascensionTokens || 0;
  const lastAscended = playerState.lastAscendedAt ? new Date(playerState.lastAscendedAt).toLocaleDateString() : null;
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const tryAscend = () => {
    const res = onAscend?.();
    if (res?.ok) {
      setConfirming(false);
      setScreen('home');
    } else {
      setFeedback({ tone: 'bad', text: res?.reason || 'Cannot ascend.' });
      setTimeout(() => setFeedback(null), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <div
        className="p-6 rounded-sm relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-amber, 41, 24, 12), 0.55) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
          border: '3px double rgba(245, 158, 11, 0.7)',
          boxShadow: '0 0 30px rgba(245, 158, 11, 0.3), inset 0 0 30px rgba(0,0,0,0.5)',
        }}
      >
        <div className="absolute top-2 left-2 text-amber-300 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-amber-300 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-amber-300 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-amber-300 text-sm">⚜</div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="text-4xl">🌟</div>
            <div>
              <h2
                className="text-2xl font-bold text-amber-200 italic"
                style={{ textShadow: '0 0 12px rgba(245, 158, 11, 0.5)' }}
              >
                The Path of Ascension
              </h2>
              <div className="text-xs text-amber-400 tracking-[0.2em] italic">⚜ TRANSCEND THE CYCLE ⚜</div>
              <div className="text-xs text-amber-100/70 italic mt-1">
                Reset thy level, gold, and gear — keep thy identity, lore, and stable. Earn an Ascension Token.
              </div>
            </div>
          </div>
          <button
            onClick={() => setScreen('home')}
            className="px-3 py-2 rounded-sm text-xs italic border-2 border-amber-700 text-amber-300 hover:bg-amber-900/30"
            style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.6)' }}
          >
            ← Return to the Hearth
          </button>
        </div>
      </div>

      {/* Stats ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <div
          className="p-3 rounded-sm"
          style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(245, 158, 11, 0.4)' }}
        >
          <div className="text-[10px] uppercase italic text-amber-700">Current Level</div>
          <div className="text-lg font-bold italic text-amber-200">
            {lvl} / {REQ}
          </div>
        </div>
        <div
          className="p-3 rounded-sm"
          style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(245, 158, 11, 0.4)' }}
        >
          <div className="text-[10px] uppercase italic text-amber-700">Ascensions</div>
          <div className="text-lg font-bold italic text-amber-200">🌟 {ascensions}</div>
        </div>
        <div
          className="p-3 rounded-sm"
          style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(245, 158, 11, 0.5)' }}
        >
          <div className="text-[10px] uppercase italic text-amber-700">Tokens</div>
          <div className="text-lg font-bold italic text-amber-200">🪙 {tokens}</div>
        </div>
        <div
          className="p-3 rounded-sm"
          style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(245, 158, 11, 0.4)' }}
        >
          <div className="text-[10px] uppercase italic text-amber-700">Last Ascension</div>
          <div className="text-sm font-bold italic text-amber-200">{lastAscended || '—'}</div>
        </div>
      </div>

      {/* What is preserved / lost */}
      <div className="grid md:grid-cols-2 gap-3">
        <div
          className="p-4 rounded-sm"
          style={{
            background:
              'linear-gradient(135deg, rgba(var(--surface-emerald, 6, 78, 59), 0.4) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
            border: '2px solid rgba(16, 185, 129, 0.5)',
          }}
        >
          <h4 className="font-bold italic text-emerald-200 text-sm mb-2">✦ Preserved</h4>
          <ul className="text-xs italic text-emerald-100/80 space-y-1 list-disc list-inside">
            <li>Achievements & special titles</li>
            <li>Bestiary entries (defeats persist)</li>
            <li>Stable familiars & their levels</li>
            <li>Spellbook (learned spells)</li>
            <li>Devotion calendar streak & total devotion</li>
            <li>Ingredients in thy basket</li>
            <li>Reliquary + Celestial permanent boons</li>
            <li>Total lifetime XP recorded in tomes</li>
          </ul>
        </div>
        <div
          className="p-4 rounded-sm"
          style={{
            background:
              'linear-gradient(135deg, rgba(var(--surface-amber-strong, 120, 53, 15), 0.4) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
            border: '2px solid rgba(245, 158, 11, 0.5)',
          }}
        >
          <h4 className="font-bold italic text-amber-200 text-sm mb-2">✦ Reset</h4>
          <ul className="text-xs italic text-amber-100/80 space-y-1 list-disc list-inside">
            <li>Level → 1 (XP within current level resets)</li>
            <li>Gold → 0</li>
            <li>Equipped weapons, head, cloak, pet, spell slots</li>
            <li>One-time gear & potions in thy hoard</li>
            <li>Sanctum permanent stacks (gold-bought ones)</li>
          </ul>
        </div>
      </div>

      {/* Ascend action */}
      <div
        className="p-6 rounded-sm text-center"
        style={{
          background: ready
            ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.45) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)'
            : 'linear-gradient(135deg, rgba(31, 41, 55, 0.5) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
          border: `3px ${ready ? 'double' : 'solid'} ${ready ? '#fbbf24' : 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.4)'}`,
        }}
      >
        {!ready ? (
          <div>
            <div className="text-amber-700 italic mb-2">The path opens at level {REQ}.</div>
            <div className="text-xs italic text-amber-700/70">{REQ - lvl} levels remain before thou mayest ascend.</div>
          </div>
        ) : !confirming ? (
          <div>
            <div className="text-amber-200 italic mb-3 text-base">The cycle awaits thy renewal.</div>
            <button
              onClick={() => setConfirming(true)}
              className="px-6 py-3 rounded-sm text-base italic font-bold border-2"
              style={{
                background: 'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)',
                borderColor: '#fbbf24',
                color: '#1a0e08',
                fontFamily: '"Cinzel", Georgia, serif',
              }}
            >
              🌟 Begin Ascension
            </button>
          </div>
        ) : (
          <div>
            <div className="text-amber-200 italic mb-3 text-base font-bold">
              Art thou certain? Thy gold and gear shall be undone.
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={tryAscend}
                className="px-5 py-2.5 rounded-sm text-sm italic font-bold border-2"
                style={{
                  background: 'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)',
                  borderColor: '#fbbf24',
                  color: '#1a0e08',
                }}
              >
                ✓ Yes — Ascend
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="px-5 py-2.5 rounded-sm text-sm italic border-2 border-stone-600 text-stone-300 hover:bg-stone-800/30"
                style={{ background: 'rgba(31, 24, 12, 0.7)' }}
              >
                ✕ Hold the Course
              </button>
            </div>
            {feedback && <div className="mt-2 text-xs italic text-red-300">{feedback.text}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default AscensionScreen;
