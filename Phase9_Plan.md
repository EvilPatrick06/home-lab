# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 9 of the D&D VTT project.

Phase 9 covers the **Campaign System** — creation, management, session notes, journal, and state persistence. The creation wizard (10 steps) and edit/delete flows are solid. The critical problems are a **fractured journal/notes pipeline** (4 separate note systems that never converge into the campaign journal), **dual save systems that can overwrite each other**, no campaign archive, and missing manual journal entry creation.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 9 is entirely client-side. No Raspberry Pi involvement.

**Campaign Types & Store:**

| File | Role |
|------|------|
| `src/renderer/src/types/campaign.ts` | `Campaign`, `JournalEntry`, `SavedGameState`, `SessionJournal` types (lines 72-118) |
| `src/renderer/src/stores/use-campaign-store.ts` | Campaign CRUD — `createCampaign` (lines 112-127), `deleteCampaign` (lines 71-82), `saveCampaign` |
| `src/main/storage/campaign-storage.ts` | File persistence — save/load/delete with cascade (lines 93-121) |

**Campaign UI:**

| File | Role |
|------|------|
| `src/renderer/src/components/campaign/CampaignWizard.tsx` | 10-step creation wizard (lines 27-38) |
| `src/renderer/src/components/campaign/StartStep.tsx` | Campaign browser, create/join |
| `src/renderer/src/pages/CampaignDetailPage.tsx` | Campaign detail — edit cards, journal display (lines 277-324), export, delete |
| `src/renderer/src/pages/MakeGamePage.tsx` | Make/import campaigns |

**The Four Disconnected Note Systems:**

| System | File | Where It Persists | Writes to Campaign Journal? |
|--------|------|-------------------|-----------------------------|
| 1. DMNotepad session log | `src/renderer/src/components/game/dm/DMNotepad.tsx`, `stores/game/time-slice.ts` (lines 79-117) | `game-states/{id}.json` only | **NO** — `buildSavableCampaign` excludes `sessionLog` |
| 2. Shared journal (in-game) | `src/renderer/src/components/game/modals/utility/SharedJournalModal.tsx` | `game-states/{id}.json` during play | **NO** — not written to `campaign.journal.entries` |
| 3. JournalPanel sidebar | `src/renderer/src/components/game/sidebar/JournalPanel.tsx` | **NOWHERE** — local state only, `void campaignId` | **NO** |
| 4. AI `add_journal_entry` | `src/renderer/src/services/game-actions/effect-actions.ts` (lines 335-341) | Combat log via `addLogEntry` | **NO** — goes to combat log, not campaign journal |

**Campaign Journal (destination that nothing writes to):**
- Type: `campaign.journal.entries: JournalEntry[]`
- Shown on: `CampaignDetailPage` (lines 277-324)
- Can be imported via `entity-io` (`.dndjournal`)
- **Cannot be manually created** — no create form exists
- Placeholder text falsely claims: "Entries are created during and after game sessions"

**Save Systems (conflicting):**

| System | File | What It Saves | Trigger |
|--------|------|---------------|---------|
| `campaign.savedGameState` | `game-state-saver.ts` `buildSavableCampaign()` | Initiative, round, conditions, turnStates, handouts, inGameTime — but NOT sessionLog, NOT sharedJournal, NOT shop | DMNotepad save, explicit save |
| `game-states/{id}.json` | `game-auto-save.ts` `buildSavePayload()` | Maps, initiative, sessionLog, handouts, shopInventory | Auto-save timer (DM only) |

**Load order conflict:** `InGamePage` loads `campaign.savedGameState` → then `use-game-effects` (DM only) loads from `game-states` file → second load can overwrite first.

**Session Commands:**

| File | Commands |
|------|---------|
| `src/renderer/src/services/chat-commands/commands-dm-campaign.ts` (lines 114-147) | `/session start`, `/session end`, `/session recap` — all are broadcast-only placeholders |

**AI Recap:**

| File | Role |
|------|------|
| `src/main/ai/conversation-manager.ts` (lines 156-173) | `generateEndOfSessionRecap()` — generates AI summary but only for conversation pruning, NOT written to campaign journal |

### Raspberry Pi (`patrick@bmo`) — NO WORK THIS PHASE

