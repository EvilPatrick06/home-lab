import { PET_LEVEL_XP, PET_MAX_LEVEL, PETS, petLevelFromXp } from '../../services/pets.js';

// Phase 18 — Stable. Hatched familiars with level/XP bars, equip toggle,
// and lore. Pets gain XP from delves while equipped (see DungeonExplore
// finishRun → awardPetXp). Each pet's passive scales with its level.
function StableScreen({ playerState, setScreen, onEquipPet, onUnequipPet }) {
  const owned = playerState.pets || {};
  const equippedPet = playerState.equipped?.pet || null;
  const allPets = Object.values(PETS);
  const ownedPets = allPets.filter((p) => owned[p.id]);
  const lockedPets = allPets.filter((p) => !owned[p.id]);

  const passiveLabel = (def, level) => {
    const value = (def.base || 0) + (def.perLevel || 0) * (level - 1);
    switch (def.passive) {
      case 'xp_pct':
        return `+${value}% XP from delves`;
      case 'gold_pct':
        return `+${value}% gold drop`;
      case 'shield_bonus':
        return `+${value} starting shield${value === 1 ? '' : 's'}`;
      case 'first_wrong_free':
        return 'First wrong answer absorbed';
      case 'plant_double_pct':
        return `${value}% chance to double plant drops`;
      default:
        return '—';
    }
  };

  return (
    <div className="space-y-6">
      <div
        className="p-6 rounded-sm relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-emerald, 6, 78, 59), 0.45) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
          border: '3px double rgba(16, 185, 129, 0.6)',
          boxShadow: '0 0 30px rgba(16, 185, 129, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
        }}
      >
        <div className="absolute top-2 left-2 text-emerald-400 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-emerald-400 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-emerald-400 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-emerald-400 text-sm">⚜</div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="text-4xl">🐾</div>
            <div>
              <h2
                className="text-2xl font-bold text-emerald-200 italic"
                style={{ textShadow: '0 0 12px rgba(16, 185, 129, 0.4)' }}
              >
                The Stable
              </h2>
              <div className="text-xs text-emerald-400 tracking-[0.2em] italic">⚜ FAMILIARS AT THY SIDE ⚜</div>
              <div className="text-xs text-amber-100/70 italic mt-1">
                {ownedPets.length}/{allPets.length} hatched. Pets gain XP from each delve while equipped.
              </div>
            </div>
          </div>
          <button
            onClick={() => setScreen('home')}
            className="px-3 py-2 rounded-sm text-xs italic border-2 border-emerald-700 text-emerald-300 hover:bg-emerald-900/30"
            style={{ background: 'rgba(var(--surface-emerald, 6, 78, 59), 0.45)' }}
          >
            ← Return to the Hearth
          </button>
        </div>
      </div>

      {ownedPets.length === 0 && (
        <div
          className="p-6 rounded-sm text-center text-sm italic text-amber-700"
          style={{
            background: 'rgba(0,0,0,0.5)',
            border: '2px dashed rgba(var(--surface-amber-strong, 120, 53, 15),0.4)',
          }}
        >
          Thou hast no familiars yet. Visit the Marketplace and purchase a Stable egg to hatch one.
        </div>
      )}

      {ownedPets.length > 0 && (
        <div className="grid md:grid-cols-2 gap-3">
          {ownedPets.map((def) => {
            const status = owned[def.id];
            const xp = status?.xp || 0;
            const level = petLevelFromXp(xp);
            const isMax = level >= PET_MAX_LEVEL;
            const nextThreshold = isMax ? PET_LEVEL_XP[PET_MAX_LEVEL - 1] : PET_LEVEL_XP[level];
            const prevThreshold = PET_LEVEL_XP[level - 1] || 0;
            const pctToNext = isMax
              ? 100
              : Math.min(100, Math.floor(((xp - prevThreshold) / (nextThreshold - prevThreshold)) * 100));
            const isEquipped = equippedPet === def.id;
            return (
              <div
                key={def.id}
                className="p-4 rounded-sm"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(31, 17, 8, 0.9) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.97) 100%)',
                  border: `2px solid ${isEquipped ? 'rgba(16, 185, 129, 0.7)' : 'rgba(245, 158, 11, 0.4)'}`,
                  boxShadow: isEquipped ? '0 0 14px rgba(16, 185, 129, 0.3)' : 'none',
                }}
              >
                <div className="flex items-start gap-3 mb-2">
                  <div className="text-4xl">{def.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <h4 className="font-bold italic text-base text-amber-200">{def.name}</h4>
                      <span className="text-xs italic text-emerald-300 font-bold tabular-nums">
                        Level {level}
                        {isMax && ' · MAX'}
                      </span>
                    </div>
                    <p className="text-[11px] italic text-amber-100/70 mt-1">{def.lore}</p>
                  </div>
                </div>
                <div className="text-[11px] italic text-emerald-200 mb-2">✦ {passiveLabel(def, level)}</div>
                {/* XP bar */}
                <div className="mb-3">
                  <div className="flex items-baseline justify-between text-[10px] italic text-amber-700 mb-1">
                    <span>{isMax ? 'Maxed' : `XP ${xp - prevThreshold}/${nextThreshold - prevThreshold}`}</span>
                    <span className="tabular-nums">Total: {xp}</span>
                  </div>
                  <div className="h-2 rounded-sm overflow-hidden" style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div
                      className="h-full"
                      style={{
                        width: `${pctToNext}%`,
                        background: isMax
                          ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
                          : 'linear-gradient(90deg, #10b981, #34d399)',
                      }}
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  {isEquipped ? (
                    <button
                      onClick={() => onUnequipPet?.()}
                      className="px-3 py-1.5 rounded-sm text-xs italic border-2 border-emerald-700 text-emerald-200 hover:bg-emerald-900/30"
                      style={{ background: 'rgba(var(--surface-emerald, 6, 78, 59), 0.5)' }}
                    >
                      Dismiss
                    </button>
                  ) : (
                    <button
                      onClick={() => onEquipPet?.(def.id)}
                      className="px-3 py-1.5 rounded-sm text-xs italic border-2 border-amber-700 text-amber-200 hover:bg-amber-900/30"
                      style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.6)' }}
                    >
                      Equip
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lockedPets.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🥚</span>
            <h3 className="text-sm font-bold italic text-amber-300 tracking-wider">Awaiting Hatch</h3>
            <div className="flex-1 h-px bg-linear-to-r from-amber-700/50 to-transparent" />
          </div>
          <div className="grid md:grid-cols-3 gap-2">
            {lockedPets.map((def) => (
              <div
                key={def.id}
                className="p-3 rounded-sm text-xs italic"
                style={{
                  background: 'rgba(15, 12, 18, 0.85)',
                  border: '2px dashed rgba(var(--surface-amber-strong, 120, 53, 15), 0.4)',
                  opacity: 0.7,
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="text-2xl">🥚</div>
                  <div>
                    <div className="text-amber-700">??? ({def.biome})</div>
                    <div className="text-[10px] text-amber-700/70">Purchase the egg in the Marketplace.</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default StableScreen;
