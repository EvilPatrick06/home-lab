# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 6 of the D&D VTT project.

Phase 6 covers the **AI DM and Discord Bot System**. The AI DM has a sophisticated context pipeline (RAG, SRD data, character sheets, campaign memory, game state) and an ~800-line system prompt enforcing narrative rules. The Discord integration is a dual-layer system: VTT-to-Discord narration bridge (Electron) + standalone Discord DM bot (Raspberry Pi). The audit found **4 critical issues**: stat mutations bypass user approval, `actingCharacterId` never wired, `__dirname` path breakage in packaged builds, and Discord/VTT session state desynchronization.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — AI DM Core + Discord Bridge

**AI DM Main Process (`src/main/ai/`):**

| File | Role | Issues |
|------|------|--------|
| `src/main/ai/context-builder.ts` | Builds AI context from RAG, SRD, characters, campaign, game state | `actingCharacterId` accepted but never passed; `__dirname` path breaks in packaged builds; silent error swallowing in catches at lines 36-38, 190-193, 256-259, 286-289 |
| `src/main/ai/ai-service.ts` | AI service orchestrator | Does NOT pass `actingCharacterId` to `buildContext` (lines 343-349); `AiChatRequest` type missing the field |
| `src/main/ai/types.ts` | AI request/response types | `AiChatRequest` (lines 25-31) has no `actingCharacterId` field |
| `src/main/ai/dm-system-prompt.ts` | ~800-line DM system prompt | Monolithic; no modular loading based on context; references `place_creature` (which IS in DmAction union — audit was wrong about this) |
| `src/main/ai/dm-actions.ts` | DM action parser + types | `place_creature` IS present at lines 38-47 (contradicts this audit's claim) |
| `src/main/ai/stat-mutations.ts` | Applies stat changes to characters | Mutations auto-applied; `remove_condition` for exhaustion is too aggressive (see Phase 4) |
| `src/main/ai/memory-manager.ts` | Persistent world/combat state | `updateWorldState`/`updateCombatState` defined but never called from renderer (see Phase 1) |

**Discord Bridge (`src/main/discord-integration/`):**

| File | Role |
|------|------|
| `src/main/discord-integration/discord-service.ts` | Sends AI DM narration to Discord via webhook or bot API; strips `[DM_ACTIONS]`/`[STAT_CHANGES]` metadata |

**BMO Bridge:**

| File | Role |
|------|------|
| `src/main/bmo-bridge.ts` | HTTP client to Pi — `startDiscordDm()`, `stopDiscordDm()`, `sendNarration()`, `getDmStatus()` via `http://bmo.local:5000` |

**Renderer:**

| File | Role | Issues |
|------|------|--------|
| `src/renderer/src/hooks/use-game-effects.ts` | Processes AI responses, applies stat changes and DM actions | Auto-applies mutations at lines 295-328 without user approval |

### Raspberry Pi (`patrick@bmo`) — Discord Bots + Voice

**Discord Bots:**

| File | Role |
|------|------|
| `BMO-setup/pi/discord_dm_bot.py` | Standalone D&D DM bot with 14 slash commands, voice channel integration, TTS (Fish Audio), STT (Groq) |
| `BMO-setup/pi/discord_bot.py` | General session management bot |

**Slash Commands in `discord_dm_bot.py`:**
`/dm start`, `/dm stop`, `/dm status`, `/roll`, `/initiative`, `/recap`, `/spell`, `/item`, `/condition`, `/loot`, `/npc`, `/encounter`, `/tavern`, `/monster`

**Key Issue:** The Discord bot maintains its own isolated `DMSession` state. Actions in Discord voice (combat, damage, movement) do NOT sync back to the VTT's visual grid. The bridge is asymmetric: VTT → Discord works; Discord → VTT does not.

---

## 📋 Core Objectives & Corrections

### AUDIT CORRECTION

The audit claims `place_creature` is "missing from the TypeScript `DmAction` union in `dm-actions.ts`." This is **FALSE** — verified in Phase 1 that `place_creature` IS present at lines 38-47. No action needed for this item.

### CRITICAL FIXES

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| F1 | AI stat mutations auto-applied without approval | **Critical** | AI can damage players, change conditions, modify stats with zero user consent |
| F2 | `actingCharacterId` not wired through AI pipeline | **High** | All characters get full sheets in context, wasting token budget and reducing AI focus |
| F3 | `__dirname` path breaks in packaged Electron builds | **High** | Monster/SRD data unavailable in production, AI operates without game data |
| F4 | Discord/VTT state desynchronization | **High** | Discord players' actions don't reflect on VTT grid; split reality |
| F5 | Silent error handling in context builder | **Medium** | AI operates without critical data, no indication of failure |
| F6 | Monolithic system prompt (~800 lines on every request) | **Medium** | Token waste; no contextual pruning |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Stat Mutation Approval System (F1) — Windows 11

**Step 1 — Add Approval Queue to Game Store**
- Open `src/renderer/src/hooks/use-game-effects.ts`
- Instead of immediately calling `window.api.ai.applyMutations`, queue the mutations:
  ```typescript
  if (lastMsg.statChanges && lastMsg.statChanges.length > 0) {
    // Queue for approval instead of auto-applying
    gameStore.queuePendingMutations({
      messageId: lastMsg.id,
      mutations: lastMsg.statChanges,
      source: 'ai-dm',
      timestamp: Date.now()
    })
  }
  ```
- Create a `pendingMutations` state in the game store:
  ```typescript
  pendingMutations: PendingMutation[]
  queuePendingMutations: (mutation: PendingMutation) => void
  approveMutation: (id: string) => void
  rejectMutation: (id: string) => void
  approveAllMutations: () => void
  ```

**Step 2 — Create Mutation Approval UI**
- Create a `MutationApprovalPanel` component that shows pending AI changes:
  - Character name, what changed (HP, conditions, etc.), old value → new value
  - "Approve" / "Reject" / "Approve All" buttons
  - DM role sees all pending mutations; players see only their own
- Render this panel in the game sidebar or as a floating notification
- Auto-approve setting: add a `autoApproveAiMutations: boolean` game setting (default: false) for DMs who trust the AI

**Step 3 — Wire DM Action Approval**
- DM actions (token placement, movement, initiative changes) from `use-game-effects.ts` should also go through the approval queue
- Narrative text should display immediately; only mechanical state changes need approval
- Add visual indicators: pending changes shown as "ghost" effects (e.g., token damage shown as pending with a dotted outline)

### Sub-Phase B: Wire `actingCharacterId` (F2) — Windows 11

**Step 4 — Add `actingCharacterId` to AI Request Type**
- Open `src/main/ai/types.ts`
- Add `actingCharacterId?: string` to `AiChatRequest` (lines 25-31):
  ```typescript
  export interface AiChatRequest {
    message: string
    characterIds: string[]
    actingCharacterId?: string  // NEW: focused character for context
    campaignId?: string
    activeCreatures?: unknown[]
    gameState?: unknown
  }
  ```

**Step 5 — Pass `actingCharacterId` Through AI Service**
- Open `src/main/ai/ai-service.ts`
- At lines 343-349 where `buildContext` is called, pass the acting character:
  ```typescript
  const context = await buildContext(
    request.message,
    request.characterIds,
    request.campaignId,
    request.activeCreatures,
    request.gameState,
    request.actingCharacterId  // NEW
  )
  ```

**Step 6 — Pass `actingCharacterId` from Renderer**
- Find where the renderer sends AI chat requests (likely in a chat input handler or AI hook)
- Determine the "acting character" — in combat, this is the entity whose turn it is; outside combat, it's the player's selected character
- Pass the ID with the request:
  ```typescript
  window.api.ai.chat({
    message: userInput,
    characterIds: partyIds,
    actingCharacterId: currentTurnCharacterId || selectedCharacterId,
    campaignId: campaign.id,
    // ...
  })
  ```

### Sub-Phase C: Fix Packaged Build Paths (F3) — Windows 11

**Step 7 — Replace `__dirname` with Electron-safe Paths**
- Open `src/main/ai/context-builder.ts`
- Find `loadMonsterData()` at line 27:
  ```typescript
  const dataDir = path.join(__dirname, '..', '..', 'renderer', 'public', 'data', '5e')
  ```
- Replace with Electron's resource path:
  ```typescript
  import { app } from 'electron'
  import { is } from '@electron-toolkit/utils'

  function getDataDir(): string {
    if (is.dev) {
      return path.join(__dirname, '..', '..', 'renderer', 'public', 'data', '5e')
    }
    // In packaged build, resources are in the app's resources directory
    return path.join(app.getAppPath(), 'out', 'renderer', 'data', '5e')
  }
  ```
- Verify the actual packaged output structure by checking `electron.vite.config.ts` or `electron-builder.yml` to confirm where `public/data/5e/` ends up in the build output
- Apply the same fix to ALL path constructions in `context-builder.ts` that use `__dirname`

### Sub-Phase D: Fix Error Handling (F5) — Windows 11

**Step 8 — Add Logging to Silent Catches**
- Open `src/main/ai/context-builder.ts`
- Replace all silent `catch { }` blocks with logged warnings:
  ```typescript
  // Line 36-38 (loadMonsterData):
  } catch (err) {
    logToFile(`[context-builder] Failed to load monster data: ${err}`)
  }

  // Line 190-193 (SRD):
  } catch (err) {
    logToFile(`[context-builder] Failed to load SRD data: ${err}`)
  }

  // Line 256-259 (campaign):
  } catch (err) {
    logToFile(`[context-builder] Failed to load campaign data: ${err}`)
  }

  // Line 286-289 (memory):
  } catch (err) {
    logToFile(`[context-builder] Failed to load memory data: ${err}`)
  }
  ```
- Import `logToFile` from `../log` (already used elsewhere in the main process)
- Add a context health indicator: track which data sources loaded successfully and include a `contextHealth` summary in the AI response metadata

### Sub-Phase E: Modularize System Prompt (F6) — Windows 11

**Step 9 — Split Monolithic Prompt Into Modules**
- Open `src/main/ai/dm-system-prompt.ts` (~800 lines)
- Split into contextual modules:
  ```typescript
  // Base narration rules (always included)
  export const BASE_NARRATION_PROMPT = `...`

  // Combat-specific rules (only when in combat)
  export const COMBAT_RULES_PROMPT = `...`

  // Exploration-specific rules (only when exploring)
  export const EXPLORATION_RULES_PROMPT = `...`

  // Social encounter rules (only when in social)
  export const SOCIAL_RULES_PROMPT = `...`

  // DM action schema (always included)
  export const DM_ACTIONS_SCHEMA_PROMPT = `...`

  // Stat mutation schema (always included)
  export const STAT_CHANGES_SCHEMA_PROMPT = `...`
  ```
- In the context builder, assemble the prompt based on current game mode:
  ```typescript
  function assembleSystemPrompt(gameMode: 'combat' | 'exploration' | 'social' | 'general'): string {
    let prompt = BASE_NARRATION_PROMPT + DM_ACTIONS_SCHEMA_PROMPT + STAT_CHANGES_SCHEMA_PROMPT
    switch (gameMode) {
      case 'combat': prompt += COMBAT_RULES_PROMPT; break
      case 'exploration': prompt += EXPLORATION_RULES_PROMPT; break
      case 'social': prompt += SOCIAL_RULES_PROMPT; break
    }
    return prompt
  }
  ```
- This reduces token consumption by ~30-50% per request

### Sub-Phase F: Discord/VTT State Sync (F4) — BOTH ENVIRONMENTS

**Step 10 — Define Sync Protocol**
- Design a bidirectional sync API between the VTT (Windows) and Discord bot (Pi):
  ```
  VTT → Pi (already exists):
    POST /api/discord/dm/narrate — send narrative text
    POST /api/discord/dm/start — start session
    POST /api/discord/dm/stop — stop session

  Pi → VTT (NEW — needs implementation):
    WebSocket or POST callback to VTT:
    - token_damage: { tokenLabel, damage, damageType }
    - token_move: { tokenLabel, gridX, gridY }
    - condition_change: { tokenLabel, condition, action: 'add'|'remove' }
    - initiative_action: { type: 'start'|'next'|'end' }
    - roll_result: { player, roll, result }
  ```

**Step 11 — Add VTT Webhook Receiver (Windows 11)**
- Open `src/main/bmo-bridge.ts`
- Add an HTTP server endpoint (or WebSocket listener) that accepts state change callbacks from the Pi:
  ```typescript
  import { createServer } from 'node:http'

  export function startSyncReceiver(port = 5001) {
    const server = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/api/sync') {
        // Parse incoming state change from Pi Discord bot
        // Forward to renderer via IPC
        // Apply through the mutation approval queue (Step 1-2)
      }
    })
    server.listen(port)
  }
  ```
- Forward received changes through the same mutation approval queue from Sub-Phase A
- This ensures Discord-originated changes also get DM approval

**Step 12 — Add VTT Callback URL to Pi Bot (Raspberry Pi)**
- SSH to `patrick@bmo`
- Open `BMO-setup/pi/discord_dm_bot.py`
- Add a `VTT_CALLBACK_URL` config (e.g., `http://<vtt-machine-ip>:5001/api/sync`)
- When the Discord bot processes `/roll`, `/initiative`, or damage commands, POST the state change to the VTT callback:
  ```python
  async def notify_vtt(action_type: str, data: dict):
      if VTT_CALLBACK_URL:
          async with aiohttp.ClientSession() as session:
              await session.post(f"{VTT_CALLBACK_URL}/api/sync", json={
                  "type": action_type,
                  "data": data,
                  "source": "discord"
              })
  ```

**Step 13 — Sync Initiative State**
- When the VTT starts combat, push initiative order to the Pi bot
- When the Pi bot advances initiative (via Discord commands), push the change back to VTT
- Both sides should treat the VTT as the source of truth; Discord bot should confirm/request rather than unilaterally change

---

## ⚠️ Constraints & Edge Cases

### Stat Mutation Approval
- **Narrative text must NOT be gated by approval** — only mechanical state changes (HP, conditions, token positions). The DM narration should display immediately.
- **Auto-approve option for trusted AI**: Some DMs want the AI to be fully autonomous. The `autoApproveAiMutations` setting must be per-campaign, not global.
- **Timeout**: If mutations are not approved within 60 seconds, auto-reject them and notify the DM.
- **Batch approval**: When the AI generates multiple mutations in one response (e.g., AoE damage to 5 creatures), show them as a group with "Approve All" / "Reject All".

### Packaged Build Paths
- **Verify the actual build output** — `electron.vite.config.ts` controls where `public/data/` files are copied. The path in the packaged build depends on whether electron-vite copies public assets to `out/renderer/` or bundles them differently.
- **Use `app.isPackaged`** if `@electron-toolkit/utils` `is.dev` is not available.
- **ASAR considerations**: If the app is packaged as ASAR, file system reads may need `app.getAppPath()` pointing inside the ASAR or `process.resourcesPath` for unpacked assets.

### Discord/VTT Sync
- **Network topology**: The VTT runs on a Windows machine and the bot on a Pi. They must be on the same local network. The VTT's sync receiver port (5001) must be accessible from the Pi.
- **VTT as source of truth**: All state changes from Discord must go through the approval queue. Discord cannot unilaterally modify VTT state.
- **Offline resilience**: If the Pi is unreachable, the VTT must continue functioning. Sync is best-effort, not blocking.
- **No credentials in VTT**: Discord bot tokens, Fish Audio API keys, and Groq API keys live ONLY on the Pi. The VTT never handles these credentials.

### System Prompt Optimization
- **Do not remove any rules from the prompt** — only reorganize and conditionally include them. The combat rules module must contain ALL combat-relevant rules from the original monolithic prompt.
- **Test with the AI** — after splitting the prompt, verify that AI responses maintain the same quality for combat narration, exploration, and social encounters.
- **`DM_TOOLBOX_CONTEXT` and `PLANAR_RULES_CONTEXT`** are already modular additions — maintain this pattern.

Begin implementation now. Start with Sub-Phase A (Steps 1-3) for the stat mutation approval system — this is the highest-severity issue affecting player trust. Then Sub-Phase B (Steps 4-6) to wire `actingCharacterId`. Sub-Phase F (Steps 10-13) for Discord sync should be done last as it requires coordination between both machines.
