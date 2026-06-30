# PHASE-12 — Light-theme active-tome panel accent/tag contrast (Phase-03/41 ramp residue)

> Authored from [`QA-report-2026-06-29-5.md`](./QA/completed/QA-report-2026-06-29-5.md) (automated `scholar-qa-tester` pass against the live GitHub-Pages SPA build `index-Dw_qfUwQ.js` — the post-integrator-merge `337fbbaf` redeploy carrying dungeon-scholar phases 07/08/09, newer than run-4's `index-Bht36BpW.js` — cross-checked `origin/master` `223fd832`, 2026-06-29). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md). PLANNING ONLY — this phase authors the plan; no app changes here.

## Goal

Run-5 found **no Critical/High**. Its single highest-impact item is a Medium, and it is the same family the project has fixed before (PHASE-03 / PHASE-10: "Light-theme surfaces must route through theme vars — *and the accent text must darken too*"), but on a **new surface** the earlier sweeps did not reach: the **home Active Tome panel**.

- **F1 (Medium) — accent / tag text on the home Active-Tome panel stays light-gold while the panel lightens.** The panel background is theme-aware (it lightens to gold/cream in Light theme via `--surface-amber-strong`/`--surface-amber`), but several accent elements on it keep a **fixed light-gold (or light-purple) colour** that does not invert, so they wash out gold-on-cream. The headline instance: the tome **tag pills** (`#sociology`, …) measure **8.22:1 in Dark but 1.23:1 in Light** — `color: '#fcd34d'` (= `rgb(252,211,77)`), a fixed hex that never inverts, on a pill background that *does* lighten. The same class affects the **"⚔ ACTIVE TOME ⚔" eyebrow** (`text-amber-600`), the **subject metadata pill** (fixed `#d8b4fe` light-purple on the lightening `--surface-purple`), and the **scrolls/riddles/trials meta strip** (`text-amber-300/80`).

The fix mirrors PHASE-10 exactly: the panel **background** already re-themes (it uses `--surface-*` vars); only the **text** was authored with non-inverting fixed hexes / a too-bright ramp index, so it must darken in Light theme too. Dark theme — the default — is unaffected throughout (every conversion keeps the current dark value as the fallback).

## Dependencies & cross-phase notes

- **Sibling of PHASE-10 (same root-cause family, different surface).** PHASE-10 converts the *app-wide player-stats header* and the *Inventory/Shop/Bestiary* accent labels; this phase converts the *home Active-Tome panel*. Run PHASE-10 first by severity (it carries two Mediums; this carries one) — and because PHASE-10 introduces the shared light-theme ink approach this phase reuses. If PHASE-10 has **not** landed when this runs, define the ink token(s) here per PHASE-10 10A's spec.
- **Builds on completed PHASE-03 + the Phase-41 ramp inversion** (`src/index.css` `html[data-theme="light"]` `--color-amber-*` + `--surface-*` overrides). PHASE-03 is *done*; this phase does not reopen it — it extends the same documented pattern to the Active-Tome panel, a surface PHASE-03's greps did not enumerate (its failing accents are inline fixed hexes / Tailwind ramp classes on a theme-aware panel). Cite `DESIGN-CONSTRAINTS.md` §"Light-theme surfaces must route through theme vars (Phase 03)" as the governing rule.
- **Already covered — do NOT re-file under F1.** The report's F1 list also names the **XP `162 / 1118` strip** and the **`98` victories stat**. Those are **not** on the Active-Tome panel — they are the persistent **player-stats header** (`src/App.jsx` EXPERIENCE/VICTORIES/DELVES/DRAGONS strip), which is **PHASE-10 F1 / 10A** (the `text-amber-700`/`text-amber-400` header labels). Re-confirmed here, not re-authored. The report also names the **Library tome-tag chips** elsewhere in the family — those are **PHASE-03 F6 / 03H** (done).
- **Two surfaces are intentionally dark-in-both — leave them.** The Active-Tome panel's **author pill** (`#93c5fd` light-blue on fixed `rgba(12,24,41,0.7)`) and **difficulty pill** (`#fca5a5` light-red on fixed `rgba(41,12,12,0.7)`) pair *light* fixed text with a *fixed-dark* (non-var) background, so they stay legible in both themes (cf. PHASE-03 §"surface that is intentionally dark in both themes"). **Coordinate with PHASE-10 10C:** 10C sweeps `rgba(41,12,12,…)` inline backgrounds onto `--surface-red`, but its own rule explicitly *leaves* surfaces whose text is a light fixed hex (light-text-on-dark, intentionally dark in both) — so the difficulty pill is left dark by 10C, and this phase must **not** lighten its background either. No change to either pill; documented so a future pass doesn't re-file them.
- **`src/index.css` is the single theme-token home.** New ink vars go in the `html[data-theme="light"]` block next to `--surface-*`, matching the established "undefined in dark (inline fallback) / set in light" pattern. Do **not** alter the Phase-41 `--color-amber-*` ramp.

## Verified findings

All verification read-only against the live tree at `origin/master` (worktree `auto/scholar-phase-maker`). Re-run each block before implementing (INSTRUCTIONS rule 3 — line numbers drift).

### F1 (medium, bug/contrast) — home Active-Tome panel accent/tag text does not darken in Light theme

**Status: confirmed in source. The panel background re-themes via `--surface-*` vars; the accent text uses non-inverting fixed hexes (tag/subject pills) or a too-bright ramp index (eyebrow/meta strip).**

The panel container lightens in Light theme — its background is built from theme vars (`src/features/home/HomeScreen.jsx:281`):

```jsx
// HomeScreen.jsx ~277-283 — the Active-Tome panel container
style={{ background:
  'linear-gradient(135deg, rgba(var(--surface-amber-strong, 120, 53, 15), 0.4) 0%, rgba(var(--surface-amber, 41, 24, 12), 0.9) 100%)', … }}
```

`src/index.css` flips those surfaces light in Light theme, so the panel becomes gold/cream:

```css
:root                    { --surface-amber: 41, 24, 12;  --surface-amber-strong: 120, 53, 15;  --surface-purple: 31, 12, 41; }   /* dark */
html[data-theme="light"] { --surface-amber: 254, 243, 198; --surface-amber-strong: 253, 230, 138; --surface-purple: 243, 232, 255; } /* light */
```

But the accent text on that lightening panel does **not** darken. The confirmed failing surfaces, highest-impact first:

- **Tag pills (headline, 1.23:1) — `HomeScreen.jsx:345-360`.** `color: '#fcd34d'` (= `rgb(252,211,77)`, a fixed bright-gold hex) on `background: 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.4)'`. The background lightens to gold (`253,230,138`) but the text stays bright gold → gold-on-cream, 1.23:1 (was 8.22:1 in Dark).
- **Subject metadata pill — `HomeScreen.jsx:307-316`.** `color: '#d8b4fe'` (fixed light-purple) on `background: 'rgba(var(--surface-purple, 31, 12, 41), 0.7)'` — the purple surface lightens to lilac (`243,232,255`) but the text stays light-purple → light-on-light. Same fixed-hex-on-lightening-surface class as the tag pills.
- **"⚔ ACTIVE TOME ⚔" eyebrow — `HomeScreen.jsx:293`.** `<div className="text-xs text-amber-600 …">`. In Light theme `--color-amber-600: oklch(82.8% …)` is a **bright** gold (the Phase-41 inversion brightens `amber-600`), so the eyebrow washes out on the lightened panel — the same ramp-class failure PHASE-10 fixed for `text-amber-700` labels, here at `amber-600`.
- **Scrolls/riddles/trials meta strip — `HomeScreen.jsx:362`.** `<div className="… text-xs text-amber-300/80">`. `--color-amber-300: oklch(55.5% …)` is mid-gold; at `/80` on the gold panel it is borderline. Re-measure in Light; fold in if < 4.5:1 (small text).

```bash
sed -n '277,374p' dungeon-scholar/src/features/home/HomeScreen.jsx       # the whole Active-Tome panel
grep -n "#fcd34d\|#d8b4fe\|#93c5fd\|#fca5a5\|text-amber-600\|text-amber-300/80\|ACTIVE TOME" dungeon-scholar/src/features/home/HomeScreen.jsx
grep -n 'surface-amber\|surface-purple\|--color-amber-300\|--color-amber-600' dungeon-scholar/src/index.css
```

**Passes already — left as-is, documented (so a future pass doesn't re-file):**

- **Tome title — `HomeScreen.jsx:294-299`** (`text-amber-200`). `--color-amber-200: oklch(47.3% …)` is **dark ink** in Light theme, so the title darkens correctly and clears AA on the lightened panel. The report's "~1.19:1" reading is the *dark/fallback* gold measured before `html[data-theme="light"]` took effect (the same measurement artifact PHASE-10 documented for the focus ring), amplified by the title's gold `textShadow` glow. No change.
- **Active-tome description — `HomeScreen.jsx:300-303`** (`RichContent … text-amber-100/70`). `--color-amber-100: oklch(41.4% …)` is **dark ink** in Light theme; at `/70` over the lightened panel re-measure, but it inverts in the correct direction. The report's "~1.07:1" is the same pre-theme/fallback-gold artifact. Re-measure during 12A; convert only if it genuinely lands < 4.5:1, else leave + record.
- **"Library (N)" button — `HomeScreen.jsx:369-374`** (`text-amber-200` on `rgba(var(--surface-amber …),0.7)`): both re-theme correctly (dark-ink text on light-gold). No change.
- **Author + difficulty pills — `:318-329` / `:330-343`**: light fixed text on **fixed-dark** (non-var) backgrounds = intentionally dark-in-both (see cross-phase note). No change.

**Why fixed-fallback ink vars (not a ramp tweak):** in Dark theme the pills/eyebrow want their current bright gold / light purple; in Light theme they want dark ink. Exactly as PHASE-10 established, no single `text-amber-N` index is correct in both themes after Phase-41 inverted the ramp, and the pills are *inline fixed hexes* the ramp never touches at all. So the surgical fix is a per-surface ink var whose value is the current colour by fallback (Dark untouched) and dark ink under `[data-theme="light"]`.

### Environment facts an executor needs

- **Tests:** `cd dungeon-scholar && npm run test` (`vitest run`, happy-dom + `@testing-library/react`). Contrast is CSS-var driven and not unit-asserted (happy-dom does not parse `oklch()` — the same limit the report's scanner hit). The meaningful guards are (a) a JSDOM assertion that the converted JSX no longer contains the fixed light hex / failing class on the named surfaces and routes through the ink var, and (b) the manual two-theme spot check below. Do **not** invent a brittle computed-contrast unit test.
- **Lint / typecheck / build:** `npm run lint` (Biome), `npm run typecheck` (`tsc --noEmit`, checkJs 0 — keep clean), `npm run build` (`VITE_BASE=/home-lab/`). CI (`dungeon-scholar-ci.yml`) gates test + build on push.
- React 19, Tailwind v4 (`@import "tailwindcss"`), plain JSX, `type: "module"`. Theme is `html[data-theme="light"|"dark"]`; default/dark is the untouched baseline.
- **Manual two-theme check is the authoritative acceptance gate** (the report's own methodology): Home → Visual Theme → ☀ Light, look at the Active Tome panel's tag pills, subject pill, eyebrow and meta strip → all legible; toggle back to Dark and confirm the panel is pixel-identical to before.

## Sub-phases

Order: 12A lands the ink var(s) + the inline-hex pills (the headline + subject pill); 12B converts the Tailwind-class accents (eyebrow + meta strip) and re-measures the borderline title/description. Each is independently shippable and leaves the tree green.

### 12A — Light-theme ink vars; convert the tag pills + subject pill (F1, headline)

**Objective:** the tag pills (`#fcd34d`) and the subject pill (`#d8b4fe`) darken to legible ink in Light theme while staying byte-identical in Dark, clearing AA on the lightened panel.

**Files:**
- `dungeon-scholar/src/index.css` — add the light-only ink vars next to the `--surface-*` overrides.
- `dungeon-scholar/src/features/home/HomeScreen.jsx` — the tag-pill `color` (`:354`) and subject-pill `color` (`:312`).

**Steps:**
1. In `src/index.css`, under `html[data-theme="light"]`, add (no `:root` default — the inline fallback keeps Dark byte-identical):
   ```css
   html[data-theme="light"] { --accent-gold-ink: #92400e; }   /* amber-800 dark ink, ≥4.5:1 on #fde68a/#fdf3c6 */
   html[data-theme="light"] { --accent-purple-ink: #6b21a8; } /* purple-800 dark ink, ≥4.5:1 on #f3e8ff */
   ```
   (If PHASE-10 has already added `--text-accent-muted` = `#92400e` in light, reuse it for the gold case instead of a second identical var; the *purple* case needs its own ink var regardless. Record which.)
2. Tag pills (`:354`): `color: '#fcd34d'` → `color: 'var(--accent-gold-ink, #fcd34d)'`. Dark = `#fcd34d` (fallback, unchanged); Light = dark ink. (Keep the `rgba(var(--surface-amber-strong …),0.4)` pill background and the amber border as-is — the bg already re-themes.)
3. Subject pill (`:312`): `color: '#d8b4fe'` → `color: 'var(--accent-purple-ink, #d8b4fe)'`. Dark unchanged; Light = dark purple ink. (Keep the `--surface-purple` background.)

**Verify (read-only, after editing):**
```bash
grep -n "var(--accent-gold-ink\|var(--accent-purple-ink" dungeon-scholar/src/features/home/HomeScreen.jsx
grep -n "#fcd34d\|#d8b4fe" dungeon-scholar/src/features/home/HomeScreen.jsx   # → only as the var() fallbacks
grep -n 'accent-gold-ink\|accent-purple-ink\|text-accent-muted' dungeon-scholar/src/index.css
```

**Acceptance:** in Light theme the `#tag` pills and the subject pill read as dark ink ≥ 4.5:1 on the lightened panel; in Dark theme both are visually identical to before; lint/typecheck/build clean.

### 12B — Darken the eyebrow + meta strip Tailwind accents; re-measure the borderline title/description (F1, remaining)

**Objective:** the "⚔ ACTIVE TOME ⚔" eyebrow and the scrolls/riddles/trials meta strip darken in Light theme; the title/description are confirmed passing (or converted only if measured failing).

**Files:**
- `dungeon-scholar/src/features/home/HomeScreen.jsx` (eyebrow `:293`; meta strip `:362`; title `:294-299`; description `:300-303`).
- `dungeon-scholar/src/index.css` (the light-theme override rule, if class-gated).

**Steps:**
1. The eyebrow (`text-amber-600`) and meta strip (`text-amber-300/80`) are Tailwind ramp classes, so an inline fallback-var swap would change the Dark colour. Keep Dark exactly by gating in CSS: add a stable class (e.g. `active-tome-accent`) to both elements and override **only** in Light theme:
   ```css
   html[data-theme="light"] .active-tome-accent { color: var(--accent-gold-ink) !important; }
   ```
   Dark keeps the existing Tailwind ramp colour; Light uses the dark-ink var. (The `!important` beats the Tailwind utility; document it as the same mechanism PHASE-10 10B used for the Bestiary biome headings.)
2. Re-measure the **title** (`text-amber-200`) and **description** (`text-amber-100/70`) in Light on the lightened panel. `amber-200`/`amber-100` invert to dark ink, so both are expected to pass — leave them untouched and record the measured ratios. Convert (add `active-tome-accent`) only if one genuinely lands below threshold.
3. Leave the author + difficulty pills and the Library button unchanged (see cross-phase note / passing list).

**Verify (read-only, after editing):**
```bash
grep -n 'active-tome-accent' dungeon-scholar/src/features/home/HomeScreen.jsx dungeon-scholar/src/index.css
grep -n 'text-amber-600\|text-amber-300/80' dungeon-scholar/src/features/home/HomeScreen.jsx   # now class-gated for light
```

**Acceptance:** in Light theme the eyebrow + meta strip are legible (eyebrow ≥ 3.0 large / strip ≥ 4.5 small); the title + description are confirmed ≥ AA (with measured ratios recorded); Dark theme unchanged; lint/typecheck/build clean.

## Research notes

- The panel **already** re-themes its background (it was built on `--surface-*` vars in an earlier light-theme pass); only the accent **text** was missed — the exact "the background lightens but the text didn't darken" gap `DESIGN-CONSTRAINTS.md` warns about. The tag/subject pills are the inline-fixed-hex sibling of PHASE-03 F5 (Chat bubbles) / PHASE-10 10B (Bestiary headings); the eyebrow/strip are the ramp-class sibling of PHASE-10 10A (`text-amber-700` labels).
- **Why a fallback var (not `:root` + override):** giving the var **no** dark default means Dark falls back to the inline hex byte-for-byte — zero Dark drift — while Light gets the ink. This is the same fallback idiom PHASE-10 10C uses for `rgba(var(--surface-red, 41,12,12), α)`.
- The author/difficulty pills are deliberately excluded because their backgrounds are *fixed dark* (non-var) — light text on them is correct in both themes, and lightening them (or darkening their text) would *break* the dark theme. This is why PHASE-10 10C's sweep also leaves light-text-on-fixed-dark surfaces alone; the two phases agree.

## Test plan

- **Build/lint/type gate:** `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` (`VITE_BASE=/home-lab/`) all clean (CI parity).
- **Static guards (cheap):** the `grep` "Verify" blocks — the fixed light hexes appear only as `var()` fallbacks on the named surfaces, and the ink vars / class are present.
- **Manual two-theme spot check (authoritative):** Light theme — the Active Tome panel's tag pills, subject pill, eyebrow and meta strip all legible (pills/strip ≥ 4.5:1, eyebrow ≥ 3.0). Dark theme — the panel is visually identical to pre-change.

## Acceptance criteria

1. The home Active-Tome panel's **tag pills** and **subject pill** route their text colour through a light-theme ink var (with the current hex as the inline fallback), reading dark ink ≥ 4.5:1 in Light and unchanged in Dark.
2. The **"⚔ ACTIVE TOME ⚔" eyebrow** and the **scrolls/riddles/trials meta strip** darken in Light theme (class-gated override), Dark unchanged.
3. The **tome title** and **description** are confirmed ≥ AA in Light (measured ratios recorded); converted only if measured failing.
4. The author/difficulty pills and the Library button are unchanged; Dark theme is visually identical on every touched surface.
5. `npm run lint` + `npm run typecheck` + `npm run test` + `npm run build` clean.

## Out of scope

- **Player-stats header XP strip + victories stat** (report F1 list) — that is the app-wide stats header, **PHASE-10 F1 / 10A**, not the Active-Tome panel. Not duplicated here.
- **Library tome-tag chips** — **PHASE-03 F6 / 03H** (done). Not reopened.
- **Author + difficulty metadata pills** — intentionally dark-in-both (light fixed text on fixed-dark backgrounds); coordinated-left with PHASE-10 10C. No change.
- **No change to the Phase-41 `--color-amber-*` ramp, to Dark theme, or to any gradient/badge surface.**
