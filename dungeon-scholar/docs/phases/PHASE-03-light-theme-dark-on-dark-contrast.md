# PHASE-03 — Light-theme dark-on-dark contrast (systemic)

> Authored from the 2026-06-24 dungeon-scholar QA reports — [`QA-report-2026-06-24-2.md`](./QA/completed/QA-report-2026-06-24-2.md) (run 2, the fuller pass) — tested @ deployed `index-B4qcBDzT.js` / src `9e454930` · `origin/master` `3c89d787`. Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md). PLANNING ONLY — this phase authors the plan; no app changes here. **Amended 2026-06-29** to add **F5 / sub-phase 03G** from [`QA-report-2026-06-28.md`](./QA/completed/QA-report-2026-06-28.md) (deployed `index-Dy2bw_1f.js`, src `8a8891fb`): the Light-theme Oracle/Chat-bubble **light-on-light** regression — the *inverse* of F1-F3 and a distinct root cause the F2 03E dark-on-dark grep does not catch. **Further amended 2026-06-29** (run 2, deployed `index-C2MmghGQ.js`, src `dc85f35f`) to add **F6 / sub-phase 03H** from [`QA-report-2026-06-29.md`](./QA/completed/QA-report-2026-06-29.md): the Light-theme Library **tag chips + tome-subject label + sealed badge** are low-contrast — the *same* family as F5/03G (a theme-aware *lightening* surface under a hardcoded *non-inverting* inline hex colour), fixed by inverting the text, not the background. The run-2 report ([`QA-report-2026-06-29-2.md`](./QA/completed/QA-report-2026-06-29-2.md)) also re-confirmed F1 and located that the flashcard card gradient is applied as a **`background-image`** (not `background-color`) — see the added note in 03B.

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

### F5 (medium) — Light theme: Oracle (Chat) answer AND user-message bubbles are light-on-light (the INVERSE of F1-F3)

**Status: confirmed in source.**

QA repro (Light theme, a tome loaded, Oracle reachable):

1. In Light theme, load a tome and open Chat (`#/chat`). 2. Ask any question and Speak. 3. The Oracle answers correctly (RAG retrieval + generation both work) but the **answer body is invisible** — light text on a light bubble — until you select it. The user's own message bubble has the same defect; only the gold "THE ORACLE" label and the amber "SOURCES FROM THE TOME" citations stay legible.

QA measured: answer bubble background `rgba(254, 243, 198, 0.7)` (amber-50, light) with body text `rgb(254, 243, 199)` (amber-100, near-white) — essentially the same colour.

Root cause, confirmed in source — and **distinct from F1-F3** (note this carefully, the fix differs):

- **The bubble background is already theme-aware (it lightens correctly).** The Oracle/search bubble at `src/features/study/ChatMode.jsx:561` uses `background: isSearch ? 'rgba(12, 24, 41, 0.7)' : 'rgba(var(--surface-amber, 41, 24, 12), 0.7)'`. In Light theme `--surface-amber` flips to a light amber value, so the **non-search (Oracle) bubble surface becomes light** — exactly as intended. The user bubble at `:543` likewise uses `rgba(var(--surface-amber-strong …)` / `rgba(var(--surface-amber …)` and lightens.
- **The text colour is a hardcoded, NON-inverting inline hex.** The same bubble pins `color: '#fef3c7'` inline (`:563` Oracle, `:545` user) — amber-100's raw light value. Because it is an inline hex (not a `text-amber-*` Tailwind utility), it is **not** part of the ramp that `html[data-theme="light"]` inverts, so it stays near-white in Light theme. Light bubble + non-inverting light text = light-on-light.
- This is the **mirror image of F1-F3**: there a hardcoded-*dark* background sat under auto-*inverting* `text-amber-*` (dark-on-dark); here a theme-aware *lightening* background sits under a hardcoded-*light* inline colour (light-on-light). **The F2 03E sweep grep — "a hardcoded dark `linear-gradient(... rgba(...` paired with a `text-amber-50/100/200`" — will NOT match this**, because the offender is a themeable-var background + an inline hex colour, not a hardcoded-dark background + a utility class. So this needs its own fix (03G), not the 03A var-swap.
- **The search-result branch is fine — leave it.** When `isSearch`, the background is a *hardcoded dark* `rgba(12, 24, 41, 0.7)` that stays dark in both themes, so the `#fef3c7` light text reads correctly there. Only the Oracle (non-search) and user bubbles are affected.

Verification commands (read-only):

