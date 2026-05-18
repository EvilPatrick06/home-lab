# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 18 of the D&D VTT project.

Phase 18 is a **GUI & UX audit**. The app has solid foundations (dark theme, accessibility store, toast system, keyboard shortcuts, error boundaries) but suffers from **inconsistent iconography** (Unicode chars instead of an icon library), **100+ occurrences of 10px text**, **only 67 aria-labels across 697 TSX files**, **no responsive breakpoints**, and **z-index soup**. Many items overlap previous phases; this plan covers only net-new UX work.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 18 is entirely client-side. No Raspberry Pi involvement.

### Cross-Phase Overlap (DO NOT duplicate)

| Issue | Owned By |
|-------|----------|
| Modal escape handling, focus traps | Phase 17 (GUI-7, GUI-8) |
| Token context menu conditions | Phase 1 (A6), Phase 13 (C) |
| CompendiumModal vs Library unification | Phase 16 (E) |
| Floor selector unwired | Phase 1 (A10) |
| Drawing tools DM-only | Phase 14 (B) |
| Missing tooltips (drawing buttons) | This phase (new) |
| Modal Escape/focus issues | Phase 17 (GUI-7, GUI-8) |
| Bottom bar collapse hiding macros | Phase 16 (D, Step 13) |

---

## 📋 Core Objectives (Net-New Only)

### HIGH PRIORITY

| # | Issue | Scope |
|---|-------|-------|
| U1 | Replace Unicode icons with Lucide React across entire codebase | Global — 50+ components |
| U2 | Replace all `text-[10px]` with minimum `text-xs` (12px) | Global — 100+ occurrences |
| U3 | Add `aria-label` to all icon-only buttons | Global — hundreds of buttons |
| U4 | Add tooltips to all icon-only buttons using existing `Tooltip` component | Global |

### MEDIUM PRIORITY

| # | Issue | Scope |
|---|-------|-------|
| M1 | Add empty states to all data-dependent views | ~15 components |
| M2 | Add loading states to data-fetching components | ~10 components |
| M3 | Fix z-index soup with systematic layering constants | `GameLayout.tsx` + overlays |
| M4 | Fix route duplication (`/characters/create` vs `/characters/5e/create`) | `App.tsx` |
| M5 | Add `aria-expanded` to collapsible sections | Sidebars, dropdowns |
| M6 | Cross-browser scrollbar styling (Firefox support) | `globals.css` |

### LOW PRIORITY

| # | Issue | Scope |
|---|-------|-------|
| L1 | Add fantasy font option for D&D immersion | `globals.css`, theme system |
| L2 | Auto-detect screen reader preference from OS | Accessibility store |
| L3 | Improve error state visibility with inline messages + retry | Various |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Icon Library Migration (U1)

**Step 1 — Install Lucide React**
- Run: `npm install lucide-react`
- Lucide is lightweight, tree-shakeable, and has 1500+ icons including D&D-relevant ones (sword, shield, scroll, skull, dice, map, compass, eye)

**Step 2 — Create Icon Migration Map**
- Audit all Unicode icon usage and map to Lucide equivalents:
  ```
  &#9881; (gear) → <Settings />
  &#9876; (swords) → <Swords />
  ✏️ (pencil) → <Pencil />
  📏 (ruler) → <Ruler />
  ▭ (rectangle) → <Square />
  ○ (circle) → <Circle />
  📝 (memo) → <Type />
  ```
- Also replace Unicode emoji in `LeftSidebar.tsx` section icons

**Step 3 — Replace Icons Across Codebase**
- Start with the most visible components:
  - `SettingsDropdown.tsx` (line 293: gear)
  - `InGamePage.tsx` (line 145: crossed swords)
  - `LeftSidebar.tsx` (lines 34-41: section icons)
  - `GameLayout.tsx` (lines 832-870: drawing tool buttons)
  - `PlayerBottomBar.tsx` (tool dropdown icons)
  - `DMBottomBar.tsx` / `DMTabPanel.tsx` (tab icons)
- Use consistent 16px/20px sizing: `<Icon className="w-4 h-4" />` or `<Icon className="w-5 h-5" />`

### Sub-Phase B: Minimum Font Size (U2)

**Step 4 — Search and Replace text-[10px]**
- Find all occurrences of `text-[10px]` across the codebase (100+ instances)
- Replace with `text-xs` (12px) as minimum. For truly cramped layouts, use `text-[11px]`
- Priority files:
  - `SettingsPage.tsx` (lines 171, 200, 208, 217, 246, 303, 346, 377)
  - `LibraryPage.tsx` (metadata labels)
  - `ModalFormFooter.tsx` pattern
  - Any component using `text-[10px]` on interactive buttons
