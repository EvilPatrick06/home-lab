# PHASE-16 — Devotion "Current Streak" stat honesty + light-theme tome-card chip sweep (round of Lows)

> Authored from [`QA-report-2026-07-15.md`](./QA/completed/QA-report-2026-07-15.md) (automated `scholar-qa-tester` pass against the live GitHub-Pages build `index-BRt729T6.js` / `index-ZUXFOuDd.css`, cross-checked worktree base `e03664fa`; plan authored against `origin/master` `f2300ac8`, 2026-07-15). Screenshot: [`QA/completed/screenshots/light-library-tome-card-dark-chips.png`](./QA/completed/screenshots/light-library-tome-card-dark-chips.png). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md). PLANNING ONLY — this phase authors the plan; no app changes here.

## Goal

The report's two remaining Lows, bundled per the established round-of-Lows pattern (cf. PHASE-11/13/14), one independent sub-phase each:

- **F1 (low, UX) — the Devotion Calendar contradicts itself on a lapsed streak.** The stat card renders the *stored* `loginStreak` raw (`CURRENT STREAK 🔥 2`) while the claim banner, three lines down, correctly derives "Streak broken — start anew at Day 1" from `devotionStatus()`. The stored value is only zeroed on the *next claim*, so the two surfaces disagree for the entire lapsed window.
- **F2 (low, UX) — light theme: the Library tome card keeps three hardcoded dark surfaces** (the ✒️ author/citation chip, the ★ difficulty chip, the emerald duplicate-button) as dark islands on the parchment card — plus the card's *light-ink* siblings (tag chips, subject chip, sealed badge) whose fix was authored as **PHASE-03 03H but never executed** (see below). This sub-phase is the full tome-card sweep the report asks for, and it **supersedes two earlier leave-alone decisions** that this report now shows were wrong on the light theme.

