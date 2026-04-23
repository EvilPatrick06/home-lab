# Phase 26: Encounter Builder & Combat Tracker Research
**Agent:** Gemini 3.1 Pro
**Date:** March 9, 2026

## 1. Dedicated DM Interface for Encounter Building
**Finding:** Yes, there is a dedicated interface.
- **Component:** `src/renderer/src/components/game/modals/dm-tools/EncounterBuilderModal.tsx`
- **Access:** The DM can access this via the `DMToolsTabContent` component in the DM bottom bar by clicking the "Encounter Builder" button.
- **Features:** It provides a search bar to find monsters from the 5e data, add them to a list, adjust their counts, set the party size and average level, and save the encounter as a preset to `localStorage`.

## 2. Encounter Difficulty & XP Budgets (DMG 2024)
**Finding:** Yes, the system correctly implements the 2024 DMG XP budgets.
- **Logic Location:** `EncounterBuilderModal.tsx` lines 70-91 and 185-204.
- **Implementation:** It uses a `DEFAULT_BUDGETS` array that perfectly matches the 2024 DMG "XP Budget per Character" table (e.g., Level 1: 50 Low / 75 Moderate / 100 High; Level 20: 6400 Low / 13200 Moderate / 22000 High).
- **Calculation:** It multiplies the per-character budget by the `partySize` state to get the total budget thresholds. It then sums the XP of all selected monsters and compares it against these thresholds.
- **UI Feedback:** It displays a dynamic, color-coded XP Budget Bar (Green for Low, Amber for Moderate, Red for High) and labels the encounter difficulty as "Low", "Moderate", "High", or "Over Budget".

## 3. Grouping, Waves, and Deployment
**Finding:** Grouping and deployment are partially supported, but waves are missing.
- **Grouping:** Monsters of the same type are automatically grouped in the builder UI with a `count` property (`updateCount` function).
- **Waves:** There is **no native support for waves**. DMs cannot assign monsters to "Wave 1", "Wave 2", etc., within a single encounter. They would have to create and save separate encounter presets for each wave.
- **Deployment:** 
  - The AI DM action `executeLoadEncounter` (`src/renderer/src/services/game-actions/creature-actions.ts`) can load an encounter preset and automatically spawn the tokens. However, it places them in a basic grid pattern starting at the exact center of the map (`centerX + col * dims.x`), which is rudimentary and ignores walls or player positions.
  - In the `EncounterBuilderModal.tsx` itself, the "Place All & Start Initiative" button currently only broadcasts a chat message (`Encounter started! Monsters: ...`) and closes the modal. It does not appear to actually instantiate the tokens on the map directly from the UI button.

## 4. Bulk Initiative & Bulk Saving Throws
**Finding:** Both are supported, though with some caveats.
- **Bulk Initiative:** Supported. In `src/renderer/src/components/game/dm/InitiativeSetupForm.tsx` (line 157), the `handleRollInitiative` function checks `useGameStore.getState().groupInitiativeEnabled`. If true, it groups enemies by `entityType` and `name` (e.g., `enemy:goblin`) and rolls a single d20 for the entire group, applying it to all identical monsters.
- **Bulk Saving Throws:** Supported via `src/renderer/src/components/game/modals/combat/GroupRollModal.tsx`. The DM can select "Saving Throw", pick an ability, set a DC, and request a roll for all or selected players. It calculates group success based on whether at least half the targets pass. **However**, the current implementation is stubbed out with hardcoded simulated players (`['Theron', 'Lyra', 'Grimjaw', 'Senna']`) and fake random rolls (line 71). It does not yet pull actual connected players or wait for their real network responses.

## 5. Missing, Broken, or Cumbersome Aspects
Based on the analysis, the following issues exist from the DM's perspective:
1. **Broken Group Rolls:** The `GroupRollModal` uses hardcoded mock data instead of real networked player rolls.
2. **Cumbersome Deployment:** Spawning an encounter via the AI places all monsters in a tight grid at the exact center of the map. The DM must manually drag each monster to its correct starting position.
3. **Incomplete UI Placement:** The "Place All & Start Initiative" button in the Encounter Builder UI doesn't actually place the tokens; it just sends a chat broadcast.
4. **No Wave Support:** DMs cannot structure multi-stage boss fights or reinforcements within a single encounter preset.
5. **Missing Encounter Map Linkage:** While the `Encounter` type definition (`src/renderer/src/types/encounter.ts`) includes a `mapId`, the `EncounterBuilderModal` doesn't provide a way to associate an encounter with a specific map or specific coordinates on that map.