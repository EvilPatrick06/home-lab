# PHASE-03 — Light-theme dark-on-dark contrast (systemic)

> Authored from the 2026-06-24 dungeon-scholar QA reports — [`QA-report-2026-06-24-2.md`](./QA/completed/QA-report-2026-06-24-2.md) (run 2, the fuller pass) — tested @ deployed `index-B4qcBDzT.js` / src `9e454930` · `origin/master` `3c89d787`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md). PLANNING ONLY — this phase authors the plan; no app changes here.

## Goal

Make every screen actually readable in **Light** theme. The light theme inverts the Tailwind amber/colour ramps via CSS custom properties (`html[data-theme="light"]` in `src/index.css`), so ordinary parchment surfaces read as dark ink on a light background. But a handful of components hardcode a **dark** background gradient (raw `rgba(…)`, not the theme-aware `--panel-bg-*`/`--surface-*` vars) while their foreground text still uses the now-inverted `text-amber-50/100/200`. The result is **dark-on-dark**: the flashcard question/answer (~1.04:1 contrast, WCAG AA needs 4.5:1), the Lab trial descriptions, and the Mistake-Vault question prompts are effectively invisible in Light theme. This phase fixes the systemic root cause — every hardcoded-dark surface gets either a theme-aware background or text pinned to a theme-independent light value — and revisits the Theme-picker copy that promises "both themes restyle every screen; pick whichever reads best" so the promise is true.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Self-contained contrast/theming work in the study features + the global theme tokens.
- **Theme system provenance:** the full light theme (inverted colour ramps + light panel/surface vars) was established by **PHASE-41 (`ds-sealed-tomes-theme`)** (`dnd-app/docs/phases/completed/PHASE-41-ds-sealed-tomes-theme.md`, QA16) — `src/index.css:128+` carries the generated `html[data-theme="light"]` ramp with the comment "regenerate with the script in PHASE-41 plan if the Tailwind version changes." This phase does **not** touch the ramp generation; it fixes the components that opt out of the themeable vars. Re-read PHASE-41's theme notes before editing `index.css`.
- **The `--panel-bg-*` / `--surface-*` vars already do the right thing.** `src/index.css:71-129` defines dark defaults at `:root` and light overrides under `html[data-theme="light"]` (e.g. `--panel-bg-rose` flips from `rgba(41,12,27,.85)` to `rgba(252,231,243,.85)`). Components that consume `rgba(var(--surface-amber, …), α)` (e.g. `MistakeVault.jsx:45,83`, `FlashcardsMode.jsx:225`) re-theme correctly. The bug is purely the components that **hardcode** the dark rgba instead — so the cleanest fix is to route them through the existing vars.
- **Independent of PHASE-01/02.** No shared files with the routing/PWA work or the load-noise round.

## Verified findings

All verification was performed read-only against the live tree at `origin/master` (worktree `auto/scholar-phase-maker`).

### F1 (High) — Light theme: the flashcard question AND answer are unreadable (dark-on-dark, ~1.04:1)

**Status: confirmed in source.**