---

## 📋 Core Objectives & Corrections

### CRITICAL: Journal Pipeline

| # | Issue | Impact |
|---|-------|--------|
| J1 | Session log from DMNotepad never reaches campaign journal | Session notes lost when game-states file is not backed up |
| J2 | Shared journal from in-game play never reaches campaign journal | Collaborative notes exist only in volatile game-state |
| J3 | AI `add_journal_entry` writes to combat log, not campaign journal | AI recaps go to the wrong destination |
| J4 | No UI to manually create campaign journal entries | Campaign journal is read-only (import-only) |
| J5 | JournalPanel sidebar uses local state, never persists | DM sidebar notes vanish on refresh |

### HIGH: Save System Coherence

| # | Issue | Impact |
|---|-------|--------|
| S1 | `buildSavableCampaign` excludes `sessionLog` | DMNotepad save doesn't preserve session notes in campaign |
| S2 | `buildSavableCampaign` excludes `sharedJournal` | Shared journal not in campaign save |
| S3 | Load order: `InGamePage` loads savedGameState, then auto-save file may overwrite | Stale data can overwrite newer data |

### MEDIUM: Missing Features

| # | Feature |
|---|---------|
| M1 | Campaign archive (no `archived` flag or UI) |
| M2 | End-of-session flow (recap prompt → save to journal) |
| M3 | Campaign-level loot tracking |
| M4 | Dedicated locations model (only `NPC.location` string) |
| M5 | `/session recap` is a placeholder |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Fix Campaign Journal Pipeline (J1-J5)

**Step 1 — Add Manual Journal Entry Creation UI (J4)**
- Open `src/renderer/src/pages/CampaignDetailPage.tsx`
- Find the journal display section (lines 277-324)
- Add a "New Entry" button that opens a creation form:
  ```tsx
  <JournalEntryForm
    onSave={(entry) => {
      const newEntry: JournalEntry = {
        id: generateUUID(),
        sessionNumber: campaign.journal.entries.length + 1,
        date: new Date().toISOString(),
        title: entry.title,
        content: entry.content,
        isPrivate: entry.isPrivate,
        authorId: currentUserId
      }
      const updatedCampaign = {
        ...campaign,
        journal: {
          ...campaign.journal,
          entries: [...campaign.journal.entries, newEntry]
        }
      }
      saveCampaign(updatedCampaign)
    }}
  />
  ```
- Support edit and delete for existing entries too
- Fix the placeholder text: change "Entries are created during and after game sessions" to "Add session recaps, notes, and story summaries."

**Step 2 — Include sessionLog in buildSavableCampaign (S1)**
- Open `src/renderer/src/services/io/game-state-saver.ts`
- Find `buildSavableCampaign()` function
- Add `sessionLog` to the saved state:
  ```typescript
  const savable = {
    ...campaign,
    savedGameState: {
      // ... existing fields
      sessionLog: gameStore.sessionLog,  // NEW
      sharedJournal: gameStore.sharedJournal,  // NEW (S2)
    }
  }
  ```
- This ensures DMNotepad notes and shared journal survive in the campaign JSON

**Step 3 — Add "Export to Journal" Flow from Session Log (J1)**
- Open `src/renderer/src/components/game/dm/DMNotepad.tsx`
- Add an "Export to Campaign Journal" button:
  ```typescript
  const handleExportToJournal = () => {
    const currentSession = sessionLog.filter(entry => entry.sessionLabel === currentSessionLabel)
    const journalEntry: JournalEntry = {
      id: generateUUID(),
      sessionNumber: getNextSessionNumber(),
      date: new Date().toISOString(),
      title: `Session ${currentSessionLabel}`,
      content: currentSession.map(e => `[${e.type}] ${e.text}`).join('\n'),
      isPrivate: false,
      authorId: 'dm'
    }
    // Append to campaign journal
    appendToCampaignJournal(journalEntry)
  }
  ```
- Create `appendToCampaignJournal()` utility that loads the campaign, appends the entry, and saves

**Step 4 — Fix Shared Journal → Campaign Journal (J2)**
- Open `src/renderer/src/components/game/modals/utility/SharedJournalModal.tsx`
- Add an "Archive to Campaign" button that copies the current shared journal to campaign.journal
- Alternatively, automatically archive shared journal entries at session end

