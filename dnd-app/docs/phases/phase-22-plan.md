# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 22 of the D&D VTT project.

Phase 22 is a **comprehensive codebase analysis** covering performance, architecture, documentation, dependencies, accessibility, and i18n. Many findings overlap prior phases. This plan covers **net-new items only**: unused reduced-motion hook, timer/listener leaks, unused dependencies, conversation memory leak, plugin installer security, CSP hardcoded IP, production console statements, service layer bypass, and missing project files.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

### Cross-Phase Overlap (DO NOT duplicate)

| Issue | Owned By |
|-------|----------|
| README rewrite | Phase 21 |
| CI pipeline | Phase 21 |
| Modal escape/focus (50+ modals) | Phase 17 (GUI-7, GUI-8) |
| ARIA labels (50+ buttons) | Phase 18 |
| Input labels (200+ inputs) | Phase 18 |
| Error handling consistency | Phase 17 (Sub-Phase D) |
| Timer leaks in DiceOverlay, ShopView | Phase 17 (GUI-3, GUI-11) |
| Three.js resource leaks | Phase 17 (GUI-4) |
| Audio emitters/floor selector | Phase 1 |
| God object decomposition | Catalogued for future |

---

## 📋 Net-New Objectives

### HIGH PRIORITY

| # | Issue | Impact |
|---|-------|--------|
| H1 | `useReducedMotion` hook defined but NEVER used — accessibility setting has zero effect | Users who need reduced motion get no relief |
| H2 | Unused production dependencies inflate install (`immer`, `@pixi/react`, `@tiptap/extension-image`) | Bundle bloat |
| H3 | Script-only deps in `dependencies` (`@langchain/*`) | Production install includes build tools |
| H4 | Components bypass data-provider service layer (direct IPC) | Miss caching, error handling, homebrew merge |
| H5 | Timer/listener leaks in ArmorManager, EquipmentListPanel, AudioPlayerItem, PlayerHUDOverlay, use-toast | Memory leaks, stale state updates |

### MEDIUM PRIORITY

| # | Issue | Impact |
|---|-------|--------|
| M1 | ConversationManager never cleans up deleted campaign conversations | Memory growth in long sessions |
| M2 | Plugin installer uses PowerShell `Expand-Archive` — injection risk | Security |
| M3 | Hardcoded IP `10.10.20.242` in CSP | Non-portable BMO configuration |
| M4 | 5 production console.warn/error calls bypass logger | Unwanted output in production |
| M5 | No LICENSE file despite ISC declaration in package.json | Legal ambiguity |
| M6 | No CHANGELOG.md | No structured release tracking |
| M7 | Electron 40 EOL June 2026 | 4 months to plan upgrade |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Wire useReducedMotion (H1)

**Step 1 — Apply useReducedMotion Throughout**
- The hook exists at `src/renderer/src/hooks/use-reduced-motion.ts` but is never imported
- Find ALL animation-bearing components and apply the hook:
  ```typescript
  import { useReducedMotion } from '@/hooks/use-reduced-motion'

  function AnimatedComponent() {
    const prefersReducedMotion = useReducedMotion()
    return (
      <div className={prefersReducedMotion ? '' : 'transition-all duration-300'}>
  ```
- Key targets:
  - `globals.css` animations (toast, dice) — add `@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; } }`
  - Map fog transitions (`fog-overlay.ts`) — skip animation if reduced motion
  - Token movement animations (`token-animation.ts`) — instant move if reduced motion
  - Weather particles (`weather-overlay.ts`) — disable if reduced motion
  - Dice 3D physics (`DiceRenderer.tsx`) — skip 3D roll, show result immediately
  - Combat animations (`combat-animations.ts`) — disable particle effects

