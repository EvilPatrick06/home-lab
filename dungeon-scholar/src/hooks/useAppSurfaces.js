import { useState } from 'react';

// App-level "surface" state — the cluster of per-surface open/close + filter
// flags that used to live as scattered useState calls in the App.jsx
// God-component. Grouped here (next to useAppModals) so the shell stays a thin
// orchestrator and this state becomes unit-testable. Semantics are unchanged:
// these are independent values, never mutually exclusive.
export function useAppSurfaces() {
  // Pending in-app confirmation dialog payload (null = none).
  const [pendingConfirm, setPendingConfirm] = useState(null);
  // When the tutorial action-button opens a surface, remember which one so we
  // can flip the matching tutorialVisits flag once the player navigates back /
  // closes the modal. null when no tutorial-driven surface is open.
  const [tutorialOpenedSurface, setTutorialOpenedSurface] = useState(null);
  const [shareTomeId, setShareTomeId] = useState(null);
  const [editMetadataTomeId, setEditMetadataTomeId] = useState(null);
  const [editContentTomeId, setEditContentTomeId] = useState(null);
  // Phase 40F: tome whose encrypted private notes are open (null = closed).
  const [notesTome, setNotesTome] = useState(null);
  // PHASE-41 41B: decrypted sealed-tome content keyed by tomeId. This map is
  // NEVER written into playerState — so decrypted content never reaches
  // localStorage or Supabase. That in-memory-only lifetime IS the security
  // property: a hard refresh, sign-out, or process exit re-locks every tome.
  const [unsealedTomes, setUnsealedTomes] = useState({});
  // 25e2: Domain Study screen launches Quiz/Flashcards filtered by a single
  // domain string. Cleared on navigation away from quiz/flashcards so it
  // doesn't carry over into a fresh, unfiltered run.
  const [domainFilter, setDomainFilter] = useState(null);
  // 26g: when true, FlashcardsMode scopes the deck to due cards (FSRS
  // scheduling). Reset on every navigation away from the flashcards screen.
  const [reviewMode, setReviewMode] = useState(false);
  return {
    pendingConfirm,
    setPendingConfirm,
    tutorialOpenedSurface,
    setTutorialOpenedSurface,
    shareTomeId,
    setShareTomeId,
    editMetadataTomeId,
    setEditMetadataTomeId,
    editContentTomeId,
    setEditContentTomeId,
    notesTome,
    setNotesTome,
    unsealedTomes,
    setUnsealedTomes,
    domainFilter,
    setDomainFilter,
    reviewMode,
    setReviewMode,
  };
}
