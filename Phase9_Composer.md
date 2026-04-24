# Phase 9: Campaigns — Research & Analysis

**Research Date:** March 9, 2025  
**Analyst:** Composer 1.5  
**Scope:** Full project analysis of campaign creation, management, persistence, session notes, sharing, and gaps.

---

## Executive Summary

The campaign system is **substantially implemented** with a full creation wizard, edit/delete flows, persistence of core state, and export/import. **Gaps exist** in session notes/journal integration, archive support, and automatic recap generation. Several data flows (shared journal vs. campaign journal, session log vs. saved state) are fragmented or not fully wired.

---

## 1. Campaign Creation Flow

**Status: ✅ Implemented**

### Entry Points
- **Main Menu** → "My Campaigns" → `/make` (MakeGamePage)
- **Library** → "campaigns" category → "Create" → `/create-campaign` (route not present; Library uses `/create-campaign` for `NAV_ROUTES.campaigns`)
- **Campaign Wizard** StartStep → "Create New" button

### Campaign Wizard Steps
`CampaignWizard.tsx` (lines 27–38) defines a 10-step wizard:

| Step | Component | Purpose |
|------|------------|---------|
| 0 | SystemStep | Select game system (e.g., D&D 5e) |
| 1 | DetailsStep | Name, description, max players, turn mode, lobby message |
| 2 | AiProviderSetup | Optional AI DM (Ollama, Claude, OpenAI, Gemini) |
| 3 | AdventureSelector | Preset or custom; select adventure with exclusion filters |
| 4 | SessionZeroStep | Content limits, tone, PvP, death expectations, schedule |
| 5 | RulesStep | Custom rules |
| 6 | CalendarStep | Calendar config (Gregorian, Harptos, etc.) |
| 7 | MapConfigStep | Maps from adventure + user selection |
| 8 | AudioStep | Custom audio tracks |
| 9 | ReviewStep | Review and create |

### Creation Logic
- `createCampaign()` in `use-campaign-store.ts` (lines 112–127)
- Generates UUID `id`, `inviteCode`, `players: []`, `journal: { entries: [] }`
- Persists via `saveCampaign()` → IPC `storage:save-campaign` → `campaign-storage.ts`
- Campaign files: `{userData}/campaigns/{id}.json`

### StartStep Campaign Browser
`StartStep.tsx` provides:
- Quick Resume (last hosted or last joined)
- Create New → wizard
- Your Campaigns (expandable list: Open, Export, Delete)
- Joined Games (rejoin recent sessions)

---

## 2. DM Create, Edit, Delete, Archive

### Create
- ✅ Full wizard flow as above

### Edit
- ✅ **OverviewCard** (`campaign-detail/OverviewCard.tsx`): name, description, max players, turn mode, level range, lobby message, Discord URL
- ✅ **MapManager**: add/remove maps
- ✅ **NPCManager**: add/edit/delete NPCs
- ✅ **RuleManager**: custom rules
- ✅ **LoreManager**: lore entries
- ✅ **SessionZeroCard**: session zero config
- ✅ **AdventureManager**: adventure entries
- ✅ **CalendarCard**: calendar
- ✅ **AudioManager**: custom audio
- ✅ **TimelineCard**: milestones
- ✅ **AiDmCard**: AI DM config

All use `saveCampaign(campaign)` from the campaign store.

### Delete
- ✅ `deleteCampaign(id)` in `use-campaign-store.ts` (lines 71–82)
- ✅ IPC `storage:delete-campaign`
- ✅ `campaign-storage.ts` `deleteCampaign()` (lines 93–121):
  - Removes `campaigns/{id}.json`
  - Cascades: `campaigns/{id}/`, `game-states/{id}.json`, `ai-conversations/{id}.json`, `bans/{id}.json`
- ✅ UI: CampaignDetailPage Delete button + ConfirmDialog
- ✅ StartStep: per-campaign Delete, "Delete All" for all campaigns

### Archive
- ❌ **Not implemented**
- No `archived` flag, `archiveCampaign`, or archive UI
- Grep for "archive" only finds bastion facility type and plugin installer

---

## 3. Campaign State Persistence

### Storage Paths
- **Campaign JSON**: `{userData}/campaigns/{id}.json`
- **Game State**: `{userData}/game-states/{id}.json`
- **AI Conversations**: `{userData}/ai-conversations/{id}.json`
- **Custom audio**: `{userData}/campaigns/{id}/`
- **Bans**: `{userData}/bans/{id}.json`

### Persisted in Campaign JSON
From `campaign.ts` and `campaign-storage.ts`:

