import { useState } from 'react';
import { SPELLS } from '../../services/spells.js';

// Phase 19 — Spellbook. Lists all spells; known ones can be quick-slotted
// into 3 cast slots usable in the dungeon (Z/X/C hotkeys). Unknown spells
// show locked entries pointing to the Arcanum scroll that learns them.
// 25h: extracted from SpellbookScreen so the Inventory screen's Spells tab
// can reuse the same cast-slot + spell-grid UI without duplication. The
// standalone SpellbookScreen route wraps this with its header + return button.
export function SpellbookContent({ playerState, onEquipSpell, onUnequipSpell }) {
  const known = playerState.spellbook || {};
  const equipped = playerState.equippedSpells || [null, null, null];
  const allSpells = Object.values(SPELLS);
  const [pendingSlot, setPendingSlot] = useState(null);

  const handleSlotClick = (i) => {
    if (equipped[i]) onUnequipSpell?.(i);
    else setPendingSlot(i);
  };

  const handleAssign = (spellId) => {
    if (pendingSlot === null) {
      onEquipSpell?.(spellId);
    } else {
      onEquipSpell?.(spellId, pendingSlot);
      setPendingSlot(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Quick-slot row */}
      <div
        className="p-4 rounded-sm"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-purple, 31, 12, 41), 0.6) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
          border: '2px solid rgba(126, 34, 206, 0.4)',
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base">✦</span>
          <h4 className="text-xs font-bold italic text-amber-200 tracking-wider">Cast Slots</h4>
          <div className="flex-1 h-px bg-linear-to-r from-amber-700/40 to-transparent" />
          <span className="text-[10px] italic text-amber-700">
            {pendingSlot !== null
              ? `Choose a spell for slot ${'ZXC'[pendingSlot]}…`
              : 'Click empty slot then a spell · click filled slot to clear'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs italic">
          {[0, 1, 2].map((i) => {
            const sid = equipped[i];
            const def = sid ? SPELLS[sid] : null;
            const isPending = pendingSlot === i;
            return (
              <button
                key={i}
                onClick={() => handleSlotClick(i)}
                className="p-2 rounded-sm flex items-center gap-2 text-left"
                style={{
                  background: isPending ? 'rgba(59, 130, 246, 0.3)' : 'rgba(0,0,0,0.35)',
                  border: `1px solid ${def ? 'rgba(96, 165, 250, 0.6)' : isPending ? '#60a5fa' : 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.3)'}`,
                  cursor: 'pointer',
                }}
              >
                <div className="text-xl w-6 text-center">{def ? def.icon : 'ZXC'[i]}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-sky-300">
                    [{'ZXC'[i]}] · Slot {i + 1}
                  </div>
                  <div className={def ? 'text-amber-200 truncate' : 'text-amber-700/60 truncate'}>
                    {def ? `${def.name} · ${def.cost} mana` : isPending ? 'Pick a spell below…' : '— Empty —'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Known + locked spells grid */}
      <div className="grid md:grid-cols-2 gap-3">
        {allSpells.map((def) => {
          const isKnown = !!known[def.id];
          const slotIdx = equipped.indexOf(def.id);
          const isEquipped = slotIdx >= 0;
          return (
            <div
              key={def.id}
              className="p-4 rounded-sm"
              style={{
                background: isKnown
                  ? 'linear-gradient(135deg, rgba(31, 17, 8, 0.9) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.97) 100%)'
                  : 'linear-gradient(135deg, rgba(15, 12, 18, 0.85) 0%, rgba(6, 4, 8, 0.95) 100%)',
                border: `2px solid ${isEquipped ? '#60a5fa' : isKnown ? 'rgba(245, 158, 11, 0.5)' : 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.3)'}`,
                opacity: isKnown ? 1 : 0.65,
                boxShadow: isEquipped ? `0 0 14px ${def.accent}33` : 'none',
              }}
            >
              <div className="flex items-start gap-3 mb-2">
                <div className="text-3xl">{isKnown ? def.icon : '❓'}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <h4 className="font-bold italic text-sm text-amber-200">{isKnown ? def.name : '???'}</h4>
                    <span className="text-xs italic font-bold tabular-nums" style={{ color: def.accent }}>
                      {def.cost} mana
                    </span>
                  </div>
                  <p className="text-[11px] italic text-amber-100/70 mt-1">
                    {isKnown ? def.desc : 'Purchase the corresponding scroll in the Marketplace to learn this spell.'}
                  </p>
                </div>
              </div>
              {isKnown && (
                <div className="flex justify-end">
                  {isEquipped ? (
                    <button
                      onClick={() => onUnequipSpell?.(slotIdx)}
                      className="px-3 py-1.5 rounded-sm text-xs italic border-2 border-sky-700 text-sky-200 hover:bg-sky-900/30"
                      style={{ background: 'rgba(12, 24, 41, 0.5)' }}
                    >
                      Unslot ({'ZXC'[slotIdx]})
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAssign(def.id)}
                      className="px-3 py-1.5 rounded-sm text-xs italic border-2 border-amber-700 text-amber-200 hover:bg-amber-900/30"
                      style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.6)' }}
                    >
                      {pendingSlot !== null ? `Assign to ${'ZXC'[pendingSlot]}` : 'Slot'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SpellbookScreen({ playerState, setScreen, onEquipSpell, onUnequipSpell }) {
  const known = playerState.spellbook || {};
  const allSpells = Object.values(SPELLS);
  const knownCount = allSpells.filter((s) => known[s.id]).length;

  return (
    <div className="space-y-6">
      <div
        className="p-6 rounded-sm relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(12, 24, 41, 0.55) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
          border: '3px double rgba(59, 130, 246, 0.6)',
          boxShadow: '0 0 30px rgba(59, 130, 246, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
        }}
      >
        <div className="absolute top-2 left-2 text-sky-300 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-sky-300 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-sky-300 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-sky-300 text-sm">⚜</div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="text-4xl">📜</div>
            <div>
              <h2
                className="text-2xl font-bold text-sky-200 italic"
                style={{ textShadow: '0 0 12px rgba(59, 130, 246, 0.4)' }}
              >
                The Spellbook
              </h2>
              <div className="text-xs text-sky-400 tracking-[0.2em] italic">⚜ ACTIVE INCANTATIONS ⚜</div>
              <div className="text-xs text-amber-100/70 italic mt-1">
                {knownCount}/{allSpells.length} learned. Slot up to 3 to cast in the dungeon (Z · X · C).
              </div>
            </div>
          </div>
          <button
            onClick={() => setScreen('home')}
            className="px-3 py-2 rounded-sm text-xs italic border-2 border-sky-700 text-sky-300 hover:bg-sky-900/30"
            style={{ background: 'rgba(12, 24, 41, 0.45)' }}
          >
            ← Return to the Hearth
          </button>
        </div>
      </div>

      <SpellbookContent playerState={playerState} onEquipSpell={onEquipSpell} onUnequipSpell={onUnequipSpell} />
    </div>
  );
}

export default SpellbookScreen;
