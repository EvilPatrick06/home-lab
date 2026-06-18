import { useEffect } from 'react';
import { Check, Skull } from 'lucide-react';

function MistakeVault({ courseSet, tomeProgress, playerState, onRemove, checkAchievement, unlockSpecialTitle, awardXP, onGoHome }) {
  const vault = tomeProgress?.mistakeVault || [];

  useEffect(() => {
    if (vault.length === 0 && playerState.totalAnswered > 10) {
      checkAchievement('vault_clear');
      unlockSpecialTitle('vaultkeeper');
    }
  }, [vault.length]);

  if (!courseSet) {
    return (
      <div className="text-center py-12 max-w-md mx-auto">
        <Skull className="w-20 h-20 mx-auto text-stone-600 mb-4" />
        <h2 className="text-2xl font-bold text-amber-300 mb-2 italic">No Active Tome</h2>
        <p className="text-amber-100/60 italic">Open a tome to view its vault of failures.</p>
      </div>
    );
  }

  if (vault.length === 0) {
    return (
      <div className="text-center py-12 max-w-md mx-auto">
        <Skull className="w-20 h-20 mx-auto text-stone-600 mb-4" />
        <h2 className="text-2xl font-bold text-amber-300 mb-2 italic">The Tome is Empty</h2>
        <p className="text-amber-100/60 italic">"All foes have been vanquished, brave scholar. Let new challenges find you..."</p>
        {/* 19E (L17): a way out of the dead-end ledger. */}
        <button onClick={() => onGoHome?.()}
          className="mt-5 w-full py-3 px-4 rounded-sm italic border-2 border-amber-700 text-amber-200"
          style={{ background: 'rgba(41, 24, 12, 0.7)' }}>
          Return to the Hearth — study a tome to fill this ledger
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-amber-200 mb-1 flex items-center gap-2 italic">
        <Skull className="w-7 h-7 text-red-400" /> Tome of Failures ({vault.length})
      </h2>
      {/* Phase 30d QA #18: the green check affordance was ambiguous —
          unclear whether it marked resolved or required re-answering. */}
      <p className="text-xs italic text-amber-100/70 mb-3">
        Tap the green ✓ to mark a foe vanquished (grants +5 XP). Or revisit it in a study mode to clear it by answering correctly.
      </p>
      {vault.map((item, i) => (
        <div key={i} className="p-4 rounded-sm relative" style={{
          background: 'linear-gradient(135deg, rgba(41, 12, 12, 0.7) 0%, rgba(20, 6, 6, 0.9) 100%)',
          border: '2px solid rgba(185, 28, 28, 0.5)',
        }}>
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1">
              <div className="text-xs text-red-400 tracking-[0.3em] mb-1 italic">⚔ {(item._type || 'item').toUpperCase()} ⚔</div>
              <div className="text-amber-50 mb-2 italic">{item.question || item.front || item.term || item.title}</div>
              {item.explanation && (
                <div className="text-sm text-amber-100/70 mt-2 p-2 rounded-sm italic" style={{ background: 'rgba(20, 12, 6, 0.6)', border: '1px solid rgba(120, 53, 15, 0.4)' }}>{item.explanation}</div>
              )}
            </div>
            <button onClick={() => { onRemove(item); awardXP(5); }} className="px-3 py-1 rounded-sm text-sm border-2 border-emerald-400 text-emerald-200" style={{ background: 'rgba(6, 78, 59, 0.5)' }}
              title="Mark vanquished (+5 XP) — dismisses this entry (undoable for a moment)"
              aria-label={`Mark vanquished and dismiss: ${(item.question || item.front || item.term || item.title || '').slice(0, 80)}`}>
              <Check className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default MistakeVault;
