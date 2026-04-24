# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 15 of the D&D VTT project.

Phase 15 covers the **Player View** — what players see, interact with, and cannot access. The audit scored it 8/10: fog of war, vision, HUD (HP/conditions/spell slots/class resources), action economy display, 3D dice, chat, macros, and DM/player separation are all solid. The gaps are in **player agency** — no in-game inventory management, no measurement tools for players, no personal journals, no private messaging groups, initiative order potentially leaking enemy info, and limited character sheet integration during play.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 15 is entirely client-side. No Raspberry Pi involvement.

**Player UI Components (all verified working):**

| File | Role | Status |
|------|------|--------|
| `src/renderer/src/components/game/player/PlayerHUD.tsx` | HP, AC, initiative, speed, conditions | Working |
| `src/renderer/src/components/game/overlays/PlayerHUDOverlay.tsx` | HP management, spell slots, class resources, heroic inspiration, latency | Working |
| `src/renderer/src/components/game/player/ConditionTracker.tsx` | Condition icons with durations | Working |
| `src/renderer/src/components/game/player/SpellSlotTracker.tsx` | Spell slot pips (levels 1-9 + pact) | Working |
| `src/renderer/src/components/game/player/ActionBar.tsx` | Action economy: Attack, Dash, Disengage, Dodge, Help, Hide, Search, Study, Influence, Magic, Ready, Utilize | Working |
| `src/renderer/src/components/game/bottom/PlayerBottomBar.tsx` | Action buttons, tools dropdown, macro bar, chat | Working |
| `src/renderer/src/components/game/player/CharacterMiniSheet.tsx` | Ability scores, saves, skills, features | Working |
| `src/renderer/src/components/game/player/ShopView.tsx` | Shop interface with item visibility | Working |

**Vision/Fog (all verified working):**

| File | Role |
|------|------|
| `src/renderer/src/services/map/vision-computation.ts` | Party vision union, darkvision, light sources |
| `src/renderer/src/components/game/map/fog-overlay.ts` | Three-state animated fog |
| `src/renderer/src/stores/game/vision-slice.ts` | Explored cells, dynamic fog toggle |

**Initiative (potential leak):**

| File | Role |
|------|------|
| `src/renderer/src/components/game/InitiativeOverlay.tsx` (or similar) | Shows full initiative order to ALL players — may reveal hidden enemy positions |

### Raspberry Pi (`patrick@bmo`) — NO WORK THIS PHASE

---

## 📋 Core Objectives & Corrections

### HIGH PRIORITY: Player Agency Gaps

| # | Gap | Impact |
|---|-----|--------|
| A1 | No in-game inventory management — players can't use/equip items during play | Core gameplay missing |
| A2 | No measurement tools for players — only DM can measure distances | Players can't plan movement or spell ranges |
| A3 | Initiative order shows all combatants including hidden enemies | Information leak to players |

### MEDIUM PRIORITY: Player Experience Enhancements

| # | Gap | Impact |
|---|-----|--------|
| M1 | No personal player journal — only shared journal | Players can't take private notes |
| M2 | No player-to-player trading — DM-mediated only | Social friction |
| M3 | No spell preparation interface in-game | Must exit to character sheet |
| M4 | No in-game character editing | View-only sheet access |
| M5 | No private messaging groups (only DM whisper) | Limited party coordination |

### LOW PRIORITY: Polish

| # | Gap | Impact |
|---|-----|--------|
| L1 | No screen reader support for player HUD elements | Accessibility |
| L2 | No player-side session tracking (attendance, XP, milestones) | Progress visibility |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Player Inventory Panel (A1)

**Step 1 — Create In-Game Inventory Panel**
- Create `PlayerInventoryPanel.tsx` as a new player tool:
  ```tsx
  interface PlayerInventoryPanelProps {
    character: Character5e
    onUseItem: (itemId: string) => void
    onEquipItem: (itemId: string) => void
    onUnequipItem: (itemId: string) => void
    onDropItem: (itemId: string) => void
  }
  ```
- Display sections:
  - **Equipped**: Currently equipped weapons, armor, shield
  - **Consumables**: Potions, scrolls with "Use" buttons
  - **Inventory**: All carried items with weight tracking
  - **Currency**: PP, GP, EP, SP, CP totals
- "Use" button for consumables should:
  - Remove the item from inventory
  - Apply the effect (e.g., healing potion restores HP)
  - Broadcast to DM via network message

**Step 2 — Wire to PlayerBottomBar**
- Open `src/renderer/src/components/game/bottom/PlayerBottomBar.tsx`
- The "Use an Item" button already exists — wire it to open `PlayerInventoryPanel`
- Add the panel as a slide-up or modal overlay