```bash
sed -n '536,572p' dungeon-scholar/src/features/study/ChatMode.jsx   # user bubble (:543 bg / :545 #fef3c7) + Oracle bubble (:561 bg / :563 #fef3c7) + search-branch dark bg
grep -n "color: '#fef3c7'" dungeon-scholar/src/features/study/ChatMode.jsx
grep -n -- '--surface-amber' dungeon-scholar/src/index.css            # the var that lightens the bubble in light theme
```

**Suggested action:** stop hardcoding the bubble body text as a fixed light hex. Because these surfaces **lighten** in Light theme, the text must **darken** — route the body text through an inverting `text-amber-*` utility / a theme-aware text token so it resolves dark-on-light in Light theme and light-on-dark in Dark theme. Do **not** apply the 03A var-swap (the background is already correct) and do **not** use the non-inverting `--on-dark-fg` escape hatch here (that is only for surfaces that must stay dark in both themes — these don't).


### F6 (low) — Light theme: Library tag chips, tome-subject label, and sealed badge are low-contrast (same family as F5)

**Status: confirmed in source.**

QA repro (report 1, section 7 — Light theme, Library open):

1. Switch to Light theme. 2. Open the Library. 3. Tag chips ("#sociology", "#race", ...) and the "subject" label render pale-on-pale.

QA measured: tag chip text gold `rgb(252,211,77)` (amber-300) on pale-amber chip `rgba(253,230,138,.4)` -> **1.16:1**; tome-subject label purple `rgb(216,180,254)` (purple-300) on pale-purple `rgba(243,232,255,.7)` -> **1.5:1**.

Root cause, confirmed in source - and **identical to F5/03G** (theme-aware *lightening* background + hardcoded *non-inverting* inline hex text), not the F1-F3 dark-on-dark pattern:

- **Tag chip** (`src/features/library/LibraryScreen.jsx:561-573`): background `rgba(var(--surface-amber-strong, 120, 53, 15), 0.4)` (`:569`) - a themeable var that **lightens** in Light theme - under `color: '#fcd34d'` (`:570`), a hardcoded inline hex (amber-300's raw light value) that does **not** invert. Light chip + light text = ~1.16:1.
- **Tome-subject label** (`src/features/library/LibraryScreen.jsx:520-531`): background `rgba(var(--surface-purple, 31, 12, 41), 0.7)` (`:526`, lightens) under `color: '#d8b4fe'` (`:528`, hardcoded purple-300 light value). Same defect, ~1.5:1.
- **Sealed badge** (`src/features/library/LibraryScreen.jsx:493-504`): background `rgba(var(--surface-purple, 31, 12, 41), 0.8)` (`:497`, lightens) under `color: '#d8b4fe'` (`:499`). Same defect.
- **Leave the author + difficulty chips** (`:540-545` `#93c5fd` on a hardcoded-dark `rgba(12,24,41,.7)`; `:551-556` `#fca5a5` on hardcoded-dark `rgba(41,12,12,.7)`): their backgrounds stay dark in both themes (like the ChatMode `isSearch` bubble), so the light text reads correctly - do not touch.
- **The fix is the 03G mechanism, not 03A:** `index.css` already defines inverting Light overrides for `--color-amber-300` (`:133`) and `--color-purple-300` (`:143`), so replacing the inline `color: '#fcd34d'`/`'#d8b4fe'` with the `text-amber-300`/`text-purple-300` **utility classes** makes the text track the ramp and darken in Light theme. Do **not** alter the (already-correct) chip backgrounds.

Verification commands (read-only):

```bash
sed -n '493,573p' dungeon-scholar/src/features/library/LibraryScreen.jsx   # sealed badge (:497/:499), subject label (:526/:528), tag chip (:569/:570), and the leave-alone author/difficulty chips
grep -n "color: '#fcd34d'\|color: '#d8b4fe'" dungeon-scholar/src/features/library/LibraryScreen.jsx
grep -n -- '--color-amber-300\|--color-purple-300' dungeon-scholar/src/index.css   # inverting Light overrides (:133 / :143)
```

**Suggested action:** route the chip/label/badge text through the inverting `text-amber-300` / `text-purple-300` utilities (or a theme-aware token) so it darkens in Light theme; leave the chip backgrounds and the on-dark author/difficulty chips unchanged.


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

> **Note (re-confirmed 2026-06-29 run 2):** the `:341` dark gradient is set via the inline `background:` shorthand, i.e. it resolves to a **`background-image`** (a `linear-gradient`), not a `background-color`. A Light-theme override that only sets `background-color` will **not** cover it — route the whole `background` through the `--panel-bg-sapphire` var (or pin the face text per 03A) so the gradient itself flips.

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

### 03G — Chat (Oracle + user) bubble text follows the theme (F5)

**Objective:** the Oracle answer body and the user-message body meet WCAG AA (>=4.5:1) in **both** themes, without altering the (already-correct) bubble backgrounds.

**Files:** `dungeon-scholar/src/features/study/ChatMode.jsx` (`:545` user-bubble inline `color`, `:563` Oracle-bubble inline `color`; audit the other inline text colours in this file — e.g. the `system_notice` `color: '#fde047'` at `:528` on a `--surface-amber-strong` surface, the input `text-amber-50` at `:650`).

**Steps:**

1. Replace the hardcoded `color: '#fef3c7'` on the **Oracle** bubble (`:563`) and the **user** bubble (`:545`) with a **theme-aware** text colour that darkens in Light theme — an inverting `text-amber-50/100` utility class (so it tracks the ramp like ordinary parchment text) or a dedicated themed token. This is the OPPOSITE of the 03A pattern: do not touch the background (it already lightens correctly), and do not pin to the non-inverting `--on-dark-fg` token (these surfaces are meant to lighten, so the text must darken).
2. **Leave the search-result branch (`isSearch`) as-is** — its background is a hardcoded dark `rgba(12, 24, 41, 0.7)` that stays dark in both themes, so its `#fef3c7` light text is correct. Verify it still reads.
3. Sweep the remaining hardcoded inline `color: '#fe…'` / `'#fde047'` values that sit on a themeable `--surface-*` background in this file; fix any that go light-on-light in Light theme. Keep the gold "THE ORACLE" label (`#fcd34d`, `:568`) and the amber-600 sources legible (they already are).
4. Add a contrast/computed-style assertion if tractable (render an Oracle message under `data-theme="light"`, assert the body-text colour is dark / passes a luminance-ratio check against the lightened bubble).

**Acceptance:** the Oracle answer body and user-message body pass AA in **both** themes; "THE ORACLE" label + sources stay legible; the search-result bubble is unchanged and still reads; dark theme visually unchanged; `npm run build` clean; any new test green.


### 03H - Library tag chips, subject label, and sealed badge follow the theme (F6)

**Objective:** the Library tag chips, the subject label, and the "Sealed" badge meet WCAG AA (>=4.5:1) in **both** themes, without altering their (already-correct) backgrounds.

**Files:** `dungeon-scholar/src/features/library/LibraryScreen.jsx` (tag chip `:570`, subject label `:528`, sealed badge `:499`).

**Steps:**

1. Replace the hardcoded inline `color: '#fcd34d'` (tag chip `:570`) and `color: '#d8b4fe'` (subject label `:528`, sealed badge `:499`) with the inverting `text-amber-300` / `text-purple-300` utility classes (or a theme-aware token) - the 03G mechanism (darken the text), **not** the 03A var-swap (the backgrounds already lighten correctly).
2. Leave the author chip (`:540-545`, `#93c5fd` on hardcoded-dark) and difficulty chip (`:551-556`, `#fca5a5` on hardcoded-dark) unchanged - their dark backgrounds stay dark in both themes, so the light text is correct.
3. Add a contrast/computed-style assertion if tractable (render a Library card under `data-theme="light"`, assert the chip/label text passes a luminance-ratio check against its lightened background).

**Acceptance:** Library tag chips, subject label, and sealed badge pass AA in **both** themes; the on-dark author/difficulty chips are unchanged; dark theme visually unchanged; `npm run build` clean; any new test green.


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
- The Oracle/Chat answer body and user-message bubbles pass WCAG AA in both themes (F5) — fixed by darkening the text, not the already-themed background.
- The Library tag chips, tome-subject label, and sealed badge pass WCAG AA in both themes (F6) - same fix as F5 (invert the text; leave the background and the on-dark author/difficulty chips alone).
- Dark theme is visually unchanged.
- `dungeon-scholar-ci.yml` green (full `npm run test` + `npm run build`).

## Out of scope

- Regenerating or re-tuning the light-theme colour ramp itself (PHASE-41's generated block) — this phase only fixes components that opt out of the themeable vars.
- The colourblind-safe palette toggle and any broader colour-system redesign — separate concern.
- Dark-theme appearance — confirmed already readable by QA (the defect is light-theme-specific); do not alter it beyond what the var swap implies.
