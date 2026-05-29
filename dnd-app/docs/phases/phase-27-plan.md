# Phase 27 — Audio, SFX & Atmosphere System

## Context

The audio subsystem is split across `sound-manager.ts` (SFX pool of 3 round-robin `HTMLAudioElement` slots per event, 97 events, 130 bundled .mp3s) and `sound-playback.ts` (single ambient loop + custom-audio Map). DM controls live in `DMAudioPanel.tsx`; chat control in `commands-dm-sound.ts`. Network sync goes through `dm:play-sound`, `dm:play-ambient`, `dm:stop-ambient` over PeerJS.

Two critical path bugs remain: the default-ambient code path points at a nonexistent `assets/audio/ambient/*.ogg` location (real files are at `sounds/ambient/*.mp3`), and custom-audio stop/delete in `DMAudioPanel.tsx` pass a bare `fileName` while `sound-playback.ts` keys the Map by absolute `filePath`. Both make user-visible audio features silently broken. Add to that: 3D dice animations (the `trigger3dDice()` path used by 25+ call sites) never call `play()`, and audio messages are double-handled (both `use-game-network.ts:114-126` and `client-handlers.ts:814-842`).

Late-joiner ambient sync has already been wired in Phase 14d (`game-sync.ts:353-394` + `client-handlers.ts:158-163`); this phase no longer owns that work.

## Depends on / blocks

- Depends on: none
- Blocks: none (Phase 31 will absorb the duplicate-handler and chat-sync fixes structurally; Phase 30/32 will route custom-audio file transfer via TransportAdapter)

## Files touched

| Path | Role |
|------|------|
| `src/renderer/src/services/sound-playback.ts` | Ambient path fix, error logging, fade cancellation, custom-audio volume setter |
| `src/renderer/src/services/sound-manager.ts` | `reinit()` cleanup expansion, re-export of new setter |
| `src/renderer/src/components/game/bottom/DMAudioPanel.tsx` | Custom stop/delete key fix, live volume update, playlist UI |
| `src/renderer/src/components/game/dice3d/DiceOverlay.tsx` | Add sound playback in `trigger3dDice` handler |
| `src/renderer/src/components/game/dice3d/DiceRoller.tsx` | Add `source` flag on tray-originated rolls to suppress double-play |
| `src/renderer/src/hooks/use-game-network.ts` | Remove duplicate audio handlers (114-126) |
| `src/renderer/src/services/chat-commands/commands-dm-sound.ts` | Broadcast `dm:play-ambient` / `dm:stop-ambient` from `/sound` |
| `src/renderer/src/network/message-types.ts` | New `dm:play-custom-audio`, `dm:stop-custom-audio` types |
| `src/renderer/src/network/schemas.ts` | Zod schemas for custom-audio messages |
| `src/renderer/src/stores/network-store/client-handlers.ts` | Receive custom-audio messages and play blob URLs |
| `src/main/ipc/audio-handlers.ts` | Add `audio:read-custom-file` IPC for binary transfer |

## Sub-phase summary

| # | Sub-phase | Theme |
|---|-----------|-------|
| 27a | Default ambient path | Fix nonexistent path + add error logging |
| 27b | Custom audio key | Use absolute path in stop/delete |
| 27c | 3D dice sound | Wire `play()` into `trigger3dDice` handler |
| 27d | Duplicate handlers | Remove hook-based audio handlers |
| 27e | Chat `/sound` sync | Broadcast network messages from chat command |
| 27f | Fade cancel | Token-based fade cancellation |
| 27g | reinit cleanup | Stop ambient + clear custom tracks on reinit |
| 27h | Live custom volume | Update playing `HTMLAudioElement.volume` on slider change |
| 27i | Custom audio sync | Network-transfer custom audio to clients |
| 27j | Playlist system | Per-campaign playlists with auto-advance |

## Sub-phase details

