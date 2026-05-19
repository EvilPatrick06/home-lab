# SYSTEM OVERRIDE: IMPLEMENTATION MODE

Phase 17 is a **full codebase error audit** identifying 171 issues across syntax, logic, network, GUI, runtime, and type categories. This is the largest single phase. The plan focuses on the **49 critical and high-severity issues** that are NET-NEW (not already addressed by previous phases). Lower-severity items are catalogued for future cleanup.

> **See also:** Phases 29-32. NET-5 broadcast hardening (Step 19) lands inside `host-manager.ts` paths that Phase 30 consolidates into `GameAuthority` — the try-catch travels with the consolidation. Many of the "30 medium network issues" (NET-21–NET-50) may disappear after Phase 30 (single message router) + Phase 31 (single sync protocol); re-scope at execution time.
>
> **Phase 17 GUI-4 (Three.js resource leaks) — additional scope (2026-05-18):** include the `scene.remove(mesh)` + `dispose()` discipline pattern absorbed from SUGGESTIONS-LOG-DNDAPP. The fix wraps `scene.remove` with mandatory `geometry.dispose()` + `material.dispose()` + `material.map?.dispose()` across `dice3d/` (84 `new THREE.*()` allocations vs 1 historical `dispose()` call). Define a `disposeDie(mesh)` helper and replace every clear/cleanup path. Lint rule (or grep-based pre-commit): forbid bare `scene.remove(...)` outside the helper.
>
> **Verification pass (2026-05-18):** Spot-checked ~30 audit steps. ~2 already addressed: **GUI-1** PlayerHUDOverlay hooks placement (hooks above the early return at `PlayerHUDOverlay.tsx`); **NET-5** broadcast try-catch present at the visible sites in `host-manager.ts:170-174` (disconnectPeer) and `:303-308` (ping interval). The plan's stale line numbers (321/329/342) don't map to current code; full broadcast-site coverage is unverified, so treat NET-5 as **partial**. All other P0/P1 audit items (NET-1/12/13/14/15 path traversal, NET-2/3 BrowserWindow guards, RUN-1 JSON.parse, LOG-1–LOG-12 game logic, GUI-2/4/7/8, TYP-1–TYP-4) verified NOT done. **Recommendation:** re-run the audit script before scoping; some "fixed elsewhere" may show up.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 17 is entirely client-side code fixes. No Raspberry Pi involvement.

### Cross-Phase Overlap (DO NOT duplicate)

| Issue ID | Already In |
|----------|-----------|
| LOG-6 (exhaustion long rest) | Phase 4 Steps 1-2 |
| NET-9 (non-atomic writes) | Phase 7 Steps 1-3 |
| GUI-5 (selectedTokenId inconsistency) | Phase 12 Step 17 |
| SYN-2 useHookAtTopLevel warnings | Addressed by GUI-1 fix |

---

## 📋 Execution Plan: 30 Steps, 7 Sub-Phases

### Sub-Phase A: SECURITY FIXES (Steps 1-5) — DO THESE FIRST

