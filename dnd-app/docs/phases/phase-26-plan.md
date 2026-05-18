# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 26 of the D&D VTT project.

Phase 26 covers the **Encounter Builder & Combat Tracker**. The builder correctly implements 2024 DMG XP budgets and has a functional search/add/count UI. The critical issues are: **GroupRollModal uses hardcoded mock data** (fake players, fake rolls), **"Place All & Start Initiative" doesn't actually place tokens**, **AI deployment stacks monsters in a tight grid ignoring walls**, **no wave support**, and **no encounter-to-map linkage**.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

**Key Files:**

| File | Role | Issues |
|------|------|--------|
| `src/renderer/src/components/game/modals/dm-tools/EncounterBuilderModal.tsx` | Encounter builder UI — search, add, count, XP budgets, presets | "Place All & Start Initiative" only broadcasts chat; no map linkage UI |
| `src/renderer/src/components/game/modals/combat/GroupRollModal.tsx` | Group saving throw rolls | **Hardcoded mock players** (line 71): `['Theron', 'Lyra', 'Grimjaw', 'Senna']` with fake random rolls |
| `src/renderer/src/services/game-actions/creature-actions.ts` | `executeLoadEncounter` — AI encounter deployment | Places all tokens in tight grid at map center, ignores walls/players |
| `src/renderer/src/components/game/dm/InitiativeSetupForm.tsx` | Initiative setup — supports group initiative | `groupInitiativeEnabled` for identical monsters (line 157) — functional |
| `src/renderer/src/types/encounter.ts` | `Encounter` type with `mapId` field | `mapId` defined but no UI to set it |

### Raspberry Pi (`patrick@bmo`) — NO WORK THIS PHASE

---

## 📋 Core Objectives

### CRITICAL

| # | Issue | Impact |
|---|-------|--------|
| E1 | GroupRollModal uses hardcoded mock players/rolls — not wired to network | Group saves are fake; DM sees fictional results |
| E2 | "Place All & Start Initiative" doesn't place tokens | Core builder feature is a no-op |

### HIGH

| # | Issue | Impact |
|---|-------|--------|
| E3 | AI encounter deployment places monsters in tight grid at map center | DMs must manually reposition every monster |
| E4 | No wave support for multi-stage encounters | Boss fights with reinforcements require separate presets |
| E5 | No encounter-to-map linkage in UI | Can't pre-assign monster positions |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Fix GroupRollModal (E1)

**Step 1 — Wire GroupRollModal to Real Players**
- Open `src/renderer/src/components/game/modals/combat/GroupRollModal.tsx`
- Remove hardcoded `['Theron', 'Lyra', 'Grimjaw', 'Senna']` at line 71
- Pull actual connected players from the lobby/network store:
  ```typescript
  const players = useLobbyStore(s => s.players)
  const connectedPlayers = players.filter(p => p.status === 'connected')
  ```
- Display real player names with their characters

**Step 2 — Implement Networked Group Roll**
- When the DM initiates a group roll:
  1. Send `dm:group-roll-request` to all target players with `{ ability, dc, rollType: 'save' }`
  2. Each player's client shows a roll prompt (reuse `RollRequestOverlay` from Phase 1 B3)
  3. Player rolls (or auto-rolls if setting enabled) and sends `player:group-roll-result` back
  4. DM's GroupRollModal collects results as they arrive, updating the UI in real-time
  5. After all results received (or timeout), show pass/fail summary
- Timeout: 30 seconds; after timeout, unresponsive players are marked "No Response"
- Auto-roll option: DM can toggle "Auto-roll for NPCs/monsters" for non-player targets

**Step 3 — Add Monster Group Rolls**
- The DM should be able to include enemy tokens in group rolls (e.g., AoE effects)
- For monsters, roll automatically using their save modifier from the stat block:
  ```typescript
  for (const monster of selectedMonsters) {
    const saveMod = getMonsterSaveMod(monster, ability)
    const roll = rollD20()
    const total = roll + saveMod
    results.push({ name: monster.label, roll, modifier: saveMod, total, passed: total >= dc })
  }
  ```
- This fixes the Phase 17 LOG-4 issue (area saves ignoring modifiers) for the group roll flow