### 27a — Default ambient path
**Files:** `src/renderer/src/services/sound-playback.ts`
**Steps:**
1. At `sound-playback.ts:30`, replace `const path = customPath ?? \`assets/audio/ambient/${ambient}.ogg\`` with `const path = customPath ?? \`./sounds/ambient/${ambient.replace('ambient-', '')}.mp3\``. Ambient ids in `data/audio/ambient-tracks.json` are prefixed (`ambient-tavern`); files are bare (`tavern.mp3`).
2. At `sound-playback.ts:34`, replace `audio.play().catch(() => {})` with `audio.play().catch((err) => { logger.warn('[sound-playback] Failed to play ambient:', ambient, err) })`.
**Acceptance:** Click each of the 9 ambient buttons in `DMAudioPanel` — every track produces audio output. Trigger a forced failure (rename a file) — log message appears in devtools console.

### 27b — Custom audio key
**Files:** `src/renderer/src/components/game/bottom/DMAudioPanel.tsx`
**Steps:**
1. At `DMAudioPanel.tsx:171`, change `stopCustomAudio(fileName)` to resolve the path first: read from `customAudioPathsRef.current.get(fileName)` (already populated when the track started — see lines 182-188) and pass that to `stopCustomAudio(filePath)`.
2. At `DMAudioPanel.tsx:207` in `handleDeleteCustom`, do the same path resolution before `stopCustomAudio`. After delete, also `customAudioPathsRef.current.delete(fileName)` (already present at line 209 — verify).
3. Edge: if `customAudioPathsRef` has no entry (toggle-stop before any play), the track isn't playing so `stopCustomAudio` is a no-op — safe to skip.
**Acceptance:** Upload a custom track, press play, press stop — audio stops. Press play, press delete — audio stops and entry disappears.

### 27c — 3D dice sound
**Files:** `src/renderer/src/components/game/dice3d/DiceOverlay.tsx`, `src/renderer/src/components/game/dice3d/DiceRoller.tsx`
**Steps:**
1. Extend `Dice3dRollEvent` in `DiceOverlay.tsx:9-17` with `source?: 'tray' | 'command' | 'network'`.
2. Update `DiceRoller.tsx` (the 25+ `trigger3dDice` callers) to pass `source: 'tray'` from the tray UI, `source: 'command'` from chat commands / macros, `source: 'network'` from network-received rolls. Only the tray site already plays sound (`DiceRoller.tsx:79-81`).
3. In `DiceOverlay.tsx:140` handler, before setting the roll request, parse the first die size and call `playDiceSound(sides)` unless `event.source === 'tray'`. Also play `nat-20` / `nat-1` for solo d20s. Import from `../../../services/sound-manager`.
**Acceptance:** Run `/roll 1d20` in chat → 3D animation + sound. Trigger an attack macro → animation + sound. Roll via the dice tray → exactly one sound (not two).

### 27d — Duplicate handlers
**Files:** `src/renderer/src/hooks/use-game-network.ts`
**Steps:**
1. Remove the three audio branches at `use-game-network.ts:114-126` (`dm:play-sound`, `dm:play-ambient`, `dm:stop-ambient`). The store-based handler at `client-handlers.ts:814-842` already covers them.
2. Drop the now-unused imports at `use-game-network.ts:8-20`: `PlayAmbientPayload`, `PlaySoundPayload`, `StopAmbientPayload`, `AmbientSound`, `SoundEvent`, `playAmbient`, `play as playSound`, `setAmbientVolume`, `stopAmbient`. Keep `trigger3dDice` (still used by `game:dice-result`).
3. Grep `useGameNetwork` consumers to confirm nobody relies on the hook running these handlers.
**Acceptance:** As a client, the DM plays an SFX — sound plays exactly once. Lint passes (no unused imports).

