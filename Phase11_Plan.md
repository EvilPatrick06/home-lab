# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 11 of the D&D VTT project.

Phase 11 covers the **In-Game System** — session flow, initiative, action economy, HUD, chat/dice sync, and real-time state updates. The audit described this as "exceptionally clean and feature-complete" with only minor polish items. **However, this audit contradicts findings from Phase 4** which identified significant bugs in action economy, death saves, and exhaustion handling. This plan addresses the small amount of net-new work from Phase 11 while flagging the cross-phase contradictions.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 11 is entirely client-side. No Raspberry Pi involvement.

**Core In-Game Files (All verified as functional by this audit):**

| File | Role | Status |
|------|------|--------|
| `src/renderer/src/components/game/GameLayout.tsx` | Main game layout container, HUD orchestration | Functional |
| `src/renderer/src/hooks/use-game-effects.ts` | Game loop, auto-save, AI memory sync, state broadcasts | Functional |
| `src/renderer/src/stores/game/initiative-slice.ts` | Initiative tracking, turn states, lair actions, delay/ready | Functional |
| `src/renderer/src/components/game/ActionEconomyBar.tsx` | Action economy display | Functional |
| `src/renderer/src/services/combat/combat-resolver.ts` | Attack resolution, damage application, grapple/shove | Functional |
| `src/renderer/src/services/combat/multi-attack-tracker.ts` | Extra Attack tracking | Functional |
| `src/renderer/src/services/combat/reaction-tracker.ts` | Reaction prompts (Counterspell, Shield, OA) | Functional |
| `src/renderer/src/components/game/ChatPanel.tsx` | Chat system with slash commands | Functional |
| `src/renderer/src/services/combat/dice-service.ts` | Dice rolling + 3D physics broadcast | Functional |
| `src/renderer/src/stores/game/combat-log-slice.ts` | Persistent combat history log | Functional |
| `src/renderer/src/services/game/game-sync.ts` | State change broadcasting to peers | Functional |
| `src/renderer/src/services/map/vision-computation.ts` | Dynamic vision/lighting recompute | Functional |

**Files with TODOs (minor polish):**

| File | TODO |
|------|------|
| `src/renderer/src/components/game/map/map-event-handlers.ts` | "Render live preview" for drawing tools |
| `src/renderer/src/components/game/map/map-overlay-effects.ts` | "Add playing state management" for audio/visual effects |
| `scripts/extract-5e-data.ts` | "Add Nodes for the other 27 Domains" for subclass data |

### Raspberry Pi (`patrick@bmo`) — NO WORK THIS PHASE

---

## 📋 Core Objectives & Corrections

### CRITICAL: Cross-Phase Contradiction Report

Phase 11 claims "Action Economy: Fully Implemented" and "Combat Resolution: Fully Automated." **Phase 4 (verified with source code) proved otherwise.** The implementation agent must be aware of these contradictions:

| Phase 11 Claim | Phase 4 Finding (Verified) | Resolution |
|----------------|---------------------------|------------|
| "Action economy strictly tracked and enforced" | Attacks do NOT call `useAction()` — players can make unlimited attack actions per turn | **Phase 4 is correct.** Fix is in Phase 4 Plan, Step 7. |
| "Combat resolver automatically applies damage" | `applyTokenDamage` doesn't call `deathSaveDamageAtZero` — damage at 0 HP doesn't trigger death save failures | **Phase 4 is correct.** Fix is in Phase 4 Plan, Step 4. |
| "Vision recomputed dynamically based on light sources" | `computePartyVision` accepts `lightSources` parameter but no caller passes it | **Phase 1 is correct.** Fix is in Phase 1 Plan, Step 2. |
| Implied: exhaustion handling works | DM/AI long rest removes ALL exhaustion instead of -1 | **Phase 4 is correct.** Fix is in Phase 4 Plan, Steps 1-2. |

**Instruction to implementation agent:** Do NOT re-implement these fixes here. They belong to their respective phase plans (Phase 1, Phase 4). This phase focuses only on the net-new items from Phase 11's audit.

