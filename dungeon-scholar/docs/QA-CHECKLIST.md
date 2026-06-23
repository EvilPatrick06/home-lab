# Dungeon Scholar — Manual QA Checklist

Covers the flows that can't be exercised by the automated vitest suite (visual,
responsive, real-network, real-OAuth, full interactive runs) plus the two
feature surfaces added in PHASE-41 (sealed tomes, full light theme). Automatable
flows are covered by tests — see PHASE-41 41G (`deleteAccount`, offline recovery,
120-tome library, devotion claim, ascension + celestial spend, stable/bestiary,
tome deletion, delve-setup unlock predicate).

Origin: Phase-30 QA "couldn't test" list (2026-05-17) + the 2026-06-10 audit
(F3 sealed tomes, QA16 light theme). Re-run before a release that touches
dungeon-scholar.

## Responsive layout
- [ ] **375 px (mobile portrait):** header wraps without overflow; mode-card grid collapses to one column; the practice-exam timer stays visible while scrolling; modals fit the viewport (no horizontal scroll).
- [ ] **768 px (tablet):** mode-card grid is 2–3 columns; library rows + per-tome action buttons don't clip; the dungeon canvas scales to width.

## Authentication (real OAuth)
- [ ] From a signed-out browser, **Sign in with GitHub** completes the real OAuth round-trip and returns to the app signed in (cloud sync enabled).
- [ ] Installed-PWA (iOS) sign-in: the app prompts for GitHub credentials once inside the standalone app even if Safari is signed in, then persists across launches (documented platform behavior).

## Offline / sync (real network loss)
- [ ] DevTools → Network → Offline, edit progress → status shows `saving` → retries → `offline`; reconnect → sync recovers to `idle` and the cloud row updates. (Backoff/flip logic is unit-tested; this verifies the real-network UX.)
- [ ] Full local study (flashcards, quiz, practice exam, dungeon delve) works with the network fully offline after first load (PWA shell cached).

## Dungeon Delve — full run (apprentice)
- [ ] Enter a delve: movement, a mob battle, an elite, a boss kill, the run-summary screen, and a Chronicle/run-history entry all work end to end. **Note: curses/modifiers are vestigial — nothing to test there** (logged in `docs/logs/ISSUES-LOG-DUNGEON-SCHOLAR.md`).
- [ ] Stable equip effects inside a delve: an equipped owl's XP bonus and a dragon's shield apply as described.

## Daily Devotion
- [ ] Claim across a real midnight boundary: the claim is allowed once per day, `loginStreak` increments across consecutive days and resets after a skipped day.

## Library at scale
- [ ] 100+-tome library scrolls smoothly; switching the active tome is responsive; the active tome's content loads correctly.
- [ ] Local tome deletion, including deleting the **active** tome (active re-points to a remaining tome; deleting the last clears the active tome).

## Sealed tomes (PHASE-41 F3) — end to end
- [ ] Library → Share → **Seal for proctored use**: enter a passphrase (+ confirm), Seal & download → a `*-sealed.json` file downloads; the working library copy is unchanged.
- [ ] Import the sealed file into a **fresh profile** (clear localStorage first): it appears with a 🔒 Sealed badge and shows section counts.
- [ ] Open any study mode on the sealed tome → the unlock gate appears. Wrong passphrase → "the seal holds" error, stays locked. Correct passphrase → unlocks; flashcards/quiz/lab/chat/exam/delve all work and the Oracle gets the knowledge base.
- [ ] Refresh the page → the tome re-locks (unlock state is memory-only).
- [ ] DevTools → Application → Local Storage: the saved blob contains **no** plaintext question/answer/explanation/knowledge-base text for the sealed tome.

## Light theme (PHASE-41 QA16) — visual pass
Switch to Light (Home → Visual Theme → ☀ Light) and visually scan every screen for dark-on-dark / light-on-light artifacts, unreadable text, or invisible borders:
- [ ] Home, Library, Shop, Inventory, Crafting, Bestiary, Stable, Spellbook, Calendar, Ascension, Run History, Quests, Domain Study.
- [ ] All study modes: Flashcards, Quiz, Lab, Chat, Mistake Vault, Practice Exam, Dungeon Delve.
- [ ] Every modal (share/import/paste/metadata, notes, sealed-tome gate, reset/confirm, achievements/titles, account panel) and the tutorial panel.
- [ ] Focus rings are visible on light surfaces (Tab through buttons/inputs); the skip-link is legible.
- [ ] Switch back to Dark → everything is unchanged from before (dark is the default and byte-identical).
