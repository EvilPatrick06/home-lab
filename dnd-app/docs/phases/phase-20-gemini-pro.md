# Phase 16 Research Findings: VTT Platform Comparison

This document outlines the findings from an extensive analysis of the current codebase compared against industry-leading Virtual Tabletop (VTT) and digital toolset platforms: D&D Beyond, Foundry VTT, and Roll20.

## 1. D&D Beyond (DDB)
D&D Beyond excels as a digital character management and campaign prep toolset. Compared to DDB, our platform is missing several key features:

*   **Guided, Rules-Enforced Character Builder:** DDB features a highly polished, step-by-step builder with strict rules enforcement and auto-calculations for complex multiclassing. While our `src/renderer/src/components/builder/5e/CharacterBuilder5e.tsx` has basic validation (e.g., checking for blank fields, required selections), it lacks deep rules enforcement and auto-calculation for complex edge cases.
*   **Dynamic Digital Character Sheet:** DDB's sheet automatically recalculates AC, hit points, spell save DCs, and attack bonuses dynamically based on equipped items, conditions, and active spells. Our `src/renderer/src/services/combat/effect-resolver-5e.ts` handles static bonuses (feats, fighting styles, magic items) but is not fully integrated with dynamic conditions (e.g., conditions don't mechanically alter token properties on the map).
*   **Advanced Encounter Builder:** DDB offers a CR-based encounter builder that filters monsters by environment, size, type, and sourcebook, and calculates difficulty (Easy/Medium/Hard/Deadly) dynamically. Our `src/renderer/src/components/game/modals/dm-tools/EncounterBuilderModal.tsx` uses XP budgets but lacks advanced filtering and simply broadcasts a chat message rather than persisting an encounter state or placing tokens.
*   **Content Sharing & Marketplace:** DDB allows a Master Tier subscriber to share all purchased content with their campaign. We currently have no content sharing model, marketplace integration, or in-app purchasing.
*   **Party Inventory / Shared Loot:** DDB campaigns can have a shared inventory pool. We only have a `ShopInventoryTable` for merchants, but no shared party loot pool.
*   **Mobile Companion App:** DDB has a dedicated mobile app and a highly responsive web UI. Our UI relies heavily on absolute positioning (`GameLayout.tsx`) and is not touch-optimized or responsive for small screens.

## 2. Foundry VTT
Foundry VTT is known for its powerful rendering engine, deep automation, and extensive modding ecosystem. Compared to Foundry, we are missing:

*   **Active Effects V2:** Foundry has a robust system for effects that dynamically alter token stats, vision, and lighting based on conditions, spells, or items, with complex duration tracking and stacking rules. Our `effect-resolver-5e.ts` is largely static.
*   **Dynamic Lighting Animations:** Foundry supports animated light sources (torch flicker, pulse, emanation, chroma). Our `src/renderer/src/components/game/map/lighting-overlay.ts` is purely static, rendering simple visibility cutouts without animation.
*   **Scene Regions & Trigger Zones:** Foundry allows DMs to draw regions that trigger macros, teleport tokens, apply effects, or pause the game when a token enters/leaves. We currently have no trigger zones or token area-enter/leave events.
*   **Positional Ambient Audio & Sound Walls:** Foundry supports audio emitters that are occluded by walls, creating realistic soundscapes. Our `src/renderer/src/components/game/map/audio-emitter-overlay.ts` exists and creates an `AudioEmitterLayer`, but `updateEmitters()` is never called, and sound occlusion by walls is not implemented.
*   **Multi-floor Scene Levels:** Foundry supports multi-floor dungeons within a single scene. Our `src/renderer/src/components/game/map/FloorSelector.tsx` exists and sets `currentFloor` state, but it is never used for token visibility or layer filtering.
*   **Advanced Wall Types:** Foundry has 7+ wall types (ethereal, invisible, terrain, one-way) with independent toggles for light, sight, movement, and sound. We only have solid, door, and window types.
*   **Animated Scene Transitions & Preloading:** Foundry preloads assets for the next scene and transitions with fade effects. Our map switching is instant, lacks transitions, and has no asset preloading mechanism.

## 3. Roll20
Roll20 is known for its accessibility, quick setup, and integrated tabletop tools. Compared to Roll20, we are missing:

*   **Advanced Macro Bar / Hotbar:** Roll20 provides a quick-access hotbar for macros, spells, and items. While we have `src/renderer/src/components/game/player/MacroBar.tsx` and `src/renderer/src/services/macro-engine.ts`, our engine only resolves simple variables (`$self`, `$target`, `$mod.str`) and lacks complex scripting, conditional logic, or loops. Furthermore, our bottom bar collapse hides the Macro Bar entirely.
*   **Multi-Token Group Operations:** Roll20 allows selecting multiple tokens to move them together, lock them, or apply bulk changes. We currently only support single-token selection.
*   **Rollable Tables:** Roll20 has native support for rollable tables (e.g., random encounters, loot) that output directly to chat. We have `random-tables.json` in the library data but no in-game table roller UI.
*   **Built-in Voice & Video Chat:** Roll20 has integrated WebRTC voice and video. We use PeerJS for data synchronization but have no A/V integration.
*   **Map Pins & Journal Linkage:** Roll20 allows placing pins on the map that link directly to journal entries, with configurable player/GM visibility. We have no map pins or spatial bookmarks.
*   **Foreground / Occlusion Layer:** Roll20 has a foreground layer that can fade out when tokens move under it (e.g., tree canopies). We have a `weather-overlay.ts` but no foreground tile layer with conditional opacity.

## 4. UX Patterns & Workflows Worth Adopting

Based on the analysis of these platforms, the following UX patterns and workflows should be adopted to improve our VTT:

1.  **Prep Speed as a First-Class Feature (DDB/Roll20):** Implement one-click combat importing, quickplay maps, and instant shop/treasure generation. Currently, our custom map prep is slow because image import is placeholder-only (`MapConfigStep.tsx:83-89`).
2.  **Contextual Quick Actions (Foundry):** Right-click context menus on tokens should expose all common actions (Apply Condition, Target, Open Sheet). Currently, our `TokenContextMenu` closes when applying a condition without linking to the `QuickConditionModal`.
3.  **Non-Blocking UI (Foundry):** Reduce reliance on screen-blocking modals (`GameModalDispatcher`) that take players out of the map context. Move tools to sidebars or floating, draggable windows to maintain immersion.
4.  **Visual Indicators (Roll20/Foundry):** Add token aura rings (for light radius, spell range), grid coordinate readouts on hover, and token rotation/facing indicators. Currently, `combat-animations.ts` has `drawTokenStatusRing` exported but it is never referenced.
5.  **Streamlined Onboarding (Roll20):** Implement an interactive tutorial or guided first-character creation instead of text-heavy help modals.
6.  **Unified Content Discovery (DDB):** Merge the library and in-game compendium mental models. Currently, we have duplication between `CompendiumModal` (in-game, read-only) and `LibraryPage` (full compendium + homebrew) with different feature sets and rendering logic.
7.  **Auto-Pan / Camera Focus (Roll20):** Implement auto-panning to the active token on turn change during combat. Currently, "Center on entity" is a manual action via portrait click.