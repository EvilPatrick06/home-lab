# Phase 11: In-Game System Research Findings

**Researcher:** Gemini 3.1 Pro
**Date:** March 9, 2026

This document contains a comprehensive analysis of the In-Game System within the D&D 5e VTT codebase. The research covers session flow, initiative tracking, action economy, HUD completeness, chat/dice synchronization, state management, and identifies any missing or partially implemented features.

---

## 1. End-to-End Session Flow
**Status: Fully Implemented and Functional**

The session flow is robust and supports both standalone VTT play and Discord-integrated sessions via the BMO bot.
*   **Initialization:** Sessions can be initiated via the Discord bot (`/dm start` command in `discord_dm_bot.py`) which joins the voice channel and initializes a session in `CampaignMemory`. Alternatively, sessions start via the VTT UI (`LobbyPage.tsx` -> `GameLayout.tsx`).
*   **Game Loop:** Upon mounting `GameLayout.tsx`, `useGameEffects.ts` triggers `startGameSync(sendMessage)` for the host, which begins broadcasting state changes to all connected peers. It also starts auto-saving (`startAutoSave`) and AI memory syncing (`startAiMemorySync`).
*   **Termination:** The DM can end the session via the `SettingsDropdown` component (`handleEndSession`), which handles cleanup, saving, and gracefully disconnecting clients.

## 2. Turn Order & Initiative Tracker
**Status: Fully Implemented and Synced**

The initiative system is highly advanced and accurately reflects D&D 5e 2024 rules.
*   **State Management:** Handled by `initiative-slice.ts`, which tracks `entries`, `currentIndex`, `round`, and `turnMode`.
*   **Synchronization:** `game-sync.ts` listens to store changes and broadcasts `dm:initiative-update` payloads to all clients whenever the turn or round changes.
*   **UI Components:** `InitiativeTracker.tsx` (DM view) and `InitiativeOverlay.tsx` (Player view) display the turn order.
*   **Advanced Features:**
    *   **Lair Actions:** Automatically inserts a "Lair Action" entry at Initiative count 20 if any creature in the encounter has `inLair: true`.
    *   **Turn Delay & Ready Actions:** Supports delaying turns (`delayTurn`, `undelay`) and readying actions (`readyAction`, `triggerReadyAction`).
    *   **Combat Timers:** Includes an optional turn timer (`timerEnabled`, `timerSeconds`) to enforce fast-paced combat.

## 3. Action Economy Enforcement
**Status: Fully Implemented**

The action economy is strictly tracked and enforced during combat.
*   **State Tracking:** `initiative-slice.ts` maintains a `TurnState` for each entity, tracking `actionUsed`, `bonusActionUsed`, `reactionUsed`, `movementUsed`, and `movementMax`.
*   **UI Integration:** `ActionEconomyBar.tsx` visually displays available and expended actions, bonus actions, reactions, and movement for the current player's turn.
*   **Combat Resolution:** `combat-resolver.ts` integrates with `multi-attack-tracker.ts` to track Extra Attacks. It also validates if an attacker can act (e.g., checking for the Incapacitated condition via `getAttackConditionEffects`).
*   **Reactions:** `reaction-tracker.ts` prompts players for reactions (e.g., Counterspell, Shield, Opportunity Attacks) when specific triggers occur.

## 4. In-Game HUD Completeness
**Status: Highly Comprehensive**

The HUD (`GameLayout.tsx`) is feature-rich and provides all necessary information without cluttering the screen. Key components include:
*   **PlayerHUD / PlayerHUDOverlay:** Displays character stats, HP, AC, and active conditions.
*   **CharacterMiniSheet / SpellSlotTracker:** Quick access to character abilities and resources.
*   **ActionEconomyBar:** Shows available actions for the current turn.
*   **ClockOverlay:** Displays in-game time, calendar, and lighting conditions (integrates with `processDawnRecharge`).
*   **TurnNotificationBanner:** Announces the start of a new turn.
*   **Hotbar & Bottom Bars:** `PlayerBottomBar` and `DMBottomBar` provide quick access to actions, spells, items, and DM tools.
*   **Context Menus:** `TokenContextMenu` and `EmptyCellContextMenu` provide quick actions directly on the map canvas.

## 5. Chat, Dice Rolls, and Game Log
**Status: Fully Implemented and Synced**

*   **Chat System:** `ChatPanel.tsx` handles standard messages, system messages, and slash commands (parsed via `chat-commands` services). Messages are synced via `sendMessage('chat:message')`.
*   **Dice Integration:** Dice rolls are resolved via `dice-service.ts` and broadcasted via `game:dice-result`. This triggers the 3D dice physics engine (`DiceRoller.tsx` / `trigger3dDice`) across all connected clients simultaneously.
*   **Game Log:** `combat-log-slice.ts` records a persistent history of attacks, damage, saves, and conditions. `combat-resolver.ts` automatically pushes detailed summaries to the log (e.g., `"Goblin hits Fighter with Scimitar! (18 vs AC 16) Damage: 5 slashing"`).

## 6. In-Game State Real-Time Updates
**Status: Fully Implemented**

State mutations are instantly calculated and broadcasted to all peers.
*   **Combat Automation:** `combat-resolver.ts` automatically applies damage to tokens (`applyDamageToToken`) and assigns conditions (e.g., applying the "Grappled" condition on a successful grapple check, or "Prone" on a shove).
*   **Network Sync:** `game-sync.ts` subscribes to Zustand store changes. When `conditions`, `turnStates`, or `partyVisionCells` change, it immediately sends the corresponding network payload (`dm:condition-update`, `game:state-update`, etc.).
*   **Vision & Lighting:** Vision is recomputed dynamically based on token movement and light sources (`vision-computation.ts`), updating the fog of war in real-time.

## 7. Missing, Broken, or Partially Implemented Features
**Status: Minor Polish Items Remaining**

The codebase is exceptionally clean and feature-complete. A codebase-wide audit for `TODO`, `FIXME`, and `partial` tags revealed very few missing features. The remaining items are minor UI/UX polish tasks or data-entry expansions:
*   **Map Tooling:** `map-event-handlers.ts` has a `// TODO: Render live preview` for drawing tools. `map-overlay-effects.ts` notes `// TODO: Add playing state management` for audio/visual effects.
*   **Data Extraction:** `extract-5e-data.ts` contains `// TODO: Add Nodes for the other 27 Domains...`, indicating that some specific subclass data nodes might still need to be scraped or formatted.
*   **Partial Matching:** Several search/filter functions (e.g., `name-resolver.ts`, `chat-commands/index.ts`) rely on partial string matching, which is functioning as intended but noted in tests.

**Conclusion:**
The In-Game System is a robust, production-ready implementation of the D&D 5e 2024 ruleset. The architecture cleanly separates state management (Zustand), networking (PeerJS), and game logic (Combat Resolver), resulting in a highly responsive and synchronized multiplayer experience.