**Step 5 — Fix AI add_journal_entry (J3)**
- Open `src/renderer/src/services/game-actions/effect-actions.ts`
- Find `executeAddJournalEntry()` at lines 335-341
- Change from writing to combat log (`addLogEntry`) to writing to campaign journal:
  ```typescript
  function executeAddJournalEntry(action: AddJournalEntryAction) {
    const campaign = useCampaignStore.getState().activeCampaign
    if (!campaign) return
    const entry: JournalEntry = {
      id: generateUUID(),
      sessionNumber: campaign.journal.entries.length + 1,
      date: new Date().toISOString(),
      title: action.title,
      content: action.content,
      isPrivate: false,
      authorId: 'ai-dm'
    }
    // Write to campaign journal
    appendToCampaignJournal(entry)
  }
  ```

**Step 6 — Fix JournalPanel Persistence (J5)**
- Open `src/renderer/src/components/game/sidebar/JournalPanel.tsx`
- The component uses local state and `void campaignId`
- Wire it to either:
  - The game store's `sharedJournal` (for in-game collaborative use), OR
  - The campaign's `journal.entries` (for persistent notes)
- Ensure changes are saved via the game store and auto-save system

### Sub-Phase B: Fix Save System Coherence (S3)

**Step 7 — Resolve Load Order Conflict**
- Open the `InGamePage` component (find it via imports)
- Open `src/renderer/src/hooks/use-game-effects.ts`
- Currently:
  1. `InGamePage` loads `campaign.savedGameState` into game store
  2. `use-game-effects` (DM) loads `game-states/{id}.json` and may overwrite
- Fix: Use timestamps to determine which is newer:
  ```typescript
  // In use-game-effects, when loading persisted game state (DM):
  const persisted = await loadPersistedGameState(campaignId)
  const savedGameState = campaign.savedGameState
  
  // Compare timestamps — use the newer one
  const persistedTime = persisted?.lastSaveTimestamp ?? 0
  const campaignTime = savedGameState?.lastSaveTimestamp ?? 0
  
  if (persistedTime > campaignTime) {
    applyGameState(persisted)
  }
  // else: keep the already-loaded campaign.savedGameState
  ```
- Add `lastSaveTimestamp: number` to both save payloads (`buildSavableCampaign` and `buildSavePayload`)

### Sub-Phase C: End-of-Session Flow (M2, M5)

**Step 8 — Create End-of-Session Modal**
- Create `EndOfSessionModal.tsx`:
  - Shows session duration, combats resolved, notes taken
  - "Save Session Recap" — compiles DMNotepad notes + shared journal into a campaign journal entry
  - "Generate AI Recap" — calls `generateEndOfSessionRecap()` and saves result to campaign journal
  - "Skip" — close without saving recap
- Trigger this modal when `/session end` is used or when the DM ends the game

**Step 9 — Wire /session Commands**
- Open `src/renderer/src/services/chat-commands/commands-dm-campaign.ts`
- Replace placeholder implementations:
  ```typescript
  case 'start':
    gameStore.startNewSession(sessionLabel)
    return { type: 'broadcast', content: `Session "${sessionLabel}" started.` }

  case 'end':
    // Open end-of-session modal
    gameStore.setEndSessionModalOpen(true)
    return { type: 'broadcast', content: 'Session ending. Saving recap...' }

  case 'recap':
    // Generate AI recap and save to campaign journal
    const recap = await generateEndOfSessionRecap()
    appendToCampaignJournal({
      id: generateUUID(),
      title: `Recap — ${currentSessionLabel}`,
      content: recap,
      // ...
    })
    return { type: 'broadcast', content: recap }
  ```

**Step 10 — Wire AI Recap to Campaign Journal**
- Open `src/main/ai/conversation-manager.ts`
- Find `generateEndOfSessionRecap()` (lines 156-173)
- Ensure its output can be routed to the campaign journal, not just conversation pruning
- Expose it via IPC so the renderer can call it from the end-of-session modal

### Sub-Phase D: Campaign Archive (M1)

**Step 11 — Add Archive Flag**
- Open `src/renderer/src/types/campaign.ts`
- Add `archived?: boolean` to the `Campaign` type

