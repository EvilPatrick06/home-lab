import { Sparkles, X } from 'lucide-react';
import { useDialogA11y } from '../useDialogA11y.js';
import { TITLES, SPECIAL_TITLES } from '../../game/titles.js';

export function TitlesModal({ playerState, onSelect, onClose }) {
  const panelRef = useDialogA11y({ onClose }); // 19A
  const currentLevel = playerState.level;
  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Titles" className="rounded-sm max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col relative" style={{
        background: 'linear-gradient(135deg, rgba(var(--surface-amber, 41, 24, 12), 0.97) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.99) 100%)',
        border: '3px double rgba(245, 158, 11, 0.6)', boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)',
      }}>
        <div className="p-4 border-b border-amber-700/50 flex justify-between items-center">
          <h3 className="text-xl font-bold text-amber-300 italic">⚔ Choose Thy Title ⚔</h3>
          <button onClick={onClose} className="p-2 hover:bg-amber-900/30 rounded-sm text-amber-300" aria-label="Close choose title dialog"><X className="w-5 h-5" aria-hidden="true" /></button>
        </div>
        <div className="p-4 overflow-y-auto overscroll-contain flex-1 space-y-4">
          <div>
            <h4 className="text-sm text-amber-600 mb-2 tracking-[0.3em] italic">⚜ TITLES OF RANK ⚜</h4>
            <div className="space-y-2">
              <button onClick={() => onSelect(null)} className="w-full text-left p-3 rounded-sm border-2" style={{
                background: !playerState.selectedTitle ? 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.5)' : 'rgba(var(--surface-amber, 41, 24, 12), 0.4)',
                borderColor: !playerState.selectedTitle ? 'rgba(245, 158, 11, 0.8)' : 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.5)',
              }}>
                <div className="font-bold text-amber-100 italic">Auto (Current Rank)</div>
                <div className="text-xs text-amber-100/60 italic">Display title based on current level</div>
              </button>
              {TITLES.map(t => {
                const unlocked = currentLevel >= t.min;
                // Phase 46d: locked rows surface the theme on hover/focus
                // (via title attribute) so users can decide whether to
                // chase this rank without seeing the actual name yet.
                const hint = unlocked
                  ? (t.theme || `Rank reached at level ${t.min}`)
                  : `${t.theme || 'Rank title'} · unlocks at level ${t.min}`;
                return (
                  <div
                    key={t.name}
                    className="p-3 rounded-sm border-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-400"
                    tabIndex={unlocked ? -1 : 0}
                    title={hint}
                    style={{
                      background: unlocked ? 'rgba(var(--surface-amber, 41, 24, 12), 0.5)' : 'rgba(var(--surface-modal, 20, 12, 6), 0.4)',
                      borderColor: unlocked ? 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.5)' : 'rgba(45, 30, 20, 0.5)',
                      opacity: unlocked ? 1 : 0.55,
                    }}
                  >
                    <div className="flex justify-between items-baseline gap-2">
                      <div className="font-bold text-amber-100 italic">{unlocked ? t.name : '???'}</div>
                      <div className="text-xs text-amber-700 shrink-0">Lvl {t.min}+</div>
                    </div>
                    {!unlocked && t.theme && (
                      <div className="text-[10px] italic text-amber-700/80 mt-0.5">{t.theme}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <h4 className="text-sm text-amber-600 mb-2 tracking-[0.3em] italic">✦ LEGENDARY TITLES ✦</h4>
            <div className="space-y-2">
              {Object.entries(SPECIAL_TITLES).map(([key, t]) => {
                const unlocked = playerState.unlockedTitles.includes(key);
                return (
                  <button key={key} onClick={() => unlocked && onSelect(key)} disabled={!unlocked} className="w-full text-left p-3 rounded-sm border-2 disabled:cursor-not-allowed" style={{
                    background: playerState.selectedTitle === key ? 'rgba(126, 34, 206, 0.4)' : unlocked ? 'rgba(var(--surface-amber, 41, 24, 12), 0.5)' : 'rgba(var(--surface-modal, 20, 12, 6), 0.4)',
                    borderColor: playerState.selectedTitle === key ? 'rgba(168, 85, 247, 0.8)' : unlocked ? 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.5)' : 'rgba(45, 30, 20, 0.5)',
                    opacity: unlocked ? 1 : 0.4,
                  }}>
                    <div className="flex justify-between">
                      <div className="font-bold text-amber-100 italic">{unlocked ? t.name : '???'}</div>
                      {unlocked && <Sparkles className="w-4 h-4 text-purple-400" />}
                    </div>
                    <div className="text-xs text-amber-100/60 italic">{t.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