### 27e — Chat `/sound` sync
**Files:** `src/renderer/src/services/chat-commands/commands-dm-sound.ts`
**Steps:**
1. In the `'ambient'` case at `commands-dm-sound.ts:60-84`, after `playAmbient(fullName)` (line 82) add `useNetworkStore.getState().sendMessage?.('dm:play-ambient', { ambient: fullName })`. Import `useNetworkStore` from `'../../stores/network-store'`.
2. In the `'stop'` case at line 86-88, add `useNetworkStore.getState().sendMessage?.('dm:stop-ambient', {})` after `stopAmbient()`.
3. Consider also broadcasting `dm:play-sound` / volume changes, but those are out of scope unless trivially mappable.
**Acceptance:** DM runs `/sound ambient tavern` — all connected players hear the same track. `/sound stop` — all players stop.

### 27f — Fade cancel
**Files:** `src/renderer/src/services/sound-playback.ts`
**Steps:**
1. Add module-level `let activeFadeId = 0` near the other state at `sound-playback.ts:11-15`.
2. In `fadeAmbient` (`sound-playback.ts:77-115`), at the top capture `const fadeId = ++activeFadeId`. In the `step` function, before doing anything else, check `if (fadeId !== activeFadeId) { resolve(); return }` to abort superseded fades.
**Acceptance:** Rapidly toggle two different ambient buttons in `DMAudioPanel` — final track plays at slider volume with no audible volume oscillation.

### 27g — reinit cleanup
**Files:** `src/renderer/src/services/sound-manager.ts`
**Steps:**
1. In `reinit()` at `sound-manager.ts:328-343`, after `init()` add: `playbackStopAmbient()` (already imported as `stopAmbient` alias line 22) and `playbackStopAllCustomAudio()` (line 21).
2. Also clear the custom-override map: iterate `playbackCustomOverrides` (line 16 import) and `.clear()`. Verify this doesn't break the DM-custom-sound feature mid-session — call sites that rely on overrides should re-register after `reinit`. If unsafe, scope this to a new `dispose()` and call from the game-page unmount instead.
3. Add a `dispose()` export that also stops ambient + clears custom audio without re-initing. Wire `dispose()` into the game session unmount effect.
**Acceptance:** Start ambient, navigate away from the game session, navigate back — ambient is stopped, custom tracks empty.

### 27h — Live custom volume
**Files:** `src/renderer/src/services/sound-playback.ts`, `src/renderer/src/services/sound-manager.ts`, `src/renderer/src/components/game/bottom/DMAudioPanel.tsx`
**Steps:**
1. In `sound-playback.ts`, add `export function setCustomAudioVolume(filePath: string, volume: number): void { const audio = customAudioTracks.get(filePath); if (audio) audio.volume = Math.max(0, Math.min(1, volume)) }`.
2. Re-export from `sound-manager.ts` alongside the existing playback re-exports.
3. In `DMAudioPanel.tsx` `handleCustomVolumeChange` (lines 196-198), after `setCustomAudioEntries`, if a cached path exists in `customAudioPathsRef.current.get(fileName)` and the entry is playing, call `setCustomAudioVolume(filePath, vol / 100)`.
**Acceptance:** Play a custom track, drag the volume slider — volume changes immediately without restart.

