# Phase 27 — Audio, SFX & Atmosphere Analysis

**Agent:** Claude Opus 4.6 Max  
**Date:** 2026-03-09  
**Scope:** Full codebase audit of the audio pipeline — managers, playback, networking, volume controls, spatial audio, and bugs.

---

## Table of Contents

1. [Audio Manager Architecture](#1-audio-manager-architecture)
2. [Playlist & DM Sync Capabilities](#2-playlist--dm-sync-capabilities)
3. [Sound Effects Tied to In-Game Actions](#3-sound-effects-tied-to-in-game-actions)
4. [Volume Controls & User Preferences](#4-volume-controls--user-preferences)
5. [Bugs, Missing Features & Performance Issues](#5-bugs-missing-features--performance-issues)
6. [File Index](#6-file-index)

---

## 1. Audio Manager Architecture

### 1.1 Two-Module Design

The audio system is split across two modules with distinct responsibilities:

| Module | File | Role |
|--------|------|------|
| **Sound Manager** | `src/renderer/src/services/sound-manager.ts` | Central API surface — SFX pools, volume state, custom overrides, delegation to playback |
| **Sound Playback** | `src/renderer/src/services/sound-playback.ts` | Low-level `HTMLAudioElement` management for ambient loops and custom audio tracks |

Both use **module-level state** (no class, no store) — exported functions mutate file-scoped `let` variables and `Map` collections.

### 1.2 Technology Stack

- **Playback engine:** Native `HTMLAudioElement` via `new Audio()`. No Web Audio API (`AudioContext`, `GainNode`, `BiquadFilterNode`), no Howler.js, no Tone.js.
- **Audio format:** `.mp3` for all bundled sounds (130 files under `src/renderer/public/sounds/`).
- **No external audio dependencies** in `package.json`.

### 1.3 SFX Pool System (sound-manager.ts)

Sound effects use a **round-robin pool** of 3 `HTMLAudioElement` instances per event, enabling overlapping playback of the same effect:

```
sound-manager.ts:148   const POOL_SIZE = 3
sound-manager.ts:214   const pools: Map<SoundEvent, HTMLAudioElement[]> = new Map()
sound-manager.ts:217   const poolIndex: Map<SoundEvent, number> = new Map()
```

On `play(event)` (line 316–333):
1. Retrieves the pool for the event.
2. Gets the next round-robin index.
3. Resets `currentTime = 0` and calls `.play()`.
4. Advances the index modulo `POOL_SIZE`.

**Variant support:** Each pool slot first tries a variant file (e.g., `dice/d20-1.mp3`), and on error falls back to the base file (`dice/d20.mp3`) — lines 241–255.

### 1.4 Two-Tier Override Architecture

- **Tier 1:** Bundled defaults in `src/renderer/public/sounds/` (shipped with app).
- **Tier 2:** DM custom audio overrides per campaign, stored in `userData/campaigns/{id}/custom-audio/`.

Custom overrides are registered via `registerCustomSound(event, filePath)` (line 272) and propagated to the playback module via `customOverrides` maps.

### 1.5 Ambient Playback (sound-playback.ts)

A single `HTMLAudioElement` at a time for ambient loops:

```
sound-playback.ts:11   let currentAmbient: HTMLAudioElement | null = null
sound-playback.ts:12   let currentAmbientName: AmbientSound | null = null
```

`playAmbient()` (line 26–38): Stops any existing ambient, creates a new `Audio` element with `loop = true`, and plays. Volume fade uses `requestAnimationFrame` with ease-in-out interpolation (lines 77–115).

### 1.6 Custom Audio Playback (sound-playback.ts)

Custom audio tracks are stored in a `Map<string, HTMLAudioElement>` keyed by file path:

```
sound-playback.ts:15   const customAudioTracks: Map<string, HTMLAudioElement> = new Map()
```

Supports loop and per-track volume options. File paths are converted to `file://` URLs for Electron playback (line 139).

### 1.7 Spatial Audio System (Visual Only)

Three components form a spatial audio framework that is **not wired to actual sound output**:

| Component | File | Purpose |
|-----------|------|---------|
| **Sound Occlusion** | `src/renderer/src/services/map/sound-occlusion.ts` | Raycast-based wall occlusion + distance falloff calculations |
| **Audio Emitter Overlay** | `src/renderer/src/components/game/map/audio-emitter-overlay.ts` | PixiJS visual layer showing emitter radius circles on the map |
| **Map Overlay Effects** | `src/renderer/src/components/game/map/map-overlay-effects.ts` (lines 294–308) | Feeds emitters to the overlay layer |

The occlusion model is well-designed:
- Distance falloff: `1 - (distance / radius)^1.5`
- Occluded volume multiplier: `0.1`
- Low-pass frequency hints: 800 Hz occluded, 22000 Hz clear
- Wall filtering: only solid walls and closed doors block sound

**However**, `getEmitterVolume()` is never called from any actual audio playback code. The overlay is purely visual — colored circles (blue = clear, red = occluded, gray = stopped) drawn on the map canvas. No `HTMLAudioElement` is ever created or played for map emitters.

### 1.8 IPC Handlers for Custom Audio (Main Process)

`src/main/ipc/audio-handlers.ts` provides 5 IPC channels:

| Channel | Purpose |
|---------|---------|
| `audio:upload-custom` | Write file to `userData/campaigns/{id}/custom-audio/` |
| `audio:list-custom` | List files in that directory |
| `audio:delete-custom` | Delete a custom audio file |
| `audio:get-custom-path` | Return absolute path for playback |
| `audio:pick-file` | Open native file dialog (mp3, ogg, wav, webm, m4a) |

Security: UUID validation for campaign IDs, safe filename regex, path traversal prevention via `isWithinDirectory()`.

### 1.9 Initialization Flow

```
App.tsx              → initSoundManager() + preloadEssential()
use-game-effects.ts  → initSounds() when entering a game session
```

`preloadEssential()` (line 508–520) forces `.load()` on the most time-critical sounds: all dice types, nat-20, nat-1, turn-notify, initiative-start.

---

## 2. Playlist & DM Sync Capabilities

### 2.1 Playlists: NOT IMPLEMENTED

There is **no playlist system** anywhere in the codebase. The DM cannot:
- Create ordered playlists of tracks
- Set up auto-advance between ambient tracks
- Schedule music changes
- Share playlists with players

The closest feature is the **9 preset ambient tracks** in `ambient-tracks.json`, which are individually togglable but not sequenceable.

### 2.2 DM Audio Panel (DMAudioPanel.tsx)

The DM's audio control surface lives in the bottom panel's Audio tab:

**Ambient Music Section** (lines 221–247):
- 9 preset buttons in a 3-column grid: Tavern, Dungeon, Forest, Cave, City, Battle, Tension, Victory, Defeat
- Toggle on/off with fade-out animation (800ms to stop, 400ms to switch)
- Active track shows a pulsing play indicator

**Quick SFX Section** (lines 283–296):
- 6 one-shot buttons: Door, Trap, Loot, Announce, Initiative, Death
- Fires once and syncs to all players

**Custom Sounds Section** (lines 298–389):
- Upload audio files from disk
- Per-track play/stop, loop toggle, volume slider, delete
- Category filter tabs (All, Ambient, Effect, Music) — but all uploads default to "effect"
- Files stored per-campaign via IPC to main process

### 2.3 Network Sync via PeerJS

Three message types handle audio sync over WebRTC:

| Message | Payload | Sync behavior |
|---------|---------|---------------|
| `dm:play-sound` | `{ event: string }` | All clients play the SFX locally |
| `dm:play-ambient` | `{ ambient: string, volume?: number }` | All clients start the ambient loop at the specified volume |
| `dm:stop-ambient` | `{}` | All clients stop ambient |

**Handlers exist in TWO places** (duplication):
1. `src/renderer/src/hooks/use-game-network.ts` (lines 114–126)
2. `src/renderer/src/stores/network-store/client-handlers.ts` (lines 624–650)

Both call the same `playSound`, `playAmbient`, `stopAmbient` functions from `sound-manager.ts`. This means audio messages may be processed twice on clients.

### 2.4 What is NOT synced

| Feature | Synced? |
|---------|---------|
| Ambient track selection | Yes |
| Ambient volume from DM | Yes |
| Quick SFX triggers | Yes |
| Custom audio tracks | **No** — DM-local only |
| Master volume changes | **No** — local only |
| Ambient volume slider moves (live) | **No** — only sent on track start |
| Audio emitter state | **No** — visual overlay only |

### 2.5 Chat Commands

`/sound` (DM-only, aliases: `/sfx`) in `commands-dm-sound.ts`:

| Subcommand | Effect |
|------------|--------|
| `/sound mute` | Mute all local audio |
| `/sound unmute` | Unmute |
| `/sound on` / `off` | Enable/disable sound system |
| `/sound volume 0.5` | Set master SFX volume (0–1) |
| `/sound ambientvolume 0.3` | Set ambient volume (0–1) |
| `/sound ambient tavern` | Play an ambient track |
| `/sound stop` | Stop ambient |

Note: `/sound ambient` via chat does NOT network-sync to players (it calls `playAmbient()` directly without `sendMessage()`).

---

## 3. Sound Effects Tied to In-Game Actions

### 3.1 Comprehensive SFX Coverage

The app defines **97 sound events** across 7 categories with **130 bundled .mp3 files**:

| Category | Count | Examples |
|----------|-------|---------|
| Combat | 10 | `attack-hit`, `crit-hit`, `melee-attack`, `death`, `instant-kill` |
| Spells | 10 | `spell-evocation`, `spell-necromancy`, `counterspell`, `spell-fizzle` |
| Conditions | 10 | `condition-blinded`, `condition-paralyzed`, `condition-exhaustion` |
| Dice | 12 | `dice-d4` through `dice-d100`, `dice-advantage`, `nat-20`, `nat-1` |
| UI/Events | 16 | `initiative-start`, `turn-notify`, `heal`, `loot-found`, `door-open` |
| Weapons | 15 | `weapon-sword`, `weapon-bow`, `weapon-flaming`, `weapon-holy` |
| Creatures | 18 | `creature-dragon`, `creature-goblin`, `creature-ghost`, `creature-spider` |

### 3.2 Where SFX Are Triggered

| Game Action | Sound Event | Trigger Location |
|-------------|-------------|------------------|
| Dice tray roll | `dice-d{N}` + `nat-20`/`nat-1` | `DiceRoller.tsx:79–81` |
| Initiative start | `initiative-start` | `InitiativeTracker.tsx` |
| Turn notification | `turn-notify` | `TurnNotificationBanner.tsx` |
| Spell casting | `spell-{school}` | `SpellsTab.tsx` via `playSpellSound()` |
| Condition applied | `condition-{name}` | `commands-player-conditions.ts` via `playConditionSound()` |
| Healing / Death | `heal`, `death` | `commands-player-hp.ts` |
| AI DM actions | Various ambient + SFX | `visibility-actions.ts` |
| DM Quick SFX | `door-open`, `trap-triggered`, etc. | `DMAudioPanel.tsx` |

### 3.3 3D Dice Sounds — Disconnected from 3D Animation

This is a significant architectural issue. There are two separate dice systems:

**Dice Tray (DiceRoller.tsx)** — HAS sound:
```
DiceRoller.tsx:79   playDiceSound(sides)
DiceRoller.tsx:80   if (sides === 20 && rolls.length === 1 && rolls[0] === 20) play('nat-20')
DiceRoller.tsx:81   else if (sides === 20 && rolls.length === 1 && rolls[0] === 1) play('nat-1')
```

**3D Dice Animation (DiceOverlay.tsx)** — NO sound:
- `trigger3dDice()` is called from 25+ locations (attack commands, spell commands, combat commands, chat panel, macros, network received rolls).
- `DiceOverlay.tsx` only subscribes to events and renders the Three.js + cannon-es physics animation.
- **No call to `play()` or `playDiceSound()` exists in DiceOverlay or trigger3dDice.**

**Result:** When a player uses the dice tray UI, they hear dice sounds. When dice are rolled via chat commands (`/roll 1d20`), attack macros, spell commands, network-received rolls, or any `trigger3dDice` path — the 3D dice animation plays silently.

### 3.4 Sound File Organization

Files are organized into category subfolders with stripped prefixes and variant numbering:

```
src/renderer/public/sounds/
├── ambient/       (9 files: tavern.mp3, dungeon.mp3, forest.mp3, ...)
├── combat/        (10 files: attack-hit.mp3, crit-hit.mp3, ...)
├── conditions/    (10 files: blinded.mp3, charmed.mp3, ...)
├── creatures/
│   ├── beasts/    (9 files: wolf.mp3, bear.mp3, spider.mp3, ...)
│   └── monsters/  (9 files: dragon.mp3, goblin.mp3, demon.mp3, ...)
├── dice/          (36 files: d20-1.mp3, d20-2.mp3, d20-3.mp3, nat-20-1.mp3, ...)
├── spells/        (10 files: evocation.mp3, necromancy.mp3, ...)
├── ui/            (16 files: heal.mp3, door-open.mp3, ping.mp3, ...)
└── weapons/
    ├── melee/     (9 files: sword.mp3, mace.mp3, axe.mp3, ...)
    ├── ranged/    (2 files: bow.mp3, crossbow.mp3)
    └── magic/     (4 files: flaming.mp3, frost.mp3, lightning.mp3, holy.mp3)
```

Total: ~130 bundled .mp3 files.

---

## 4. Volume Controls & User Preferences

### 4.1 Available Volume Controls

| Control | Scope | Location | Default | Networked? | Persisted? |
|---------|-------|----------|---------|------------|------------|
| Master Volume | All SFX pools | `sound-manager.ts:208` | `1.0` (100%) | No | **No** |
| Ambient Volume | Ambient loop | `sound-manager.ts:209` | `0.3` (30%) | Partial* | **No** |
| Per-Custom-Track | Individual custom audio | `DMAudioPanel.tsx` state | `0.8` (80%) | No | **No** |
| Mute | All audio | `sound-manager.ts:210` | `false` | No | **No** |
| Enabled | System on/off | `sound-manager.ts:211` | `true` | No | **No** |

*Ambient volume is sent in the `dm:play-ambient` payload when a track starts, but real-time slider adjustments are not synced.

### 4.2 UI Controls

**DM sees** (in DMAudioPanel):
- Ambient volume slider (0–100%) — line 253–265
- Master volume slider (0–100%) — line 266–279
- Per-custom-track volume sliders — line 354–362

**Players see:** Nothing. There are **no volume controls exposed to non-DM players**.

### 4.3 Persistence: NONE

Volume settings live in module-level variables (`let volume = 1`, `let ambientVolume = 0.3`) that reset to defaults on every app reload. Despite the import/export system in `import-export.ts` supporting `dnd-vtt-*` localStorage keys, **no audio preferences are ever written to localStorage**.

The key `dnd-vtt-volume` appears only in `import-export.test.ts` as a test fixture — it's never read or written by the app.

### 4.4 What Players Cannot Do

- Adjust their own master volume
- Adjust ambient music volume independently from the DM's setting
- Mute SFX while keeping ambient (or vice versa)
- Set per-category volume (dice, combat, UI separately)
- Persist any audio preference across sessions

---

## 5. Bugs, Missing Features & Performance Issues

### 5.1 CRITICAL: Ambient Path Mismatch (Broken Default Ambient)

**File:** `sound-playback.ts:30`

```typescript
const path = customPath ?? `assets/audio/ambient/${ambient}.ogg`
```

The fallback path `assets/audio/ambient/${ambient}.ogg` is wrong:
- The directory `assets/audio/` does not exist.
- Bundled ambient files are at `sounds/ambient/*.mp3` (not `.ogg`).
- `sound-manager.ts` correctly uses `./sounds/` for SFX (line 197).

**Impact:** Default ambient tracks (without custom overrides) will fail to load. The `.play()` error is silently swallowed by `.catch(() => {})` on line 34, so the DM gets no feedback — the button appears active but produces silence.

**Fix:** Change to `./sounds/ambient/${ambient.replace('ambient-', '')}.mp3`.

### 5.2 CRITICAL: Custom Audio Stop/Delete Uses Wrong Key

**File:** `DMAudioPanel.tsx:171, 207`

The `handleToggleCustomPlay` function calls `stopCustomAudio(fileName)` with just the filename (e.g., `"battle-music.mp3"`), but `sound-playback.ts` stores tracks by the **full absolute path** (e.g., `C:\Users\...\custom-audio\battle-music.mp3`).

```typescript
// DMAudioPanel.tsx:171 — passes fileName
stopCustomAudio(fileName)

// sound-playback.ts:154–159 — looks up by filePath
export function stopCustomAudio(filePath: string): void {
  const audio = customAudioTracks.get(filePath)  // Map miss!
```

**Impact:** Custom audio tracks cannot be stopped or deleted while playing. The audio continues indefinitely. Same bug affects `handleDeleteCustom` at line 207.

### 5.3 HIGH: 3D Dice Animations Are Silent

As documented in Section 3.3, `trigger3dDice()` does not play any sound. Only the dice tray UI plays dice sounds. All 25+ call sites of `trigger3dDice()` across attack commands, spell commands, chat rolls, macro rolls, and network-received dice produce visual-only 3D animations.

### 5.4 HIGH: No Ambient State on Player Join

**File:** `game-sync.ts:249–292`

`buildFullGameStatePayload()` sends 25+ fields to newly joining players but does NOT include:
- `currentAmbient` / `currentAmbientName`
- `ambientVolume`
- Any audio emitter playing state

**Impact:** A player who joins mid-session hears silence even if the DM has ambient music playing for everyone else. They must wait for the DM to change tracks to receive a sync message.

### 5.5 HIGH: Duplicate Audio Message Handlers

Audio network messages (`dm:play-sound`, `dm:play-ambient`, `dm:stop-ambient`) are handled in **two separate locations**:

1. `use-game-network.ts:114–126` — hook-based handler
2. `client-handlers.ts:624–650` — store-based handler

Both call the same sound manager functions. Unless one path is guarded, this results in **double-processing**: ambient could be started twice (creating two overlapping `Audio` elements), or SFX could play twice per trigger.

### 5.6 MEDIUM: Custom Audio Not Networked

Custom audio uploaded by the DM plays only on the DM's machine. There is no:
- `dm:play-custom-audio` message type
- File transfer mechanism for custom audio to clients
- Streaming or URL-based playback for remote players

### 5.7 MEDIUM: Audio Emitters Are Visual-Only

The spatial audio system (occlusion calculations, distance falloff, emitter overlay) is fully implemented for **visualization** but never drives actual sound playback. The `getEmitterVolume()` method exists but is never called from audio code. The emitter `playing` state is hardcoded to `true` with a TODO comment:

```
map-overlay-effects.ts:302   // TODO: Add playing state management
```

### 5.8 MEDIUM: No Fade Cancel / Race Condition

**File:** `sound-playback.ts:77–115`

`fadeAmbient()` starts a `requestAnimationFrame` loop but provides no cancellation mechanism. Rapid ambient switches in `DMAudioPanel.tsx` can trigger overlapping fades — each spawns its own rAF loop modifying the same volume variable simultaneously, producing unpredictable volume jumps.

### 5.9 MEDIUM: No Audio Resource Cleanup

- `reinit()` (sound-manager.ts:294–309) clears SFX pools but does NOT:
  - Stop the ambient track
  - Clear `customAudioTracks` in sound-playback
  - Clear `customOverrides`
- No `dispose()` or `destroy()` function exists for the sound system.
- `customAudioTracks` map grows unbounded if tracks are played but never explicitly stopped.
- Navigating away from a game session does not clean up ambient or custom audio.

### 5.10 LOW: Silent Error Swallowing

**File:** `sound-playback.ts:34`

```typescript
audio.play().catch(() => {})
```

Ambient playback errors (including the broken default path) are silently swallowed with an empty catch. No logging, no toast, no feedback. Other playback paths have better error handling (`logger.debug` for SFX, `logger.warn` for custom audio).

### 5.11 LOW: Chat `/sound ambient` Doesn't Network Sync

`commands-dm-sound.ts:82` calls `playAmbient(fullName)` directly without sending a network message. DM hears the ambient; players do not. This is inconsistent with the `DMAudioPanel` buttons which do sync.

### 5.12 LOW: Low-Pass Filter Not Applied

`sound-occlusion.ts` calculates `lowPassFrequency` values (800 Hz occluded, 22000 Hz normal) in every `SoundOcclusionResult`, but since the app uses `HTMLAudioElement` (not Web Audio API), there is no `BiquadFilterNode` to apply these frequencies. The values are computed and stored but never used.

### 5.13 LOW: Per-Track Volume Not Live-Updated

In `DMAudioPanel.tsx`, changing the volume slider for a custom audio track updates React state but does NOT update the already-playing `HTMLAudioElement.volume`. The new volume only takes effect if the track is stopped and restarted.

### 5.14 INFO: No Player-Facing Audio UI

Players have zero audio controls. There is no:
- Volume slider in the player UI
- Mute button
- Audio settings page
- Separate SFX/Music/Ambient mixing
- Per-channel volume (e.g., "I want dice loud but ambient quiet")

---

## 6. File Index

### Core Audio Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/renderer/src/services/sound-manager.ts` | 558 | Central audio API — pools, volume, events, delegation |
| `src/renderer/src/services/sound-playback.ts` | 173 | Ambient loop + custom audio playback |
| `src/renderer/src/services/map/sound-occlusion.ts` | 216 | Wall-based sound occlusion calculation |
| `src/renderer/src/components/game/map/audio-emitter-overlay.ts` | 206 | PixiJS visual overlay for map audio emitters |
| `src/renderer/src/components/game/bottom/DMAudioPanel.tsx` | 393 | DM audio control panel UI |
| `src/renderer/src/services/chat-commands/commands-dm-sound.ts` | 97 | `/sound` chat command |
| `src/main/ipc/audio-handlers.ts` | 132 | Main process IPC for custom audio file management |

### Data Files

| File | Purpose |
|------|---------|
| `src/renderer/public/data/audio/sound-events.json` | 97 event definitions, categories, subcategories, strip prefixes, essential events |
| `src/renderer/public/data/audio/ambient-tracks.json` | 9 ambient tracks + 6 quick SFX definitions |
| `src/renderer/public/sounds/**/*.mp3` | ~130 bundled sound effect files |

### Network Sync

| File | Lines | Purpose |
|------|-------|---------|
| `src/renderer/src/hooks/use-game-network.ts` | 114–126 | Audio message handlers (hook) |
| `src/renderer/src/stores/network-store/client-handlers.ts` | 624–650 | Audio message handlers (store) — **duplicate** |
| `src/renderer/src/network/game-sync.ts` | 249–292 | Full state sync — **missing audio state** |
| `src/renderer/src/network/message-types.ts` | 49–51 | `dm:play-sound`, `dm:play-ambient`, `dm:stop-ambient` |
| `src/renderer/src/network/schemas.ts` | 497–499 | Zod schemas for audio payloads |

### Integration Points

| File | Usage |
|------|-------|
| `src/renderer/src/App.tsx` | `initSoundManager()` + `preloadEssential()` |
| `src/renderer/src/components/game/dice3d/DiceRoller.tsx:79–81` | Dice tray sounds |
| `src/renderer/src/components/game/dice3d/DiceOverlay.tsx:34` | 3D dice trigger (**no sound**) |
| `src/renderer/src/pages/campaign-detail/AudioManager.tsx` | Campaign audio management page |
| `src/renderer/src/components/campaign/AudioStep.tsx` | Campaign wizard audio step |

### IPC Channels (src/shared/ipc-channels.ts:142–147)

| Channel | Purpose |
|---------|---------|
| `audio:upload-custom` | Upload custom audio to campaign folder |
| `audio:list-custom` | List campaign's custom audio files |
| `audio:delete-custom` | Delete a custom audio file |
| `audio:get-custom-path` | Get absolute path for playback |
| `audio:pick-file` | Open native file picker dialog |

### Test Files

| File | Coverage |
|------|----------|
| `src/renderer/src/services/sound-manager.test.ts` | Export/source checks only |
| `src/renderer/src/services/sound-playback.test.ts` | Export/source checks only |
| `src/renderer/src/services/chat-commands/commands-dm-sound.test.ts` | Command execution |
| `src/renderer/src/pages/campaign-detail/AudioManager.test.tsx` | Component rendering |
| `src/renderer/src/components/game/bottom/DMAudioPanel.test.tsx` | Component rendering |
| `src/renderer/src/components/game/map/audio-emitter-overlay.test.ts` | Overlay behavior |
| `src/main/ipc/audio-handlers.test.ts` | IPC handler tests |

---

## Summary of Findings

### What Exists and Works
- Robust SFX pool system with 97 events, 130 bundled files, and round-robin overlapping playback
- DM audio panel with ambient toggles, quick SFX, and custom audio upload
- Network sync for ambient tracks and one-shot SFX via PeerJS
- Spatial audio occlusion model with wall raycasting and distance falloff (visual only)
- Two-tier override system allowing DM custom sounds per campaign
- Fade-out transitions when switching or stopping ambient tracks
- Chat commands for DM sound control

### What Is Missing
- **Playlist system** — no creation, ordering, auto-advance, or sharing of playlists
- **Player volume controls** — no UI for players to adjust any audio
- **Volume persistence** — all settings reset on reload
- **Custom audio sync** — DM custom tracks don't play for connected players
- **Audio emitter playback** — spatial system is visual-only
- **3D dice sounds** — `trigger3dDice()` path is completely silent
- **Ambient state sync on join** — late joiners miss current ambient
- **Per-category volume mixing** — no separate dice/combat/UI/music channels
- **Web Audio API features** — no low-pass filters, panning, or spatial audio processing

### Critical Bugs
1. Default ambient path points to nonexistent `assets/audio/ambient/*.ogg` instead of `sounds/ambient/*.mp3`
2. Custom audio stop/delete passes `fileName` but playback map is keyed by `filePath` — tracks cannot be stopped
3. Duplicate message handlers may cause double-playback of synced audio
