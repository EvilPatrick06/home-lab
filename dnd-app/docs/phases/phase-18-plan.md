# Phase 18 — GUI and UX Audit

## Context
The dnd-app has a solid dark-themed foundation: an accessibility store with reduced-motion / colorblind / tooltip toggles, a toast system, keyboard shortcuts, error boundaries, and a focus-trapping Modal. UX rough edges remain that block consistent polish: Unicode characters used as icons in toolbars and overlays, 1053 `text-[10px]` occurrences (baseline drift from the original 100+ scope), 158 `aria-label` attributes spread across 697 TSX files, no Firefox scrollbar styling, no responsive breakpoint strategy in layouts, and ad-hoc z-index values across overlays.

Phase 18 is entirely client-side work in the Electron renderer. It is net-new UX work and explicitly defers items owned by other phases (see Depends on / blocks). Roles work in Phase 29 will replace `isHost` / `isCoDM` checks with `hasPermission(peer, key, campaign)`; any new toolbar visibility logic should anticipate that shape.

## Depends on / blocks
- Depends on: none
- Blocks: none
- Owned elsewhere (do not duplicate):
  - Phase 17 (GUI-7, GUI-8): modal escape handling, focus traps
  - Phase 1 (A6), Phase 13 (C): token context menu conditions
  - Phase 16 (E): CompendiumModal vs Library unification
  - Phase 1 (A10): floor selector unwired (`MapCanvas.tsx:191` uses `currentFloor` only for token visibility filter)
  - Phase 14 (B): drawing tools DM-only gate
  - Phase 16 (D, Step 13): bottom bar collapse hiding macros
  - Phase 29: role/permission migration (`isHost` / `isCoDM` -> `hasPermission`)

## Files touched
| Path | Role |
|------|------|
| `dnd-app/package.json` | Add `lucide-react` dependency |
| `src/renderer/src/components/game/GameLayout.tsx` | Drawing toolbar icons + sizes + z-index |
| `src/renderer/src/components/game/overlays/SettingsDropdown.tsx` | Gear icon (`&#9881;` at line 312) |
| `src/renderer/src/pages/InGamePage.tsx` | Crossed swords (`&#9876;` at line 167) |
| `src/renderer/src/components/game/sidebar/LeftSidebar.tsx` | Section icon array (lines 37-48) |
| `src/renderer/src/components/game/bottom/PlayerBottomBar.tsx` | Tool dropdown icons, aria-expanded |
| `src/renderer/src/components/game/bottom/DMBottomBar.tsx` | Tab icons |
| `src/renderer/src/components/game/bottom/DMTabPanel.tsx` | Tab icons |
| `src/renderer/src/pages/SettingsPage.tsx` | `text-[10px]` cluster |
| `src/renderer/src/pages/LibraryPage.tsx` | `text-[10px]` cluster |
| `src/renderer/src/components/game/modals/shared/ModalFormFooter.tsx` | Footer button text size |
| `src/renderer/src/components/ui/Tooltip.tsx` | Existing component, wrap call sites |
| `src/renderer/src/components/ui/EmptyState.tsx` | Existing component, expand call sites |
| `src/renderer/src/components/ui/Skeleton.tsx` | Existing component, expand call sites |
| `src/renderer/src/components/game/dm/InitiativeTracker.tsx` | Empty state |
| `src/renderer/src/components/game/sidebar/CombatLogPanel.tsx` | Empty state |
| `src/renderer/src/components/game/player/ShopView.tsx` | Empty state |
| `src/renderer/src/components/game/dm/ShopPanel.tsx` | Empty state |
| `src/renderer/src/components/game/modals/dm-tools/EncounterBuilderModal.tsx` | Skeleton loading |
| `src/renderer/src/components/game/modals/dm-tools/TreasureGeneratorModal.tsx` | Skeleton loading |
| `src/renderer/src/components/levelup/5e/SubclassSelector5e.tsx` | Skeleton loading |
| `src/renderer/src/components/library/CoreBooksGrid.tsx` | Skeleton loading |
| `src/renderer/src/constants/z-index.ts` (new) | Z-index layer constants |
| `src/renderer/src/App.tsx` | Route duplication fix (lines 165, 173) |
| `src/renderer/src/styles/globals.css` | Firefox scrollbar, fantasy font CSS |
| `src/renderer/src/stores/use-accessibility-store.ts` | `fontStyle`, screen-reader prompt |
| `src/renderer/src/pages/JoinGamePage.tsx` | Auto-rejoin loading indicator |