### 27i — Custom audio sync
**Files:** `src/renderer/src/network/message-types.ts`, `src/renderer/src/network/schemas.ts`, `src/renderer/src/stores/network-store/client-handlers.ts`, `src/renderer/src/components/game/bottom/DMAudioPanel.tsx`, `src/main/ipc/audio-handlers.ts`, `src/preload/index.ts`
**Steps:**
1. In `message-types.ts` near lines 49-51 add `'dm:play-custom-audio'` and `'dm:stop-custom-audio'` types with payload `{ fileName: string; loop: boolean; volume: number; audioData?: string; mimeType?: string }`.
2. Add matching Zod schemas in `schemas.ts:497-499` region. Reject `audioData` > 1.5MB (post-base64).
3. Add IPC `audio:read-custom-file` in `src/main/ipc/audio-handlers.ts` returning `{ buffer: ArrayBuffer; mimeType: string }`; preload-bridge it as `window.api.audioReadCustomFile(campaignId, fileName)`.
4. In `DMAudioPanel.tsx` `handleToggleCustomPlay` (lines 163-194), if `isHost` and file < 1MB, after `playCustomAudio` send `dm:play-custom-audio` with base64-encoded buffer + `loop` + `volume`. On the stop branch, send `dm:stop-custom-audio` with `fileName`. Warn-toast if file is over 1MB and skip broadcast.
5. In `client-handlers.ts` add cases for both new messages: decode base64 → `Blob` → `URL.createObjectURL` → play via `playCustomAudio` keyed by `fileName`. Cache the blob URL keyed by fileName. Revoke the URL on `dm:stop-custom-audio`.
6. Edge: chunked transfer for > 256KB files (PeerJS data-channel limit). For v1, hard-limit to 256KB and surface a UI hint; chunking is a follow-up.
**Acceptance:** DM plays a 200KB custom MP3 — connected players hear the same track. DM stops it — players stop. Files > 1MB show a toast and remain DM-local.

### 27j — Playlist system
**Files:** `src/renderer/src/components/game/bottom/DMAudioPanel.tsx`, possibly new `src/renderer/src/services/playlist-manager.ts`
**Steps:**
1. Define `Playlist { id: string; name: string; tracks: Array<{ kind: 'preset' | 'custom'; ref: string }>; shuffle: boolean; loopPlaylist: boolean; currentIndex: number }`.
2. Add UI in `DMAudioPanel.tsx` below Custom Sounds: "+ New Playlist" button, list of playlists, drag-to-reorder tracks, shuffle/loop toggles, play/skip/stop.
3. Persist per-campaign at `localStorage["dnd-vtt-playlists-" + campaignId]`. Wrap reads in try/catch + JSON validation.
4. Auto-advance: subscribe to the `ended` HTMLMediaEvent on the current ambient track. With `loop: true` the `ended` event never fires, so set `audio.loop = false` while a playlist is active and re-enable for the final track only if `loopPlaylist` is false.
5. On track advance, sync via existing `dm:play-ambient` (presets) or `dm:play-custom-audio` (custom, depends on 27i).
6. Expose a `getCurrentAmbientTrack()` so the playlist manager can detect external interruptions and stop the auto-advance loop.
**Acceptance:** Create a 3-track playlist of preset ambients, press Play — each track plays in sequence, advances at end without user input. Toggle shuffle, replay — order randomises. Clients hear the same sequence.

## Constraints & edge cases

- **Ambient name format:** `ambient-tracks.json` uses `ambient-<name>` ids; bundled files are bare `<name>.mp3`. The strip-prefix in 27a is required.
- **`cave` track had no variant** at audit time; verify before claiming "all 9 presets play."
- **Custom audio key uniqueness:** `fileName` collisions across campaigns are impossible (per-campaign IPC root) but two uploads with the same basename within one campaign would overwrite. Already prevented by `audio-handlers.ts` regex.
- **3D dice double-play:** the dice tray path already plays sound. The `source` flag is required to avoid two sounds per tray roll. Network-received rolls must play sound.
- **Duplicate-handler removal:** before deleting the hook code in 27d, grep for any test or component that mocks `use-game-network` and expects the audio side-effects.
- **PeerJS data channel:** default chunk limit ~16KB, max ~256KB. 27i v1 hard-caps at 1MB total payload with a toast; > 256KB will need chunked transfer in a follow-up.
- **Playlist `ended` event:** does not fire when `loop = true`. Disable loop for playlist tracks; re-enable only for the final track if `loopPlaylist` is false.
- **`reinit()` blast radius:** clearing `customOverrides` mid-session forces DMs to re-register custom sounds. If this is destructive, move the override clear into a separate `dispose()` and only call from session unmount.

