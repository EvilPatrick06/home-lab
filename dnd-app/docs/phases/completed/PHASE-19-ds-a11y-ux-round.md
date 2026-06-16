# PHASE-19 — Dungeon Scholar accessibility + UX round

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Close the open accessibility and UX-polish findings in `dungeon-scholar/` (the GitHub-Pages study app): give every modal overlay real dialog semantics with a shared focus-trap hook (WAI-ARIA APG dialog pattern), add the global `prefers-reduced-motion` CSS block, harden answer-correctness feedback so it never relies on color alone (WCAG 1.4.1 — the real remaining gap is the dungeon-delve per-option reveal), make the practice-exam countdown audible to screen readers at milestone moments, add next-action CTAs to dead-end empty states, surface the muted-by-default procedural audio with a one-time opt-in banner, and grow the header icon buttons to a 44 px (AAA) tap target. Four of the eleven audit findings turned out already fixed in the live tree (M12, L4, L3, QA-Bestiary badges); this phase locks them in with regression tests instead of re-implementing them.

## Dependencies & cross-phase notes

- **No prerequisite phases** (independent — front of the set per PHASE-INDEX).
- **PHASE-17 (ds bug round)** and **PHASE-18 (ds security round)** also edit `dungeon-scholar/src/App.jsx` and `src/components/ExamMode.jsx`. Phases run numerically, so 17/18 land first — **re-run every verification command below before editing; all line numbers cited here will have drifted.** Functional anchors (function names, string literals) are given for every citation so re-location is mechanical.
- **PHASE-39 (ds architecture)** splits the 10,875-line `App.jsx` into feature modules. It depends on 17–19 landing first; new components created here (`useDialogA11y.js`, `AudioInviteBanner.jsx`) should live in `src/components/` so PHASE-39 can move them untouched.
- **PHASE-40 (ds PWA/cloud)** owns `src/audio/sound.js` changes for L8 (AudioContext close). Sub-phase 19F only *reads* `sound.js` exports (`getAudioSettings`, `setMuted`) — do not restructure `sound.js` here.
- **PHASE-41 (ds sealed tomes + light theme)** owns `index.css` light-theme work. Sub-phase 19B appends one independent media-query block to `index.css`; no collision expected, but if PHASE-41 somehow runs first, append after its blocks.

## Verified findings

All verification commands were run 2026-06-10 from the repo root against the live tree. `dungeon-scholar/src/App.jsx` is currently **10,875 lines** (`wc -l dungeon-scholar/src/App.jsx`) — the audit's line numbers (written against ~9,278 lines) were stale; corrected positions are given below.

### H4 — Modal overlays lack dialog semantics + focus management (OPEN, scope corrected: 17 sites, not 3)

The audit claimed three modals (`PromptModal.jsx:45`, `AccountPanel.jsx:57`, `MergeChooser.jsx:35`) lack `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, Escape-to-close, and focus restore. Reality is broader and partially improved:

- **Escape-to-close already exists on most modals** ("Phase 37b QA P2"): a `useEscapeKey` hook is defined in `App.jsx` (search anchor: `function useEscapeKey(onEscape)` — currently App.jsx:1107) and used by 8 App.jsx modals; `PromptModal.jsx` carries its own copy (PromptModal.jsx:6); `ConfirmModal` has bespoke Escape handling (anchor: `// Escape always cancels.`, App.jsx:10562).
- **One modal already has dialog semantics**: ExamMode's trial-detail modal (`ExamMode.jsx:731-738`) has `role="dialog"`, `aria-modal="true"`, `aria-label="Trial detail"`, and backdrop-click close — but still no focus trap or focus restore.
- **No modal anywhere has a focus trap, initial-focus placement, or focus restore.** Background content stays tab-able under every overlay.
- **`AccountPanel.jsx` and `MergeChooser.jsx` have neither Escape nor any ARIA dialog attribute** (verified: `grep -n "role=\|aria-modal\|Escape\|focus" dungeon-scholar/src/components/AccountPanel.jsx` → no matches; same for MergeChooser except button `aria-label`s).

Full inventory of overlay sites (verify with `grep -n "fixed inset-0" dungeon-scholar/src/App.jsx dungeon-scholar/src/components/*.jsx`, ignore the three `pointer-events-none` background layers at App.jsx:2931/2934/2937):

| # | Site | Current anchor | Escape today | role=dialog today |
|---|---|---|---|---|
| 1 | Clear-chat confirm (Oracle screen, inline) | App.jsx:6488 `{showClearConfirm &&` | no | no |
| 2 | Purchase confirm (Marketplace, inline) | App.jsx:8017 `{pendingPurchase &&` | no | no |
| 3 | `WelcomeModal` | App.jsx:9905 | yes (`useEscapeKey(onSkip)`) | no |
| 4 | `ShareTomeModal` | App.jsx:10069 | yes | no |
| 5 | `ImportCodeModal` | App.jsx:10202 | yes | no |
| 6 | `MetadataEditModal` | App.jsx:10276 | yes | no |
| 7 | `ResetConfirmModal` | App.jsx:10476 | yes | no |
| 8 | `ConfirmModal` | App.jsx:10555 | yes (bespoke) | no |
| 9 | `PasteTomeModal` | App.jsx:10633 | yes | no |
| 10 | `AchievementsModal` | App.jsx:10720 | yes | no |
| 11 | `TitlesModal` | App.jsx:10794 | yes | no |
| 12 | `MergeChooser` | components/MergeChooser.jsx:40 | **no** | no |
| 13 | `AccountPanel` | components/AccountPanel.jsx:57 | **no** | no |
| 14 | `PromptModal` (`ModalShell`) | components/PromptModal.jsx:57 | yes (local hook) | no |
| 15 | Exam submit confirm (inline) | components/ExamMode.jsx:553 `{showSubmitConfirm &&` | no | no |
| 16 | Exam trial-detail | components/ExamMode.jsx:731 | no (backdrop click only) | **yes** |

### H7 — Color-only answer-correctness feedback (PARTIALLY OPEN — claim corrected)

The audit said quiz feedback is "distinguished purely by red/green bg + icon color" at App.jsx:4517–4523. **Corrected:** the QuizMode answered panel has carried non-color text tokens since the app's first commit (`git log -S "Strike True" --oneline` → present in `e7d9b4f7`, the initial import): `'⚔ Strike True! ⚔'` vs `'✗ The Blow Falters'` plus `Check`/`X` icons. Current anchors:

- QuizMode answered panel: App.jsx:5578-5586 (anchor: `'⚔ Strike True! ⚔'`). Colors: emerald bg/border vs red bg/border, both `border-2` **solid** — the border carries no non-color distinction.
- LabMode feedback panel: App.jsx:5977-5984 (anchor: `'⚔ Stage Conquered! ⚔'` / `'✗ Try Again, Brave One'`). Same pattern.
- Neither panel has `role="status"`/`aria-live`, so the verdict is silent for screen readers.