## Sub-phase summary
| # | Sub-phase | Theme |
|---|-----------|-------|
| 18a | Icon library migration | Install Lucide React, replace Unicode icons |
| 18b | Minimum font size and touch targets | Sweep `text-[10px]`, raise drawing button sizes |
| 18c | ARIA labels and tooltips | Wrap icon-only buttons with `Tooltip` + `aria-label` |
| 18d | Empty and loading states | Adopt `EmptyState` / `Skeleton` in data views |
| 18e | Z-index systematization | New constants module, replace hardcoded values |
| 18f | Route cleanup | Resolve `/characters/create` duplication |
| 18g | aria-expanded coverage | Add to collapsible UI |
| 18h | Cross-browser scrollbar | Firefox `scrollbar-width` / `scrollbar-color` |
| 18i | Fantasy font option | Opt-in Cinzel serif headers |
| 18j | Screen reader auto-detect | First-run prompt + correlate with reduced-motion |
| 18k | Auto-rejoin loading feedback | Visible state during `JoinGamePage` reconnection |

## Sub-phase details

### 18a — Icon library migration
**Files:** `dnd-app/package.json`, `src/renderer/src/components/game/overlays/SettingsDropdown.tsx`, `src/renderer/src/pages/InGamePage.tsx`, `src/renderer/src/components/game/sidebar/LeftSidebar.tsx`, `src/renderer/src/components/game/GameLayout.tsx`, `src/renderer/src/components/game/bottom/PlayerBottomBar.tsx`, `src/renderer/src/components/game/bottom/DMBottomBar.tsx`, `src/renderer/src/components/game/bottom/DMTabPanel.tsx`
**Steps:**
1. Install Lucide: `npm install lucide-react` in `dnd-app/`. Tree-shakeable, no bundle concern.
2. Build a migration map covering: gear -> `<Settings />`, swords -> `<Swords />`, pencil -> `<Pencil />`, ruler -> `<Ruler />`, rectangle -> `<Square />`, circle -> `<Circle />`, type -> `<Type />`, plus `LeftSidebar.tsx:37-48` emoji array (Characters/NPCs/Allies/Enemies/Places/Bastions/Tables/Party Loot/Combat Log/Journal).
3. Replace at known sites: `SettingsDropdown.tsx:312` (gear), `InGamePage.tsx:167` (crossed swords), `LeftSidebar.tsx:37-48` (section icon objects), `GameLayout.tsx:1045/1053/1061/1069/1077` (drawing tools). Use consistent sizing: `<Icon className="w-4 h-4" />` for dense, `w-5 h-5` for primary toolbars.
4. Skip intentionally thematic Unicode (D&D runes, decorative dice glyphs). Only swap generic UI icons.
**Acceptance:** `grep -rn '&#9881;\|&#9876;' src/renderer/src/` returns no hits in the listed files; `lucide-react` appears in `package.json` dependencies; visual smoke test of drawing toolbar + sidebar shows Lucide glyphs at uniform pixel size.

### 18b — Minimum font size and touch targets
**Files:** `src/renderer/src/components/game/modals/shared/ModalFormFooter.tsx`, `src/renderer/src/pages/SettingsPage.tsx`, `src/renderer/src/pages/LibraryPage.tsx`, `src/renderer/src/components/game/GameLayout.tsx`, plus all other files matching `text-[10px]`
**Steps:**
1. Run `grep -rn 'text-\[10px\]' src/` to enumerate the 1053 occurrences (baseline drift from original 100+ scope).
2. Replace with `text-xs` (12px) globally; allow `text-[11px]` only in genuinely cramped contexts (token badges, version numbers). Interactive button text minimum `text-sm` (14px) per WCAG AA.
3. Concrete first targets: `ModalFormFooter.tsx:33,41`, `SettingsPage.tsx:183,212,220,228,358,359,363,366,373,375`, `LibraryPage.tsx:658,679`.
4. Raise drawing toolbar buttons in `GameLayout.tsx:1043,1051,1059,1067,1075` from `w-10 h-10` (40px) to `w-11 h-11` (44px); ensure `p-2` minimum on every icon-only button.
**Acceptance:** `grep -rn 'text-\[10px\]' src/renderer/src/ | wc -l` returns 0 (or only annotated, justified survivors); drawing toolbar buttons measure 44px in DevTools.

### 18c — ARIA labels and tooltips
**Files:** `src/renderer/src/components/game/GameLayout.tsx`, `src/renderer/src/components/game/dm/InitiativeControls.tsx`, `src/renderer/src/components/game/dm/DMToolbar.tsx`, `src/renderer/src/components/game/map/FloorSelector.tsx`, all icon-only `<button>` sites
**Steps:**
1. Grep `<button` blocks in `src/renderer/src/components/game/` that contain only an icon/glyph (no text child). Add descriptive `aria-label` to each. Baseline count is 158 `aria-label` instances across 697 TSX files — target every icon-only button.
2. Wrap each with the existing `Tooltip` component (`src/renderer/src/components/ui/Tooltip.tsx`, 93 lines). Both `aria-label` and `Tooltip` must coexist: `Tooltip` is gated by `accessibilityStore.tooltipsEnabled`, so the `aria-label` is the only fallback when tooltips are disabled.
3. Concrete first targets: all five drawing buttons in `GameLayout.tsx:1040-1080`; initiative controls; floor selector arrows; bottom bar collapse toggle; sidebar collapse toggle; view mode toggle.
**Acceptance:** No icon-only `<button>` in `src/renderer/src/components/game/` lacks `aria-label`; `<Tooltip>` wrapper appears on each listed target; axe-core / Lighthouse a11y audit shows zero "Buttons must have discernible text" violations on game layout.