**Step 3 — Sync Inventory Changes to Character Store**
- When a player uses/equips/drops an item, update the character via IPC:
  ```typescript
  window.api.saveCharacter({
    ...character,
    equipment: updatedEquipment
  })
  ```
- Broadcast the change to the host so the DM sees the updated state

### Sub-Phase B: Player Measurement Tool (A2)

**Step 4 — Enable Measurement Tool for Players**
- Open `src/renderer/src/components/game/GameLayout.tsx`
- Find where the measurement tool is made available
- The measurement tool (`measurement-tool.ts`) is already implemented and works for the DM
- Add a "Measure Distance" button to `PlayerBottomBar` that activates the measurement tool:
  ```tsx
  // In PlayerBottomBar tools dropdown, Combat & Movement section:
  { label: 'Measure Distance', action: () => setActiveTool('measure') }
  ```
- The tool should be read-only for players — they can measure but not modify the map
- Measurement results should be visible only to the measuring player (not broadcast)

**Step 5 — Add Line-of-Sight Check Tool**
- Create a simple LoS check: player clicks two points, the tool shows if there's a clear line of sight between them (using the existing `isMovementBlocked` from `raycast-visibility.ts`)
- Display result: "Clear line of sight" (green) or "Blocked by wall" (red) with the blocking wall highlighted
- Add as a button in PlayerBottomBar tools: "Check Line of Sight"

### Sub-Phase C: Fix Initiative Information Leak (A3)

**Step 6 — Filter Initiative Display for Players**
- Find the initiative overlay/tracker that shows to players (likely `InitiativeOverlay.tsx`)
- For non-host players, filter the initiative list:
  ```typescript
  const visibleEntries = isHost
    ? entries  // DM sees all
    : entries.filter(entry => {
        // Show: player tokens, visible NPC/enemy tokens
        if (entry.entityType === 'player') return true
        const token = activeMap?.tokens.find(t => t.entityId === entry.entityId)
        return token?.visibleToPlayers !== false
      })
  ```
- Hidden enemies (`visibleToPlayers: false`) should NOT appear in the player's initiative list
- The current turn indicator should still work — if it's a hidden enemy's turn, show "???" or "Unknown" to players

**Step 7 — Add DM Setting for Initiative Visibility**
- Add a campaign setting: `initiativeVisibility: 'all' | 'visible-only' | 'players-only'`
  - `'all'`: Everyone sees full initiative order (current behavior)
  - `'visible-only'`: Players only see visible tokens in initiative (default)
  - `'players-only'`: Players only see player characters in initiative
- Add toggle in campaign settings or DM toolbar

### Sub-Phase D: Personal Player Journal (M1)

**Step 8 — Create Player Notes Panel**
- Create `PlayerNotesPanel.tsx`:
  ```tsx
  interface PlayerNote {
    id: string
    title: string
    content: string
    createdAt: string
    updatedAt: string
    tags?: string[]
  }
  ```
- Features:
  - Create/edit/delete personal notes
  - Tag notes (e.g., "quest", "npc", "location", "loot")
  - Search notes by title/content/tag
  - Notes are private — NOT synced via network, NOT visible to DM
- Storage: localStorage per character: `player-notes-{characterId}`

**Step 9 — Wire to PlayerBottomBar**
- Add "My Notes" to the PlayerBottomBar tools dropdown under "Social"
- Open as a slide-up panel or modal

### Sub-Phase E: Player-to-Player Trading (M2)

**Step 10 — Create Trade Request System**
- Create a trade flow:
  1. Player A initiates trade with Player B via context menu on B's token
  2. Network message `player:trade-request` sent to Player B
  3. Player B receives trade modal showing A's offer
  4. Both players can add/remove items from their side
  5. "Accept" / "Decline" buttons
  6. On accept, items transfer between character inventories
  7. Transaction logged in chat

**Step 11 — Create Trade Modal UI**
- Create `TradeModal.tsx`:
  - Split view: "Your Items" (left) | "Their Items" (right)
  - Drag items from inventory to trade area
  - Currency input for gold trades
  - "Confirm" requires both players
  - "Cancel" returns all items

### Sub-Phase F: Spell Preparation In-Game (M3)

**Step 12 — Add Spell Preparation Panel**
- For prepared caster classes (Cleric, Druid, Paladin, Wizard), add an in-game spell preparation panel:
  ```tsx
  // Shows available spells and lets player swap preparations
  interface SpellPrepPanel {
    knownSpells: SpellEntry[]
    preparedSpells: SpellEntry[]
    maxPrepared: number  // WIS mod + class level (or INT for Wizard)
    onPrepare: (spellId: string) => void
    onUnprepare: (spellId: string) => void
  }
  ```