- For button text specifically: minimum `text-sm` (14px) per WCAG touch target guidelines

**Step 5 — Increase Touch Targets**
- Ensure all interactive elements are at least 44x44px on touch:
  - Drawing toolbar buttons: change from `w-10 h-10` (40px) to `w-11 h-11` (44px)
  - Modal footer buttons: add `min-h-[44px]` padding
  - Icon-only buttons: ensure `p-2` minimum padding around the icon

### Sub-Phase C: ARIA Labels & Tooltips (U3, U4)

**Step 6 — Systematic aria-label Audit**
- Find all `<button>` elements without `aria-label` that contain only icons or symbols
- Add descriptive `aria-label` to each:
  ```tsx
  <button aria-label="Open settings" onClick={...}>
    <Settings className="w-4 h-4" />
  </button>
  ```
- Priority areas:
  - Game toolbar (map tools, fog tools, drawing tools)
  - Initiative controls (next turn, delay, ready)
  - Token context menu buttons
  - Floor selector arrows
  - Bottom bar collapse/expand toggle
  - Sidebar section icons when collapsed

**Step 7 — Wrap Icon Buttons with Tooltip Component**
- The `Tooltip` component exists at `src/renderer/src/components/ui/Tooltip.tsx` (93 lines)
- Wrap all icon-only buttons:
  ```tsx
  <Tooltip content="Open settings">
    <button aria-label="Open settings" onClick={...}>
      <Settings className="w-4 h-4" />
    </button>
  </Tooltip>
  ```
- Ensure tooltip visibility respects the accessibility store `tooltipsEnabled` setting
- Add tooltips to at minimum:
  - All drawing toolbar buttons
  - All DM toolbar buttons
  - All initiative control buttons
  - Floor selector arrows
  - View mode toggle
  - Bottom/sidebar collapse toggles

### Sub-Phase D: Empty & Loading States (M1, M2)

**Step 8 — Add Empty States to Key Views**
- Use the existing `EmptyState` component (`src/renderer/src/components/ui/EmptyState.tsx`)
- Add to:
  - Initiative tracker (no entries): "No initiative order. Start combat to begin tracking."
  - Combat log (no events): "No combat events yet."
  - Shop (no items): "This shop has no items for sale."
  - Character inventory (empty sections): "No equipped items" / "No consumables"
  - Library search (no results): "No results found for your search."
  - Campaign journal (no entries): "No journal entries yet. Add one after your next session."

**Step 9 — Add Loading Skeletons to Data-Fetching Components**
- Use the existing `Skeleton` component
- Add skeleton loading to:
  - `EncounterBuilderModal` (when loading monster list)
  - `TreasureGeneratorModal` (when loading treasure tables)
  - `SubclassSelector5e` (when loading subclass data)
  - `CoreBooksGrid` (when loading books)
  - `LibraryPage` (when loading category items)

### Sub-Phase E: Z-Index Systematization (M3)

**Step 10 — Create Z-Index Constants**
- Create `src/renderer/src/constants/z-index.ts`:
  ```typescript
  export const Z = {
    MAP_CANVAS: 0,
    SIDEBAR: 10,
    BOTTOM_BAR: 10,
    TOOLBAR: 20,
    OVERLAY: 30,      // HUD, initiative, notifications
    DROPDOWN: 40,     // Context menus, dropdowns
    MODAL_BACKDROP: 50,
    MODAL: 60,
    TOAST: 70,
    DICE_3D: 80,
    CRITICAL_OVERLAY: 90,  // Death saves, connection lost
  } as const
  ```
- Replace all hardcoded `z-10`, `z-20`, `z-40`, `z-50`, `z-[60]`, `z-[9999]` with references to these constants
- Use Tailwind's `z-[]` arbitrary value syntax: `z-[${Z.MODAL}]` or add custom Tailwind config values

### Sub-Phase F: Route Cleanup (M4)

**Step 11 — Fix Character Creation Route Duplication**
- Open `src/renderer/src/App.tsx`
- Currently has both `/characters/create` and `/characters/5e/create` (lines 165-179)
- Redirect `/characters/create` to `/characters/5e/create` since 5e is the only supported system:
  ```tsx
  <Route path="/characters/create" element={<Navigate to="/characters/5e/create" replace />} />
  ```
- Or remove the duplicate route entirely if nothing links to `/characters/create`

