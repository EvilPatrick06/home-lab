# PHASE-10 — Light-theme accent-text & danger-button contrast (Phase-03/41 ramp residue)

> Authored from [`QA-report-2026-06-29-4.md`](./QA/completed/QA-report-2026-06-29-4.md) (automated `scholar-qa-tester` pass against the live GitHub-Pages SPA build `index-Bht36BpW.js` — the post-`auto/scholar-phase-executer`-merge redeploy, newer than run-3's `index-CkFA4t7H.js` — cross-checked `origin/master` `5d4fd982` / last dungeon-scholar src commit `2269c923`, 2026-06-29). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md). PLANNING ONLY — this phase authors the plan; no app changes here.

## Goal

Run-4 found **no Critical/High**. Its two highest-impact items are both Medium, both Light-theme contrast, and both are *residue of the Phase-03/Phase-41 light-theme work that the earlier dark-on-dark sweeps did not reach*:

- **F1 (Medium) — pervasive low-contrast accent / stat *text* on light surfaces, led by the app-wide player-stats header.** The persistent "EXPERIENCE / VICTORIES / DELVES / DRAGONS / Level N • Total XP" strip renders on **every one of the 21 screens**; in Light theme its small-caps labels measure **~1.39:1** (gold `rgb(255,210,48)` on parchment `rgb(250,250,249)`). The same root cause washes out the Inventory equipment-slot/secondary labels, the Shop "gold" / secondary labels, and the Bestiary biome headings (2.0–3.5:1, several below the 3.0 large-text floor). This is the *light-on-light accent-text* surface — distinct from the *dark-on-dark backgrounds* PHASE-03 fixed and from the gold action **buttons** already tracked in `ISSUES-LOG-DUNGEON-SCHOLAR.md`.
- **F2 (Medium) — the "Begin Anew" reset button is dark-on-dark in Light theme** (~1.1:1): it hardcodes `background: rgba(41, 12, 12, 0.7)` (a fixed *dark* brown) under inverting red text, the exact pattern `DESIGN-CONSTRAINTS.md` §Phase-03 forbids — a remaining instance the Phase-03 `background-color` grep missed because the literal is an *inline-style* `background`, not a Tailwind `bg-*` class.

Both are the same family the project has fixed before (PHASE-03: "Light-theme surfaces must route through theme vars — *and the text must darken too*"), but on **new surfaces**. F1's fix darkens the *text* (a new theme-aware muted-label token, because no single Tailwind ramp position is dark-ink in *both* themes once Phase-41 inverted the ramp). F2's fix lightens the *background* (route the hardcoded `rgba(41,12,12,…)` through the existing `--surface-red` var Phase-03 already defined). Dark theme — the default — is unaffected throughout.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Independent of PHASE-10's sibling round (PHASE-11) and of the open backlog; run by severity (both Medium → this phase before PHASE-11's Lows).
- **Builds on completed PHASE-03 (`completed/PHASE-03-light-theme-dark-on-dark-contrast.md`) and the Phase-41 ramp inversion** (`src/index.css` `html[data-theme="light"]` `--color-*` overrides). PHASE-03 is *done*; this phase does not reopen it — it extends the same documented pattern to surfaces PHASE-03's two greps (dark `bg-*`/`rgba()` backgrounds, and the F5/F6 inline-hex *text* on Chat bubbles + Library tag chips) did not enumerate. Cite `DESIGN-CONSTRAINTS.md` §"Light-theme surfaces must route through theme vars (Phase 03)" as the governing rule.
- **Already covered — do NOT re-file under F1.** The report's F1 list also names the **Library tome-tag chips** (`#sociology`, …). Those are **PHASE-03 F6 / sub-phase 03H** (done) — the same theme-aware-lightening-pill + non-inverting accent-text family, already fixed by inverting the chip text. Re-confirmed here, not re-authored. The **gold action buttons** ("Inscribe a Tome", "Open Tome", "Continue Studying") and the **rarity badges** ("★ LEGENDARY ★", "★ ACTIVE") are CSS-gradient-backed (the report's compositor flagged them ~1.0–1.4 *approximate*); the gold-action-button variant is already in `docs/logs/ISSUES-LOG-DUNGEON-SCHOLAR.md` (~line 199). This phase does **not** touch gradient-backed buttons/badges — only the flat accent **text** surfaces F1 enumerates beyond them.
- **Shared file with PHASE-11:** none. PHASE-10 edits `src/index.css`, `src/App.jsx`, and three `features/progression/*` screens; PHASE-11 edits routing/study/quests files. No overlap.
- **`src/index.css` is the single theme-token home.** New tokens go in the `:root` block next to the existing `--surface-*` / `--panel-bg-*` definitions, with the `html[data-theme="light"]` override directly below — matching the established two-block pattern (default dark value as inline-style fallback, light override under the attribute selector). Do **not** alter the Phase-41 `--color-amber-*` ramp itself (it is correct for surfaces and bright-accent inversion; changing it would regress everything that legitimately darkens).