**Step 2 — Add CSS Global Reduced Motion**
- Open `src/renderer/src/styles/globals.css`
- Add a comprehensive reduced-motion rule:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
  ```
- Also apply when the in-app `reducedMotion` setting is true by adding a class to the root:
  ```typescript
  if (accessibilityStore.reducedMotion) {
    document.documentElement.classList.add('reduce-motion')
  }
  ```
  ```css
  .reduce-motion *, .reduce-motion *::before, .reduce-motion *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
  ```

### Sub-Phase B: Dependency Cleanup (H2, H3)

**Step 3 — Remove Unused Production Dependencies**
- Run: `npm uninstall immer @pixi/react @tiptap/extension-image`
- Verify no imports exist (search codebase for each package name first)
- `immer`: Zero imports in `src/` (only incidental text matches in JSON)
- `@pixi/react`: Zero imports; PixiJS used imperatively
- `@tiptap/extension-image`: Zero imports; JournalPanel uses Link, Placeholder, StarterKit only

**Step 4 — Move Script-Only Deps to devDependencies**
- Move from `dependencies` to `devDependencies`:
  ```bash
  npm uninstall @langchain/anthropic @langchain/core @langchain/langgraph
  npm install --save-dev @langchain/anthropic @langchain/core @langchain/langgraph
  ```
- These are only used in `scripts/extract-5e-data.ts`, a build-time data extraction script

**Step 5 — Review Package Overrides**
- Document why each of the 7 overrides exists:
  ```json
  "overrides": {
    "minimatch": ">=10.2.1",      // security patch
    "scheduler": "0.27.0",        // React 19 internal requirement
    "fs-extra": "11.3.3",         // electron-builder compat
    "commander": "12.1.0",        // version conflict resolution
    "chalk": "4.1.2",             // CJS/ESM conflict
    "semver": "7.7.4",            // security patch
    "entities": "4.5.0"           // security patch
  }
  ```
- Add comments in package.json (JSON5-style comments won't work; add to README or a `DEPENDENCIES.md`)

### Sub-Phase C: Route Components Through Service Layer (H4)

**Step 6 — Fix Service Layer Bypasses**
- Replace direct IPC calls with data-provider in these components:
  - `game/sidebar/EquipmentTab.tsx`: `window.api.game.loadEquipment()` → `data-provider.load5eEquipment()`
  - `game/sidebar/SpellsTab.tsx`: `window.api.game.loadSpells()` → `data-provider.load5eSpells()`
- This gives them caching, error handling, and homebrew merge for free
- Verify the data-provider functions exist and return the expected shapes

### Sub-Phase D: Fix Remaining Timer/Listener Leaks (H5)

**Step 7 — Fix ArmorManager and EquipmentListPanel Timer Leaks**
- `components/sheet/5e/ArmorManager5e.tsx` line 62, 158: `setTimeout` without cleanup
- `components/sheet/5e/EquipmentListPanel5e.tsx` line 170: same pattern
- Fix: Store timeout ID and clear on unmount:
  ```typescript
  const timeoutRef = useRef<NodeJS.Timeout>()
  const showWarning = () => {
    setBuyWarning(msg)
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setBuyWarning(null), 3000)
  }
  useEffect(() => () => clearTimeout(timeoutRef.current), [])
  ```

**Step 8 — Fix AudioPlayerItem Listener Leak**
- `components/library/AudioPlayerItem.tsx` lines 43-46: `loadedmetadata` and `ended` listeners never removed
- Fix: Use ref for audio element and clean up in useEffect return:
  ```typescript
  useEffect(() => {
    const audio = audioRef.current
    const onLoaded = () => { /* ... */ }
    const onEnded = () => { /* ... */ }
    audio?.addEventListener('loadedmetadata', onLoaded)
    audio?.addEventListener('ended', onEnded)
    return () => {
      audio?.removeEventListener('loadedmetadata', onLoaded)
      audio?.removeEventListener('ended', onEnded)
    }
  }, [path])
  ```

**Step 9 — Fix PlayerHUDOverlay Drag Listener Leak**
- `components/game/overlays/PlayerHUDOverlay.tsx` lines 73-74: `mousemove`/`mouseup` on document during drag
- Fix: Remove listeners in mouseup handler AND in useEffect cleanup:
  ```typescript
  const handleMouseUp = useCallback(() => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove])

  useEffect(() => () => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove, handleMouseUp])
  ```

**Step 10 — Fix use-toast Dismiss Race**
- `hooks/use-toast.ts` line 39: `setTimeout` for auto-dismiss not cleared on manual dismiss
- Fix: Clear timeout when toast is manually dismissed

### Sub-Phase E: ConversationManager Cleanup (M1)

**Step 11 — Clean Conversations on Campaign Delete**
- Open `src/main/ai/conversation-manager.ts`
- Find the `conversations` Map
- Add a cleanup method:
  ```typescript
  removeConversation(campaignId: string) {
    this.conversations.delete(campaignId)
  }
  ```
- Call it when a campaign is deleted (in `campaign-storage.ts` `deleteCampaign()` cascade, or via IPC from the renderer)

### Sub-Phase F: Plugin Installer Security (M2)

**Step 12 — Replace PowerShell Expand-Archive with Node.js ZIP**
- Open `src/main/plugins/plugin-installer.ts` lines 27-28
- Replace PowerShell `Expand-Archive` with `adm-zip` or Node.js `zlib`:
  ```bash
  npm install adm-zip
  ```
  ```typescript
  import AdmZip from 'adm-zip'

  async function extractPlugin(zipPath: string, extractDir: string) {
    const zip = new AdmZip(zipPath)
    zip.extractAllTo(extractDir, true)
  }
  ```
- This eliminates the shell injection risk from path interpolation
- Also add the zip-slip validation from Phase 20 Step 8

### Sub-Phase G: CSP and Production Console (M3, M4)

**Step 13 — Make BMO IP Configurable in CSP**
- Open `src/main/index.ts` line 62
- Replace hardcoded `10.10.20.242` with environment variable:
  ```typescript
  const bmoIp = process.env.BMO_PI_IP || 'bmo.local'
  const piConnect = ` ws://${bmoIp}:* http://${bmoIp}:*`
  ```

**Step 14 — Replace Production Console Statements with Logger**
- Replace in these 5 locations:
  - `PdfViewer.tsx:15` → `logger.warn('[PdfViewer] Failed to load worker...')`
  - `combat-resolver.ts:883-885` → `logger.warn('[CombatResolver] ...')`
  - `system-chat-bridge.ts:32` → `logger.error('[SystemChatBridge] ...')`
  - `host-handlers.ts:132,161` → `logger.warn('[host-handlers] ...')`
- Import `logger` from `utils/logger.ts` (gated behind `import.meta.env.DEV`)

### Sub-Phase H: Missing Project Files (M5, M6)

**Step 15 — Create LICENSE File**
- Create `LICENSE` in the project root with ISC license text (matching `package.json` declaration):
  ```
  ISC License

  Copyright (c) 2025-2026 Gavin Knotts

  Permission to use, copy, modify, and/or distribute this software...
  ```

**Step 16 — Create CHANGELOG.md**
- Create `CHANGELOG.md` with initial entry:
  ```markdown
  # Changelog

  ## [1.9.9] - 2026-03-09

  ### Added
  - Full D&D 5e 2024 character builder (10 species, 12 classes, 48 subclasses)
  - PixiJS map engine with fog of war, dynamic lighting, weather
  - AI Dungeon Master (Ollama, Claude, OpenAI, Gemini)
  - P2P multiplayer via PeerJS WebRTC
  - Bastion system, campaign management, session notes
  - Discord integration with voice/TTS
  ```

### Sub-Phase I: Electron Upgrade Planning (M7)

**Step 17 — Document Electron 40 EOL Plan**
- Electron 40 reaches end-of-life June 30, 2026 (~4 months)
- Add to project tracking: plan upgrade to Electron 41+ (or latest stable)
- Key considerations:
  - Check Node.js version requirements for new Electron
  - Verify all native dependencies rebuild cleanly
  - Test PixiJS, Three.js, PeerJS compatibility
  - Review breaking changes in Electron changelog
- This is a planning step, not implementation — create a tracking issue or document

---

## ⚠️ Constraints & Edge Cases

### Reduced Motion
- **CSS approach covers most cases**: The `@media (prefers-reduced-motion: reduce)` rule affects CSS animations and transitions. JavaScript animations (PixiJS ticker, Three.js render loop, requestAnimationFrame) need explicit code checks.
- **PixiJS animations**: Fog fade, token movement, combat particles all use PixiJS tickers. Check `useReducedMotion()` in the orchestrating React component and skip the animation call.
- **3D dice**: If reduced motion is enabled, show the result directly without physics simulation. Keep the result display (which dice, which faces) but skip the throw animation.

### Dependency Removal
- **Verify before removing**: Run `npm ls immer`, `npm ls @pixi/react`, `npm ls @tiptap/extension-image` to confirm no transitive consumers depend on them being in `dependencies`.
- **Lock file**: After removing, run `npm install` to regenerate `package-lock.json` cleanly.

### Service Layer
- **Don't break direct calls that need fresh data**: Some components intentionally bypass cache for fresh loads. If a component MUST have fresh data (not cached), it's acceptable to call IPC directly. But document the reason.

### Plugin Installer
- **adm-zip is a JS-only library** — no native dependencies, works cross-platform. It's already used by many Electron apps.
- **Test with existing plugins**: After replacing the extraction method, verify existing `.zip` content packs still extract correctly.

Begin implementation now. Start with Sub-Phase A (Steps 1-2) for the reduced-motion fix — this is a real accessibility failure where a defined setting has zero effect. Then Sub-Phase B (Steps 3-5) for dependency cleanup. Sub-Phase D (Steps 7-10) for timer/listener leaks is quick mechanical work.