### MINOR: TODOs to Address

| # | TODO | File | Impact |
|---|------|------|--------|
| T1 | Drawing tool live preview | `map-event-handlers.ts` | UX polish — see current shape as you draw |
| T2 | Audio/visual overlay playing state | `map-overlay-effects.ts` | Track which effects are actively playing |
| T3 | 5e data extraction remaining domains | `extract-5e-data.ts` | More subclass data available in library |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Drawing Tool Live Preview (T1)

**Step 1 — Find the Drawing Tool TODO**
- Open `src/renderer/src/components/game/map/map-event-handlers.ts`
- Locate the `// TODO: Render live preview` comment
- This is in the drawing tool event handler where the user is actively drawing a shape (mousedown → mousemove → mouseup)

**Step 2 — Implement Live Preview**
- During `mousemove` while drawing, render a temporary preview shape:
  ```typescript
  // In the drawing tool mousemove handler:
  if (isDrawing && currentTool === 'draw') {
    // Clear previous preview
    previewLayer.clear()
    
    // Draw preview from startPoint to currentPoint
    const { startX, startY } = drawStart
    const { x: currentX, y: currentY } = gridPosition
    
    switch (drawShape) {
      case 'line':
        previewLayer.moveTo(startX, startY).lineTo(currentX, currentY)
        break
      case 'rect':
        previewLayer.rect(startX, startY, currentX - startX, currentY - startY)
        break
      case 'circle':
        const radius = Math.hypot(currentX - startX, currentY - startY)
        previewLayer.circle(startX, startY, radius)
        break
    }
    
    previewLayer.stroke({ width: 2, color: drawColor, alpha: 0.5 })
  }
  ```
- Use the existing PixiJS drawing layer (`drawing-layer.ts`) for the preview
- The preview should use 50% opacity to distinguish from committed shapes
- On `mouseup`, commit the final shape to the drawing layer and clear the preview

**Step 3 — Add Preview for Fog Brush**
- While painting fog (reveal/hide), show a circular preview of the brush area at the cursor position
- Use `fogBrushSize` (which Phase 1 will wire up) to determine the preview circle radius
- Render as a semi-transparent circle overlay following the cursor

### Sub-Phase B: Audio/Visual Overlay State Management (T2)

**Step 4 — Find the Overlay Effects TODO**
- Open `src/renderer/src/components/game/map/map-overlay-effects.ts`
- Locate the `// TODO: Add playing state management` comment

**Step 5 — Track Effect Playing State**
- Add state tracking for which effects are currently active:
  ```typescript
  interface OverlayEffectState {
    id: string
    type: 'audio' | 'visual'
    playing: boolean
    startedAt: number
    duration?: number  // ms, undefined = looping
  }

  const activeEffects = new Map<string, OverlayEffectState>()

  export function startEffect(id: string, type: 'audio' | 'visual', duration?: number) {
    activeEffects.set(id, { id, type, playing: true, startedAt: Date.now(), duration })
  }

  export function stopEffect(id: string) {
    activeEffects.delete(id)
  }

  export function getActiveEffects(): OverlayEffectState[] {
    return Array.from(activeEffects.values())
  }

  export function isEffectPlaying(id: string): boolean {
    return activeEffects.has(id)
  }
  ```
- Integrate with the audio emitter system (which Phase 1 will wire up via `audio-emitter-overlay.ts`)
- Auto-expire effects when their duration elapses

### Sub-Phase C: 5e Data Extraction Expansion (T3)

**Step 6 — Expand extract-5e-data Script**
- Open `scripts/extract-5e-data.ts`
- Find the TODO about "other 27 Domains"
- This refers to subclass-specific data nodes (e.g., Cleric domains, Warlock patrons, etc.) that need to be extracted from the SRD source
- Uncomment or add extraction logic for the remaining domains:
  - Already extracted: Spells
  - Previously commented out: Classes (Phase 1 noted this at line 267)
  - Remaining: Subclass features, class resource tables, invocation lists, metamagic options, etc.