**Step 12 — Add Archive UI**
- In `CampaignDetailPage.tsx`, add an "Archive Campaign" button
- In `StartStep.tsx`, filter archived campaigns from the main list; add a "Show Archived" toggle
- Archive action: set `campaign.archived = true` and save
- Unarchive action: set `campaign.archived = false` and save

**Step 13 — Update Campaign Store**
- In `use-campaign-store.ts`, add:
  ```typescript
  archiveCampaign: (id: string) => {
    const campaign = get().campaigns.find(c => c.id === id)
    if (campaign) {
      saveCampaign({ ...campaign, archived: true })
    }
  }
  unarchiveCampaign: (id: string) => {
    const campaign = get().campaigns.find(c => c.id === id)
    if (campaign) {
      saveCampaign({ ...campaign, archived: false })
    }
  }
  ```
- Migration: existing campaigns default `archived: false`

### Sub-Phase E: Campaign Loot Tracking (M3)

**Step 14 — Add Campaign-Level Loot**
- Open `src/renderer/src/types/campaign.ts`
- Add `lootHistory?: LootEntry[]` to the `Campaign` type:
  ```typescript
  interface LootEntry {
    id: string
    sessionNumber: number
    timestamp: string
    items: Array<{ name: string; quantity: number; value?: number }>
    source: string  // "Dragon Hoard", "Goblin Camp", etc.
    distributedTo?: Record<string, string[]>  // characterId -> item names
  }
  ```
- When loot is awarded in-game (via `/loot` command or AI DM), log it to campaign loot history
- Add a "Loot History" section on CampaignDetailPage

### Sub-Phase F: Fix Campaign Export (Completeness)

**Step 15 — Include Game State in Campaign Export**
- Open `src/renderer/src/services/io/campaign-io.ts`
- In `exportCampaignToFile()`, also include the associated game state:
  ```typescript
  const gameState = await window.api.storage.loadGameState(campaign.id)
  const exportData = {
    campaign,
    gameState: gameState?.data ?? null,
    version: 2
  }
  ```
- In `importCampaignFromFile()`, restore the game state alongside the campaign

---

## ⚠️ Constraints & Edge Cases

### Journal Pipeline
- **`appendToCampaignJournal()` must be atomic** — load campaign, append entry, save campaign. Use a mutex/lock if multiple sources (AI, DMNotepad, shared journal) could write simultaneously.
- **Session numbering**: Auto-increment `sessionNumber` based on existing entries. If entries are deleted, numbers should NOT be reused (use max + 1).
- **JournalEntry.content** should support rich text (TipTap HTML) for JournalPanel entries, and plain text for auto-generated recaps. Include a `format: 'text' | 'html'` field.

### Save System
- **Timestamp-based conflict resolution** is the simplest approach. Both save systems must write `lastSaveTimestamp: Date.now()` so the loader can compare.
- **Never discard data silently** — if the older save has `sessionLog` entries that the newer save lacks, merge rather than overwrite. Consider a merge strategy for arrays.
- **Auto-save frequency**: The game-states auto-save runs frequently. Campaign JSON is saved less often. This naturally means game-states will usually be newer. The timestamp comparison should handle this correctly.

### Campaign Archive
- **Archived campaigns should NOT be deleted** — archive is a soft-hide, not a delete.
- **Archived campaigns should NOT appear in game join lists** — other players should not see archived campaigns in their "Joined Games" section.
- **Export of archived campaigns** should still work — allow export from the archived list.

### AI Recap
- **Token budget**: `generateEndOfSessionRecap()` may need the full conversation history to generate a good recap. If the conversation has been pruned, the recap quality may suffer. Include session log entries as additional context.
- **Recap length**: Cap at ~500 words. The AI may generate very long recaps — truncate or summarize further.

### Migration
- Adding `archived?: boolean`, `lootHistory?: LootEntry[]` to Campaign must use optional fields (`?`) to avoid breaking existing campaign saves. Default to `false` and `[]` respectively.

Begin implementation now. Start with Sub-Phase A (Steps 1-6) to fix the journal pipeline — this is the most impactful change, connecting 4 disconnected note systems into the campaign journal. Then Sub-Phase B (Step 7) to fix the save system load order.