**The genuine WCAG 1.4.1 failure is the dungeon-delve battle reveal** (`dungeon-scholar/src/components/DungeonExplore.jsx:2412-2435`, anchor: `const isPickedWrong = revealResult && revealResult.choice === i`): after answering, the correct option and the picked-wrong option are distinguished ONLY by green/red background + border + text color — no glyph, no text marker, no border-style change. Verify:

```bash
grep -n "isPickedWrong\|isPickedRight\|isAnsRight" dungeon-scholar/src/components/DungeonExplore.jsx
```

ExamMode's "By Domain" result rows use a 4-band color ramp but each row also prints `{correct}/{total} · {pct}%` text (ExamMode.jsx:620-645), so they pass 1.4.1 — no change needed there.

### M12 — MergeChooser destructive warning hover-only (ALREADY FIXED — verify only)

The audit said the "other side will be replaced" warning lived only in `title=`. **Corrected:** the warning is now an always-visible inline paragraph — `MergeChooser.jsx:48`: `Thy progress lives in two places. Choose which to keep — the other will be replaced.` — and each pick button carries an action-specific `aria-label` ("Keep this device's progress and overwrite the cloud copy" / "Use the cloud progress and overwrite this device's copy", MergeChooser.jsx:58/66, comment cites "Phase 33e QA P5"). Verify:

```bash
grep -n "the other will be replaced\|overwrite the cloud copy" dungeon-scholar/src/components/MergeChooser.jsx
```

Residue folded into 19A/19H: MergeChooser still lacks dialog semantics + Escape (H4 table row 12), and there is no test locking the visible warning.

### M7 — No `prefers-reduced-motion` block (OPEN — confirmed)

`dungeon-scholar/src/index.css` (106 lines) contains no `@media` rule at all — only `@import 'tailwindcss'`, `@layer base` blocks (border compat, focus indicators), `.skip-to-main:focus`, and light-theme custom properties. Verify:

```bash
grep -n "@media\|prefers-reduced-motion" dungeon-scholar/src/index.css   # → no output
```

Motion sources that the block will tame: `animate-pulse` ×4 in App.jsx (quest badge App.jsx:3120, low-time exam clock ExamMode.jsx:397, SyncStatusDot saving pulse, others), `animate-spin` ×5 (Loader2 spinners), ~38 `transition` utilities, plus PromptModal/ExamMode pulses. The DungeonExplore canvas game loop (`requestAnimationFrame` at DungeonExplore.jsx:3899-3901) is gameplay, not decoration — deliberately untouched by the CSS block.

### L5 — Exam timer silent for screen readers (OPEN — confirmed, lines drifted)

`ExamMode.jsx` in-progress header (audit said 218–243; now ~387-409, anchor: `const lowTime = secondsLeft < 5 * 60;`): the clock `<span>` has no `role="timer"`, no `aria-live`, and the `lowTime` state is conveyed purely by red color + `animate-pulse` (ExamMode.jsx:396-398). The countdown ticks once per second via `setInterval` in the `phase === 'inProgress'` effect (ExamMode.jsx:120-132, anchor: `const id = setInterval(tick, 1000);`). Verify:

```bash
grep -n "role=\"timer\"\|aria-live" dungeon-scholar/src/components/ExamMode.jsx   # → no output today
grep -n "setInterval(tick, 1000)" dungeon-scholar/src/components/ExamMode.jsx
```

### L4 — Notification toast aria-live (ALREADY FIXED — verify only)

The audit asked to wrap the toast in `role="status" aria-live="polite"`. **Corrected:** the toast container already has exactly that (App.jsx:3002-3006, comment "Phase 38a/39b/44c: clickable notifications + SR a11y"; `role={notification.onClick ? 'button' : 'status'}` + `aria-live="polite"` + hover/focus pause of the dismiss timer). Verify:

```bash
grep -n "aria-live=\"polite\"" dungeon-scholar/src/App.jsx | head -3
```

Nothing to implement; 19H records the verification.

### L3 — Decorative icons lack `aria-hidden` (ALREADY RESOLVED at the library level — claim corrected)

The audit asked for an `aria-hidden="true"` sweep across all lucide icon usages (~201 JSX icon usages, only 26 with an explicit `aria-hidden`). **Corrected:** the installed `lucide-react` **1.17.0** applies `aria-hidden="true"` automatically to every icon rendered without children and without any explicit a11y prop. Verified in the shipped source:

```bash
cd dungeon-scholar && node -p "require('lucide-react/package.json').version"   # 1.17.0
grep -n "aria-hidden" dungeon-scholar/node_modules/lucide-react/dist/esm/Icon.mjs
# → ...!children && !hasA11yProp(rest) && { "aria-hidden": "true" },
```

This matches the upstream accessibility guidance (lucide docs: icons are `aria-hidden` by default; only opt standalone meaningful icons in via `aria-label` or a `<title>` child). A scripted scan for icon-only buttons missing an accessible name found none (header buttons, modal close buttons, etc. all carry `aria-label` — e.g. App.jsx:3113-3177, PromptModal.jsx close/back buttons). The remaining work is a regression lock (19H), not a sweep.

### L1 — Header icon buttons under 44 px tap target (OPEN — measurement corrected)

The audit said ~36×36 px at App.jsx:2717–2769. **Corrected:** the header `<nav aria-label="Primary">` block is now App.jsx:3094-3241; the five icon buttons (Quest Board, Library, The Hoard, Marketplace, Hall of Glory — anchors `onClick={() => setScreen('quests')}` etc.) use `p-2` (8 px) + `w-5 h-5` icon (20 px) + `border-2` (2 px) = **40×40 px** rendered. That passes WCAG 2.2 SC 2.5.8 (AA, 24 px minimum) but misses the 44 px AAA/`mobile platform` target the audit adopted. The Hearth button (`px-3 py-2` + text) is ~40 px tall. Verify:

```bash
grep -n 'className="p-2 hover:bg' dungeon-scholar/src/App.jsx | head -6
```

### L17 — Empty states without next-action CTAs (PARTIALLY OPEN — claim corrected)

"Phase 30d QA #7" already added exit affordances to several empty states (flashcards empty → Return Home / Clear-Filter button grid, App.jsx:5000-5016; quiz **filtered** empty → Clear Filter button, App.jsx:5407-5413). Remaining true dead-ends, verified by reading each branch:

1. **Quiz unfiltered empty** — `'No riddles in this tome.'` (App.jsx:5404) renders with NO button when `domainFilter` is null (the button at 5408 is inside `{domainFilter && ...}`).
2. **LabMode empty** — `'No trials in this tome.'` (App.jsx:5713) — bare `<div>`, no CTA.
3. **Library empty card** — `~ The Shelves Stand Empty ~` (App.jsx:3845-3858) — prose only; the create/import buttons exist in the toolbar above (App.jsx:3808-3841: `onShowPrompt` "Forge with Magic", `onPaste`, `onImportCode`, `onImport` "Inscribe a Tome") but the empty card itself has no inline CTA pointing at them.
4. **Mistake-vault empty** — `The Tome is Empty` (App.jsx:6553-6559) — prose only, no way to jump to a study mode.

Verify: `grep -n "No riddles in this tome\|No trials in this tome\|The Shelves Stand Empty\|The Tome is Empty" dungeon-scholar/src/App.jsx`.

### L16 — Audio muted by default with no discovery prompt (OPEN — confirmed)

`dungeon-scholar/src/audio/sound.js:15`: `muted: true` in `DEFAULT_SETTINGS` ("Default mute so the page is silent until the player opts in"); settings persist to `localStorage` key `dungeon-scholar-audio-settings` (sound.js:12). The only un-mute surface is the `AudioPanel` ("✦ Bardic Settings ✦", App.jsx:4601-4660) rendered inside the home-screen Account/settings collapsible groups (`<AudioPanel />` at App.jsx:4298 and 4591) — nothing on first paint tells the player procedural BGM/SFX exist. `armOnFirstGesture()` is wired at App.jsx:1386 so the AudioContext resumes on first interaction; `setMuted(false)` itself resumes the context (sound.js:89-103). HomeScreen's two top-level returns are at App.jsx:4157 (no-tome welcome branch) and App.jsx:4304 (main branch, anchor `⚔ ACTIVE TOME ⚔`). Verify:

```bash
grep -n "muted: true" dungeon-scholar/src/audio/sound.js
grep -n "Wake the bards" dungeon-scholar/src/App.jsx   # → no output today
```

### QA-Bestiary — per-item difficulty/Bloom badges (ALREADY IMPLEMENTED — verify only)