### Sub-Phase B: Fix Token Placement (E2)

**Step 4 — Wire "Place All & Start Initiative" to Actually Place Tokens**
- Open `src/renderer/src/components/game/modals/dm-tools/EncounterBuilderModal.tsx`
- Find the "Place All & Start Initiative" button handler
- Instead of just broadcasting chat, actually create tokens:
  ```typescript
  const handlePlaceAndStart = () => {
    const activeMap = useGameStore.getState().activeMap
    if (!activeMap) return

    const tokens: Partial<MapToken>[] = []
    for (const entry of encounterMonsters) {
      for (let i = 0; i < entry.count; i++) {
        tokens.push({
          label: `${entry.name}${entry.count > 1 ? ` ${i + 1}` : ''}`,
          entityType: 'enemy',
          currentHP: entry.hp,
          maxHP: entry.hp,
          ac: entry.ac,
          walkSpeed: entry.speed,
          monsterStatBlockId: entry.id,
          visibleToPlayers: false, // Hidden by default — DM reveals when ready
        })
      }
    }

    // Place tokens using smart placement (Step 5)
    smartPlaceTokens(activeMap, tokens)

    // Start initiative
    const initiativeEntries = tokens.map(t => ({
      entityName: t.label,
      entityType: 'enemy',
      initiative: rollD20() + (t.initiativeModifier ?? 0),
    }))
    gameStore.startInitiative(initiativeEntries)

    onClose()
  }
  ```

**Step 5 — Smart Token Placement Algorithm**
- Instead of placing all tokens at the map center in a tight grid:
  ```typescript
  function smartPlaceTokens(map: GameMap, tokens: Partial<MapToken>[]): void {
    const cellSize = map.grid.cellSize
    const mapCols = Math.floor(map.width / cellSize)
    const mapRows = Math.floor(map.height / cellSize)

    // Find empty cells not occupied by existing tokens or walls
    const occupied = new Set(map.tokens.map(t => `${t.gridX},${t.gridY}`))
    const blocked = new Set<string>() // cells with walls

    // Build blocked set from walls
    for (const wall of map.walls ?? []) {
      // Mark cells adjacent to walls as potentially blocked
    }

    // Find the map edge farthest from players for enemy placement
    const playerTokens = map.tokens.filter(t => t.entityType === 'player')
    const playerCenter = getAveragePosition(playerTokens)

    // Place tokens in a spread formation away from players
    let placed = 0
    const startX = playerCenter ? (playerCenter.x > mapCols / 2 ? 2 : mapCols - 5) : Math.floor(mapCols / 2)
    const startY = playerCenter ? (playerCenter.y > mapRows / 2 ? 2 : mapRows - 5) : Math.floor(mapRows / 2)

    for (const token of tokens) {
      // Spiral outward from start position to find empty cell
      const pos = findEmptyCell(startX, startY, occupied, blocked, mapCols, mapRows, placed)
      if (pos) {
        gameStore.addToken(map.id, { ...token, gridX: pos.x, gridY: pos.y })
        occupied.add(`${pos.x},${pos.y}`)
        placed++
      }
    }
  }
  ```
- Place enemies on the opposite side of the map from players
- Spread tokens in a loose formation (not tight grid)
- Respect walls — don't place tokens inside walls

### Sub-Phase C: Wave Support (E4)

**Step 6 — Add Wave Data Model**
- Open `src/renderer/src/types/encounter.ts`
- Add wave support to the `Encounter` type:
  ```typescript
  export interface EncounterWave {
    id: string
    name: string  // "Wave 1", "Reinforcements", "Boss Phase 2"
    monsters: EncounterMonster[]
    triggerCondition?: string  // "round 3", "when boss below 50% HP", manual
  }

  export interface Encounter {
    id: string
    name: string
    mapId?: string
    waves: EncounterWave[]  // replaces flat monsters array
    // ... existing fields
  }
  ```
- Migrate existing encounters: if `monsters` exists without `waves`, wrap in a single wave

