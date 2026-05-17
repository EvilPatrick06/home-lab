# dungeon-scholar Suggestions Log

> **Future ideas, design gotchas (warnings for future contributors), and notable observations — dungeon-scholar domain only.**
>
> Sibling logs:
> - dnd-app suggestions → [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
> - BMO suggestions → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - dungeon-scholar active bugs / debt → [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md)
> - dnd-app active bugs / debt → [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - Resolved dungeon-scholar entries → [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Triage rule:** `Domain: dungeon-scholar` design-gotchas / future-ideas / info → here. `Domain: both` entries that meaningfully apply to dungeon-scholar behavior → mirrored here AND in the other relevant suggestions log. Cross-tooling rules that touch dungeon-scholar contributors → here (and mirror in another file if it touches them too).

New entries go at the TOP of their section (newest first).

---

# Future ideas

### [2026-05-12] F6 — Offline-first PWA + background sync

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** Audio is procedural (already offline). Tomes are bundled. The only thing keeping this from being an installable PWA is the missing `manifest.json` + service worker. Big quality-of-life win for "study on the train" use case.

**Proposed scope:**
- [ ] Add `manifest.json` (theme color, icons, scope `/<repo>/`)
- [ ] Service worker for static-asset caching (vite-plugin-pwa is the obvious pick)
- [ ] Cache tome JSON files for offline reading
- [ ] `apple-mobile-web-app-capable` meta tags
- [ ] iOS install instructions in README

**Related files:** `dungeon-scholar/index.html`, `dungeon-scholar/vite.config.js`, new `dungeon-scholar/public/manifest.json` + icons. Phase 27l will cover this.

---

### [2026-05-12] F5 — Per-tome RLS-encrypted personal notes

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** A "scribble notes per question" feature that syncs but is encrypted-at-rest with a passphrase distinct from the OAuth session. Lets power users keep private study notes without trusting Supabase staff or the deploying maintainer.

**Effort:** Medium. Needs WebCrypto-derived key (PBKDF2 from passphrase), local key cache, per-tome encrypted payload, UI for passphrase set / unlock. Out of scope for Phase 27 — deferred.

**Related files:** `dungeon-scholar/src/services/cloudSync.js`, new `dungeon-scholar/src/services/notesCrypto.js`

---

### [2026-05-12] F4 — First-class browser router + deep-linkable tome IDs

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** App currently routes via `useState` (`setScreen('quests')`). Browser back exits the app or hits GH Pages 404. Useful for sharing a specific tome's quiz / lab via URL, browser back / forward, "open in new tab". Subsumes L12 (back button) once shipped.

**Effort:** ~1 day with `wouter` or hand-rolled `history.pushState` + `popstate`. Phase 27k will cover this.

**Related files:** `dungeon-scholar/src/App.jsx` (the `screen` state + every `setScreen(...)` site)

---

### [2026-05-12] F3 — Server-side / encrypted tome option for proctored exam-prep

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** For users who legitimately need the answer keys hidden from `view-source`. Could be a paid SaaS tier, a self-hosted Supabase function that serves tomes via authenticated endpoint, or a tome-encryption scheme keyed off the user's Supabase JWT.

**Effort:** Large. Needs backend, key management, anti-prefetch. Out of scope for Phase 27.

**Related files:** `dungeon-scholar/src/services/persistence.js`, new server-side function, the tome JSON schema (would need a "sealed" variant)

---

### [2026-05-12] F2 — Break up `App.jsx` (9,278 lines) into feature modules

- **Category:** future-idea, debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** Long-term debt — the polish log already mentions code-splitting the modes. F2 goes further: extract per-feature modules so each screen owns its own state + hooks + tests, with App.jsx reduced to a thin shell.

**Proposed scope:**
- [ ] Extract feature modules per screen: `features/Library/`, `features/Shop/`, `features/Bestiary/`, `features/Dungeon/`, …
- [ ] Lift `playerState` into a Zustand store or React Context to drop prop drilling
- [ ] Co-locate tests with each module

**Effort:** Multi-phase. Phase 27m will scaffold (extract first 2–3 modes); full split is its own multi-phase plan.

**Related files:** `dungeon-scholar/src/App.jsx`

---

### [2026-05-05] Code-split the major study modes (FlashcardsMode/QuizMode/LabMode/ShopScreen/RunHistoryScreen)

- **Category:** future-idea, performance
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 24 polish post-mortem

**Description:** The Phase 24 vendor split + DungeonExplore lazy-load took the main app chunk from 624 KB → 386 KB (under the 500 KB warning). The five biggest in-bundle components — `FlashcardsMode`, `QuizMode`, `LabMode`, `ShopScreen`, `RunHistoryScreen` — still ship in the main chunk. Splitting them further would cut initial load for users who land on the home screen or navigate to a non-mode route (Stable, Spellbook, Calendar, Bestiary).

**Why it's a planned future task, not an active blocker:** Current main chunk is 387 KB gzipped 104 KB — the warning is gone, the page is fast. The split is worth doing once a single mode component crosses ~80 KB (DungeonExplore's threshold for lazy load) or when adding a new heavy mode. We have the infrastructure already (`React.lazy` + `Suspense` is already used for DungeonExplore).

**Proposed fix (when scheduled):**
- [ ] Extract each of `FlashcardsMode`, `QuizMode`, `LabMode`, `ShopScreen`, `RunHistoryScreen` into `src/components/<name>.jsx` files (they currently live inline in `App.jsx`)
- [ ] Convert each import to `React.lazy(() => import('./components/<name>.jsx'))`
- [ ] Wrap each `screen === '<mode>' && courseSet && ...` render in a small `<Suspense fallback={...}>` block (mirror the DungeonExplore pattern)
- [ ] Verify `npm run build` chunk-size report shows 5 new chunks roughly proportional to each mode's responsibility
- [ ] Confirm 167 tests still pass — the modes share state via prop drilling, so extraction should be a near-mechanical move

**Related files:** `dungeon-scholar/src/App.jsx` (mode component definitions + screen routing block), `dungeon-scholar/vite.config.js` (manualChunks split is already in place — no change needed there), `dungeon-scholar/docs/PHASE-24-POLISH.md` (the deferred-polish entry that already names this work)

**Note:** This is F2's spiritual sibling and will partly land naturally as part of F2.

---

# Low-severity polish / info

### [2026-05-12] L18 — Tests missing for cloudSync conflict-resolution branches

- **Category:** debt, info
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

`usePlayerState.test.jsx` covers the basics but not the `wasDirty && cloudTime > lastSyncTime` (forced chooser) path or the Realtime echo dedup behavior. Both are correctness-critical for the cloud-sync feature. Phase 27h.

**Files:** `dungeon-scholar/src/hooks/usePlayerState.test.jsx`

---

### [2026-05-12] L17 — Empty-state messages have no next-action CTA

- **Category:** UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

E.g., `App.jsx:4412` "No riddles in this tome." gives users no next step. New users with a freshly-imported empty tome get stuck. Should offer "Import another tome" / "Open the Spell of Tome Creation" CTA per empty state. Phase 27j.

**Files:** `dungeon-scholar/src/App.jsx` (empty-state branches across Flashcards/Quiz/Lab/etc.)

---

### [2026-05-12] L16 — Audio defaults to muted but no visible un-mute prompt for new users

- **Category:** UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

Audio is delightful (procedural BGM + SFX) but most users never discover it because it's silent on first load and the mute control is buried in settings. A one-time inline "🔊 Wake the bards?" banner on first home-screen render would surface the feature. Phase 27j.

**Files:** `dungeon-scholar/src/audio/sound.js`, `dungeon-scholar/src/App.jsx` (home screen)

---

### [2026-05-12] L15 — Quiz/Flashcard `cardsProp`/`questionsProp` arrays not defensively copied

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

Parent doesn't mutate them today, but a defensive `.slice()` at mount costs nothing and prevents a class of future bugs. Phase 27c.

**Files:** `dungeon-scholar/src/App.jsx:4139, 4325` (approximate, FlashcardsMode + QuizMode mount sites)

---

### [2026-05-12] L14 — No size cap on imported tome JSON before `JSON.parse`

- **Category:** UX, performance
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

A 50 MB pasted JSON freezes the main thread on parse. `if (raw.length > 2_000_000) reject(...)` would catch the obvious cases. Phase 27c.

**Files:** `dungeon-scholar/src/App.jsx` (import-tome handler, approx line 2564)

---

### [2026-05-12] L12 — No browser back-button integration

- **Category:** UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

Routing is `useState`-based (`setScreen('quests')` etc.). Browser back exits the app or hits the GH Pages 404 page. Most users will hit this once per session.

**Note:** Subsumed by F4 (router) when that lands. Phase 27k will fix both at once.

**Files:** `dungeon-scholar/src/App.jsx`

---

### [2026-05-12] L11 — No service worker / PWA manifest

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

App could be installable + offline-first. No `manifest.json`, no `theme-color`, no `apple-mobile-web-app-*` meta.

**Note:** Subsumed by F6 (PWA). Phase 27l.

**Files:** `dungeon-scholar/index.html`, new `manifest.json`

---

### [2026-05-12] L8 — `src/audio/sound.js` AudioContext is never explicitly closed

- **Category:** performance, portability
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

When the page hides for an extended period, the AudioContext is suspended (browser-managed) but not closed. Negligible RAM on desktop; on iOS it can prevent the audio thread from sleeping which costs battery. Phase 27g.

**Files:** `dungeon-scholar/src/audio/sound.js`

---

### [2026-05-12] L5 — Exam timer has no `aria-live` announce

- **Category:** UX, a11y
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

Countdown ticks visually but doesn't announce. The "lowTime" pulse is purely visual. Phase 27e.

**Files:** `dungeon-scholar/src/components/ExamMode.jsx:218–243`

---

### [2026-05-12] L4 — Notification toast has no `aria-live`

- **Category:** UX, a11y
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

Score updates, XP gains, achievement unlocks fire silently for screen-reader users. Wrap the toast container in `role="status" aria-live="polite"`. Phase 27d.

**Files:** `dungeon-scholar/src/App.jsx:2672–2682`

---

### [2026-05-12] L3 — Lucide icons rendered without `aria-hidden="true"`

- **Category:** UX, a11y
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

Throughout App.jsx and components. Decorative icons make screen readers double-announce ("Trophy hall of glory trophy"). Add `aria-hidden="true"` to all purely decorative icons. Phase 27e.

**Files:** all `<Icon ... />` usages across `src/`

---

### [2026-05-12] L2 — No keyboard shortcuts for quiz answer selection

- **Category:** UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

1/2/3/4 for MC, T/F for TF — would speed power users dramatically. Phase 27j.

**Files:** `dungeon-scholar/src/App.jsx:4486–4498` (MC/TF buttons in QuizMode)

---

### [2026-05-12] L1 — Header buttons have ~36×36 px tap targets (WCAG 2.5.5 wants ≥44×44)

- **Category:** UX, a11y
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

`p-2` with `w-5 h-5` icons → ~36×36 hit area. `p-3` (12 px padding → 44 px outer) fixes it. Phase 27d.

**Files:** `dungeon-scholar/src/App.jsx:2717–2769`

---

# Design gotchas (warnings for future agents)

*(none currently logged)*

---

> dungeon-scholar active bugs / debt: [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md). Resolved dungeon-scholar entries: [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md).