Neither depends on the other; implement in any order. Both are Low; per the autonomy policy these are non-bug `UX` items — board-gate accordingly (the same gate PHASE-11/12's UX rounds cleared).

## Dependencies & cross-phase notes

- **No prerequisite phases.** Independent of PHASE-14 (pending) and PHASE-15. F1 files (`CalendarScreen.jsx`, `devotion.js` + its test) and F2 files (`LibraryScreen.jsx`, `HomeScreen.jsx:370` judgment item, `index.css`, a `__guards__` test) do not overlap.
- **F2 supersedes, deliberately:**
  - **PHASE-03 03H** ("Library tag chips, subject label, sealed badge follow the theme") was amended into PHASE-03 on 2026-06-29 *after* the phase's execution commit `9314885a` landed that morning — the exec commit and the doc's `## Completed (2026-06-29)` section cover 03A-03G only, the doc then moved to `completed/`, and the raw hexes are still in today's tree (`LibraryScreen.jsx:525/:554/:596`). 03H is un-executed shipped-doc debt; F2 carries it rather than reopening a completed phase doc.
  - 03H's step 2 said "leave the author chip and difficulty chip alone — their dark backgrounds stay dark in both themes, so the light text is correct," and PHASE-10 10C's completed notes likewise kept "the two fixed-`#fca5a5` difficulty badges … dark-in-both." Defensible when the *card* was dark too; this report's screenshot shows the outcome on the now-parchment light-theme card: dark leftovers. F2 makes those backgrounds theme-aware (the PHASE-03 var-swap) *and* gives their inks light-theme values (the PHASE-12 ink-var pattern) — both mechanisms already in the codebase.
- F2 follows **PHASE-12's** exact ink-var convention (`--accent-gold-ink`/`--accent-purple-ink`: light-only definitions, no `:root` default, dark falls back to the inline hex byte-for-byte) and reuses those two existing vars where the fallback hex matches.

## Verified findings

All verification read-only against `origin/master` `f2300ac8` (worktree `auto/scholar-phase-maker`). Re-run before implementing (rule 3).

### F1 (low, UX) — stat card shows the stale stored streak while the banner says the streak is broken

**Status: confirmed in source.** `CalendarScreen.jsx` reads the stored value raw for the stat card but derives the banner:

```jsx
// CalendarScreen.jsx
const streak = playerState.loginStreak || 0;               // :11 — stored value, zeroed only on next claim
...
<div className="text-lg font-bold italic text-amber-200">🔥 {streak}</div>   // :77 — stat card, raw
...
const status = devotionStatus({ today, lastClaimedDate: playerState.lastClaimedDate, streak, longest });  // :121 — banner only
...
return `Streak broken — start anew at Day ${cycleDayIdx}.`;                  // :125
```

`devotionStatus` (`src/services/devotion.js:72-78`) returns `'broken'` (gap > 1, `longest >= 2`) or `'lapsedShort'` (gap > 1, short/first streak) precisely when the stored `loginStreak` no longer describes a live streak — the claim path (`computeNextClaim`, `:54-64`) will restart at `willStreak = 1`. So with `loginStreak = 2` and `lastClaimedDate` ≥ 2 days ago, the card says `2`, the banner says broken. Exactly the report.

One derivation trap an executor must not fall into: **`devotionStatus` cannot be applied blindly to the claimed-today case.** When `lastClaimedDate === today`, `dayDiff` is `0` (not `1`), so `devotionStatus` returns `'broken'`/`'lapsedShort'` even though the streak is alive and just claimed — the current code never hits this because the banner IIFE only runs in the `!claimedToday` branch (`:117`). Any shared helper must special-case `claimedToday` first (see 16A).

Also checked: the 7-day-cycle grid's `isPast` (`:157`) uses the raw `streak`, but on a lapse `cycleDayIdx` is `1` so `reward.day < 1` never holds — no visible defect; leave it.

**Root cause:** the stat card skips the `devotionStatus()` derivation the banner uses; the stored `loginStreak` is a claim-bookkeeping value, not a display value, during a lapse.

**Suggested action (report's):** feed the stat card through the same decision — display `0` when lapsed/broken.

### F2 (low, UX) — tome-card chips: three hardcoded dark surfaces + the un-executed 03H light inks

**Status: confirmed in source**, all inline in the tome-card map of `src/features/library/LibraryScreen.jsx`:

| Surface | Line(s) | Today | Light-theme result |
|---|---|---|---|
| ✒️ author/citation chip | `:560-570` | bg `rgba(12, 24, 41, 0.7)` (hardcoded sapphire-dark), ink `#93c5fd` | dark slate chip, white-ish text, on parchment (the screenshot) |
| ★ difficulty chip | `:572-582` | bg `rgba(41, 12, 12, 0.7)` (hardcoded red-dark), ink `#fca5a5` | dark maroon chip; filled/unfilled stars both low-contrast |
| Duplicate (Copy) button | `:771-777` | bg `rgba(12, 41, 27, 0.7)` (hardcoded emerald-dark); text/border via inverting `text-emerald-300`/`border-emerald-700` classes | dark-green button whose *classes* invert to dark ink → dark-on-dark-green |
| 🔒 Sealed badge ink | `:525` | `color: '#d8b4fe'` on token bg `--surface-purple` (lightens) | light lavender on light lavender (03H's finding) |
| 📚 subject chip ink | `:554` | `color: '#d8b4fe'` on token bg `--surface-purple` (lightens) | light-on-light (03H) |
| #tag chips ink | `:596` | `color: '#fcd34d'` on token bg `--surface-amber-strong` (lightens) | light gold on light gold (03H) |

The delete button beside Duplicate is the in-file proof of the fix pattern — it already routes through `rgba(var(--surface-red, 41, 12, 12), 0.6)` (`:783`) and re-themes correctly. Existing tokens/vars (`src/index.css`): `--surface-red: 41, 12, 12` (light `254, 226, 226`) fits the difficulty chip exactly; there is **no** `--surface-*` RGB-triplet for sapphire `12, 24, 41` or deep-emerald `12, 41, 27` (only the composite `--panel-bg-sapphire`/`--panel-bg-emerald` rgba values, light `rgba(219, 234, 254, 0.85)` / `rgba(209, 250, 229, 0.85)` — the light triplets to reuse). PHASE-12's light-only ink vars exist with exactly-matching dark fallbacks for two of the inks: `--accent-gold-ink` (fallback `#fcd34d`) and `--accent-purple-ink` (fallback `#d8b4fe`) (`index.css:118-124`, used today only in `HomeScreen.jsx:360/:402`).

**Same-family sibling (judgment item):** `HomeScreen.jsx:370` — the Active-Tome panel's author pill uses the identical hardcoded `rgba(12, 24, 41, 0.7)` + `#93c5fd` combination on a panel that lightens; PHASE-12 fixed that panel's gold/purple pills but not this sapphire one. Include it in the sweep (same two-var treatment).

Deliberately out of the sweep: `SpellbookScreen.jsx` (`:121/:155/:183`), `ChatMode.jsx:566` (`isSearch` branch), `FlashcardsMode.jsx:356` also contain `12, 24, 41` — those surfaces either already route through `--panel-bg-sapphire` or were intentionally kept dark by PHASE-03 03G (the search bubble keeps fixed light text on a fixed dark bg). Not QA-flagged; do not expand the pass (log if in doubt, cf. PHASE-03's out-of-scope discipline).

**Root cause:** the same Phase-03/41 family as every prior light-theme round — hardcoded dark inline surfaces that predate the token system (chips), plus fixed light inline inks over token-lightening surfaces (the 03H trio), plus one hardcoded dark surface under ramp-*inverting* text classes (Duplicate — the inverse combination).

**Suggested action (report's):** route the chip backgrounds through theme tokens; sweep the tome card for remaining hardcoded dark surfaces.

## Environment facts an executor needs

- **Tests:** `cd dungeon-scholar && npm run test`. `src/services/devotion.test.js` exists (pure-helper suite — extend for 16A). The light-theme static guards live in `src/__guards__/` (`activeTomePanelInk.guard.test.js` is PHASE-12's — the model for a 16B guard; `lightThemeAccentDangerContrast.guard.test.js`, `lightThemeColorRamp.guard.test.js` adjacent). `LibraryScreen.test.jsx` exists for render-level assertions.
- **Contrast targets (WCAG AA 4.5:1).** Suggested light inks (executor verifies with a contrast checker before committing): sapphire ink `#1e40af` (blue-800) on `rgb(219, 234, 254)` ≈ 8:1; red ink `#991b1b` (red-800) on `rgb(254, 226, 226)` ≈ 7:1. Dark theme must stay byte-identical via the no-`:root`-default fallback convention.
- **Lint / typecheck / build:** `npm run lint` (Biome — hand-format touched files, don't repo-wide autofix), `npm run typecheck`, `npm run build` (`VITE_BASE=/home-lab/`). CI gates test + build.
- jsdom/happy-dom cannot resolve CSS-var cascades or `oklch()` — computed-contrast assertions are not tractable (PHASE-03's verified caveat); use static source guards + build + next-deploy visual check instead.

## Sub-phases

One per finding; independent; either order.

### 16A — Stat card renders the *effective* streak via a shared derivation (F1)

**Objective:** on a lapsed/broken streak the stat card shows `🔥 0`, agreeing with the banner; on claimed-today/continuing states it shows the live value unchanged; the derivation is a tested pure helper, not a second inline three-way.

**Files:** `dungeon-scholar/src/services/devotion.js` (new helper + export); `dungeon-scholar/src/features/progression/CalendarScreen.jsx` (`:11` area + `:77`, and hoist the `:121` IIFE's status call); `dungeon-scholar/src/services/devotion.test.js` (extend).

**Steps:**
1. Add the pure display helper next to `devotionStatus` in `devotion.js`, with the claimed-today guard spelled out (the F1 derivation trap):
   ```js
   // PHASE-16 16A: the streak value to DISPLAY. `loginStreak` is claim bookkeeping —
   // it is only zeroed on the next claim, so during a lapse it still holds the dead
   // streak. Claimed-today must short-circuit: dayDiff(today, today) === 0 makes
   // devotionStatus() read a just-claimed streak as 'broken'/'lapsedShort'.
   export const displayedStreak = ({ today, lastClaimedDate, streak = 0, longest = 0 }) => {
     if (lastClaimedDate === today) return streak;
     const status = devotionStatus({ today, lastClaimedDate, streak, longest });
     return status === 'broken' || status === 'lapsedShort' ? 0 : streak;
   };
   ```
2. In `CalendarScreen.jsx`, compute it once near the other derived values (`:9-18`) — `const shownStreak = displayedStreak({ today, lastClaimedDate: playerState.lastClaimedDate, streak, longest });` — and render `🔥 {shownStreak}` in the stat card (`:77`). Leave `streak` itself for `computeNextClaim` (`:18`) and the grid's `isPast` (`:157`) — the claim math must keep seeing the stored value.
3. Optionally (cheap, do it): hoist the banner IIFE's `devotionStatus(...)` call (`:121`) to the same spot so status is computed once; banner copy branches unchanged.
4. "Longest" stat, claim flow, rewards, and `devotionStatus` itself: untouched.

**Verify (read-only, after editing):**
```bash
grep -n 'displayedStreak' dungeon-scholar/src/services/devotion.js dungeon-scholar/src/features/progression/CalendarScreen.jsx
sed -n '70,80p' dungeon-scholar/src/features/progression/CalendarScreen.jsx   # stat card uses shownStreak
```

**Tests:** extend `devotion.test.js` — `displayedStreak` returns: `streak` when `lastClaimedDate === today` (the trap case, e.g. streak 3 claimed today → 3, **not** 0); `streak` when gap === 1 (`continuing`); `0` when gap ≥ 2 with `longest >= 2` (`broken`); `0` when gap ≥ 2 lapsed-short; `0`/`streak` pass-through for `firstEver` (no `lastClaimedDate`, streak 0). A `CalendarScreen` render assertion (lapsed props → stat card text `🔥 0` while banner contains "Streak broken") is a nice-to-have if a screen test is added; the pure-helper coverage is the requirement.

**Acceptance:** lapsed profile shows `CURRENT STREAK 🔥 0` + the broken banner (no contradiction); claimed-today and continuing profiles show the live streak; claim math byte-identical; devotion tests green; lint/typecheck/build clean.

### 16B — Tome-card theme sweep: token the three dark surfaces, ink the 03H trio (F2)

**Objective:** every chip/badge/button on the Library tome card re-themes in light mode with AA-passing text, dark theme byte-identical; the same treatment applied to the `HomeScreen.jsx:370` sibling pill; a static guard pins the result.

**Files:** `dungeon-scholar/src/index.css` (`:root` + `html[data-theme="light"]` blocks); `dungeon-scholar/src/features/library/LibraryScreen.jsx` (`:525`, `:554`, `:560-570`, `:572-582`, `:596`, `:771-777`); `dungeon-scholar/src/features/home/HomeScreen.jsx` (`:370` area); `dungeon-scholar/src/__guards__/` (new or extended guard test).

**Steps:**
1. `index.css` — two new surface triplets (dark defaults == today's hardcoded values; light values == the existing panel-var light tints), plus two new light-only ink vars per the PHASE-12 convention (no `:root` default — dark falls back to the inline hex byte-for-byte):
   ```css
   :root {
     /* PHASE-16 16B: triplets for the last hardcoded-dark tome-card surfaces. */
     --surface-sapphire: 12, 24, 41;        /* author chip, Active-Tome author pill */
     --surface-emerald-deep: 12, 41, 27;    /* Duplicate button (matches --panel-bg-emerald dark) */
   }
   html[data-theme="light"] {
     --surface-sapphire: 219, 234, 254;     /* == --panel-bg-sapphire light tint */
     --surface-emerald-deep: 209, 250, 229; /* == --panel-bg-emerald light tint */
     --accent-sapphire-ink: #1e40af;        /* blue-800 ink on the blue-100 chip */
     --accent-red-ink: #991b1b;             /* red-800 ink on the red-100 chip */
   }
   ```
2. `LibraryScreen.jsx` author chip (`:560-570`): `background: 'rgba(var(--surface-sapphire, 12, 24, 41), 0.7)'`, `color: 'var(--accent-sapphire-ink, #93c5fd)'`. Border `rgba(29, 78, 216, 0.5)` (blue-700) reads on both tints — leave unless the visual check disagrees.
3. Difficulty chip (`:572-582`): `background: 'rgba(var(--surface-red, 41, 12, 12), 0.7)'` (existing token — the delete-button precedent), `color: 'var(--accent-red-ink, #fca5a5)'`. This supersedes PHASE-10 10C's "difficulty badges stay dark-in-both" note — record that in the commit body. The ★/☆ distinction is glyph-shape; restoring ink contrast is the whole fix.
4. Duplicate button (`:771-777`): `background: 'rgba(var(--surface-emerald-deep, 12, 41, 27), 0.7)'`. Its `text-emerald-300`/`border-emerald-700` classes already invert via the light ramp — with the background lightening they become correct automatically; no ink var needed.
5. The 03H trio (carrying the un-executed sub-phase): sealed badge `:525` and subject chip `:554` → `color: 'var(--accent-purple-ink, #d8b4fe)'`; tag chips `:596` → `color: 'var(--accent-gold-ink, #fcd34d)'`. Backgrounds already tokened — inks only (03H's own prescription, PHASE-12's vars, matching fallbacks).
6. `HomeScreen.jsx:370` sibling pill: same treatment as step 2 (`--surface-sapphire` + `--accent-sapphire-ink`).
7. Guard test in `src/__guards__/` (model: `activeTomePanelInk.guard.test.js`): assert `LibraryScreen.jsx` source contains no `rgba(12, 24, 41`, `rgba(41, 12, 12`, `rgba(12, 41, 27` raw surfaces and no raw `color: '#d8b4fe'`/`'#fcd34d'`/`'#93c5fd'`/`'#fca5a5'` in the tome-card region; assert `index.css` defines the two triplets in both blocks and the two inks in the light block only (the byte-identical-dark convention).

**Verify (read-only, after editing):**
```bash
grep -n 'surface-sapphire\|surface-emerald-deep\|accent-sapphire-ink\|accent-red-ink' dungeon-scholar/src/index.css dungeon-scholar/src/features/library/LibraryScreen.jsx dungeon-scholar/src/features/home/HomeScreen.jsx
grep -n "rgba(12, 24, 41\|rgba(41, 12, 12\|rgba(12, 41, 27" dungeon-scholar/src/features/library/LibraryScreen.jsx   # expect only var-fallback forms
```

**Tests:** the new/extended `__guards__` static test (step 7); `LibraryScreen.test.jsx` and the existing guard suites stay green.

**Acceptance:** in light theme the author chip, difficulty chip, and Duplicate button render as light tinted surfaces with dark AA ink (screenshot scenario resolved); tags/subject/sealed inks darken (03H closed); Home Active-Tome author pill matches; dark theme byte-identical (fallback hexes == today's values); guard test green; lint/typecheck/test/build clean.

## Research notes

- **Why F2 carries 03H instead of reopening PHASE-03:** the phase docs are execution units — PHASE-03 moved to `completed/` on its execution commit and reopening completed plans breaks the numeric-order loop. The un-executed amendment is simply work that still exists in the tree; folding it into the same card's sweep costs three `color:` edits and closes the oldest open light-theme thread. Provenance recorded in `PHASE-PROVENANCE.md`.
- **Why backgrounds *and* inks for the two chips (not inks alone):** the report's screenshot shows the design-level problem is the dark *island* on parchment, not just contrast — and the duplicate button proves inks alone can't work here (its ink already inverts and the result is dark-on-dark). The var-swap background + light ink pair is the only combination that resolves all three surfaces consistently, and it is the codebase's established pattern (PHASE-03 03A + PHASE-12).
- **Why `--surface-emerald-deep` instead of reusing `--surface-emerald`:** the existing triplet is `6, 78, 59` — visibly lighter than the button's `12, 41, 27`. The byte-identical-dark convention (every prior phase's acceptance) rules out silently restyling the dark theme to save one variable.
- `displayedStreak` lives in `devotion.js` (not inline in the component) for the same reason `devotionStatus` does — PHASE-02 F5 established that calendar copy/state decisions are tested pure helpers; the claimed-today trap documented in F1 is exactly the kind of edge that belongs under unit tests.

## Test plan

- **Unit (new/extended):** `devotion.test.js` (`displayedStreak` matrix incl. the claimed-today trap); the 16B `__guards__` static test; existing `LibraryScreen.test.jsx` + guard suites unmodified-green.
- **Gate:** `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` (`VITE_BASE=/home-lab/`) — CI parity.
- **Runtime / next-deploy visual check (not CI-gated):** Light theme → `#/library`: author/difficulty chips and Duplicate button render as parchment-tinted chips with dark ink; tags/subject/sealed readable; `#/home` Active-Tome author pill matches; Dark theme visually unchanged on both screens. `#/calendar` with a lapsed save: stat card `🔥 0` + broken banner; claim once → stat card `🔥 1`.

## Acceptance criteria

1. Lapsed-streak calendar shows `CURRENT STREAK 🔥 0` while the banner shows the broken/new-dawn copy — no contradictory pair; claimed-today and continuing streaks display unchanged; claim math untouched.
2. `displayedStreak` is a tested pure export of `devotion.js` handling claimed-today, continuing, lapsed-short, broken, and first-ever.
3. All six F2 surfaces re-theme in light mode with ≥4.5:1 text contrast; dark theme is byte-identical (inline fallbacks equal today's hexes/rgba values).
4. The two superseded leave-alone decisions (03H step 2, PHASE-10 10C difficulty-badge note) are recorded as superseded in the commit body; 03H's trio is closed.
5. A `src/__guards__/` static test pins the absence of the raw dark surfaces/inks in the tome-card region and the presence of the token definitions.
6. `npm run lint` + `npm run typecheck` + `npm run test` + `npm run build` clean.

## Out of scope

- **The Supabase outage pair** (report §6 + top findings) — PHASE-15.
- **Spellbook / Chat-search / Flashcards sapphire surfaces** — intentionally dark or already panel-var-routed, not QA-flagged; not expanded here (log first if a later pass flags them).
- **The gold gradient action buttons + rarity badges** — pre-existing `ISSUES-LOG-DUNGEON-SCHOLAR.md` entry (~line 199), separate cross-cutting concern.
- **Streak-freeze "wards"** (`evaluateStreakFreeze` has no production callers) — already logged 2026-07-15 in `ISSUES-LOG-DUNGEON-SCHOLAR.md` by the errors agent; a feature-wiring matter, not this display fix.
- **The report's "Could not test" surfaces** (mutating flows, OAuth, responsive matrix, PWA-offline, Oracle round-trip, sealed end-to-end) — QA-environment blockers, not findings.