**Step 1 — NET-1 [CRITICAL]: Path Traversal in AI Memory Handlers**
- File: `src/main/ipc/ai-handlers.ts` lines 290-340
- `AI_CLEAR_MEMORY`, `AI_LIST_MEMORY_FILES`, `AI_READ_MEMORY_FILE` use `campaignId` directly in `path.join()`. `campaignId = '../../../'` deletes arbitrary directories.
- Fix: Sanitize `campaignId` — reject if it contains `..`, `/`, `\`, or is not a valid UUID:
  ```typescript
  function sanitizeCampaignId(id: unknown): string {
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) {
      throw new Error('Invalid campaign ID')
    }
    return id
  }
  ```
- Apply to ALL handlers that use `campaignId` in path construction (10+ handlers per the audit).

**Step 2 — NET-12: Path Traversal in CHARACTER_RESTORE_VERSION**
- File: `src/main/ipc/storage-handlers.ts` lines 91-93
- `fileName` passed directly to path construction. Fix: sanitize `fileName` — strip path separators, validate format.

**Step 3 — NET-13: BOOK_IMPORT/BOOK_READ_FILE Accept Arbitrary Paths**
- File: `src/main/ipc/storage-handlers.ts` lines 324-337
- Add `isPathAllowed()` check (already used by `FS_READ`/`FS_WRITE`).

**Step 4 — NET-14: AI_INSTALL_OLLAMA Unvalidated Installer Path**
- File: `src/main/ipc/ai-handlers.ts` lines 434-441
- Validate `installerPath` is within the temp directory or downloads folder.

**Step 5 — NET-15: FS_WRITE_BINARY Missing Size Limit**
- File: `src/main/ipc/index.ts` lines 197-210
- Add `MAX_WRITE_CONTENT_SIZE` check matching `FS_WRITE`.

### Sub-Phase B: CRASH PREVENTION (Steps 6-9)

**Step 6 — NET-2/NET-3 [CRITICAL]: Destroyed BrowserWindow Crashes Main Process**
- File: `src/main/ipc/ai-handlers.ts` lines 162-183, 422-432, 452-462, 484-497
- All streaming callbacks use `win.webContents.send()` without checking `win.isDestroyed()`.
- Fix: Add guard to every callback:
  ```typescript
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data)
  }
  ```
- Apply to `AI_CHAT_STREAM`, `AI_DOWNLOAD_OLLAMA`, `AI_OLLAMA_UPDATE`, `AI_PULL_MODEL`.

**Step 7 — RUN-1/NET-7 [CRITICAL]: JSON.parse Without Try-Catch in Data Loader**
- File: `src/main/ipc/game-data-handlers.ts` lines 28-29
- `GAME_LOAD_JSON` handler: wrap `JSON.parse(content)` in try-catch:
  ```typescript
  try {
    return JSON.parse(content)
  } catch (err) {
    logToFile(`[game-data] Failed to parse ${filePath}: ${err}`)
    return null
  }
  ```

**Step 8 — GUI-1 [CRITICAL]: Conditional Hooks in PlayerHUDOverlay**
- File: `src/renderer/src/components/game/overlays/PlayerHUDOverlay.tsx` line 82
- Early return `if (!character) return <></>` BEFORE hooks at lines 86, 96, 118, 153+.
- Fix: Move ALL hooks above the early return. Guard their usage with `character` checks inside:
  ```typescript
  // ALL hooks FIRST
  const memoized = useMemo(() => character ? compute(character) : null, [character])
  const callback = useCallback(() => { if (!character) return; /* ... */ }, [character])
  // THEN the early return
  if (!character) return null
  ```

**Step 9 — SYN-1 [CRITICAL]: JSX in .ts File**
- Rename `src/renderer/src/utils/chat-links.ts` to `src/renderer/src/utils/chat-links.tsx`
- Update ALL imports across the codebase that reference `chat-links`.

### Sub-Phase C: GAME LOGIC FIXES (Steps 10-18)

**Step 10 — LOG-1 [HIGH]: Champion Fighter Crit Range Never Applied**
- File: `src/renderer/src/services/combat/attack-resolver.ts` line 481
- Replace `const isCrit = attackRoll === 20` with:
  ```typescript
  import { getCritThreshold } from './crit-range'
  const critThreshold = getCritThreshold(attacker)
  const isCrit = attackRoll >= critThreshold
  ```
- Also fix in `combat-resolver.ts` line 452 if it has the same hardcoded check.

**Step 11 — LOG-2 [HIGH]: Critical Hit Only Doubles First Dice Group**
- File: `src/renderer/src/services/combat/combat-resolver.ts` lines 870-875
- `doubleDiceInFormula()` uses regex without `g` flag.
- Fix: `formula.replace(/(\d*)d(\d+)/g, ...)`

**Step 12 — LOG-3 [HIGH]: isInMeleeRange Ignores Token Size**
- File: `src/renderer/src/services/combat/combat-rules.ts` lines 291-301
- Fix: Iterate all occupied cells (like `isAdjacent()` at line 198 already does):
  ```typescript
  function isInMeleeRange(attacker: MapToken, target: MapToken, reach: number, cellSize: number): boolean {
    for (let ax = 0; ax < attacker.sizeX; ax++) {
      for (let ay = 0; ay < attacker.sizeY; ay++) {
        for (let tx = 0; tx < target.sizeX; tx++) {
          for (let ty = 0; ty < target.sizeY; ty++) {
            const dist = gridDistance(attacker.gridX + ax, attacker.gridY + ay, target.gridX + tx, target.gridY + ty) * cellSize / cellSize * 5
            if (dist <= reach) return true
          }
        }
      }
    }
    return false
  }
  ```

**Step 13 — LOG-4 [HIGH]: Area Effect Saves Ignore Target Modifiers**
- File: `src/renderer/src/services/game-actions/creature-conditions.ts` lines 113-115
- File: `src/renderer/src/services/game-actions/creature-actions.ts` lines 256-258
- Fix: Look up target's save modifier from token stats or linked stat block:
  ```typescript
  const saveMod = getCreatureSaveMod(target, saveAbility) // DEX, CON, etc.
  const saveRoll = rollDiceFormula('1d20')
  const saved = (saveRoll.total + saveMod) >= saveDC
  ```
- Create `getCreatureSaveMod(token, ability)` that reads from `monsterStatBlockId` or token properties.

**Step 14 — LOG-5 [HIGH]: Cone AoE Uses Square Geometry**
- File: `src/renderer/src/services/game-actions/dice-helpers.ts` lines 46-49
- The `'cone'` case falls through to `'cube'` logic.
- Fix: Use the existing `getConeCells()` from `aoe-targeting.ts`:
  ```typescript
  case 'cone':
    return getConeCells(origin, direction, radius, cellSize)
  ```

**Step 15 — LOG-7 [MEDIUM]: Thrown Weapons Always Classified as Melee**
- File: `src/renderer/src/services/combat/attack-resolver.ts` lines 70-72
- Fix: `isMeleeWeapon()` should check if the attack is actually at range:
  ```typescript
  function isMeleeWeapon(weapon, attackDistance?: number): boolean {
    if (attackDistance && attackDistance > 5 && weapon.properties.some(p => p.toLowerCase() === 'thrown')) {
      return false // thrown at range = ranged attack
    }
    return !weapon.range || weapon.properties.some(p => p.toLowerCase() === 'thrown')
  }
  ```

**Step 16 — LOG-8 [MEDIUM]: Exhaustion Death at Level 6 Uses 2014 Rule**
- File: `src/renderer/src/stores/game/conditions-slice.ts` lines 21, 47
- The 2024 PHB removed the "exhaustion 6 = death" rule. Remove the death trigger.
- Keep the cumulative -2 penalty per level (already in `attack-condition-effects.ts:90`).

**Step 17 — LOG-10 [MEDIUM]: removeFromInitiative Shifts Active Turn Wrong**
- File: `src/renderer/src/stores/game/initiative-slice.ts` lines 265-288
- Fix: Track active entry by `entityId`, not by index. After removal, find the tracked entity's new index.

**Step 18 — LOG-12 [MEDIUM]: Initiative Validator Checks label Instead of entityName**
- File: `src/renderer/src/services/game-actions/action-validator.ts` line 104
- Fix: Change `e.label?.toLowerCase()` to `e.entityName?.toLowerCase()`.
- Remove the type cast `{ label?: string }` that masked the error.

### Sub-Phase D: ERROR HANDLING HARDENING (Steps 19-24)

**Step 19 — NET-5 [HIGH]: Unguarded JSON.stringify in Broadcast**
- File: `src/renderer/src/network/host-manager.ts` lines 321, 329, 342
- Wrap `JSON.stringify(msg)` in try-catch in all broadcast functions.
- **Phase 30 coordination:** these broadcast paths consolidate into `GameAuthority` during Phase 30a; the try-catch travels with the move. Land Step 19 first; Phase 30 inherits.

**Step 20 — NET-6/NET-29/NET-30: Add Try-Catch to All IPC Handlers**
- File: `src/main/ipc/ai-handlers.ts` — 27+ handlers
- File: `src/main/ipc/storage-handlers.ts` — 34 handlers
- File: `src/main/ipc/plugin-handlers.ts` — 10 handlers
- Pattern: Wrap each handler body in try-catch returning `StorageResult` or `{ success: false, error }`.
- This is a bulk operation — apply consistently to ALL handlers in these files.

**Step 21 — NET-8 [HIGH]: Add Timeouts to Cloud API Calls**
- Files: `claude-client.ts`, `openai-client.ts`, `gemini-client.ts`
- Add `AbortSignal.timeout(120_000)` (matching Ollama's timeout) to all `streamChat` and `chatOnce` calls.

**Step 22 — NET-10 [HIGH]: Replace writeFileSync with Async Write**
- File: `src/main/ai/ai-service.ts` lines 244-256
- Replace `writeFileSync` with `await writeFile` (async). This unblocks the main process.

**Step 23 — RUN-2 [HIGH]: Add .catch() to Builder Selection Slice**
- File: `src/renderer/src/stores/builder/slices/selection-slice.ts` lines 170, 227, 247, 279
- Add `.catch()` to all `load5eSpecies().then()`, `load5eBackgrounds().then()`, `load5eClasses().then()`.

**Step 24 — RUN-3/RUN-5 [HIGH]: Add .catch() to Dynamic Imports**
- File: `src/renderer/src/stores/use-ai-dm-store.ts` lines 136-138
- File: `src/renderer/src/hooks/use-game-effects.ts` lines 334, 349
- Add `.catch()` to all `import('...').then()` calls.

### Sub-Phase E: GUI FIXES (Steps 25-28)

**Step 25 — GUI-2 [HIGH]: DmAlertTray Subscription Leak**
- File: `src/renderer/src/components/game/overlays/DmAlertTray.tsx` lines 33-38
- Fix: Return cleanup function from `useEffect`, not as initial state.

**Step 26 — GUI-4 [HIGH]: Three.js Resource Leaks Per Dice Roll**
- File: `src/renderer/src/components/game/dice3d/DiceRenderer.tsx` lines 129-134
- File: `dice-textures.ts` lines 6-73
- File: `dice-physics.ts` lines 91-148
- Fix: Call `.geometry.dispose()`, `.material.dispose()`, `.texture.dispose()` in `clearDice()`.

**Step 27 — GUI-7 [HIGH]: RulingApprovalModal Cannot Be Dismissed**
- File: `src/renderer/src/components/game/modals/utility/RulingApprovalModal.tsx` lines 50-109
- Add Escape key handler, backdrop click handler, and a "Dismiss" button.

**Step 28 — GUI-8 [HIGH]: 11 Modals Missing Escape Key Handling**
- Files: `NarrowModalShell.tsx`, `LightSourceModal.tsx`, `TimeEditModal.tsx`, `SentientItemModal.tsx`, `NetworkSettingsModal.tsx`, `WhisperModal.tsx`, `HandoutModal.tsx`, `DMNotesModal.tsx`, `SharedJournalModal.tsx`, `ConfirmDialog.tsx`
- Add `useEffect` with `keydown` listener for Escape in each, or migrate them to use the shared `Modal` component that already handles Escape.

### Sub-Phase F: TYPE SAFETY (Steps 29-30)

**Step 29 — TYP-1/TYP-2 [HIGH]: Missing Preload Type Declarations**
- File: `src/preload/index.d.ts`
- Add `discord` and `cloudSync` namespace declarations matching the runtime API.
- Add `listCloudModels`, `validateApiKey`, `syncWorldState`, `syncCombatState` to `AiAPI` type.

**Step 30 — TYP-3/TYP-4 [MEDIUM]: Zod Bypass and Type Cast Masking**
- `ai-handlers.ts` line 75: Change `aiService.configure(config)` to `aiService.configure(parsed.data)`.
- `action-validator.ts` line 104: Remove `{ label?: string }` cast, use `e.entityName` (covered by Step 18).

### Sub-Phase G: MEDIUM/LOW PRIORITY CATALOGUE (For future reference — do NOT block on these)

The remaining 122 medium/low issues are catalogued for future cleanup sprints:
- **22 Biome lint warnings** (useHookAtTopLevel in 13 files) — most are false positives or require refactoring
- **6 exhaustive dependency warnings** in MapCanvas — review but may be intentional
- **30 medium network issues** (NET-21 through NET-50) — error handling and validation gaps
- **25 medium GUI issues** (GUI-12 through GUI-36) — loading states, index keys, dark mode
- **12 medium runtime issues** (RUN-10 through RUN-21) — Promise.all failures, non-null assertions
- **10 low logical issues** (LOG-16 through LOG-25) — condition timing, Math.random() inconsistency, movement edge cases
- **8 low GUI issues** (GUI-37 through GUI-44) — minor styling
- **18 low network issues** (NET-51 through NET-68) — minor cleanup

---

## ⚠️ Constraints & Edge Cases

### Security Fixes
- **Path sanitization must be defense-in-depth**: Validate format (UUID regex) AND check that the resolved path is within the expected directory (`path.resolve(base, id).startsWith(base)`).
- **Do NOT break existing campaigns**: The UUID validation regex must accept the format already used by existing campaign IDs.

### Crash Prevention
- **`win.isDestroyed()` must be checked BEFORE `win.webContents`** — accessing `webContents` on a destroyed window also throws.
- **JSON.parse fallback**: When corrupt data is detected, log the file path and return `null`. The caller must handle `null` gracefully — check all callsites of `GAME_LOAD_JSON`.

### Game Logic
- **Champion crit range**: `getCritThreshold()` needs access to the attacker's class and level. Verify this data is available in the attack resolution context.
- **Area effect saves**: `getCreatureSaveMod()` for monsters needs the stat block. If the monster token doesn't have a linked stat block, fall back to +0 (current behavior) but log a warning.
- **Exhaustion 2024**: Removing the level 6 death trigger is correct for 2024 rules. If users want the 2014 rule, add it as a campaign setting option.

### Error Handling Bulk Fix
- **IPC handler try-catch**: Use a wrapper function to avoid boilerplate:
  ```typescript
  function safeHandler<T>(fn: (...args: unknown[]) => Promise<T>) {
    return async (...args: unknown[]) => {
      try { return await fn(...args) }
      catch (err) { return { success: false, error: String(err) } }
    }
  }
  ```
- Apply to all 71+ IPC handlers across 3 files.

Begin implementation now. **Start with Sub-Phase A (Steps 1-5) — security fixes are non-negotiable.** Then Sub-Phase B (Steps 6-9) for crash prevention. Then Sub-Phase C (Steps 10-18) for game logic correctness. Error handling (Sub-Phase D) and GUI fixes (Sub-Phase E) come last.