### Sub-Phase G: Expanded State for Screen Readers (M5)

**Step 12 — Add aria-expanded to Collapsible Elements**
- Add `aria-expanded` to:
  - Left sidebar collapse button: `aria-expanded={!sidebarCollapsed}`
  - Bottom bar collapse button: `aria-expanded={!bottomCollapsed}`
  - Settings dropdown: `aria-expanded={isOpen}`
  - Tools dropdown in PlayerBottomBar: `aria-expanded={isOpen}`
  - Accordion sections in character sheet: `aria-expanded={isExpanded}`
  - Sidebar section headers: `aria-expanded={isSectionOpen}`

### Sub-Phase H: Cross-Browser Scrollbar (M6)

**Step 13 — Add Firefox Scrollbar Support**
- Open `src/renderer/src/globals.css`
- The existing webkit scrollbar styling (lines 24-39) only works in Chrome/Electron
- Add Firefox standard scrollbar CSS:
  ```css
  * {
    scrollbar-width: thin;
    scrollbar-color: #374151 transparent;
  }
  ```
- This uses the CSS Scrollbars Spec supported by Firefox 64+
- Keep the webkit styles for Chromium, add the standard property for cross-browser

### Sub-Phase I: Fantasy Font Option (L1)

**Step 14 — Add Fantasy Font for D&D Immersion**
- Import a fantasy-themed Google Font (e.g., Cinzel for headers, Inter for body):
  ```css
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&display=swap');
  ```
- Add a "Font Style" setting in the accessibility store: `fontStyle: 'system' | 'fantasy'`
- When `'fantasy'`:
  ```css
  .fantasy-font h1, .fantasy-font h2, .fantasy-font h3 {
    font-family: 'Cinzel', serif;
  }
  ```
- Apply the class to the app root when the setting is enabled
- Keep system fonts as default — fantasy font is opt-in

### Sub-Phase J: Screen Reader Auto-Detection (L2)

**Step 15 — Auto-Enable Screen Reader Mode**
- The accessibility store has `screenReaderMode: false` which must be manually enabled
- Auto-detect on app startup using OS preferences:
  ```typescript
  // In accessibility store initialization:
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setReducedMotion(true)
  }
  // Screen reader detection is limited in browsers, but we can:
  // 1. Check if prefers-reduced-motion is set (often correlated)
  // 2. Show a first-run prompt: "Do you use a screen reader?"
  ```
- Also add a prompt on first launch asking about accessibility needs

---

## ⚠️ Constraints & Edge Cases

### Icon Migration
- **Lucide React is tree-shakeable** — only imported icons are bundled. No bundle size concern.
- **Do NOT change icons that are D&D-specific** — if a Unicode symbol is intentionally thematic (e.g., a D&D rune), keep it. Only replace generic UI icons (gear, arrows, close, etc.).
- **Electron renderer**: Lucide works in Electron's Chromium renderer with no issues.

### Font Size
- **`text-[10px]` removal is a bulk operation** — use find-and-replace but verify each change visually. Some 10px text may be in decorative/non-interactive contexts where small size is intentional (e.g., version numbers, timestamps).
- **Button text minimum 14px**: This is for WCAG AA compliance on interactive elements. Non-interactive labels can remain at 12px.

### Z-Index
- **PixiJS canvas z-index**: The PixiJS canvas has its own internal z-ordering (16 layers per Phase 12). CSS z-index only affects DOM elements overlaying the canvas, not PixiJS internals.
- **Tailwind arbitrary values**: `z-[50]` works in Tailwind v4. However, if many components need z-index constants, consider extending the Tailwind config with named layers.

### Tooltips
- **Tooltip component dependency on `tooltipsEnabled`**: When tooltips are disabled, the `aria-label` is the ONLY accessible description. Both must always be present.
- **Touch devices**: Tooltips are hover-only. On touch, they should trigger on long-press or not appear at all (aria-label handles accessibility).

### Empty States
- **Do NOT use EmptyState in loading-then-populated views** — if data is loading, show a skeleton, not an empty state. Empty state should only appear when data has loaded and is genuinely empty.
- **Empty state messaging should be actionable**: "No journal entries yet. [Add one]" with a clickable link to the creation flow.

Begin implementation now. Start with Sub-Phase A (Steps 1-3) for the icon library migration — this has the broadest visual impact. Then Sub-Phase B (Steps 4-5) for font size fixes and Sub-Phase C (Steps 6-7) for aria-labels + tooltips. These three sub-phases together will dramatically improve both visual polish and accessibility.
