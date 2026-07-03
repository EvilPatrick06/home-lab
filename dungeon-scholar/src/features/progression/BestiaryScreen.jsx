import { BESTIARY_ENTRIES } from '../../game/bestiary.js';

// Phase 17 — Bestiary. Lore + drop hints + defeat counters for every
// dungeon dweller, grouped by biome. Bosses unlock tiered lore with
// repeated defeats (5 = expanded, 10 = secret).
function BestiaryScreen({ playerState, setScreen }) {
  const tracked = playerState.bestiary || {};
  const grouped = Object.entries(BESTIARY_ENTRIES).reduce((acc, [kind, entry]) => {
    const biome = entry.biome || 'misc';
    if (!acc[biome]) acc[biome] = [];
    acc[biome].push({ kind, ...entry });
    return acc;
  }, {});
  // Stable order for biomes — matches the explore selector layout.
  const BIOME_ORDER = ['crypt', 'sewers', 'tower', 'halls', 'wastes'];
  const BIOME_LABELS = {
    crypt: { name: 'Crypt of Cryptography', icon: '🗝️', accent: '#a855f7' },
    sewers: { name: 'Sewers of OWASP', icon: '🕸️', accent: '#10b981' },
    tower: { name: 'Tower of Network Defense', icon: '🗼', accent: '#3b82f6' },
    halls: { name: 'Halls of the Hardware', icon: '⚙️', accent: '#f59e0b' },
    wastes: { name: 'Wastes of WiFi', icon: '📡', accent: '#d97706' },
  };

  const totalSeen = Object.keys(tracked).length;
  const totalKnown = Object.keys(BESTIARY_ENTRIES).length;

  const entryLore = (entry, defeats) => {
    if (typeof entry.lore === 'string') return entry.lore;
    // Boss tiered lore.
    let text = entry.lore.base;
    if (defeats >= 5 && entry.lore.expanded) {
      text += `\n\n✦ ${entry.lore.expanded}`;
    }
    if (defeats >= 10 && entry.lore.secret) {
      text += `\n\n✦✦ ${entry.lore.secret}`;
    }
    return text;
  };

  return (
    <div className="space-y-6">
      <div
        className="p-6 rounded-sm relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-purple, 31, 12, 41), 0.55) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
          border: '3px double rgba(168, 85, 247, 0.6)',
          boxShadow: '0 0 30px rgba(168, 85, 247, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
        }}
      >
        <div className="absolute top-2 left-2 text-purple-300 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-purple-300 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-purple-300 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-purple-300 text-sm">⚜</div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="text-4xl">📖</div>
            <div>
              <h2
                className="text-2xl font-bold text-purple-200 italic"
                style={{ textShadow: '0 0 12px rgba(168, 85, 247, 0.4)' }}
              >
                Bestiary
              </h2>
              <div className="text-xs text-purple-400 tracking-[0.2em] italic">⚜ THE FOES THAT BLED ⚜</div>
              <div className="text-xs text-amber-100/70 italic mt-1">
                {totalSeen} / {totalKnown} entries unlocked.
              </div>
            </div>
          </div>
          <button
            onClick={() => setScreen('home')}
            className="px-3 py-2 rounded-sm text-xs italic border-2 border-purple-700 text-purple-300 hover:bg-purple-900/30"
            style={{ background: 'rgba(var(--surface-purple, 31, 12, 41), 0.45)' }}
          >
            ← Return to the Hearth
          </button>
        </div>
      </div>

      {BIOME_ORDER.map((biomeId) => {
        const entries = grouped[biomeId] || [];
        if (entries.length === 0) return null;
        const meta = BIOME_LABELS[biomeId] || { name: biomeId, icon: '⚜', accent: '#fbbf24' };
        return (
          <div key={biomeId} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{meta.icon}</span>
              <h3
                className="text-lg font-bold italic tracking-wider biome-heading"
                style={{ color: meta.accent, textShadow: `0 0 8px ${meta.accent}66` }}
              >
                {meta.name}
              </h3>
              <div className="flex-1 h-px bg-linear-to-r from-amber-700/50 to-transparent" />
              <span className="text-xs text-accent-muted italic">
                {entries.filter((e) => tracked[e.kind]).length}/{entries.length} found
              </span>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {entries.map((entry) => {
                const status = tracked[entry.kind];
                const seen = !!status;
                const defeats = status?.defeats || 0;
                const isBoss = entry.tier === 'boss';
                return (
                  <div
                    key={entry.kind}
                    className="p-4 rounded-sm relative"
                    style={{
                      background: seen
                        ? 'linear-gradient(135deg, rgba(var(--surface-known, 31, 17, 8), 0.9) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.97) 100%)'
                        : 'linear-gradient(135deg, rgba(var(--surface-locked, 15, 12, 18), 0.85) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
                      border: `2px ${isBoss ? 'double' : 'solid'} ${
                        seen
                          ? isBoss
                            ? meta.accent
                            : 'rgba(245, 158, 11, 0.5)'
                          : 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.3)'
                      }`,
                      boxShadow: seen && isBoss ? `0 0 14px ${meta.accent}33` : 'none',
                      opacity: seen ? 1 : 0.65,
                    }}
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <div className="text-3xl">{seen ? entry.icon : '❓'}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <h4
                            className={`font-bold italic text-sm ${seen ? 'text-amber-200' : 'text-accent-muted-80'}`}
                          >
                            {seen ? entry.name : '???'}
                            {isBoss && seen && <span className="ml-2 text-[10px] text-purple-300 italic">(Boss)</span>}
                            {entry.tier === 'elite' && seen && (
                              <span className="ml-2 text-[10px] text-orange-300 italic">(Elite)</span>
                            )}
                          </h4>
                          {seen && (
                            <span className="text-xs text-amber-300 font-bold italic tabular-nums">×{defeats}</span>
                          )}
                        </div>
                        <p className="text-[11px] italic text-amber-100/70 mt-1 whitespace-pre-line">
                          {seen ? entryLore(entry, defeats) : 'Defeat one in the dungeon to unlock this entry.'}
                        </p>
                        {seen && entry.drops && (
                          <div className="text-[10px] italic text-emerald-300/80 mt-2">
                            <span className="text-accent-muted not-italic">Drops:</span> {entry.drops}
                          </div>
                        )}
                        {isBoss && seen && (
                          <div className="text-[10px] italic mt-2 biome-accent-text" style={{ color: meta.accent }}>
                            ✦ Lore tiers: {defeats >= 1 ? 'base' : '—'}
                            {' · '}
                            {defeats >= 5 ? 'expanded' : `expanded @ 5 (${defeats}/5)`}
                            {' · '}
                            {defeats >= 10 ? 'secret' : `secret @ 10 (${defeats}/10)`}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default BestiaryScreen;
