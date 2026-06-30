import { Check, Skull } from 'lucide-react';
import { useEffect, useRef } from 'react';

function MistakeVault({
  courseSet,
  tomeProgress,
  playerState,
  onRemove,
  checkAchievement,
  unlockSpecialTitle,
  awardXP,
  onGoHome,
}) {
  const vault = tomeProgress?.mistakeVault || [];
  const activeTomeId = playerState?.activeTomeId;

  // PHASE-06 06A: "The Redeemed" / vault_clear must fire only on a genuine
  // had-foes -> all-banished transition WITH an active tome — never on a
  // tomeless or never-populated vault (the old `vault.length === 0` guard was
  // vacuously true on first view, and the hook runs before the !courseSet
  // early-return below, so a tomeless visit granted the reward). We track,
  // per active tome, whether the vault actually held a foe this session and
  // only grant once it then empties out. Errs toward NOT granting (a clear that
  // happened entirely in a prior session won't re-toast) — the safe direction.
  const everHadEntriesRef = useRef(false);
  const lastTomeRef = useRef(activeTomeId);
  useEffect(() => {
    if (lastTomeRef.current !== activeTomeId) {
      lastTomeRef.current = activeTomeId;
      everHadEntriesRef.current = false;
    }
    if (!courseSet) return;
    if (vault.length > 0) {
      everHadEntriesRef.current = true;
      return;
    }
    if (everHadEntriesRef.current && playerState.totalAnswered > 10) {
      checkAchievement('vault_clear');
      unlockSpecialTitle('vaultkeeper');
    }
  }, [vault.length, courseSet, activeTomeId]);

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
        <h2 className="text-2xl font-bold text-amber-300 mb-2 italic">The Vault Stands Empty</h2>
        <p className="text-amber-100/60 italic">
          "No foes to redeem yet — miss a riddle in any study mode and it shall be captured here."
        </p>
        {/* 19E (L17): a way out of the dead-end ledger. */}
        <button
          onClick={() => onGoHome?.()}
          className="mt-5 w-full py-3 px-4 rounded-sm italic border-2 border-amber-700 text-amber-200"
          style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
        >
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
        Tap the green ✓ to mark a foe vanquished (grants +5 XP). Or revisit it in a study mode to clear it by answering
        correctly.
      </p>
      {vault.map((item, i) => (
        <div
          key={i}
          className="p-4 rounded-sm relative"
          style={{
            background:
              'linear-gradient(135deg, rgba(var(--surface-red, 41, 12, 12), 0.7) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.9) 100%)',
            border: '2px solid rgba(185, 28, 28, 0.5)',
          }}
        >
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1">
              <div className="text-xs text-red-400 tracking-[0.3em] mb-1 italic">
                ⚔ {(item._type || 'item').toUpperCase()} ⚔
              </div>
              <div className="text-amber-50 mb-2 italic">{item.question || item.front || item.term || item.title}</div>
              {item.explanation && (
                <div
                  className="text-sm text-amber-100/70 mt-2 p-2 rounded-sm italic"
                  style={{
                    background: 'rgba(var(--surface-modal, 20, 12, 6), 0.6)',
                    border: '1px solid rgba(var(--surface-amber-strong, 120, 53, 15), 0.4)',
                  }}
                >
                  {item.explanation}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                onRemove(item);
                awardXP(5);
              }}
              className="px-3 py-1 rounded-sm text-sm border-2 border-emerald-400 text-emerald-200"
              style={{ background: 'rgba(var(--surface-emerald, 6, 78, 59), 0.5)' }}
              title="Mark vanquished (+5 XP) — dismisses this entry (undoable for a moment)"
              aria-label={`Mark vanquished and dismiss: ${(item.question || item.front || item.term || item.title || '').slice(0, 80)}`}
            >
              <Check className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default MistakeVault;