### 18d — Empty and loading states
**Files:** `src/renderer/src/components/game/dm/InitiativeTracker.tsx`, `src/renderer/src/components/game/sidebar/CombatLogPanel.tsx`, `src/renderer/src/components/game/player/ShopView.tsx`, `src/renderer/src/components/game/dm/ShopPanel.tsx`, `src/renderer/src/components/game/modals/dm-tools/EncounterBuilderModal.tsx`, `src/renderer/src/components/game/modals/dm-tools/TreasureGeneratorModal.tsx`, `src/renderer/src/components/levelup/5e/SubclassSelector5e.tsx`, `src/renderer/src/components/library/CoreBooksGrid.tsx`
**Steps:**
1. `EmptyState` import path: `import { EmptyState } from '../components/ui'`. Add to InitiativeTracker, CombatLogPanel, ShopView/ShopPanel, LibraryPage search (verify lines 596/629/700 cover all empty branches), Campaign journal.
2. `Skeleton` import path: same `ui` barrel. Add skeleton loading to: `EncounterBuilderModal` (monster list fetch), `TreasureGeneratorModal`, `SubclassSelector5e`, `CoreBooksGrid`.
3. Empty vs loading rule: skeleton during load, `EmptyState` only after a confirmed empty load.
**Acceptance:** Open each component in a fresh state (no data) — visible `EmptyState` rendered; throttle network in DevTools — skeleton visible before data resolves; no blank screens during fetch.

### 18e — Z-index systematization
**Files:** `src/renderer/src/constants/z-index.ts` (new), `src/renderer/src/components/game/GameLayout.tsx`, all overlays using `z-`
**Steps:**
1. Create `src/renderer/src/constants/z-index.ts` exporting `Z` constants: `MAP_CANVAS: 0, SIDEBAR/BOTTOM_BAR: 10, TOOLBAR: 20, OVERLAY: 30, DROPDOWN: 40, MODAL_BACKDROP: 50, MODAL: 60, TOAST: 70, DICE_3D: 80, CRITICAL_OVERLAY: 90`.
2. Re-export from `src/renderer/src/constants/index.ts`.
3. Replace hardcoded values in `GameLayout.tsx` (hits at lines 651, 654, 656, 666, 682, 708, 722, 788, 968, 1034) and elsewhere — 98 occurrences of `z-50`/`z-40`/`z-30`/`z-[60]`/`z-[9999]` in `src/renderer/src/components/`.
4. Use `style={{ zIndex: Z.MODAL }}` or extend `tailwind.config` `zIndex` with named tokens.
5. Do NOT touch PixiJS internal layer ordering (Phase 12 owns 16 canvas layers); only DOM overlays.
**Acceptance:** `grep -rn 'z-\[9999\]\|z-\[60\]' src/renderer/src/` returns 0; new `z-index.ts` exists; manual stacking test shows correct ordering.

### 18f — Route cleanup
**Files:** `src/renderer/src/App.tsx`
**Steps:**
1. `App.tsx:165` declares `<Route path="/characters/create" ...>`; `App.tsx:173` declares `<Route path="/characters/5e/create" ...>`. 5e is the only system.
2. Replace the `/characters/create` route element with `<Navigate to="/characters/5e/create" replace />`.
3. Audit links that point to `/characters/create` and update; if none remain after audit, delete the redirect route entirely.
**Acceptance:** Hitting `/characters/create` redirects to `/characters/5e/create`; only one active character-create route.

### 18g — aria-expanded coverage
**Files:** `src/renderer/src/components/game/sidebar/LeftSidebar.tsx`, `src/renderer/src/components/game/overlays/SettingsDropdown.tsx`, `src/renderer/src/components/game/bottom/PlayerBottomBar.tsx`, `src/renderer/src/components/game/bottom/DMBottomBar.tsx`, character sheet accordions
**Steps:**
1. `LeftSidebar.tsx:423` already sets `aria-expanded` for accordion sections — verify pattern.
2. Add `aria-expanded` to: sidebar collapse button, bottom bar collapse button, `SettingsDropdown` trigger, PlayerBottomBar "Tools..." dropdown (`PlayerBottomBar.tsx:73-350`), DMBottomBar tab triggers, character sheet accordions.
**Acceptance:** Current count is 4 `aria-expanded` usages — target every disclosure widget; screen reader announces "expanded"/"collapsed" on every toggle.