The audit said per-item study UIs don't show the tome-level difficulty/Bloom metadata. **Corrected:** `DifficultyStars` (App.jsx:4733) and `BloomBadge` (App.jsx:4744) render per-item in FlashcardsMode (App.jsx:5037-5038), QuizMode (App.jsx:5440-5441), ExamMode question chip row (App.jsx-side ExamMode.jsx:5470-5495 equivalent — anchor `hasDifficulty`/`hasBloom` in ExamMode.jsx:425-435), LabMode (App.jsx:5731, 5925, 5932-5933), and the delve question log (App.jsx:6933-6936). Landed 2026-05-10 (`4c402637 feat(dungeon-scholar): surface difficulty + Bloom's-level in study UI (P3)`) and refined 2026-05-17 (`9217da57`, `1256f538`). Verify:

```bash
grep -c "DifficultyStars\|BloomBadge" dungeon-scholar/src/App.jsx   # ≥ 16
git log --oneline -S "DifficultyStars" -- dungeon-scholar/src/App.jsx
```

Nothing to implement; 19H records the verification.

### Environment facts an executor needs

- Tests: `cd dungeon-scholar && npx vitest run` — vitest 4 + `happy-dom` environment + `@testing-library/react` 16 + `@testing-library/jest-dom` (see `vite.config.js` `test:` block and `src/test-setup.js`). Existing component-test pattern: `src/components/PromptModal.test.jsx`.
- No lint/tsc script exists for dungeon-scholar (`package.json` scripts: dev/build/preview/test only). CI (`.github/workflows/deploy.yml`) runs `npm run test` then `npm run build` on push to master touching `dungeon-scholar/**`, then deploys to GitHub Pages.
- React 19, Tailwind CSS v4 (via `@tailwindcss/postcss`), `type: "module"`, plain JSX (no TypeScript).

## Sub-phases

Order keeps the tree green: each sub-phase is independently shippable; new files land with their tests in the same sub-phase.

### 19A — Shared dialog a11y hook + conversion of all 16 modal overlay sites (H4, M12 residue)

**Objective:** every modal overlay gets `role="dialog"`, `aria-modal="true"`, an accessible name, focus trap, initial focus, Escape-to-close, and focus restore — via one shared hook, per the WAI-ARIA APG modal-dialog pattern.

**Files:**
- NEW `dungeon-scholar/src/components/useDialogA11y.js`
- NEW `dungeon-scholar/src/components/useDialogA11y.test.jsx`
- NEW `dungeon-scholar/src/components/MergeChooser.test.jsx`
- `dungeon-scholar/src/components/MergeChooser.jsx`
- `dungeon-scholar/src/components/AccountPanel.jsx`
- `dungeon-scholar/src/components/PromptModal.jsx` (+ extend `PromptModal.test.jsx`)
- `dungeon-scholar/src/components/ExamMode.jsx`
- `dungeon-scholar/src/App.jsx`

**Steps:**

1. Implement `useDialogA11y` in `src/components/useDialogA11y.js`:
   ```js
   import { useEffect, useRef } from 'react';

   const FOCUSABLE =
     'a[href], button:not([disabled]), textarea:not([disabled]), ' +
     'input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

   /**
    * WAI-ARIA APG modal-dialog behavior: initial focus, Tab/Shift+Tab trap,
    * Escape-to-close, focus restore to the invoker on close/unmount.
    * Attach the returned ref to the dialog PANEL element (the one that
    * carries role="dialog" aria-modal="true" + aria-label/aria-labelledby).
    * `active` lets always-mounted components (inline confirms) arm the hook
    * only while their overlay is rendered.
    */
   export function useDialogA11y({ onClose, active = true } = {}) {
     const panelRef = useRef(null);
     useEffect(() => {
       if (!active) return undefined;
       const panel = panelRef.current;
       if (!panel) return undefined;
       const previouslyFocused = document.activeElement;
       const focusables = () => Array.from(panel.querySelectorAll(FOCUSABLE));
       // Initial focus: first [data-autofocus], else first focusable, else the panel.
       const preferred = panel.querySelector('[data-autofocus]') || focusables()[0];
       if (preferred) preferred.focus();
       else { panel.setAttribute('tabindex', '-1'); panel.focus(); }
       const onKeyDown = (e) => {
         if (e.key === 'Escape') {
           if (typeof onClose === 'function') { e.stopPropagation(); e.preventDefault(); onClose(); }
           return;
         }
         if (e.key !== 'Tab') return;
         const items = focusables();
         if (items.length === 0) { e.preventDefault(); return; }
         const first = items[0];
         const last = items[items.length - 1];
         const current = document.activeElement;
         if (e.shiftKey && (current === first || !panel.contains(current))) {
           e.preventDefault(); last.focus();
         } else if (!e.shiftKey && (current === last || !panel.contains(current))) {
           e.preventDefault(); first.focus();
         }
       };
       document.addEventListener('keydown', onKeyDown, true);
       return () => {
         document.removeEventListener('keydown', onKeyDown, true);
         if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
       };
     }, [active, onClose]);
     return panelRef;
   }
   ```
   Notes: capture-phase listener so the trap wins over the app-wide hotkey listeners (exam 1-9/T/F hotkeys at ExamMode.jsx:170-194 already skip INPUT/TEXTAREA but not buttons — the trap's `stopPropagation` on Escape also prevents double-close with any legacy `useEscapeKey` still mounted during conversion). Do NOT filter focusables by `offsetParent` — happy-dom does not lay out, and every converted modal renders its focusables unconditionally.
2. Write `useDialogA11y.test.jsx` (pattern: PromptModal.test.jsx): a fixture component with a trigger button and a conditional panel (two buttons inside). Assert: (a) focus moves into the panel on open; (b) Escape calls `onClose`; (c) Tab from the last focusable wraps to the first and Shift+Tab from the first wraps to the last (dispatch `fireEvent.keyDown(document.activeElement, { key: 'Tab' })`); (d) closing restores focus to the trigger; (e) `active: false` does nothing.
3. Convert the three extracted components:
   - **MergeChooser** (`MergeChooser.jsx:40-46`): panel div gets `role="dialog" aria-modal="true" aria-labelledby="merge-chooser-title"` (add `id="merge-chooser-title"` to the `<h2>`); `const panelRef = useDialogA11y({ onClose: () => onResolve('cancel') })` — Escape takes the safe path (cancel sign-in, keep device unchanged).
   - **AccountPanel** (`AccountPanel.jsx:57-58`): panel gets `role="dialog" aria-modal="true" aria-label="Account panel"`; `useDialogA11y({ onClose })`. Place the hook call before the `if (!user) return null` early return (hooks must be unconditional) and pass `active: !!user`.
   - **PromptModal** (`ModalShell`, PromptModal.jsx:54-65): move dialog semantics into `ModalShell` (`role="dialog" aria-modal="true" aria-label="Spell of Tome Creation"`), call `useDialogA11y({ onClose })` inside `ModalShell`, delete the local `useEscapeKey` hook + its call.
4. Convert the App.jsx modal components (table rows 3-11): for each of `WelcomeModal`, `ShareTomeModal`, `ImportCodeModal`, `MetadataEditModal`, `ResetConfirmModal`, `ConfirmModal`, `PasteTomeModal`, `AchievementsModal`, `TitlesModal` — replace the `useEscapeKey(...)` call (and ConfirmModal's bespoke Escape effect) with `const panelRef = useDialogA11y({ onClose: <same callback> })`, attach `ref={panelRef}` + `role="dialog" aria-modal="true"` + `aria-label` (use the modal's visible heading text, e.g. "Welcome", "Share tome", "Edit tome details", "Reset progress", "Paste tome text", "Hall of Glory", "Titles") to the inner panel div. For `ConfirmModal`, `data-autofocus` goes on the **Cancel** button (APG: focus the least destructive action). Delete `useEscapeKey` from App.jsx once all callers are gone (`grep -n "useEscapeKey" dungeon-scholar/src` must return only the new hook file, i.e. nothing).
5. Convert the inline overlays (rows 1, 2, 15) — these live inside larger components, so call the hook unconditionally at component top with `active`:
   - Clear-chat confirm (anchor `{showClearConfirm &&`, App.jsx:6488): `useDialogA11y({ onClose: () => setShowClearConfirm(false), active: showClearConfirm })`.
   - Purchase confirm (anchor `{pendingPurchase &&`, App.jsx:8017): `active: !!pendingPurchase`, `onClose: () => setPendingPurchase(null)`.
   - Exam submit confirm (anchor `{showSubmitConfirm &&`, ExamMode.jsx:553): `active: showSubmitConfirm`, `onClose: () => setShowSubmitConfirm(false)`.
   Each panel gets `ref` + `role="dialog" aria-modal="true" aria-label` ("Clear chat confirmation", "Confirm purchase", "Submit exam confirmation").
6. Exam trial-detail modal (ExamMode.jsx:731-738, already `role="dialog"`): add `useDialogA11y({ onClose, active: !!selectedTrial })` for trap + restore (hook at `ExamModeImpl` top alongside the submit-confirm hook, or inside the trial-detail component if extracted — keep whichever shape the file has after PHASE-17). Keep the existing backdrop-click close.
7. Extend `PromptModal.test.jsx`: assert `screen.getByRole('dialog')` exists and has `aria-modal="true"`; assert Escape fires `onClose`. Write `MergeChooser.test.jsx`: renders with stub states; asserts the visible destructive warning text (`/the other will be replaced/i`) — the M12 regression lock — plus `getByRole('dialog')` and Escape → `onResolve('cancel')`.

**Cheap checks:** `cd dungeon-scholar && npx vitest run src/components/useDialogA11y.test.jsx src/components/MergeChooser.test.jsx src/components/PromptModal.test.jsx` and `npm run build` (catches JSX/syntax slips in App.jsx).

**Acceptance:** every row in the H4 table has `role="dialog"` + `aria-modal="true"` + accessible name + trap + Escape + focus restore; `grep -rn "useEscapeKey" dungeon-scholar/src` → no matches; the three new/extended test files pass.

### 19B — Global `prefers-reduced-motion` block (M7)

**Objective:** users with reduced-motion enabled stop seeing `animate-pulse`/`animate-spin`/transition movement, per the standard MDN-recommended override.

**Files:** `dungeon-scholar/src/index.css`.

**Steps:** append to `index.css`:

```css
/* PHASE-19B: honor prefers-reduced-motion (WCAG 2.3.3). Near-zero durations
 * (not `animation: none`) so animation/transition end events still fire and
 * JS that waits on them can't hang. Iteration count 1 freezes infinite
 * loops (pulse badges, low-time exam clock, spinners) at a static frame.
 * The dungeon canvas game loop is rAF-driven gameplay and is intentionally
 * unaffected. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Cheap checks:** `cd dungeon-scholar && npm run build` (Tailwind v4 postcss pass compiles the file).

**Acceptance:** `grep -n "prefers-reduced-motion" dungeon-scholar/src/index.css` → 1 block; build green.

### 19C — Non-color correctness signals (H7)

**Objective:** the delve battle reveal identifies the correct/wrong options without color; quiz/lab verdict panels gain a border-pattern distinction and a screen-reader announcement.

**Files:** `dungeon-scholar/src/components/DungeonExplore.jsx`, `dungeon-scholar/src/components/DungeonExplore.test.js`, `dungeon-scholar/src/App.jsx`.

**Steps:**

1. In `DungeonExplore.jsx`, export a pure helper next to `buildQuestionLogEntry` (so it is unit-testable without rendering):
   ```js
   // PHASE-19C: non-color reveal decoration (WCAG 1.4.1) — the correct option
   // gets a check glyph + solid border, the picked-wrong option a cross glyph
   // + dashed border, so the outcome reads without color perception.
   export function revealDecoration(revealResult, optionIndex, correctIndex) {
     if (!revealResult) return { glyph: '', borderStyle: 'solid' };
     const isAnsRight = optionIndex === correctIndex;
     const isPickedWrong = revealResult.choice === optionIndex && !revealResult.correct;
     if (isAnsRight) return { glyph: '✓ ', borderStyle: 'solid' };
     if (isPickedWrong) return { glyph: '✗ ', borderStyle: 'dashed' };
     return { glyph: '', borderStyle: 'solid' };
   }
   ```
2. In the battle option map (anchor `const isPickedWrong = revealResult && revealResult.choice === i`, DungeonExplore.jsx:2412-2435): call `revealDecoration(revealResult, i, q.correctIndex)`; prepend `{glyph}` to the option label and switch the inline border to `` `2px ${borderStyle} ${border}` `` when `revealResult` is set (today it is `1px solid`). Keep the existing color values.
3. Make the reveal verdict line (anchor `'✦ Thy answer rings true.'`, DungeonExplore.jsx:2437-2446) a live region: `role="status"` on its wrapper div, so delve verdicts are announced.
4. In `App.jsx`: QuizMode answered panel (anchor `'⚔ Strike True! ⚔'`, App.jsx:5578) and LabMode feedback panel (anchor `'⚔ Stage Conquered! ⚔'`, App.jsx:5977) — add `role="status"` to the panel div and add `borderStyle: answered.correct ? 'solid' : 'dashed'` (resp. `feedback.correct`) to the inline style object, doubling the existing color cue with a pattern cue. (The text + ⚔/✗ glyph tokens already satisfy the text channel — verified above.)
5. Unit tests in `DungeonExplore.test.js`: `revealDecoration` returns check/solid for the correct index, cross/dashed for the picked-wrong index, neutral otherwise, and empty glyph pre-reveal.

**Cheap checks:** `cd dungeon-scholar && npx vitest run src/components/DungeonExplore.test.js` + `npm run build`.

**Acceptance:** delve reveal shows ✓/✗ glyphs + border-style difference; quiz/lab panels have `role="status"` + dashed-on-wrong border; tests pass.

### 19D — Exam timer screen-reader announcements (L5)

**Objective:** the practice-exam countdown gets `role="timer"` semantics and milestone announcements (30/10/5/1 minutes remaining) through a visually hidden live region — never per-second chatter (the timer role's implicit `aria-live="off"` is correct for the ticking display; milestones use a separate region, per the MDN timer-role guidance).

**Files:** NEW `dungeon-scholar/src/services/timerAnnounce.js`, NEW `dungeon-scholar/src/services/timerAnnounce.test.js`, `dungeon-scholar/src/components/ExamMode.jsx`.

**Steps:**

1. `src/services/timerAnnounce.js` — pure threshold-crossing helper:
   ```js
   // PHASE-19D: milestone announcements for the exam countdown. Returns a
   // message when the remaining time crosses a threshold between two ticks,
   // else null. Thresholds descend so only the deepest crossed one fires.
   const THRESHOLDS = [
     { sec: 1800, msg: '30 minutes remain in the trial.' },
     { sec: 600, msg: '10 minutes remain in the trial.' },
     { sec: 300, msg: '5 minutes remain in the trial.' },
     { sec: 60, msg: '1 minute remains in the trial.' },
   ];
   export function timerAnnouncement(prevSeconds, nextSeconds) {
     for (const t of THRESHOLDS) {
       if (prevSeconds > t.sec && nextSeconds <= t.sec) return t.msg;
     }
     return null;
   }
   ```
2. `timerAnnounce.test.js`: crossing each threshold returns its message; non-crossing ticks return null; a resume that jumps past several thresholds (e.g. 700 → 250) returns the deepest crossed message ("5 minutes…"); equal values return null.
3. In `ExamMode.jsx`: add `const [timerAnnounce, setTimerAnnounce] = useState('')` plus a `prevSecondsRef`. In the tick effect (anchor `const id = setInterval(tick, 1000);`, ExamMode.jsx:120-132), after computing `remaining`, call `timerAnnouncement(prevSecondsRef.current, remaining)`; if non-null, `setTimerAnnounce(msg)`; update `prevSecondsRef.current = remaining`. Seed `prevSecondsRef.current = totalSec` in `startExam` and to `remainingSec` in the resume path (anchor `setSecondsLeft(remainingSec)`, ExamMode.jsx:221).
4. In the in-progress header (anchor `const lowTime = secondsLeft < 5 * 60;`, ExamMode.jsx:387-409): wrap the clock span context with `role="timer"` + `aria-atomic="true"` + `aria-label={'Time remaining ' + formatClock(secondsLeft)}` on the existing `<span>` (its implicit `aria-live` stays off — no per-second chatter), and add a sibling visually hidden live region:
   ```jsx
   <span className="sr-only" role="status" aria-live="assertive">{timerAnnounce}</span>
   ```
   (Tailwind's `sr-only` utility is available; assertive is justified — time-limit warnings are time-critical.)

**Cheap checks:** `cd dungeon-scholar && npx vitest run src/services/timerAnnounce.test.js` + `npm run build`.

**Acceptance:** clock has `role="timer"`; milestone messages flow through one `sr-only` live region; helper tests pass; no aria-live on the per-second clock itself.

### 19E — Empty-state CTAs (L17)

**Objective:** the four verified dead-end empty states each gain a concrete next action, reusing existing navigation callbacks.

**Files:** `dungeon-scholar/src/App.jsx`.

**Steps:**

1. **Quiz unfiltered empty** (anchor `'No riddles in this tome.'`, App.jsx:5404): add an optional `onGoToLibrary` prop to `QuizMode` (signature at App.jsx:5105) and wire it at the call site (anchor `{screen === 'quiz' && courseSet &&`, App.jsx:3574-3592) as `onGoToLibrary={() => setScreen('library')}`. In the `!q` empty branch, when `!domainFilter`, render a button "📜 Visit the Grand Library — import or forge a tome with riddles" styled like the existing Clear Filter button (App.jsx:5408-5413) calling `onGoToLibrary?.()`.
2. **LabMode empty** (anchor `'No trials in this tome.'`, App.jsx:5713): same pattern — `onGoToLibrary` prop on `LabMode`, wired at its call site (anchor `{screen === 'lab' && courseSet &&`, App.jsx:3593), CTA button under the message.
3. **Library empty card** (anchor `~ The Shelves Stand Empty ~`, App.jsx:3845-3858): `LibraryScreen` already receives `onShowPrompt` and `onImport` (signature App.jsx:3732). Add a two-button row inside the empty card: "✦ Open the Spell of Tome Creation" → `onShowPrompt`, and "Inscribe a Tome (import JSON)" → `onImport`, styled like the toolbar buttons at App.jsx:3809-3841.
4. **Mistake-vault empty** (anchor `The Tome is Empty`, App.jsx:6553-6559): add an optional `onGoHome` prop to `MistakeVault`, wired at the call site (anchor `{screen === 'vault' &&`, App.jsx:3633-3643) as `onGoHome={() => setScreen('home')}`; render "Return to the Hearth — study a tome to fill this ledger" button under the prose.

All buttons follow the existing empty-state button style (full-width, `rounded-sm`, `border-2 border-amber-700 text-amber-200 italic`, `background: 'rgba(41, 24, 12, 0.7)'`).

**Cheap checks:** `cd dungeon-scholar && npm run build`; `npx vitest run src/tutorial.test.js` (nearest existing App-adjacent suite) is optional — these are presentational additions.

**Acceptance:** each of the four branches renders at least one actionable CTA; no empty-state in QuizMode/LabMode/LibraryScreen/MistakeVault dead-ends without a button.

### 19F — One-time audio opt-in banner (L16)

**Objective:** first home render surfaces the muted-by-default procedural audio with a dismissible "Wake the bards?" banner; choosing to enable un-mutes via the existing persisted settings path. Off-by-default behavior is preserved — the banner never auto-plays sound; audio starts only on the user's explicit click (which is also the required user gesture for AudioContext resume, already handled by `setMuted` in sound.js:89-103).

**Files:** NEW `dungeon-scholar/src/components/AudioInviteBanner.jsx`, NEW `dungeon-scholar/src/components/AudioInviteBanner.test.jsx`, `dungeon-scholar/src/App.jsx`.

**Steps:**

1. `AudioInviteBanner.jsx`:
   - localStorage flag `dungeon-scholar-audio-invite-dismissed` (read/write inside `try { } catch { }` — match the quota-safe pattern in sound.js `saveSettings`).
   - Render `null` when the flag is set OR `getAudioSettings().muted === false` (user already opted in via Bardic Settings).
   - Visible: a slim `role="region" aria-label="Audio invitation"` bar with text `🔊 Wake the bards? This realm has procedural music + sound effects (currently muted).`, an "Enable sound" button → `setMuted(false); playSfx('click');` then set the flag and hide, and a "Not now" button → set the flag and hide. Imports from `'../audio/sound.js'`: `getAudioSettings`, `setMuted`, `playSfx`.
2. Render `<AudioInviteBanner />` as the first child of BOTH HomeScreen returns: the no-tome welcome branch (first element inside `<div className="space-y-6">`, App.jsx:4157-4158) and the main branch (App.jsx:4304-4305, above the `⚔ ACTIVE TOME ⚔` panel).
3. `AudioInviteBanner.test.jsx` (mock `../audio/sound.js` with `vi.mock`): shows when muted + undismissed; hidden when flag set; hidden when unmuted; "Enable sound" calls `setMuted(false)` and persists the flag; "Not now" persists the flag without calling `setMuted`. Reset `localStorage` in `beforeEach`.

**Cheap checks:** `cd dungeon-scholar && npx vitest run src/components/AudioInviteBanner.test.jsx` + `npm run build`.

**Acceptance:** banner appears exactly once per device (until flag cleared), both home branches covered, never auto-plays, tests pass.

### 19G — 44 px header tap targets (L1)

**Objective:** the five header icon buttons and the modal close/back icon buttons reach ≥44×44 px (WCAG 2.5.5 AAA / mobile-platform guideline; current 40×40 px already passes 2.2 AA SC 2.5.8).

**Files:** `dungeon-scholar/src/App.jsx`, `dungeon-scholar/src/components/PromptModal.jsx`.

**Steps:**

1. In the header `<nav aria-label="Primary">` (App.jsx:3094-3241): change `p-2` → `p-3` on the five icon buttons (anchors: `setScreen('quests')`, `setScreen('library')`, `setScreen('inventory')`, `setScreen('shop')`, `setShowAchievements(true)`). Result: 12+20+12+4 border = 48 px. Leave the gold pill (non-interactive) and the Hearth button (text label widens it; bump its `py-2` → `py-2.5` for ≥44 px height) and keep the count-badge absolute positioning (`-top-1 -right-1`) — visually verify badges still sit on the corner after the padding change (badge is positioned relative to the button box, so it tracks automatically).
2. In `PromptModal.jsx`: the close (×2) and back icon buttons use `p-2` + `w-5 h-5` (PromptModal.jsx:75-82, 175-196) — change `p-2` → `p-3`.

**Cheap checks:** `cd dungeon-scholar && npx vitest run src/components/PromptModal.test.jsx` + `npm run build`.

**Acceptance:** `grep -n 'className="p-2 hover:bg' dungeon-scholar/src/App.jsx` → no header-nav matches remain; PromptModal tests still green.

### 19H — Regression locks for the already-fixed findings (L3, L4, M12, QA-Bestiary)

**Objective:** the four findings that verification showed already resolved get cheap permanent guards so a dependency bump or refactor can't silently regress them. (The M12 lock ships inside `MergeChooser.test.jsx` in 19A.)

**Files:** NEW `dungeon-scholar/src/components/lucide-a11y.test.jsx`.

**Steps:**

1. `lucide-a11y.test.jsx`:
   - Render `<X data-testid="icon" />` (lucide-react); assert the rendered `svg` has `aria-hidden="true"` — locks the library default that makes the L3 sweep unnecessary (lucide-react 1.17.0 `Icon.mjs`: `...!children && !hasA11yProp(rest) && { "aria-hidden": "true" }`).
   - Render `<X aria-label="Close" />`; assert `aria-hidden` is ABSENT and `aria-label` present — locks the opt-in path for meaningful icons.
2. Record (in this plan's Completed section, per rule 17) the re-run outputs of the L4 / QA-Bestiary verification greps from the Verified findings section — no code change needed for those two.

**Cheap checks:** `cd dungeon-scholar && npx vitest run src/components/lucide-a11y.test.jsx`.

**Acceptance:** new test passes; if a future lucide-react major drops the default, this test goes red instead of the app silently regressing.

## Research notes

- **Modal dialog pattern** — the W3C APG modal-dialog pattern requires: focus moves inside on open; Tab/Shift+Tab wrap within the dialog; Escape closes; `role="dialog"` + `aria-modal="true"` + `aria-labelledby`/`aria-label` on the container; focus returns to the invoker on close; initial focus goes to the first meaningful element, or the least destructive action for destructive confirms. `aria-modal="true"` replaces the legacy "aria-hidden the background" technique. Sources: [W3C APG Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [W3C APG Modal Dialog Example](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/dialog/).
  - *Alternative considered:* the native `<dialog>` element + `showModal()` gives the trap for free, but converting 16 heterogeneous styled-overlay sites (several inline inside huge components, all styled as full-bleed flex overlays) to `<dialog>` would churn far more markup/CSS than a hook, and React refs + conditional rendering around `showModal()/close()` imperative calls add their own lifecycle bugs. A shared hook matches the existing `useEscapeKey` idiom the codebase already migrated through.
  - *Alternative considered:* `focus-trap-react` dependency — rejected; the repo keeps dungeon-scholar dependency-light (5 runtime deps), and the needed subset is ~40 lines.
- **Reduced motion** — MDN's recommended global override uses `animation-duration: 0.01ms` / `transition-duration: 0.01ms` (NOT `animation: none`) so animation/transition end events still fire for any JS that awaits them, plus `animation-iteration-count: 1` to halt infinite loops and `scroll-behavior: auto`. Essential motion that conveys state should be *replaced*, not removed — here the low-time exam clock keeps its red color + the 19D live announcement as non-motion channels. Sources: [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion), [Tailwind motion-reduce/motion-safe variants](https://tailwindcss.com/docs/animation). A per-utility `motion-reduce:` sweep across ~47 Tailwind call sites was rejected in favor of the one global block (same effect, no churn).
- **Timer announcements** — the ARIA `timer` role has implicit `aria-live="off"` precisely because per-second announcements are unusable noise; the standard approach is a separate live region updated only at meaningful milestones. Assertive is appropriate for time-limit warnings. Sources: [MDN ARIA timer role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/timer_role), [ARIA countdown demo (milestone announcements)](https://pauljadam.com/demos/ariacountdown.html).
- **Toast/status regions** — `role="status"` carries implicit `aria-live="polite"` + `aria-atomic="true"`; the existing toast implementation already conforms (verified). Source: [W3C APG / MDN live-region guidance via the timer-role page above].
- **Lucide icon accessibility** — lucide ships `aria-hidden="true"` by default on icons rendered without children/a11y props (verified in installed 1.17.0 source); meaningful standalone icons opt in via `aria-label` or a `<title>` child. Sources: [Lucide accessibility guide](https://lucide.dev/guide/accessibility), [Lucide React accessibility](https://lucide.dev/guide/react/advanced/accessibility).
- **Use of color** — WCAG SC 1.4.1 (Level A): color must never be the only visual channel; pair it with text, an icon/glyph, or a pattern (border-style) change. Source: [Understanding SC 1.4.1: Use of Color](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html).
- **Target size** — WCAG 2.2 SC 2.5.8 (AA) requires 24×24 px or equivalent spacing; SC 2.5.5 (AAA) requires 44×44 px, which also matches iOS/Android platform guidance. The header buttons measure 40×40 px today (pass AA, miss AAA); this phase adopts the 44 px target the audit specified. Sources: [Understanding SC 2.5.8: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [TestParty WCAG 2.5.5 guide](https://testparty.ai/blog/wcag-2-5-5-target-size-2025-guide).
- **happy-dom focus caveat** — happy-dom implements `document.activeElement`/`focus()` but performs no layout, so focusable-element discovery must not depend on `offsetParent`/visibility checks; the hook therefore filters only on disabled state and tabindex (all converted modals render their focusables unconditionally, so this is sound).

## Test plan

| Sub-phase | New/updated tests |
|---|---|
| 19A | NEW `src/components/useDialogA11y.test.jsx` (trap/Escape/restore/active-flag); NEW `src/components/MergeChooser.test.jsx` (dialog role, Escape→cancel, M12 warning text); UPDATED `src/components/PromptModal.test.jsx` (dialog role, aria-modal, Escape) |
| 19C | UPDATED `src/components/DungeonExplore.test.js` (`revealDecoration` cases) |
| 19D | NEW `src/services/timerAnnounce.test.js` (threshold crossings, multi-skip, no-ops) |
| 19F | NEW `src/components/AudioInviteBanner.test.jsx` (show/hide matrix, enable + dismiss persistence) |
| 19H | NEW `src/components/lucide-a11y.test.jsx` (default aria-hidden; aria-label opt-in) |

End-of-phase gate (INSTRUCTIONS.md rule 5): full `cd dnd-app && npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run` (this phase touches no dnd-app code, so these confirm no accidental spillover) **plus** the dungeon-scholar gates this phase actually exercises: `cd dungeon-scholar && npx vitest run && npm run build` (the same two gates the Pages deploy workflow runs). No Pi code touched — no pytest.

## Acceptance criteria

- [ ] All 16 modal overlay sites have `role="dialog"`, `aria-modal="true"`, an accessible name, focus trap, Escape-to-close, and focus restore via `useDialogA11y`; `useEscapeKey` is deleted.
- [ ] `index.css` contains the standard `prefers-reduced-motion: reduce` override block.
- [ ] Delve battle reveal marks the correct option `✓ `/solid and the picked-wrong option `✗ `/dashed; quiz + lab verdict panels have `role="status"` and a dashed-on-wrong border.
- [ ] Exam clock has `role="timer"`/`aria-atomic`; 30/10/5/1-minute milestones announce through one `sr-only` assertive region.
- [ ] Quiz-unfiltered, labs, library, and vault empty states each render a working CTA.
- [ ] `AudioInviteBanner` shows once (localStorage-flagged) on home when audio is muted; "Enable sound" un-mutes via `setMuted(false)`; never auto-plays.
- [ ] Header icon buttons + PromptModal icon buttons measure ≥44 px.
- [ ] Regression tests lock the lucide `aria-hidden` default and the MergeChooser inline warning; L4 toast + QA-Bestiary badge verifications recorded in Completed.
- [ ] `cd dungeon-scholar && npx vitest run` and `npm run build` green; dnd-app 4-gate green; one phase commit + push; plan moved to `completed/`.

## Out of scope

- `App.jsx` feature-module split, study-mode code-splitting, router/deep links — **PHASE-39**.
- PWA/offline, encrypted notes, cloudSync conflict tests, import size cap, AudioContext `close()` lifecycle (L8) — **PHASE-40** (owns `src/audio/sound.js` structural changes).
- Sealed/proctored tomes, full light theme (QA16), Phase-30 QA coverage list — **PHASE-41**.
- ds functional bugs (setState side-effects, daily-reward clocks, stale-closure clobber, AbortController, no-op item effects) — **PHASE-17**.
- ds security/logging (prod error logging, RLS check, oracle endpoint env, CSP) — **PHASE-18**.
- dnd-app a11y items (MutationApprovalPanel aria-live, DmAlertTray Escape) — **PHASE-04**.

## Completed

*(filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line evidence)*

- **19A (2026-06-16):** shared dialog-a11y hook + all 16 modal overlay sites (H4 + M12 residue). New `src/components/useDialogA11y.js` ({onClose, active} → role/aria on the panel; capture-phase keydown for focus trap + Escape; initial focus to `[data-autofocus]`/first focusable; focus restore on unmount) + `useDialogA11y.test.jsx` (focus-in, Escape, Tab/Shift+Tab wrap, restore, active:false no-op). Converted: MergeChooser (Escape→`onResolve('cancel')`, `aria-labelledby`) + new `MergeChooser.test.jsx` (M12 warning-text lock + dialog + Escape→cancel); AccountPanel (hook before the `if(!user)` early return, `active:!!user`); PromptModal `ModalShell` (deleted its local `useEscapeKey`, dropped the now-unused `useEffect` import) + extended `PromptModal.test.jsx` (dialog role/aria-modal/Escape); the 8 App.jsx `useEscapeKey` modals (Welcome/ShareTome/ImportCode/MetadataEdit/ResetConfirm/PasteTome/Achievements/Titles) each → `useDialogA11y` + `ref`/`role="dialog"`/`aria-modal`/`aria-label`; ConfirmModal (replaced its bespoke focus+Escape effects + `cancelRef` with the hook; `data-autofocus` on Cancel per APG; kept `role="alertdialog"`); the 3 inline overlays (clear-chat, purchase, exam-submit) with `active`-gated hooks; ExamMode TrialDetailModal (hook + ref, kept backdrop-click). Deleted the `useEscapeKey` definition. `grep useEscapeKey src/` → only 2 comment mentions. Cheap check: `vitest useDialogA11y/MergeChooser/PromptModal` → 17 passed; `npx vite build` clean.
- **19B (2026-06-16):** appended the `@media (prefers-reduced-motion: reduce)` block to `src/index.css` (M7) — near-zero `animation-duration`/`transition-duration` + `animation-iteration-count: 1` + `scroll-behavior: auto`, all `!important`, scoped to `*`/`::before`/`::after`; comment notes the dungeon rAF canvas loop is intentionally unaffected. Cheap check: `npx vite build` clean.
- **19C (2026-06-16):** non-color correctness signals (H7). New exported `revealDecoration(revealResult, optionIndex, correctIndex)` in `DungeonExplore.jsx` (correct → `✓ `/solid, picked-wrong → `✗ `/dashed, else neutral). Battle option map now prepends `{glyph}` to each option label and uses `2px ${borderStyle} ${border}` on reveal (was `1px solid`); the delve reveal verdict wrapper got `role="status"`. App.jsx QuizMode answered panel + LabMode feedback panel got `role="status"` + `borderStyle: dashed` on wrong (doubling the existing color cue; the ⚔/✗ text glyphs already cover the text channel). `DungeonExplore.test.js`: 4 `revealDecoration` cases. Cheap check: `vitest DungeonExplore.test.js` → 38 passed; `npx vite build` clean.
- **19D (2026-06-16):** exam timer SR announcements (L5). New `src/services/timerAnnounce.js` `timerAnnouncement(prev,next)` — returns the DEEPEST crossed threshold (30/10/5/1 min) between two ticks, else null. **Plan-code fix:** the plan's literal helper returned the FIRST (highest) crossed threshold via `return` in a descending loop, contradicting its own test ("700→250 ⇒ 5 minutes"); rewrote to track the last/deepest crossed so a resume that skips thresholds announces the accurate one. `ExamMode.jsx`: `timerAnnounce` state + `prevSecondsRef` (seeded in `startExam` to `totalSec` + resume path to `remainingSec`); tick effect calls `timerAnnouncement` and updates the live region; the clock `<span>` got `role="timer"` + `aria-atomic` + `aria-label` (implicit aria-live off — no per-second chatter) and a sibling `sr-only role="status" aria-live="assertive"` region for milestones. `timerAnnounce.test.js`: 4 cases (each threshold, non-crossing null, multi-skip deepest, equal-value null). Cheap check: `vitest timerAnnounce.test.js` → 4 passed; `npx vite build` clean.
- **19E (2026-06-16):** empty-state CTAs (L17). Quiz unfiltered-empty: `onGoToLibrary` prop + a "📜 Visit the Grand Library" button (rendered only when `!domainFilter`); wired at the quiz call site to `setScreen('library')`. LabMode empty: `onGoToLibrary` prop + the same CTA under "No trials in this tome."; wired likewise. Library empty card (`~ The Shelves Stand Empty ~`): inline two-button row → `onShowPrompt` + `onImport`. Mistake-vault empty (`The Tome is Empty`): `onGoHome` prop + "Return to the Hearth" button; wired to `setScreen('home')`. All buttons match the existing empty-state style. Cheap check: `npx vite build` clean.
- **19G (2026-06-16):** 44 px tap targets (L1). Header `<nav>` five icon buttons `p-2`→`p-3` (40→48 px); Hearth button `py-2`→`py-2.5`; `PromptModal` close (×2) + back icon buttons `p-2`→`p-3`. Modal close buttons (`p-2 ... text-amber-300`, no `border-2 transition`) intentionally left. Acceptance grep: no header-nav `p-2` remains. Cheap check: `vitest PromptModal.test.jsx` → 9 passed; `npx vite build` clean.
- **19F (2026-06-16):** one-time audio opt-in banner (L16). New `src/components/AudioInviteBanner.jsx` — `role="region" aria-label="Audio invitation"`; renders null when the `dungeon-scholar-audio-invite-dismissed` localStorage flag is set OR `getAudioSettings().muted === false`; "Enable sound" calls `setMuted(false)` + `playSfx('click')` + sets the flag, "Not now" just sets the flag; never auto-plays. Rendered as the first child of both HomeScreen returns (no-tome + main). `AudioInviteBanner.test.jsx`: show/hide matrix (muted-undismissed shows; flag-set hidden; unmuted hidden) + enable persists+unmutes + not-now persists without unmute. Cheap check: `vitest AudioInviteBanner.test.jsx` → 5 passed; `npx vite build` clean.
- **19H (2026-06-16):** regression locks for already-fixed findings (L3/L4/M12/QA-Bestiary). New `src/components/lucide-a11y.test.jsx`: decorative `<X/>` → `svg[aria-hidden="true"]`; `<X aria-label="Close"/>` → no aria-hidden + aria-label present (locks the lucide-react 1.17.0 default that makes the L3 sweep unnecessary). M12 lock ships in `MergeChooser.test.jsx` (19A). **L4 verified** (`grep aria-live="polite" App.jsx` → toast container at the notification block, `role={onClick?'button':'status'}` + `aria-live="polite"`). **QA-Bestiary verified** (`grep -c "DifficultyStars\|BloomBadge" App.jsx` ≥ 16; per-item badges in Flashcards/Quiz/Lab/Exam/delve-log). Cheap check: `vitest lucide-a11y.test.jsx` → 2 passed.