**Step 7 — Add Wave UI to Encounter Builder**
- In `EncounterBuilderModal.tsx`, add wave tabs:
  ```tsx
  <div className="flex gap-2 mb-4">
    {waves.map((wave, i) => (
      <button key={wave.id} onClick={() => setActiveWave(i)}
        className={activeWave === i ? 'border-b-2 border-amber-400' : ''}>
        {wave.name}
      </button>
    ))}
    <button onClick={addWave}>+ Add Wave</button>
  </div>
  ```
- Each wave has its own monster list and XP budget display
- Total encounter XP is sum of all waves
- DM can name waves and set trigger conditions (free text)

**Step 8 — Wave Deployment During Combat**
- Add a "Deploy Wave" button in the initiative tracker or DM toolbar:
  ```typescript
  const handleDeployWave = (waveIndex: number) => {
    const wave = encounter.waves[waveIndex]
    // Place wave monsters using smartPlaceTokens
    smartPlaceTokens(activeMap, wave.monsters.flatMap(m => createTokensFromMonster(m)))
    // Add to initiative
    // Broadcast: "Reinforcements arrive!"
  }
  ```
- Show deployed/pending status for each wave

### Sub-Phase D: Encounter-Map Linkage (E5)

**Step 9 — Add Map Selection to Encounter Builder**
- In `EncounterBuilderModal.tsx`, add a map dropdown:
  ```tsx
  <select value={encounter.mapId} onChange={e => setMapId(e.target.value)}>
    <option value="">No Map</option>
    {maps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
  </select>
  ```
- When a map is linked, show a mini-preview of the map

**Step 10 — Pre-Position Monsters on Map**
- When a map is linked, allow DMs to pre-assign monster starting positions:
  - Show the linked map in a small canvas view within the encounter builder
  - Click on the map to set a monster's starting position
  - Store positions in the encounter data: `monster.startX`, `monster.startY`
- When "Place All" is clicked with pre-positions, use those positions instead of smart placement

### Sub-Phase E: Improve AI Encounter Deployment (E3)

**Step 11 — Improve executeLoadEncounter Placement**
- Open `src/renderer/src/services/game-actions/creature-actions.ts`
- Find `executeLoadEncounter`
- Replace the tight center-grid placement with `smartPlaceTokens()` from Step 5
- If the encounter has pre-positioned monsters (from Step 10), use those positions
- If no pre-positions, use the smart placement algorithm

---

## ⚠️ Constraints & Edge Cases

### GroupRollModal
- **Network timeout**: Players may be slow to respond. Show results as they arrive with a progress indicator: "3/5 players responded."
- **Disconnected players**: If a player disconnects during a group roll, auto-fail (or allow DM to override).
- **Monster auto-rolls should use correct modifiers**: Pull save modifiers from the monster's stat block. If no stat block is linked, fall back to +0 with a warning.

### Token Placement
- **Large tokens**: Large (2x2), Huge (3x3), and Gargantuan (4x4) tokens need multiple cells. The `findEmptyCell` function must check all cells the token would occupy.
- **Hidden by default**: Placed enemy tokens should start with `visibleToPlayers: false` so players don't see them before the DM reveals. The DM can toggle visibility.
- **Initiative order**: When starting initiative from the encounter builder, include player tokens already on the map. Use `InitiativeSetupForm` logic for rolling initiative with group initiative support.

### Waves
- **Backward compatibility**: Existing encounter presets (saved to localStorage) use a flat `monsters` array. Migration: wrap in `waves: [{ id: 'wave-1', name: 'Wave 1', monsters: existingMonsters }]`.
- **XP budget per wave**: Show per-wave XP and total XP. The difficulty rating should use total XP across all waves.
- **Wave trigger conditions are free text**: No automation — the DM manually deploys waves. Trigger text is for the DM's reference only.

### Pre-Positioning
- **This is a nice-to-have**: If implementing the full mini-map pre-positioning canvas is too complex, start with simple grid coordinate inputs (X, Y per monster). The visual map placement can come later.
- **Pre-positions are stored in the encounter, not the map**: Monsters aren't placed until the DM deploys them.

Begin implementation now. Start with Sub-Phase A (Steps 1-3) to fix GroupRollModal — this is a broken feature that shows fake data. Then Sub-Phase B (Steps 4-5) to wire "Place All & Start Initiative" to actually work. These two fixes transform the encounter builder from partially broken to fully functional.