### 18h — Cross-browser scrollbar
**Files:** `src/renderer/src/styles/globals.css`
**Steps:**
1. Existing webkit rules at `globals.css:24-39` are Chromium-only.
2. Append `* { scrollbar-width: thin; scrollbar-color: #374151 transparent; }`.
3. Keep webkit rules for richer Chromium styling.
**Acceptance:** `grep -n 'scrollbar-width' src/renderer/src/styles/globals.css` returns a hit; Firefox shows thin gray scrollbar instead of OS default.

### 18i — Fantasy font option
**Files:** `src/renderer/src/styles/globals.css`, `src/renderer/src/stores/use-accessibility-store.ts`, settings UI
**Steps:**
1. Add `@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&display=swap');` to `globals.css`.
2. Add `fontStyle: 'system' | 'fantasy'` to accessibility store with `'system'` default; persist alongside existing `reducedMotion`/`screenReaderMode`.
3. CSS scope: `.fantasy-font h1, .fantasy-font h2, .fantasy-font h3 { font-family: 'Cinzel', serif; }`.
4. Toggle `.fantasy-font` class on `<body>` from the store. Body text stays system — fantasy is headers-only.
5. Surface a Font Style picker in `SettingsPage.tsx`.
**Acceptance:** Setting toggle flips heading font live; body text unchanged; reload preserves choice.

### 18j — Screen reader auto-detect
**Files:** `src/renderer/src/stores/use-accessibility-store.ts`
**Steps:**
1. `use-accessibility-store.ts:68-72` already auto-detects `prefers-reduced-motion`. `screenReaderMode` at line 83 is hardcoded `false`.
2. Add first-launch prompt: if no `screenReaderMode` persisted AND `prefers-reduced-motion: reduce` matches, show modal asking "Do you use a screen reader?" Persist either answer.
**Acceptance:** Fresh launch with reduced-motion set triggers the prompt; subsequent launches do not re-prompt; answering yes flips `screenReaderMode` to `true`.

### 18k — Auto-rejoin loading feedback
**Files:** `src/renderer/src/pages/JoinGamePage.tsx`
**Steps:**
1. `JoinGamePage.tsx:46` declares `autoRejoinTriggered = useRef(false)`; lines 139-150 fire the rejoin without surfacing a visible state. The page already imports `Spinner` and uses it at lines 339, 351 for manual join.
2. Add a `<Spinner size="sm" />` plus copy ("Reconnecting to game...") during the auto-rejoin window.
**Acceptance:** Cold reload of a game URL with stored session shows a visible reconnecting indicator until the lobby reattaches.

## Constraints & edge cases
- Icon migration: Lucide is tree-shakeable. Do not replace thematic Unicode (D&D runes, dice glyphs). Works in Electron renderer (Chromium) with no shim.
- Font size: 1053 occurrences is the largest mechanical sweep. Spot-check each cluster — some `text-[10px]` is decorative and may stay if explicitly justified. Buttons stay at `text-sm` minimum (WCAG AA).
- Z-index: PixiJS owns its own 16-layer ordering inside the canvas. The constants module governs only DOM overlays.
- Tooltips: `Tooltip` honours `accessibilityStore.tooltipsEnabled`. When false, the `aria-label` is the only accessible name. Both must always be present.
- Empty states: Never render `EmptyState` while still loading — show `Skeleton` first.
- Permission migration awareness: Toolbar visibility added in 18a/18c gates today on `effectiveIsDM` (`GameLayout.tsx:593, 1097`). Phase 29 swaps this for `hasPermission`. Keep the gate as a single boolean variable so the swap is mechanical.

## Verification
- `grep -rn '&#9881;\|&#9876;' src/renderer/src/` returns 0 hits in 18a target files.
- `grep -rn 'text-\[10px\]' src/renderer/src/ | wc -l` trends toward 0.
- `grep -rn 'aria-label' src/renderer/src/ | wc -l` materially exceeds 158 (baseline).
- `grep -rn 'aria-expanded' src/renderer/src/ | wc -l` materially exceeds 4 (baseline).
- New file `src/renderer/src/constants/z-index.ts` exists and is imported by `GameLayout.tsx`.
- `grep -n 'scrollbar-width' src/renderer/src/styles/globals.css` returns a hit.
- Firefox manual test: scrollbars render thin/gray.
- Hitting `/characters/create` redirects to `/characters/5e/create`.
- `lucide-react` listed in `dnd-app/package.json` dependencies.
- `npm run lint && npm run typecheck && npm test` clean in `dnd-app/`.

## Completed
(none — all sub-phases live as of 2026-05-19)