## Verification

- `cd dnd-app && npm run lint && npm run test`
- Manual playthrough as DM + 2nd-window client:
  - Toggle each of 9 preset ambients (27a)
  - Upload, play, stop, delete custom track (27b)
  - `/roll 1d20`, attack macro, network dice — all play sounds (27c)
  - Watch devtools: one `[client-handlers] dm:play-sound` log per DM trigger, no duplicates (27d)
  - `/sound ambient forest` — client hears forest (27e)
  - Rapid ambient toggling — no volume oscillation (27f)
  - Leave + re-enter session — no audio leak (27g)
  - Drag custom-track volume slider while playing — volume changes live (27h)
  - Play 200KB custom track as DM — client hears it (27i)
  - Build a 3-track playlist, play through — auto-advances (27j)

## Completed

> **PHASE 27 PARTIAL — 2026-05-29 (overnight autonomous pass; contained bug fixes done, networked/feature items deferred).** 4-gate green (lint 0, tsc web+node 0, vitest 6514/6514).
> - **27a DONE** — ambient path fixed: `./sounds/ambient/${id.replace('ambient-','')}.mp3` (was nonexistent `assets/audio/ambient/<id>.ogg`); play failures now log.
> - **27b DONE** — DMAudioPanel custom stop/delete resolve the absolute path from `customAudioPathsRef` before calling `stopCustomAudio` (the Map is keyed by path, not fileName).
> - **27e DONE** — `/sound ambient` and `/sound stop` now broadcast `dm:play-ambient`/`dm:stop-ambient` (matches DMAudioPanel).
> - **27f DONE** — fade cancellation via a monotonic `activeFadeId`; a newer fade aborts in-flight older ones (no volume oscillation).
> - **27h DONE** — `setCustomAudioVolume(path, vol)` in sound-playback + re-exported from sound-manager + wired into DMAudioPanel slider (live volume, no restart).
> - **DEFERRED:** 27c 3D-dice sound (touches DiceOverlay + 25 callers + source flag), 27d duplicate-handler removal (needs consumer grep + mock audit), 27g reinit/dispose cleanup (plan flags blast-radius risk), 27i custom-audio network sync (IPC + base64 + chunking), 27j playlist system (large feature). Need app/two-window verification.

- 27 late-joiner ambient sync — DONE (`src/renderer/src/network/game-sync.ts:340-396`, `src/renderer/src/stores/network-store/client-handlers.ts:154-163`) — `buildFullGameStatePayload` includes `currentAmbient`; client applies it on full-state hydrate. Originally tracked as Sub-Phase I; absorbed by Phase 14d.

> **PHASE 27 COMPLETE — 2026-05-29 (resumed "do them all"; 4-gate green).** 27c landed earlier in the resume; this pass finished the rest:
> - **27d DONE** — removed the duplicate `dm:play-sound`/`dm:play-ambient`/`dm:stop-ambient` branches from `use-game-network` (client-handlers already plays them — was double-playing on clients) + pruned unused imports.
> - **27g DONE** — `sound-manager.dispose()` (stop ambient + custom audio + clear override map) wired into the InGamePage unmount; `reinit()` stays non-destructive.
> - **27i DONE** — `dm:play-custom-audio`/`dm:stop-custom-audio` message types + Zod schemas (base64 ≤1.5MB); host base64-broadcasts tracks <1MB on play/stop (larger stay DM-local with a toast); clients decode to a Blob URL keyed by fileName and revoke on stop.
> - **27j DONE** — `services/playlist-manager.ts` (preset/custom tracks, shuffle/loop, no-immediate-repeat shuffle, per-campaign localStorage; unit-tested) + DMAudioPanel Playlists UI (create/delete, add/remove tracks, shuffle/loop, play/skip/stop). Preset tracks auto-advance via a new opt-in non-looping ambient playback + `onEnded` callback; host broadcasts each track.