| Data | Persisted | Notes |
|------|-----------|-------|
| Maps | ✅ | In campaign.maps; synced from game store on save |
| NPCs | ✅ | campaign.npcs |
| Lore | ✅ | campaign.lore |
| Locations | ⚠️ | NPC `location` string; no dedicated locations model |
| Loot | ❌ | No campaign-level loot tracking; loot-award is in-game only |
| Session history | ⚠️ | See Section 4 |
| Notes | ⚠️ | Session log in game-states; not in campaign JSON |
| Encounters | ✅ | campaign.encounters |
| Adventures | ✅ | campaign.adventures |
| Journal | ✅ | campaign.journal.entries (structure exists, rarely populated) |
| Players | ✅ | campaign.players |
| Calendar | ✅ | campaign.calendar |
| savedGameState | ✅ | initiative, round, conditions, handouts, etc. |
| downtimeProgress | ✅ | Downtime tracking |
| metrics | ✅ | sessionsPlayed, totalPlaytimeSeconds, etc. |
| milestones | ✅ | TimelineMilestone[] |

### SavedGameState vs. Game State File
Two separate persistence mechanisms:

1. **Campaign `savedGameState`** (in campaign JSON)
   - Built by `game-state-saver.ts` `buildSavableCampaign()`
   - Includes: initiative, round, conditions, turnStates, handouts, inGameTime, restTracking, etc.
   - Does **not** include: sessionLog, sharedJournal, shop state
   - Written when `saveGameState(campaign)` is called (e.g., DMNotepad, use-game-handlers)

2. **Game state file** (`game-states/{id}.json`)
   - Built by `game-auto-save.ts` `buildSavePayload()`
   - Includes: maps, initiative, sessionLog, handouts, shopInventory, etc.
   - Auto-saved when DM is in game (use-game-effects, lines 75–78)
   - Loaded via `loadPersistedGameState()` for DM only

### Load Order
- **InGamePage** loads `campaign.savedGameState` into game store when campaign changes
- **use-game-effects** (DM only) loads from game-states file and starts auto-save
- Order of effects can cause one source to overwrite the other

---

## 4. Session Notes / Recap System

### Implemented Parts

**DM Session Notes (DMNotepad)**
- `sessionLog` in game store (`time-slice.ts` lines 79–117)
- `addLogEntry`, `updateLogEntry`, `deleteLogEntry`, `startNewSession`
- Grouped by session, supports in-game timestamps
- Persisted in **game-states file** (via game-auto-save), **not** in campaign JSON
- DMNotepad calls `saveGameState(campaign)` which uses `buildSavableCampaign` — but that **does not** include sessionLog, so DMNotepad saves only core combat/exploration state, not session notes to campaign

**Shared Journal (in-game)**
- `SharedJournalModal`, `sharedJournal` in game store
- Synced via network: `player:journal-add`, `player:journal-update`, `player:journal-delete`, `dm:journal-sync`
- Persisted in game-states file during play
- **Not** written to `campaign.journal.entries`

**Campaign Session Journal**
- `campaign.journal.entries` — type `JournalEntry` (sessionNumber, date, title, content, isPrivate, authorId)
- Shown on CampaignDetailPage (lines 277–324)
- Import/Export via entity-io (dndjournal)
- **No automatic creation** — no code path adds entries during or after sessions
- Placeholder text says "Entries are created during and after game sessions" — **incorrect**

**AI DM `add_journal_entry`**
- `dm-system-prompt.ts`: AI can use `add_journal_entry` for recaps
- `effect-actions.ts` `executeAddJournalEntry()` (lines 335–341): writes to **combat log** via `addLogEntry`, **not** to campaign journal

**Session commands** (`commands-dm-campaign.ts` lines 114–147)
- `/session start`, `/session end`, `/session recap`
- Only broadcast messages; `/session recap` is a placeholder: "(DM, describe what happened last session here via /announce)"

**AI recap**
- `conversation-manager.ts` (lines 156–173): `generateEndOfSessionRecap()` uses summarize callback
- Used for AI conversation summarization, not for writing to campaign journal

### Summary: Session Notes / Recap
- ✅ DM can take session notes in DMNotepad (persisted in game-states)
- ✅ Shared journal for in-session collaborative notes
- ❌ No automatic copy of shared journal or session log → campaign.journal
- ❌ AI `add_journal_entry` goes to combat log, not campaign journal
- ❌ No UI to manually add campaign journal entries
- ❌ `/session recap` is placeholder only
- ❌ No end-of-session flow that writes a recap to campaign journal

---

## 5. Sharing & Export

### Export
- ✅ `exportCampaignToFile()` in `campaign-io.ts`
- ✅ CampaignDetailPage "Export" button
- ✅ StartStep per-campaign "Export"
- Format: `.dndcamp` JSON
- Includes: full campaign object (maps, NPCs, lore, journal, players, etc.)