QA repro (Light theme — the active profile's saved theme):

1. Home → Visual Theme → ☀ (Light). 2. Load a tome, open Flashcards. 3. The "✦ THE QUESTION ✦" body is invisible; tap to flip — "✦ THE ANSWER ✦" is equally invisible.

QA measured: card background `linear-gradient(135deg, rgba(12,24,41,.85), rgba(6,12,20,.95))` ≈ rgb(26,36,54); face text computed `oklch(0.279 0.077 45.635)` ≈ rgb(70,25,1); contrast **1.04:1**.

Root cause, confirmed in source:

- `src/features/study/FlashcardsMode.jsx:341` gives the card a **hardcoded** dark sapphire gradient: `background: 'linear-gradient(135deg, rgba(12, 24, 41, 0.85) 0%, rgba(6, 12, 20, 0.95) 100%)'` — a raw rgba, **not** `--panel-bg-sapphire` (which would flip to `rgba(219,234,254,.85)` in light theme).
- `src/features/study/FlashcardsMode.jsx:353` renders the face text with `className="text-xl text-amber-50 italic …"`. Under `html[data-theme="light"]`, `--color-amber-50` is overridden to `oklch(27.9% 0.077 45.635)` (dark brown — `src/index.css:130`). So a dark gradient + a now-dark `text-amber-50` = dark-on-dark.

Verification commands (read-only):

```bash
sed -n '334,357p' dungeon-scholar/src/features/study/FlashcardsMode.jsx   # card gradient (:341) + face text (:353)
sed -n '129,141p' dungeon-scholar/src/index.css                          # light-theme amber ramp (amber-50 -> dark)
grep -n '--panel-bg-sapphire' dungeon-scholar/src/index.css              # the themeable var the card SHOULD use
```

**Suggested action (the report's):** give the card a theme-aware background (`--panel-bg-sapphire`) or pin the face text to a theme-independent light token (a fixed light value, not `amber-50`).

### F2 (High) — Light-theme dark-on-dark is SYSTEMIC: Lab trial cards have the same defect

**Status: confirmed in source.**

QA: in Light theme, each Lab trial card uses a hardcoded dark maroon gradient but the scenario **description** prose resolves to the inverted (dark) `amber-100`, so the body text is low-contrast/hard to read. Titles (rose) and the "5 stages"/"IN PROGRESS" chips stay readable — the prose is the casualty.

Root cause, confirmed in source:

- `src/features/study/LabMode.jsx:104` (trial list card) and `:339` (selected-trial header) both hardcode `background: 'linear-gradient(135deg, rgba(41, 12, 27, 0.85) 0%, rgba(20, 6, 13, 0.95) 100%)'` (raw rgba, not `--panel-bg-rose`).
- The scenario description renders with `text-amber-100/70` (`LabMode.jsx:113` in the list card, `:349` in the detail view). `--color-amber-100` inverts to `oklch(41.4% …)` (dark) under light theme (`src/index.css:131`) → dark-on-dark.
- The trial-step option/answer surfaces (`LabMode.jsx:365,379,394,404`) also use `text-amber-50` on dark; audit them in the same pass.

Verification commands (read-only):

```bash
sed -n '100,115p' dungeon-scholar/src/features/study/LabMode.jsx   # list-card gradient (:104) + description (:113)
sed -n '337,352p' dungeon-scholar/src/features/study/LabMode.jsx   # detail-view gradient (:339) + description (:349)
sed -n '131,132p' dungeon-scholar/src/index.css                    # amber-100 -> dark in light theme
```

**Suggested action:** same fix as F1 — route the trial-card backgrounds through `--panel-bg-rose` (or pin on-dark text to a fixed light value). Treat F1+F2+F3 as one systemic fix.

### F3 (medium) — Light-theme dark-on-dark also hits the Mistake-Vault question prompt

**Status: confirmed in source.**

QA: in the Mistake Vault, each missed-item card has a hardcoded dark maroon background; the **question prompt** is dark-on-dark, while the lighter inner "explanation" panel is readable.

Root cause, confirmed in source:

- `src/features/study/MistakeVault.jsx:69` hardcodes `background: 'linear-gradient(135deg, rgba(41, 12, 12, 0.7) 0%, rgba(20, 6, 6, 0.9) 100%)'` (raw rgba, not `--panel-bg-red`).
- The question text at `MistakeVault.jsx:78` is `className="text-amber-50 …"` (inverts dark in light theme) → dark-on-dark.
- The inner explanation panel (`:81-83`) reads fine precisely because it uses `rgba(var(--surface-modal, 20, 12, 6), 0.6)` — a themeable var that lightens in light theme. This is the in-file proof that routing the **card** background through a var fixes it.

Verification commands (read-only):

```bash
sed -n '66,84p' dungeon-scholar/src/features/study/MistakeVault.jsx   # card gradient (:69), question text (:78), readable inner panel (:81-83)
grep -n '--panel-bg-red\|--surface-modal' dungeon-scholar/src/index.css
```

**Suggested action:** route the Vault card background through `--panel-bg-red` (matching the already-correct inner panel) or pin the question text to a fixed light value.

### F4 (low, UX/docs) — Theme-picker copy promises readability the Light theme doesn't deliver

**Status: confirmed in source.** `src/features/home/ThemePanel.jsx:64` renders "ⓘ Both themes restyle every screen; pick whichever reads best." That promise is false while F1-F3 stand — in Light theme those screens are not readable. This is a copy/UX wart that resolves once the contrast is fixed, but is listed so the audit closes the loop.

Verification: `grep -n "restyle every screen" dungeon-scholar/src/features/home/ThemePanel.jsx` → line 64.

**Suggested action:** once F1-F3 land, the copy is accurate and can stay. No copy change is needed if the contrast fix is complete; only revise the copy if any hardcoded-dark surface is intentionally left dark-on-light-incompatible (it should not be).

## Sub-phases

> dungeon-scholar checks (run from `dungeon-scholar/`): single test `npx vitest run src/.../that.test.jsx` during sub-phase work; CI (`dungeon-scholar-ci.yml`) runs the full `npm run test` + `npm run build` (`VITE_BASE=/home-lab/`) gate on push. A pure colour/contrast change has no unit gate beyond the build — validate with the build + a careful read + the next live deploy in both themes; where practical, add a contrast assertion (computed-style/luminance) test.

### 03A — Establish the fix pattern + a shared on-dark text token (F1-F3 foundation)

**Objective:** one consistent, theme-safe way to render text on an intentionally-dark surface, so the three component fixes share a single mechanism rather than three ad-hoc values.

**Files:** `dungeon-scholar/src/index.css` (add a token), optionally a short note in `dungeon-scholar/docs/DESIGN-CONSTRAINTS.md`.

**Steps:**

1. Decide the pattern. Two acceptable approaches, pick **one** and apply it uniformly:
   - **(preferred) Theme-aware background:** swap each hardcoded `rgba(…)` gradient for the matching `--panel-bg-*` var (`--panel-bg-sapphire` for the flashcard, `--panel-bg-rose` for Lab, `--panel-bg-red` for the Vault) so the surface lightens in light theme and the existing `text-amber-*` (dark ink) becomes correct dark-on-light. This matches every other panel and the already-correct Vault inner panel.
   - **(fallback, only where a surface MUST stay dark in both themes)** add a theme-independent light text token, e.g. `--on-dark-fg: #fff7ed;` at `:root` with the **same** value under `html[data-theme="light"]` (so it never inverts), and pin on-dark text to it.
2. If adding `--on-dark-fg`, document next to the light-ramp block in `index.css` why it must not be overridden in the light block (it is the deliberate escape hatch from the ramp inversion).
3. Note the chosen pattern so 03B-03D apply it identically.

**Acceptance:** the pattern is defined once (a var-swap convention and/or a single non-inverting token); `npm run build` clean; no behaviour change yet.

### 03B — Flashcard card readable in light theme (F1)

**Objective:** flashcard question + answer meet WCAG AA (≥4.5:1) in both themes.

**Files:** `dungeon-scholar/src/features/study/FlashcardsMode.jsx` (`:341` background, `:353` face text; check the OcclusionCard branch too).

**Steps:**

1. Apply the 03A pattern at `:341` — route the card background through `--panel-bg-sapphire` (or pin the `:353` face text to the non-inverting token).
2. Re-check the sub-labels on the same card (`:350` "THE QUESTION/ANSWER" `text-sky-400`, `:356` "Touch the scroll" `text-amber-700`) and the OcclusionCard render — ensure none are dark-on-dark in light theme.
3. Add a contrast/computed-style assertion if tractable (render the card under `data-theme="light"`, assert the face-text colour is light / passes a luminance-ratio check against the surface).

**Acceptance:** flashcard face text passes AA in light AND dark theme; dark theme visually unchanged; `npm run build` clean; any new test green.

### 03C — Lab trial cards readable in light theme (F2)

**Objective:** Lab trial descriptions + step text meet AA in both themes.

**Files:** `dungeon-scholar/src/features/study/LabMode.jsx` (`:104`, `:339` backgrounds; `:113`, `:349` descriptions; audit `:365,379,394,404` step surfaces).

**Steps:**

1. Apply the 03A pattern to both hardcoded gradients (`--panel-bg-rose`) — or pin the description/step text to the non-inverting token.
2. Sweep the remaining `text-amber-50/100/*` usages that sit on hardcoded-dark step/option/answer surfaces in this file and fix any that go dark-on-dark.
3. Keep the rose titles + status chips unchanged (already readable).

**Acceptance:** Lab descriptions + step prose pass AA in both themes; the trial flow is visually unchanged in dark theme; `npm run build` clean.

### 03D — Mistake-Vault card readable in light theme (F3)

**Objective:** the Vault question prompt meets AA in both themes.

**Files:** `dungeon-scholar/src/features/study/MistakeVault.jsx` (`:69` background, `:78` question text).

**Steps:**

1. Route the card background at `:69` through `--panel-bg-red` (matching the already-correct inner panel at `:81-83`) — or pin the `:78` question text to the non-inverting token.
2. Confirm the inner explanation panel still reads (it already uses `--surface-modal`); ensure the card + inner panel keep sufficient contrast between them in both themes.

**Acceptance:** the Vault question prompt passes AA in both themes; dark theme unchanged; `npm run build` clean.

### 03E — Audit the remaining hardcoded-dark surfaces (F2 systemic sweep)

**Objective:** no other component is left dark-on-dark in light theme.

**Files:** read-only grep across `dungeon-scholar/src/features/**` + `src/components/**`; fix any additional offenders found.

**Steps:**

1. Grep for the offending pattern — a hardcoded dark `linear-gradient(... rgba(...` or `background: 'rgba(` paired with a `text-amber-50/100/200` foreground — across `src/features/**` and `src/components/**`. Candidates the report flagged: **Chat (`ChatMode.jsx`) bubbles** (user/assistant/system_notice surfaces), any **`Modal`/overlay rendered over a dark surface**, and the **dungeon canvas HUD**. Also check `components/ui/ConfirmModal.jsx`, `PromptModal.jsx`, and `ErrorBoundary.jsx:55` (the PHASE-01 chunk panel uses a hardcoded amber gradient + `text-amber-*` — verify it reads in light theme).
2. For each genuine offender, apply the 03A pattern.
3. Record the audit result (offenders found + fixed, or "none beyond F1-F3") in `## Completed`.

**Acceptance:** the grep yields no remaining hardcoded-dark + inverted-amber-text combination; spot-checked screens read in both themes; `npm run build` clean.

### 03F — Theme-picker copy is accurate (F4)

**Objective:** the "both themes restyle every screen; pick whichever reads best" promise is true.

**Files:** `dungeon-scholar/src/features/home/ThemePanel.jsx:64`.

**Steps:**

1. With F1-F3(+E) landed, confirm the promise holds; leave the copy as-is. Only if a surface is *intentionally* left dark in light theme, soften the copy accordingly (it should not be).

**Acceptance:** the copy matches reality after the contrast fixes; `npm run build` clean.

## Research notes

- The light theme is implemented by **overriding Tailwind's colour-ramp CSS variables** under `html[data-theme="light"]` (`src/index.css:129+`), so `text-amber-50` resolves to a dark value in light theme by design — correct for ink-on-parchment, wrong only when the surface under it is also dark. The fix is to make the surface theme-aware too (it already has `--panel-bg-*`/`--surface-*` vars for exactly this) or to opt the text out of the ramp via a non-inverting token.
- WCAG 2.1 AA body-text contrast is **4.5:1**; the measured flashcard ratio was **1.04:1**. The already-correct surfaces in the same files (e.g. the Vault inner panel via `--surface-modal`) are the in-repo proof that routing through the vars resolves it.
- Prefer the **var-swap** over a hardcoded light text colour wherever the surface is allowed to lighten — it keeps the dungeon feel in dark theme and harmonizes with the off-white body in light theme (the explicit PHASE-41 intent).

## Test plan

- Per sub-phase: `npx vitest run` any new contrast/render test (03B-03D); a careful read of each diff against `index.css`'s var values.
- At phase end: `npm run lint:fix` (see PHASE-02's note on the repo-wide biome caveat — hand-format touched files to the surrounding style rather than running a repo-wide autofix that rewrites unrelated files), then push and let CI (`dungeon-scholar-ci.yml`) run the full `npm run test` + `npm run build` (`VITE_BASE=/home-lab/`) gate.
- Runtime / next-deploy verification (not CI-gated): on the live deploy, toggle Light theme and confirm the flashcard question/answer, Lab trial descriptions, and Vault prompts are all readable; spot-check Chat + any dark-surfaced modal; confirm dark theme is visually unchanged.

## Acceptance criteria

- Flashcard question/answer, Lab trial descriptions, and Mistake-Vault prompts all meet WCAG AA contrast in **both** themes (F1-F3).
- No remaining component pairs a hardcoded-dark background with inverted `text-amber-*` text (F2 systemic sweep, 03E).
- The Theme-picker "reads best" copy is accurate (F4).
- Dark theme is visually unchanged.
- `dungeon-scholar-ci.yml` green (full `npm run test` + `npm run build`).

## Out of scope

- Regenerating or re-tuning the light-theme colour ramp itself (PHASE-41's generated block) — this phase only fixes components that opt out of the themeable vars.
- The colourblind-safe palette toggle and any broader colour-system redesign — separate concern.
- Dark-theme appearance — confirmed already readable by QA (the defect is light-theme-specific); do not alter it beyond what the var swap implies.
