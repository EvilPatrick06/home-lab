import { useState, useEffect, useMemo } from 'react';
import { Home, ArrowLeft } from 'lucide-react';
import { SRS_RATINGS, scheduleCard, sortByDueness, filterDue } from '../../services/srs.js';
import { saveSession, loadSession, SESSION_KIND } from '../../services/sessionResume.js';
import { FilteredModeBanner } from '../../components/ui/FilteredModeBanner.jsx';
import { DifficultyStars, BloomBadge } from '../../components/ui/badges.jsx';

function FlashcardsMode({ courseSet, tomeId, cards: cardsProp, tomeProgress, awardXP, updateTomeProgress, updateCardProgress, playerState, checkAchievement, domainFilter, onExitFilter, reviewMode, onExitReviewMode, onResumeNotify }) {
  // Phase 33b/39a QA P2: defer resume until `cards` is populated. 39a
  // adds deck-order persistence so the resumed index points to the saved
  // card even when ids are missing or duplicated.
  const [index, setIndex] = useState(0);
  const [sessionDeck, setSessionDeck] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  // 26g: review-mode deck is frozen at entry — recomputing on every
  // rating would shrink the deck (cards just rated have a future dueAt)
  // and break the index. The frozen snapshot iterates linearly.
  const [reviewDeck, setReviewDeck] = useState([]);
  // Pre-shuffled deck comes from App level (stable across re-renders / cloud
  // sync). Fall back to the raw flashcards if a parent hasn't provided one.
  // PHASE-40 40B (L15): defensive copy with a stable identity — the fallback
  // branch must not hand the raw courseSet array to component state, and an
  // unstable identity would re-fire the cards memo + session effects every render.
  const baseDeck = useMemo(
    () => ((cardsProp && cardsProp.length) ? cardsProp : (courseSet.flashcards || [])).slice(),
    [cardsProp, courseSet]
  );

  useEffect(() => {
    if (reviewMode) {
      const map = tomeProgress?.cardProgress || {};
      setReviewDeck(sortByDueness(filterDue(baseDeck, map), map));
      setIndex(0);
      setReviewed(0);
      setFlipped(false);
    }
    // Don't reset on switching away from reviewMode — App-level state
    // clears reviewMode on screen change.
  }, [reviewMode]);

  // 25e2: Domain Study can launch this mode with a single-domain filter.
  // The filter applies on top of the App-level shuffle; if no card carries
  // a matching domain, the deck is empty and we surface a back-button.
  // Phase 39a: sessionDeck overrides baseDeck when restored from a session
  // (only in non-review, non-filter mode).
  const cards = useMemo(() => {
    if (reviewMode) return reviewDeck;
    const deck = sessionDeck || baseDeck;
    if (!domainFilter) return deck;
    return deck.filter((c) => c && c.domain === domainFilter);
  }, [sessionDeck, baseDeck, domainFilter, reviewMode, reviewDeck]);
  const card = cards[index];

  // Phase 33b/37a QA P2: resume from session. See QuizMode's restore for
  // the full rationale on the `restored` state flag (prevents render-1
  // persist from overwriting the saved session before render-2 restore).
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (restored) return;
    if (reviewMode) { setRestored(true); return; }
    if (!cards || cards.length === 0) return;
    if (domainFilter) { setRestored(true); return; }
    const saved = loadSession(SESSION_KIND.FLASHCARDS);
    if (!saved) { setRestored(true); return; }
    if (saved.tomeId && tomeId && saved.tomeId !== tomeId) { setRestored(true); return; }
    let positioned = false;
    let restoredIndex = 0;
    // Phase 39a: prefer saved.deckIds — reconstructs exact deck order.
    if (Array.isArray(saved.deckIds) && saved.deckIds.length > 0) {
      const byId = new Map();
      for (const item of baseDeck) {
        if (item?.id) byId.set(item.id, item);
      }
      const ordered = [];
      const seen = new Set();
      for (const id of saved.deckIds) {
        const item = byId.get(id);
        if (item && !seen.has(id)) { ordered.push(item); seen.add(id); }
      }
      for (const item of baseDeck) {
        if (item?.id && !seen.has(item.id)) { ordered.push(item); seen.add(item.id); }
      }
      if (ordered.length > 0) {
        setSessionDeck(ordered);
        const wantedIdx = typeof saved.index === 'number' && saved.index >= 0 && saved.index < ordered.length
          ? saved.index : 0;
        setIndex(wantedIdx);
        restoredIndex = wantedIdx;
        positioned = true;
      }
    }
    if (!positioned && saved.cardId) {
      const pos = cards.findIndex(c => c?.id === saved.cardId);
      if (pos >= 0) { setIndex(pos); restoredIndex = pos; positioned = true; }
    }
    if (!positioned && typeof saved.index === 'number' && saved.index >= 0 && saved.index < cards.length) {
      setIndex(saved.index);
      restoredIndex = saved.index;
      positioned = true;
    }
    if (positioned) {
      // Phase 38c: notify the user that resume worked.
      onResumeNotify?.({ kind: 'flashcards', index: restoredIndex, total: cards.length });
    }
    setRestored(true);
  }, [cards, baseDeck, tomeId, reviewMode, domainFilter, restored]);

  // Phase 30b/33b/37a/39a QA P2/P1: persist the current index + card id +
  // deck-order in non-review browse mode. Gated on `restored` so first-
  // render-with-empty-cards doesn't overwrite the saved session.
  useEffect(() => {
    if (!restored) return;
    if (reviewMode || domainFilter) return;
    saveSession(SESSION_KIND.FLASHCARDS, {
      tomeId: tomeId ?? null,
      index,
      cardId: cards[index]?.id ?? null,
      deckIds: cards.map(c => c?.id || null),
    });
  }, [restored, index, tomeId, reviewMode, domainFilter, cards]);

  // 26g: 4-button SRS rating. Schedules the card and advances. In review
  // mode the index runs off the end of the (frozen) deck and we render
  // the "reviews complete" celebration; in browse mode we cycle.
  const rate = (rating) => {
    const xp = rating === SRS_RATINGS.again ? 12 : rating === SRS_RATINGS.hard ? 10 : rating === SRS_RATINGS.good ? 8 : 5;
    awardXP(xp);
    setReviewed(r => r + 1);
    updateTomeProgress((prev) => ({ cardsReviewed: (prev.cardsReviewed || 0) + 1 })); // 17D functional form
    if (card && updateCardProgress) {
      const prev = (tomeProgress?.cardProgress || {})[card.id];
      updateCardProgress(card.id, scheduleCard(prev, rating));
    }
    const totalCardsAcrossLib = playerState.library.reduce((s, t) => s + (t.progress?.cardsReviewed || 0), 0) + 1;
    if (totalCardsAcrossLib >= 50) checkAchievement('card_shark');
    if (totalCardsAcrossLib >= 200) checkAchievement('card_master');
    setFlipped(false);
    if (reviewMode) {
      setIndex(i => i + 1);
    } else {
      setIndex((index + 1) % cards.length);
    }
  };

  // S4: keyboard shortcuts (parity with Quiz/Lab/Exam). Space/Enter flips;
  // 1-4 self-grade when flipped; arrows browse in non-review mode. Ignores
  // keystrokes while focus is in a text field.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!card) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        rate(Number(e.key));
      } else if (!flipped && !reviewMode && cards.length > 0) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); setIndex((index - 1 + cards.length) % cards.length); setFlipped(false); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); setIndex((index + 1) % cards.length); setFlipped(false); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, flipped, reviewMode, index, cards]);

  // 26g: review-mode completion celebration.
  if (reviewMode && reviewDeck.length > 0 && index >= reviewDeck.length) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <div className="p-6 rounded-sm text-center" style={{
          background: 'linear-gradient(135deg, rgba(var(--surface-emerald, 6, 78, 59), 0.5) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
          border: '3px double rgba(16, 185, 129, 0.6)',
          boxShadow: '0 0 30px rgba(16, 185, 129, 0.25), inset 0 0 25px rgba(0,0,0,0.5)',
        }}>
          <div className="text-xs italic tracking-[0.25em] uppercase text-emerald-400 mb-2">⚜ Reviews Complete ⚜</div>
          <div className="text-3xl font-bold italic text-amber-100" style={{ textShadow: '0 0 14px rgba(16, 185, 129, 0.5)' }}>
            {reviewed} scroll{reviewed === 1 ? '' : 's'} reviewed
          </div>
          <div className="text-sm italic text-emerald-200 mt-2">
            The oracle hath rescheduled each. Return on the morrow.
          </div>
        </div>
        <button onClick={() => onExitReviewMode?.()}
          className="w-full py-3 px-4 rounded-sm font-bold italic border-2 border-amber-400 text-amber-100"
          style={{ background: 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.7)' }}>
          <Home className="w-4 h-4 inline mr-2" /> Return Home
        </button>
      </div>
    );
  }

  if (!card) return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {domainFilter && (
        <FilteredModeBanner domainFilter={domainFilter} onExitFilter={onExitFilter} accent="sapphire" />
      )}
      <div className="text-center py-12 text-amber-600 italic">
        {reviewMode
          ? 'No scrolls due for review — return on the morrow.'
          : domainFilter
            ? `No scrolls tagged "${domainFilter}" in this tome. Regenerate the tome with the updated prompt to populate flashcard domains.`
            : 'No scrolls in this tome.'}
      </div>
      {reviewMode ? (
        <button onClick={() => onExitReviewMode?.()}
          className="w-full py-3 px-4 rounded-sm font-bold italic border-2 border-amber-400 text-amber-100"
          style={{ background: 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.7)' }}>
          <Home className="w-4 h-4 inline mr-2" /> Return Home
        </button>
      ) : (
        // Phase 30d QA #7: give the user a way out of an empty study screen
        // beyond the header Hearth (which the QA report noted as easy to miss).
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onExitFilter?.()} disabled={!onExitFilter}
            className="py-3 px-4 rounded-sm italic border-2 border-amber-700 text-amber-200 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}>
            <ArrowLeft className="w-4 h-4 inline mr-2" /> {domainFilter ? 'Clear Filter' : 'Back'}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {domainFilter && (
        <FilteredModeBanner domainFilter={domainFilter} onExitFilter={onExitFilter} accent="sapphire" />
      )}
      {reviewMode && (
        <div className="p-2 rounded-sm text-center text-xs italic"
          style={{ background: 'rgba(29, 78, 216, 0.35)', border: '1.5px solid rgba(59, 130, 246, 0.55)', color: '#bfdbfe' }}>
          ✦ Review mode — {reviewDeck.length} scroll{reviewDeck.length === 1 ? '' : 's'} scheduled for today
        </div>
      )}
      <div className="flex justify-between items-center text-sm text-amber-600 italic flex-wrap gap-2">
        <span className="flex items-center gap-2 flex-wrap">
          📜 Scroll {index + 1} of {cards.length}
          {/* Phase 35c QA P4: per-card difficulty only — the tome-avg
              fallback added in 32e implied false per-item granularity. If
              the per-card rating is missing, no chip is shown. */}
          {typeof card.difficulty === 'number' && <DifficultyStars value={card.difficulty} />}
          {card.bloomLevel && <BloomBadge level={card.bloomLevel} />}
          {card.domain && (
            <span className="text-[10px] italic uppercase tracking-wider text-sky-400" title={`Domain: ${card.domain}`}>
              ✦ {card.domain}
            </span>
          )}
        </span>
        <span>Studied this session: {reviewed}</span>
      </div>
      <div onClick={() => setFlipped(!flipped)} role="button" tabIndex={0} aria-label={flipped ? 'Flashcard answer — Space flips, 1-4 to rate' : 'Flashcard question — Space flips'} className="rounded-sm p-8 min-h-[300px] flex items-center justify-center cursor-pointer transition relative" style={{
        background: 'linear-gradient(135deg, rgba(12, 24, 41, 0.85) 0%, rgba(6, 12, 20, 0.95) 100%)',
        border: '3px double rgba(29, 78, 216, 0.6)', boxShadow: '0 0 30px rgba(59, 130, 246, 0.25), inset 0 0 25px rgba(0,0,0,0.5)',
      }}>
        <div className="text-center">
          <div className="text-xs text-sky-400 tracking-[0.3em] mb-3 italic">{flipped ? '✦ THE ANSWER ✦' : '✦ THE QUESTION ✦'}</div>
          <div className="text-xl text-amber-50 italic leading-relaxed">{flipped ? (card.back || card.definition) : (card.front || card.term)}</div>
          {!flipped && <div className="text-xs text-amber-700 mt-4 italic">~ Touch the scroll to reveal ~</div>}
        </div>
      </div>
      {flipped && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button onClick={() => rate(SRS_RATINGS.again)}
              className="py-3 rounded-sm font-bold border-2 border-red-400 text-red-200 italic"
              style={{ background: 'rgba(127, 29, 29, 0.55)' }}
              title="I forgot completely — show this scroll again soon">
              ⚔ Again
            </button>
            <button onClick={() => rate(SRS_RATINGS.hard)}
              className="py-3 rounded-sm font-bold border-2 border-amber-500 text-amber-200 italic"
              style={{ background: 'rgba(146, 64, 14, 0.55)' }}
              title="Recalled with struggle — short interval">
              ⚔ Hard
            </button>
            <button onClick={() => rate(SRS_RATINGS.good)}
              className="py-3 rounded-sm font-bold border-2 border-emerald-400 text-emerald-200 italic"
              style={{ background: 'rgba(var(--surface-emerald, 6, 78, 59), 0.55)' }}
              title="Recalled with effort — standard interval">
              ⚔ Good
            </button>
            <button onClick={() => rate(SRS_RATINGS.easy)}
              className="py-3 rounded-sm font-bold border-2 border-yellow-300 text-yellow-100 italic"
              style={{ background: 'rgba(120, 90, 8, 0.6)' }}
              title="Instant recall — long interval">
              ⚔ Easy
            </button>
          </div>
          <div className="text-[10px] italic text-amber-700 text-center">
            ✦ The Oracle of Memory schedules each scroll's next visit based on thy rating.
          </div>
        </>
      )}
      {!flipped && !reviewMode && (
        <div className="flex gap-2">
          <button onClick={() => { setIndex((index - 1 + cards.length) % cards.length); setFlipped(false); }} className="flex-1 py-2 rounded-sm border-2 border-amber-700 text-amber-200 italic" style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}>← Prior</button>
          <button onClick={() => { setIndex((index + 1) % cards.length); setFlipped(false); }} className="flex-1 py-2 rounded-sm border-2 border-amber-700 text-amber-200 italic" style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}>Skip →</button>
        </div>
      )}
      {!flipped && reviewMode && (
        <div className="text-[10px] italic text-amber-700 text-center">
          ✦ Review mode — flip every scroll and rate it; the deck advances forward only.
        </div>
      )}
    </div>
  );
}

export default FlashcardsMode;
