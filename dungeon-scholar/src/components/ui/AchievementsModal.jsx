import { Trophy, X } from 'lucide-react';
import { ACHIEVEMENTS } from '../../game/achievements.js';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';

export function AchievementsModal({ playerState, onClose }) {
  const panelRef = useDialogA11y({ onClose }); // 19A
  const categoryLabels = {
    milestone: '⚔ First Steps ⚔',
    dungeon: '🐉 Dungeon Glory 🐉',
    streak: '🔥 Streaks of Fury 🔥',
    volume: '📊 Trials Endured 📊',
    labs: '⚗️ Trials of Skill ⚗️',
    cards: '📜 Scholarly Pursuits 📜',
    quiz: '🔮 Riddle Mastery 🔮',
    oracle: "🪄 Oracle's Favor 🪄",
    level: '⬆️ Ranks of Power ⬆️',
    mastery: '🦉 Wisdom & Mastery 🦉',
    devotion: '🕯️ Daily Devotion 🕯️',
    vault: '🗡️ Vault of Redemption 🗡️',
    xp: '💰 Treasure Hoarded 💰',
    special: '✨ Special Honors ✨',
  };
  const grouped = ACHIEVEMENTS.reduce((acc, a) => {
    const cat = a.category || 'special';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(a);
    return acc;
  }, {});
  const categoryOrder = [
    'milestone',
    'dungeon',
    'streak',
    'volume',
    'labs',
    'cards',
    'quiz',
    'oracle',
    'level',
    'mastery',
    'devotion',
    'vault',
    'xp',
    'special',
  ];

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Hall of Glory"
        className="rounded-sm max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-amber, 41, 24, 12), 0.97) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.99) 100%)',
          border: '3px double rgba(245, 158, 11, 0.6)',
          boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)',
        }}
      >
        <div className="p-4 border-b border-amber-700/50 flex justify-between items-center">
          <h3 className="text-xl font-bold text-amber-300 flex items-center gap-2 italic">
            <Trophy className="w-5 h-5" /> ⚔ Hall of Glory ({playerState.achievements.length}/{ACHIEVEMENTS.length}) ⚔
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-amber-900/30 rounded-sm text-amber-300"
            aria-label="Close Hall of Glory"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto overscroll-contain flex-1 space-y-5">
          {categoryOrder
            .filter((c) => grouped[c])
            .map((cat) => {
              const achievements = grouped[cat];
              const unlockedCount = achievements.filter((a) => playerState.achievements.includes(a.id)).length;
              return (
                <div key={cat}>
                  <h4 className="text-sm text-amber-500 mb-2 tracking-[0.2em] italic font-bold">
                    {categoryLabels[cat]}{' '}
                    <span className="text-amber-700 text-xs">
                      ({unlockedCount}/{achievements.length})
                    </span>
                  </h4>
                  <div className="grid md:grid-cols-2 gap-2">
                    {achievements.map((a) => {
                      const unlocked = playerState.achievements.includes(a.id);
                      return (
                        <div
                          key={a.id}
                          className="p-3 rounded-sm border-2"
                          style={{
                            background: unlocked
                              ? 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.4)'
                              : 'rgba(var(--surface-amber, 41, 24, 12), 0.4)',
                            borderColor: unlocked ? 'rgba(245, 158, 11, 0.7)' : 'rgba(75, 75, 75, 0.5)',
                            opacity: unlocked ? 1 : 0.5,
                            boxShadow: unlocked ? '0 0 12px rgba(245, 158, 11, 0.2)' : 'none',
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <div className="text-2xl">{unlocked ? a.icon : '🔒'}</div>
                            <div>
                              <div className="font-bold text-amber-100 italic text-sm">{a.name}</div>
                              <div className="text-xs text-amber-100/60 italic">{a.desc}</div>
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
      </div>
    </div>
  );
}