## Verified findings

All verification was performed read-only against the live tree at `origin/master` (worktree `auto/scholar-phase-maker`). Re-run each block before implementing (INSTRUCTIONS rule 3 — line numbers drift).

### F1 (medium, bug/contrast) — Light-theme accent/stat *text* washes out on light surfaces; app-wide player-stats header is the highest-impact instance

**Status: confirmed in source. Root cause: the Phase-41 ramp inversion brightens `text-amber-700` (and unconverted inline-hex accents) on the very labels that must stay dark ink.**

The mechanism, confirmed in `src/index.css`: Phase-41 (`html[data-theme="light"]`) inverts the Tailwind amber ramp so a *low* index resolves to dark ink and a *high* index resolves to bright gold:

```css
/* src/index.css, html[data-theme="light"] block */
--color-amber-200: oklch(47.3% 0.137 46.201);  /* dark brown — good on light */
--color-amber-700: oklch(87.9% 0.169 91.605);  /* ≈ rgb(255,210,48) BRIGHT gold — bad on light */
```

`oklch(0.879 0.169 91.605)` is **exactly** the `rgb(255,210,48)` the report measured at ~1.39:1. The defect: small-caps *label* text was authored with `text-amber-700` (a muted brown-gold in the **dark** theme), so the inversion pushes it *brighter* on light parchment — the wrong direction. Surfaces, all confirmed:

- **App-wide player-stats header (every screen) — `src/App.jsx`.** The persistent strip's labels and meta line use `text-amber-700`:
  - `App.jsx:1762` `<span className="text-amber-700 tracking-widest">EXPERIENCE</span>`
  - `App.jsx:1757` `⚔ Level {playerState.level} • {…} Total XP ⚔` inside `<div className="text-xs text-amber-700 tracking-wider">`
  - `App.jsx:1804 / :1817 / :1830` `VICTORIES` / `DELVES` / `DRAGONS` each `<div className="text-xs text-amber-700 tracking-wider">`
  - The compact (non-home) header variant repeats it: `App.jsx:1854` `EXPERIENCE` inside `text-[10px] text-amber-700`.
  - (The numeric stat *values* are `text-emerald-400` / `text-purple-400` / `text-red-400` — those ramps invert to dark-enough ink and are **not** the failing surface; the EXPERIENCE `xp / xpNeeded` value is `text-amber-400` → `oklch(66.6%)`, borderline, fold in.)
- **Inventory — `src/features/progression/InventoryScreen.jsx`.** Category section count + secondary labels use `text-amber-700` / `text-amber-700/60` (`:65`, `:85-88`); the slot labels (`Weapon`/`Head`/`Cloak`/`Pet`, `SLOTS` at `:38-43`) render through the same muted-label styling. (The category *headings* themselves are `text-amber-200` → invert to dark ink, already fine — leave them.)
- **Shop — `src/features/progression/ShopScreen.jsx`.** The "gold" unit label `:93` `text-amber-700`, the empty-hall notice `:124` `text-amber-700`, and corner glyphs `:172-175` `text-amber-700/60`. (Headings `text-amber-200`/`:71` are fine.)
- **Bestiary biome headings — `src/features/progression/BestiaryScreen.jsx`.** Two distinct sub-cases: (a) the "found" count `:96` `text-amber-700`; (b) the biome `<h3>` at `:90-94` colors itself with an **inline fixed hex** `style={{ color: meta.accent }}` (`BIOME_LABELS` accents, default `#fbbf24`) that does **not** invert at all → the 2.0–3.5:1 readings. This is the inline-hex-accent variant (cf. PHASE-03 F5 Chat bubbles), not a ramp-class case.