- Gate this to only work during long rest or outside combat (per 2024 PHB rules)
- Wire to a button in PlayerHUDOverlay near the spell slot tracker

### Sub-Phase G: Initiative Accessibility

**Step 13 — Add Turn Notification for Players**
- When it becomes a player's turn, show a prominent notification banner:
  ```tsx
  <TurnNotificationBanner playerName={activeEntry.label} />
  ```
- Check if `TurnNotificationBanner` (mentioned in Phase 11 audit) already exists — if so, verify it works for player clients
- Add sound cue: play a notification sound when it's the player's turn
- Add `aria-live="assertive"` announcement: "It's your turn!"

**Step 14 — Keyboard Shortcut for Common Player Actions**
- Add player-specific keyboard shortcuts:
  ```
  Space: End Turn (when it's your turn)
  R: Roll d20
  I: Open Inventory
  N: Open Notes
  M: Toggle Measurement Tool
  Shift+Click: Check Line of Sight
  ```
- Register in the keybindings system (customizable via Settings)
- Only active when it's the player's turn (for action shortcuts)

### Sub-Phase H: HUD Accessibility (L1)

**Step 15 — Add ARIA Labels to Player HUD**
- Open `src/renderer/src/components/game/player/PlayerHUD.tsx`
- Add `aria-label` to all interactive and informational elements:
  ```tsx
  <div aria-label={`Hit Points: ${currentHP} of ${maxHP}`}>
  <div aria-label={`Armor Class: ${ac}`}>
  <div aria-label={`Speed: ${speed} feet`}>
  ```
- Open `src/renderer/src/components/game/player/SpellSlotTracker.tsx`
- Add `aria-label` to spell slot pips:
  ```tsx
  <button aria-label={`Level ${level} spell slot ${index + 1}: ${used ? 'used' : 'available'}`}>
  ```
- Open `src/renderer/src/components/game/player/ConditionTracker.tsx`
- Add `aria-label` to condition icons:
  ```tsx
  <span aria-label={`Condition: ${condition.name}, ${condition.duration} rounds remaining`}>
  ```

---

## ⚠️ Constraints & Edge Cases

### Inventory Management
- **Network sync**: When a player uses an item (e.g., potion), the HP change must be broadcast to the host. The item removal must also sync to the character store.
- **Concurrent edits**: If the DM modifies a player's inventory (via loot award) at the same time the player uses an item, there's a race condition. Use the character version system from Phase 7 to detect conflicts.
- **Consumable effects**: Healing potions are straightforward (roll dice, add HP). Other consumables (scrolls, spell items) may trigger complex effects. Start with simple items (potions, rations) and expand.

### Measurement Tool
- **Player measurement should NOT broadcast**: Unlike DM measurement which may be shown to players, player measurement is personal. Do not sync via network.
- **Performance**: The measurement tool draws a line on the PixiJS canvas. Ensure the player's measurement line is only visible to that player (don't add to the shared measurement layer).

### Initiative Filtering
- **Turn order must remain accurate**: Even if enemies are hidden from the initiative display, the turn order must still advance correctly. The "???" placeholder should indicate "something's turn" without revealing identity.
- **Surprise**: In surprise rounds, some creatures can't take actions. The initiative display should reflect this for players who can see the surprised creature.
- **Lair actions**: Lair actions at initiative 20 should always be visible (they're environmental, not a creature).

### Trading
- **Both players must be online**: P2P trading requires both players connected. If one disconnects mid-trade, cancel the trade and return items.
- **DM override**: The DM should be able to see/approve/cancel trades (optional setting).
- **Weight/encumbrance**: After trading, check if either player exceeds carrying capacity.

### Spell Preparation
- **Timing restriction**: Spell preparation requires a long rest (or special class features). The panel should be grayed out during combat and only active after a long rest event.
- **Spell count validation**: Max prepared = ability modifier + class level. Enforce this in the panel.
- **Known spells vs prepared spells**: Wizards prepare from their spellbook. Clerics/Druids prepare from the full class list. The panel must know which type of caster the player is.

Begin implementation now. Start with Sub-Phase A (Steps 1-3) for the player inventory panel — this is the most impactful player agency improvement. Then Sub-Phase B (Steps 4-5) for measurement tools and Sub-Phase C (Steps 6-7) for the initiative leak fix. These three sub-phases address all high-priority gaps.