### Import
- ✅ `importCampaignFromFile()` in `campaign-io.ts`
- ✅ MakeGamePage "Import .dndcamp" button
- Validates required fields, regenerates timestamps, saves via `saveCampaign`

### Sharing
- ⚠️ **Indirect only**: invite code for P2P join
- No export to cloud, link sharing, or collaborative editing
- `CLOUD_SYNC_*` IPC channels exist for backup/sync (Pi/Google Drive) but are not general sharing

---

## 6. Missing, Broken, or Partial

### Missing
| Feature | Notes |
|---------|-------|
| Archive campaigns | No flag or UI |
| Add campaign journal entries manually | Only import; no create form |
| Session log → campaign journal | sessionLog never written to campaign.journal |
| Shared journal → campaign journal | sharedJournal not persisted to campaign |
| AI add_journal_entry → campaign journal | Goes to combat log only |
| End-of-session recap flow | No "save recap to journal" step |
| Campaign-level loot tracking | Loot is in-session only |
| Dedicated locations model | Only NPC.location string |

### Broken / Inconsistent
| Issue | Location |
|-------|----------|
| Campaign Session Journal copy | CampaignDetailPage says entries "are created during and after game sessions" — false |
| JournalPanel persistence | `JournalPanel.tsx` uses local state, `void campaignId`; never saves to campaign |
| Two save systems | campaign.savedGameState vs. game-states file; sessionLog only in game-states |
| Load order | InGamePage vs. loadPersistedGameState can overwrite each other |

### Partial
| Feature | Status |
|---------|--------|
| Session recap | AI can generate, but no pipeline to campaign journal |
| Session commands | /session exists but recap is placeholder |
| Game state save | DMNotepad triggers save but sessionLog not in buildSavableCampaign |

---

## 7. File Reference

| File | Purpose |
|------|---------|
| `src/renderer/src/types/campaign.ts` | Campaign, JournalEntry, SavedGameState types |
| `src/renderer/src/stores/use-campaign-store.ts` | Campaign CRUD, loadCampaigns, createCampaign |
| `src/main/storage/campaign-storage.ts` | save/load/delete campaigns on disk |
| `src/renderer/src/components/campaign/CampaignWizard.tsx` | Creation wizard |
| `src/renderer/src/components/campaign/StartStep.tsx` | Campaign browser, Create New, Your Campaigns |
| `src/renderer/src/pages/CampaignDetailPage.tsx` | Campaign detail, Export, Delete, Journal display |
| `src/renderer/src/pages/MakeGamePage.tsx` | Make/Import campaigns entry |
| `src/renderer/src/services/io/campaign-io.ts` | exportCampaign, importCampaign, *ToFile |
| `src/renderer/src/services/io/game-state-saver.ts` | buildSavableCampaign, saveGameState |
| `src/renderer/src/services/io/game-auto-save.ts` | Auto-save to game-states file |
| `src/renderer/src/components/game/dm/DMNotepad.tsx` | Session notes UI |
| `src/renderer/src/components/game/modals/utility/SharedJournalModal.tsx` | In-game shared journal |
| `src/renderer/src/components/game/sidebar/JournalPanel.tsx` | DM sidebar journal (not persisted to campaign) |
| `src/renderer/src/services/game-actions/effect-actions.ts` | executeAddJournalEntry → addLogEntry |
| `src/renderer/src/services/chat-commands/commands-dm-campaign.ts` | /journal, /session, /snapshot |
| `src/main/ai/conversation-manager.ts` | generateEndOfSessionRecap |
| `src/shared/ipc-channels.ts` | SAVE_CAMPAIGN, LOAD_CAMPAIGN, etc. |

---

## 8. Recommendations

1. **Campaign journal**
   - Add UI to create/edit/delete `JournalEntry` on CampaignDetailPage
   - Or implement a flow: session end → "Save recap to journal?" → append to campaign.journal

2. **Session log → campaign**
   - Include `sessionLog` in `buildSavableCampaign` so it is saved into campaign JSON
   - Or add "Export session notes to journal" on campaign detail or session end

3. **AI add_journal_entry**
   - Either write to campaign journal (requires campaign context in executor) or clearly document that it goes to combat log

4. **Archive campaigns**
   - Add `archived?: boolean` to Campaign
   - Filter archived campaigns in lists; add Archive/Unarchive actions

5. **Single source of truth**
   - Decide: campaign JSON vs. game-states file for in-session state
   - Align load order and avoid overwriting newer data with older

6. **Update copy**
   - Change CampaignDetailPage journal text from "Entries are created during and after game sessions" to reflect import-only or planned behavior