```bash
# the ramp inversion that brightens amber-700 in light theme
sed -n '/html\[data-theme="light"\]/,/--color-amber-700/p' dungeon-scholar/src/index.css | grep 'amber-700'
# every player-stats-header label (App.jsx) + the failing accent-text surfaces
sed -n '1755,1860p' dungeon-scholar/src/App.jsx | grep -n 'text-amber-700\|text-amber-400'
grep -n 'text-amber-700' dungeon-scholar/src/features/progression/InventoryScreen.jsx dungeon-scholar/src/features/progression/ShopScreen.jsx dungeon-scholar/src/features/progression/BestiaryScreen.jsx
sed -n '84,99p' dungeon-scholar/src/features/progression/BestiaryScreen.jsx   # biome <h3> inline meta.accent hex
```

**Why a new token (not a ramp tweak):** in dark theme these labels want a muted brown-gold (`amber-700` ≈ `#b45309`); in light theme they want dark ink. After Phase-41 inverted the ramp, **no single `text-amber-N` index is dark in both themes** — `amber-700` is dark in dark / bright in light, `amber-200` is bright in dark / dark in light. So the only correct fix is a dedicated theme-aware token whose value is set per theme, exactly as `DESIGN-CONSTRAINTS.md` prescribes ("route through theme vars; the text must darken too").