- Run the extraction script and verify the output JSON files are valid
- This is a build-time script, not runtime code — changes only affect data files

### Sub-Phase D: In-Game System Polish

**Step 7 — Verify Game Sync Completeness**
- Open `src/renderer/src/services/game/game-sync.ts`
- Audit the store subscriptions to ensure ALL important state changes are broadcasted:
  - `conditions` changes → `dm:condition-update` (verified)
  - `turnStates` changes → `game:state-update` (verified)
  - `partyVisionCells` → vision update (verified)
  - Token movements → position update (verify this exists)
  - HP changes → HP update (verify this exists)
  - Spell slot usage → resource update (verify this exists)
- If any state change is NOT being synced, add the subscription

**Step 8 — Add Combat Log Export Button**
- The combat log (`combat-log-slice.ts`) records detailed combat history
- Phase 7 noted that `combat-log-export.ts` has export functions but no UI
- Add an "Export" button to the combat log panel UI:
  - Text format for quick sharing
  - JSON format for data analysis
  - CSV format for spreadsheets
- This complements Phase 7's Step 19 (same fix, referenced here for cross-phase consistency)

**Step 9 — Verify Reaction Tracker Edge Cases**
- Open `src/renderer/src/services/combat/reaction-tracker.ts`
- Verify these edge cases are handled:
  - Reaction already used this round → don't prompt
  - Incapacitated creature → can't use reactions
  - Counterspell against Counterspell (chain reactions) → only one level deep
  - Opportunity Attack with reach weapons (10ft vs 5ft) → correct threat range
- If any edge case is not handled, add it

**Step 10 — Verify Turn Timer Behavior**
- The initiative system supports combat timers (`timerEnabled`, `timerSeconds`)
- Verify behavior when timer expires:
  - Does the turn auto-advance? Or just show a warning?
  - Is the timer visible to both DM and player?
  - Can the DM extend/pause the timer mid-turn?
- Document or fix any missing timer behaviors

---

## ⚠️ Constraints & Edge Cases

### Cross-Phase Dependencies
- **Phase 1** will wire up light sources in vision and fog brush size — drawing preview (Step 3) depends on fog brush being wired
- **Phase 4** will fix action economy and death saves — do NOT duplicate those fixes here
- **Phase 7** will add combat log export UI — Step 8 here is the same fix, included for awareness
- **Phase 1** will wire up audio emitters — overlay effect state (Step 5) should coordinate with that

### Drawing Tool Preview
- **PixiJS performance**: Live preview renders on every `mousemove`. Use a dedicated `Graphics` object for the preview that is cleared and redrawn, NOT creating new objects per frame.
- **Grid snapping**: If grid snapping is enabled, the preview should snap to grid coordinates, not raw mouse position.
- **Preview should NOT be persisted** — it exists only during the draw gesture. On `mouseup`, the final shape is committed; on `mouseleave` or `Escape`, the preview is discarded.

### Audio/Visual Effects
- **Effect IDs must be unique** — use UUIDs or a combination of effect type + source ID.
- **Looping effects** (ambient sounds, persistent visual effects) have no duration and must be explicitly stopped.
- **Network sync**: If effects should be visible to all players, their state must be included in the game sync broadcasts.

### 5e Data Extraction
- **This is a build-time script** — running it regenerates the JSON data files in `src/renderer/public/data/5e/`. It does NOT affect runtime code.
- **Source data availability**: The extraction script likely reads from SRD reference files. If those files are not present, the script will fail. Verify the source files exist before running.
- **Do NOT add copyrighted content** — only extract SRD-licensed data.

Begin implementation now. This is a light phase — start with Sub-Phase A (Steps 1-3) for drawing tool live preview as the most visible improvement, then Sub-Phase B (Steps 4-5) for effect state management. Sub-Phase D (Steps 7-10) is verification work that should be quick.