**Suggested action (report's):** "Accent text on a surface that lightens in Light theme must darken too (inverting the theme token)." Introduce one shared muted-accent-label token; convert the enumerated label surfaces to it; darken the Bestiary inline-hex biome headings in light theme.

### F2 (medium, bug/contrast) — "Begin Anew" reset button is dark-on-dark in Light theme (hardcoded `rgba(41,12,12,0.7)` background)

**Status: confirmed in source. A textbook PHASE-03 dark-on-dark instance the original grep missed (inline `background`, not `bg-*`).**

`src/features/home/HomeScreen.jsx` renders the reset control twice (two layout branches) with a hardcoded dark background:

```jsx
// HomeScreen.jsx:250 and :618 (the two "Begin Anew" buttons)
style={{ background: 'rgba(41, 12, 12, 0.7)' }}
aria-label="Begin Anew — permanently erases all local progress (a confirmation dialog will appear)"
… <RotateCcw … /> Begin Anew
```

In Light theme `rgba(41,12,12,0.7)` composites to ~`rgb(104,83,83)` (dark brown) over the light page, while the label inverts to deep red `oklch(0.505 0.213 27.518)` ≈ `rgb(193,0,7)` → composited ≈ **1.1:1**, nearly invisible. `src/index.css` already defines the fix token from PHASE-03:

```css
:root              { --surface-red: 41, 12, 12; }      /* dark default = today's literal */
html[data-theme="light"] { --surface-red: 254, 226, 226; }  /* light pink */
```

So `background: 'rgba(var(--surface-red, 41, 12, 12), 0.7)'` keeps Dark identical and lightens Light to pink — deep-red-on-pink clears AA. The same fixed literal appears on sibling surfaces (`HomeScreen.jsx:334`, `LibraryScreen.jsx:576`, and the `rgba(41,12,12,0.6)` variants in `TomeNotes.jsx:315`, `LibraryScreen.jsx:783`, `ChatMode.jsx:432`, `LabMode.jsx:434`, `QuizMode.jsx:868`); they carry the identical Phase-03-forbidden risk, so the same one-token sweep applies (the report visually confirmed only "Begin Anew"; the rest are converted for the same documented reason, each spot-checked in both themes).

```bash
# the named control + every sibling hardcoded dark-red inline background
grep -rn "rgba(41, 12, 12" dungeon-scholar/src --include=*.jsx
sed -n '246,256p;614,624p' dungeon-scholar/src/features/home/HomeScreen.jsx   # the two Begin Anew buttons
grep -n 'surface-red' dungeon-scholar/src/index.css                          # the existing PHASE-03 token
```

**Suggested action (report's):** "Route the button background through the theme vars (`--surface-red` / a danger token) so it lightens in Light theme and the label keeps AA contrast."

### Environment facts an executor needs

- **Tests:** `cd dungeon-scholar && npm run test` (`vitest run`, happy-dom + `@testing-library/react`). Contrast/theme rendering is CSS-var driven and not unit-asserted today; the meaningful guard is (a) a JSDOM test that the converted JSX no longer contains the hardcoded literal / failing class, and (b) the manual two-theme spot check below. Do **not** invent a brittle computed-contrast unit test against happy-dom (it does not parse `oklch()` — the same limitation the report's scanner hit).
- **Lint / typecheck / build:** `npm run lint` (Biome), `npm run typecheck` (`tsc --noEmit`, checkJs at 0 errors — keep clean), `npm run build` (must pass `VITE_BASE=/home-lab/`). CI (`dungeon-scholar-ci.yml`) gates test + build on push.
- React 19, Tailwind v4 (`@import "tailwindcss"`), plain JSX, `type: "module"`. Theme is `html[data-theme="light"|"dark"]`; default/dark is the untouched baseline.
- **Manual two-theme check is the authoritative acceptance gate** (the report's own methodology): toggle Home → Visual Theme → ☀ Light, then visit Home/Library/Shop/Inventory/Bestiary and confirm the labels + reset button are legible; toggle back to Dark and confirm pixel-identical to before.

## Sub-phases

Order: 10A lands the shared token + the highest-impact surface (the all-screens header); 10B extends it to the three progression screens incl. the inline-hex biome headings; 10C is the independent F2 background sweep. Each is independently shippable and leaves the tree green.

### 10A — Theme-aware muted-accent-label token; convert the app-wide player-stats header (F1, highest impact)

**Objective:** one shared token renders dark-ink in Light theme and today's muted brown-gold in Dark; the persistent player-stats header (on all 21 screens) uses it instead of `text-amber-700`, so the single highest-impact instance clears AA in Light with Dark unchanged.

**Files:**
- `dungeon-scholar/src/index.css` — add `--text-accent-muted` (dark default + light override) next to the `--surface-*` block.
- `dungeon-scholar/src/App.jsx` — the player-stats header label/meta sites (`:1757`, `:1762`, `:1804`, `:1817`, `:1830`, `:1854`; and the borderline `text-amber-400` xp value `:1764` — fold in or leave per the contrast check).

**Steps:**
1. In `src/index.css`, add the token (values chosen so Dark is byte-identical to today's `amber-700` and Light is dark ink that clears AA on `#fafaf9`):
   ```css
   :root              { --text-accent-muted: #b45309; }  /* = amber-700 (dark theme today) */
   html[data-theme="light"] { --text-accent-muted: #92400e; }  /* amber-800 dark ink, ≥4.5:1 on #fafaf9 */
   ```
2. Convert each enumerated `text-amber-700` label in the player-stats header to the token. Two equivalent mechanics — pick the one that keeps the diff smallest and lint-clean:
   - inline: replace `className="… text-amber-700 …"` → drop `text-amber-700`, add `style={{ color: 'var(--text-accent-muted)' }}` (merge with any existing `style`); or
   - a tiny utility class `.text-accent-muted { color: var(--text-accent-muted); }` in the `@layer` and swap the class. (Prefer the utility class to avoid 6 inline-style merges; document whichever is used.)
3. For the `text-amber-400` EXPERIENCE value (`:1764`), measure in Light first; if it lands < 4.5:1, route it through the same token, else leave it (it is a value, not a label — record the decision).
4. Leave every non-amber stat value (`text-emerald-400`/`text-purple-400`/`text-red-400`) and every `text-amber-200`/`-300` heading untouched — they invert correctly.

**Verify (read-only, after editing):**
```bash
grep -n 'text-amber-700' dungeon-scholar/src/App.jsx                 # → none in the player-stats header band (1755-1860)
grep -n 'text-accent-muted\|--text-accent-muted' dungeon-scholar/src/App.jsx dungeon-scholar/src/index.css
```

**Acceptance:** in Light theme the EXPERIENCE/VICTORIES/DELVES/DRAGONS labels + the Level•XP line read as dark ink ≥ 4.5:1 on parchment on every screen; in Dark theme the header is visually identical to before; `npm run lint` + `npm run typecheck` + `npm run build` clean.

### 10B — Extend the token to Inventory / Shop secondary labels and darken the Bestiary biome headings (F1, remaining surfaces)

**Objective:** the Inventory slot/secondary labels, the Shop "gold"/secondary labels, and the Bestiary "found" counts route through `--text-accent-muted`; the Bestiary biome `<h3>` inline-hex accents darken in Light theme so they clear the 3.0 large-text floor.

**Files:**
- `dungeon-scholar/src/features/progression/InventoryScreen.jsx` (`:65`, `:85-88`; SLOTS labels `:38-43` render path).
- `dungeon-scholar/src/features/progression/ShopScreen.jsx` (`:93`, `:124`, `:172-175`).
- `dungeon-scholar/src/features/progression/BestiaryScreen.jsx` (`:96` count; `:90-94` biome `<h3>` inline `meta.accent`).
- `dungeon-scholar/src/index.css` (the biome-heading light override, if done in CSS).

**Steps:**
1. Inventory/Shop: swap the enumerated `text-amber-700` / `text-amber-700/60` label classes to `.text-accent-muted` (or `var(--text-accent-muted)`); keep the `/60` opacity by using `color-mix` or an opacity sibling, or accept full opacity on the tiny corner glyphs (record the choice). Leave the `text-amber-200` headings.
2. Bestiary biome `<h3>` (`:90-94`): the inline `style={{ color: meta.accent, textShadow: … }}` uses a fixed bright hex that never inverts. Keep the accent for the `textShadow` glow (decorative) but make the *text fill* theme-aware. Cleanest: gate it in CSS — add a stable class to the `<h3>` (e.g. `className="… biome-heading"`) and override only in light theme:
   ```css
   html[data-theme="light"] .biome-heading { color: var(--text-accent-muted) !important; }
   ```
   (Dark theme keeps the per-biome accent; Light theme uses the dark-ink token. The `!important` is needed to beat the inline `color`.) Document that the per-biome hue is intentionally dropped in Light for legibility (the icon + glow still convey the biome).
3. Re-measure the three screens in Light; confirm each former failing label ≥ 4.5:1 (small text) and the biome headings ≥ 3.0 (large text).

**Verify (read-only, after editing):**
```bash
grep -n 'text-amber-700' dungeon-scholar/src/features/progression/InventoryScreen.jsx dungeon-scholar/src/features/progression/ShopScreen.jsx dungeon-scholar/src/features/progression/BestiaryScreen.jsx   # only intended residue, if any, documented
grep -n 'biome-heading' dungeon-scholar/src/features/progression/BestiaryScreen.jsx dungeon-scholar/src/index.css
```

**Acceptance:** Inventory/Shop/Bestiary secondary labels and the biome headings are legible in Light theme; Dark theme unchanged; lint/typecheck/build clean.

### 10C — Route the "Begin Anew" reset (and sibling hardcoded `rgba(41,12,12,…)` backgrounds) through `--surface-red` (F2)

**Objective:** the reset button (and the identical-risk sibling inline dark-red backgrounds) lighten in Light theme via the existing `--surface-red` token, so deep-red labels clear AA; Dark theme is byte-identical.

**Files:**
- `dungeon-scholar/src/features/home/HomeScreen.jsx` (`:250`, `:618` Begin Anew; `:334` sibling).
- `dungeon-scholar/src/features/library/LibraryScreen.jsx` (`:576`, `:783`).
- `dungeon-scholar/src/components/TomeNotes.jsx` (`:315`), `dungeon-scholar/src/features/study/ChatMode.jsx` (`:432`), `dungeon-scholar/src/features/study/LabMode.jsx` (`:434`), `dungeon-scholar/src/features/study/QuizMode.jsx` (`:868`).

**Steps:**
1. Replace each `background: 'rgba(41, 12, 12, 0.7)'` → `background: 'rgba(var(--surface-red, 41, 12, 12), 0.7)'` and each `0.6` variant likewise. The fallback keeps the exact dark value if the var is ever absent (Dark byte-identical).
2. Confirm the label colors on each converted surface invert to dark-enough ink in Light (the Begin Anew label is `text-red-*` → deep red, fine on light pink). Where a converted surface's text is a *light* fixed hex meant for the dark bg, that surface is intentionally-dark-in-both (cf. PHASE-03 §"surface that is intentionally dark in both themes") — leave both bg and text fixed and record it (the `isSearch`/code-block precedent). Spot-check each in both themes.

**Verify (read-only, after editing):**
```bash
grep -rn "rgba(41, 12, 12, 0\.[67])" dungeon-scholar/src --include=*.jsx   # → only intentionally-dark-in-both surfaces remain, each documented
grep -rn "rgba(var(--surface-red" dungeon-scholar/src --include=*.jsx
```

**Acceptance:** in Light theme the Begin Anew button is light with a legible deep-red label (≥ 4.5:1); every other converted surface is legible in Light and identical in Dark; lint/typecheck/build clean.

## Research notes

- The fix reuses infrastructure the app already has. `--surface-red` (and the whole `--surface-*` family) was added by **PHASE-03** precisely so hardcoded dark `rgba()` backgrounds could re-theme; F2 is a surface PHASE-03's grep didn't enumerate because the literal is an inline `background`, not a `bg-*` class. F1's new `--text-accent-muted` token follows the same two-block (`:root` default + `[data-theme="light"]` override) pattern as every existing token.
- **Why the ramp must not be touched:** Phase-41 inverted `--color-amber-*` so that surfaces and bright dark-theme accents darken correctly in Light. The defect is narrow — *muted label text* authored at `text-amber-700`, which the inversion happens to brighten. A token for those labels is surgical; editing the ramp would regress the many surfaces that depend on the current inversion (PHASE-03 F1/F5/F6, the panels, the headings).
- **Bestiary biome headings are the inline-hex sibling of PHASE-03 F5** (Chat bubbles): a fixed hex that never inverts. PHASE-03 fixed F5 by darkening the *text*; 10B does the same, but gates it in CSS because the hex is per-biome data (`BIOME_LABELS.accent`), so a class-level light override is cleaner than threading a second color through the data.
- The numeric stat values (emerald/purple/red `-400`) were checked and *pass* in Light (their ramps invert to dark-enough ink), so they are deliberately left — narrowing the change to the genuinely failing amber labels.

## Test plan

- **Build/lint/type gate:** `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` (`VITE_BASE=/home-lab/`) all clean (CI parity).
- **Static guards (cheap):** the `grep` "Verify" blocks above — the failing classes/literals are gone from the named surfaces and the token/var is present.
- **Manual two-theme spot check (authoritative):** Light theme — Home (header strip), Library, Shop, Inventory, Bestiary, and the Begin Anew button all legible (labels ≥ 4.5:1, biome headings ≥ 3.0, reset button label ≥ 4.5:1). Dark theme — every touched surface visually identical to pre-change.

## Acceptance criteria

1. A single `--text-accent-muted` token in `src/index.css` (dark default = `amber-700`, light = dark ink) is the only path used for the converted muted-accent labels; the player-stats header (all 21 screens), Inventory/Shop secondary labels, and Bestiary "found" counts use it.
2. The Bestiary biome `<h3>` headings render dark-ink (token) in Light theme and keep their per-biome accent in Dark.
3. The "Begin Anew" reset button — and every sibling hardcoded `rgba(41,12,12,…)` inline background not intentionally dark-in-both — routes through `rgba(var(--surface-red, …), α)`; the reset label clears AA in Light.
4. Dark theme is visually unchanged on every touched surface (byte-identical fallbacks).
5. `npm run lint` + `npm run typecheck` + `npm run test` + `npm run build` clean.

## Out of scope

- **Library tome-tag chips** — already fixed as **PHASE-03 F6 / 03H** (done). Not reopened.
- **Gold action buttons + rarity badges** (CSS-gradient backgrounds) — the gold-button variant is tracked in `docs/logs/ISSUES-LOG-DUNGEON-SCHOLAR.md` (~line 199); gradient-backed surfaces need a gradient-aware fix, a separate effort from this flat-accent-text/flat-background phase. Left for that log item.
- **Light-theme focus ring** (report §7, low/observation) — **already theme-adaptive and not a defect.** `src/index.css` sets `--focus-ring: #fde047` (dark) → `#b45309` (light), and the focus rule consumes `var(--focus-ring)`; `#b45309` on `#fafaf9` clears the 3:1 non-text-contrast floor, and the run-3 pass explicitly logged "the theme-adaptive focus ring passing AA in both themes." The report's `rgb(255,210,48)` reading is the *dark/fallback* gold (`#fde047`), captured before/without `html[data-theme="light"]` taking effect — a measurement artifact, not a missing override. No change; documented here so a future pass doesn't re-file it.
- **No change to the Phase-41 `--color-amber-*` ramp**, to Dark theme, or to any gradient/badge surface.

## Completed

> Implemented 2026-06-30 by `scholar-phase-executer` on `auto/scholar-phase-executer` (auto-approved: bug/contrast phase). CI is the authoritative gate.

### 10A — `--text-accent-muted` token + player-stats header
- `src/index.css` — added `--text-accent-muted` to the `:root` Phase-03 surface block and the `html[data-theme="light"]` override. **Amendment (rule 3):** the plan suggested a literal `#b45309` dark default, but Tailwind v4's `amber-700` resolves to `#bb4d00`, not `#b45309` — a literal would shift Dark theme. To keep Dark **byte-identical**, the dark default is `var(--color-amber-700)` (the exact value the prior `text-amber-700` produced); light override is `#92400e` (measured **6.79:1** on `#fafaf9`). Added `.text-accent-muted` + `.text-accent-muted-{80,70,60,50,40}` utilities (opacity variants use `color-mix(in oklab, …)` to match Tailwind v4's `/NN` modifier, so Dark stays identical).
- `src/App.jsx` — player-stats header band (lines ~1755-1856): `EXPERIENCE`, `VICTORIES`, `DELVES`, `DRAGONS`, the `Level • Total XP` line, and the compact-header `EXPERIENCE` label converted `text-amber-700` → `text-accent-muted` (6 sites).
- **Recorded decision:** the borderline `text-amber-400` XP *value* (`{xp}/{xpNeeded}`, measured **3.06:1** in light) was **left unchanged** — routing it through the muted token would darken it in Dark theme (token dark = brown vs the value's gold), violating the byte-identical-Dark requirement; it is a numeric value, consistent with the deliberately-left emerald/purple/red-400 stat values.

### 10B — Inventory / Shop / Bestiary secondary labels + biome headings
- `src/features/progression/InventoryScreen.jsx`, `ShopScreen.jsx`, `BestiaryScreen.jsx` — all `text-amber-700[/NN]` muted labels/glyphs converted to `.text-accent-muted[-NN]` (opacity preserved via the color-mix variants; corner `⚜` glyphs and the conditional locked-item label/description ternaries included). `text-amber-200/300/400/100` headings and values left untouched.
- `src/features/progression/BestiaryScreen.jsx` (:90) — biome `<h3>` gained the `biome-heading` class; `src/index.css` `html[data-theme="light"] .biome-heading` darkens the inline per-biome-accent text fill in light theme (with `!important` to beat the inline `color`) while Dark keeps the per-biome accent + glow.
- Bestiary `:96` found-count and `:145` `Drops:` label also converted (secondary labels per the sub-phase objective).

### 10C — Danger-button backgrounds via `--surface-red`
- Routed the single-line `style={{ background: 'rgba(41, 12, 12, 0.{7,6})' }}` button backgrounds through `rgba(var(--surface-red, 41, 12, 12), α)` in: `src/features/home/HomeScreen.jsx` (the two "Begin Anew" resets :250/:618), `src/features/library/LibraryScreen.jsx` (:783 Banish), `src/components/TomeNotes.jsx` (:315 Delete notes), `src/features/study/ChatMode.jsx` (:432 Clear), `LabMode.jsx` (:434 Skip Stage), `QuizMode.jsx` (:868 Skip Riddle). All use `text-red-300`, which the light ramp inverts to deep red; measured **Begin Anew 1.11:1 → 5.51:1** in light theme.
- **Recorded decision (intentionally-dark-in-both, left unconverted):** the two difficulty-star badges (`HomeScreen.jsx:334`, `LibraryScreen.jsx:576`) use a **fixed light** text hex `color:'#fca5a5'`; lightening their background would *reduce* contrast, so per `DESIGN-CONSTRAINTS.md` they stay dark-in-both. `OrnatePanel.jsx:16`'s `rgba(41,12,12,…)` is a fallback inside `var(--panel-bg-red, …)` (already themed) — left as-is.

### Verification
- New guard: `src/phase10-contrast.test.js` (16 assertions: token present in both themes, utilities + biome-heading override defined, converted surfaces use the utility, danger buttons route through `--surface-red`, no single-line hardcoded button literal left). Passes.
- `npx vitest run src/phase10-contrast.test.js` ✓, `src/theme.test.js` ✓ (8), `npm run lint` exit 0, `npm run typecheck` exit 0, `VITE_BASE=/home-lab/ npm run build` ✓. Contrast ratios verified numerically (oklch→sRGB→WCAG).
- Out-of-scope same-family wash-out on non-enumerated screens logged to `docs/logs/ISSUES-LOG-DUNGEON-SCHOLAR.md` (rule 12).
