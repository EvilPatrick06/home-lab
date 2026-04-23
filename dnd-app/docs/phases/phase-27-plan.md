# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 27 (FINAL) of the D&D VTT project.

Phase 27 covers the **Audio, SFX & Atmosphere System**. The app has a robust SFX pool (97 events, 130 bundled .mp3 files, round-robin playback), DM audio panel, and network sync for ambient/SFX. However, it has **two critical path bugs** (default ambient points to nonexistent files, custom audio stop uses wrong key), **3D dice animations are completely silent**, **late joiners hear no ambient**, and **duplicate message handlers may cause double-playback**.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

### Cross-Phase Overlap (DO NOT duplicate)

| Issue | Owned By |
|-------|----------|
| Volume persistence to localStorage | Phase 8 (Sub-Phase A) |
| Player volume controls in Settings | Phase 8 (Sub-Phase A, Step 2) |
| Audio emitter `updateEmitters` never called | Phase 1 (A11) |
| Audio emitter playing state management | Phase 11 (Sub-Phase B) |
| Audio state not included in late-joiner sync | Phase 14 (Sub-Phase D, Step 7) |

**Key Files:**

| File | Lines | Critical Issues |
|------|-------|----------------|
| `src/renderer/src/services/sound-playback.ts` | 173 | **CRITICAL**: Line 30 — ambient path `assets/audio/ambient/*.ogg` is WRONG (should be `sounds/ambient/*.mp3`); line 34 — silent error swallowing; fade race condition (lines 77-115) |
| `src/renderer/src/services/sound-manager.ts` | 558 | Volume not persisted (Phase 8 overlap); `reinit()` doesn't clean up ambient/custom |
| `src/renderer/src/components/game/bottom/DMAudioPanel.tsx` | 393 | **CRITICAL**: Lines 171, 207 — passes `fileName` to stop/delete but Map is keyed by `filePath`; per-track volume slider doesn't update playing audio |
| `src/renderer/src/components/game/dice3d/DiceOverlay.tsx` | ~200 | **HIGH**: `trigger3dDice()` never calls `play()` — 3D dice are completely silent |
| `src/renderer/src/hooks/use-game-network.ts` | Lines 114-126 | **HIGH**: Duplicate audio handler — same messages handled in `client-handlers.ts:624-650` |
| `src/renderer/src/services/chat-commands/commands-dm-sound.ts` | 97 | `/sound ambient` doesn't network sync (line 82) |

### Raspberry Pi (`patrick@bmo`) — NO WORK THIS PHASE

---

## 📋 Core Objectives

### CRITICAL BUGS

| # | Bug | Impact |
|---|-----|--------|
| A1 | Default ambient path wrong: `assets/audio/ambient/*.ogg` instead of `sounds/ambient/*.mp3` | All 9 default ambient tracks produce silence — DM clicks play, nothing happens |
| A2 | Custom audio stop/delete uses `fileName` but Map keyed by `filePath` | Custom tracks cannot be stopped — play indefinitely |

### HIGH BUGS

| # | Bug | Impact |
|---|-----|--------|
| A3 | 3D dice animations from `trigger3dDice()` are completely silent | 25+ dice roll paths have no sound — only dice tray UI plays sounds |
| A4 | Duplicate audio message handlers in two files | SFX/ambient may play twice per trigger |
| A5 | `/sound ambient` chat command doesn't network sync | DM hears ambient via chat command; players don't |

### MEDIUM ISSUES

| # | Issue | Impact |
|---|-------|--------|
| A6 | No fade cancellation — rapid ambient switches cause overlapping rAF loops | Unpredictable volume jumps |
| A7 | `reinit()` doesn't stop ambient or clear custom tracks | Audio leaks across sessions |
| A8 | Per-track volume slider doesn't update playing audio element | Must stop/restart to apply new volume |
| A9 | Custom audio not networked to clients | DM custom tracks play locally only |
| A10 | No playlist system | Can't sequence ambient tracks |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Fix Critical Path Bug (A1)

**Step 1 — Fix Default Ambient Path**
- Open `src/renderer/src/services/sound-playback.ts`
- Find line 30:
  ```typescript
  const path = customPath ?? `assets/audio/ambient/${ambient}.ogg`
  ```
- Fix to:
  ```typescript
  const path = customPath ?? `./sounds/ambient/${ambient.replace('ambient-', '')}.mp3`
  ```
- Verify the ambient track names in `ambient-tracks.json` match the filenames in `sounds/ambient/`
- If ambient names are like `ambient-tavern`, the strip prefix ensures it resolves to `sounds/ambient/tavern.mp3`

**Step 2 — Add Error Logging for Ambient Playback**
- Replace the silent catch at line 34:
  ```typescript
  audio.play().catch((err) => {
    logger.warn(`[sound-playback] Failed to play ambient: ${ambient}`, err)
  })
  ```

### Sub-Phase B: Fix Custom Audio Key Mismatch (A2)

**Step 3 — Fix Stop/Delete to Use Full Path**
- Open `src/renderer/src/components/game/bottom/DMAudioPanel.tsx`
- Find `handleToggleCustomPlay` at line 171 and `handleDeleteCustom` at line 207
- Currently passes `fileName` (e.g., `"battle-music.mp3"`)
- Fix: pass the full path returned by `audio:get-custom-path` IPC:
  ```typescript
  const handleToggleCustomPlay = async (fileName: string) => {
    const fullPath = await window.api.audio.getCustomPath(campaignId, fileName)
    if (playingTracks.has(fileName)) {
      stopCustomAudio(fullPath)  // Use full path
      setPlayingTracks(prev => { prev.delete(fileName); return new Set(prev) })
    } else {
      playCustomAudio(fullPath, { loop: loopEnabled, volume: trackVolume })
      setPlayingTracks(prev => new Set(prev).add(fileName))
    }
  }
  ```
- Apply the same fix to `handleDeleteCustom`

### Sub-Phase C: Add Sound to 3D Dice (A3)

**Step 4 — Wire Sound to trigger3dDice**
- Open `src/renderer/src/components/game/dice3d/DiceOverlay.tsx`
- Find where `trigger3dDice` events are processed
- Add sound playback when dice are triggered:
  ```typescript
  import { play, playDiceSound } from '@/services/sound-manager'

  // When a dice roll event is received:
  const handleDiceRoll = (event: DiceRollEvent) => {
    // Play dice sound based on die type
    playDiceSound(event.sides)

    // Check for nat 20/nat 1 on d20
    if (event.sides === 20 && event.results.length === 1) {
      if (event.results[0] === 20) play('nat-20')
      else if (event.results[0] === 1) play('nat-1')
    }

    // ... existing 3D animation logic
  }
  ```
- Ensure this doesn't double-play with the dice tray — the dice tray (`DiceRoller.tsx`) already plays sounds. Add a flag: if the roll originated from the dice tray, skip the DiceOverlay sound.
- For network-received rolls, the DiceOverlay should play the sound since the dice tray isn't involved.

### Sub-Phase D: Fix Duplicate Audio Handlers (A4)

**Step 5 — Remove Duplicate Handler**
- Two locations handle `dm:play-sound`, `dm:play-ambient`, `dm:stop-ambient`:
  1. `src/renderer/src/hooks/use-game-network.ts` lines 114-126
  2. `src/renderer/src/stores/network-store/client-handlers.ts` lines 624-650
- **Keep only one.** The store-based handler in `client-handlers.ts` is the correct location (consistent with all other message handling).
- Remove the audio handlers from `use-game-network.ts` lines 114-126.
- Verify no other code depends on those hook-based handlers.

### Sub-Phase E: Fix Chat /sound Sync (A5)

**Step 6 — Network Sync /sound ambient Command**
- Open `src/renderer/src/services/chat-commands/commands-dm-sound.ts`
- Find line 82 where `playAmbient(fullName)` is called directly
- Add network broadcast:
  ```typescript
  case 'ambient': {
    const trackName = parts.slice(1).join(' ')
    const fullName = `ambient-${trackName}`
    playAmbient(fullName)
    // Sync to all clients
    const { sendMessage } = useNetworkStore.getState()
    sendMessage?.('dm:play-ambient', { ambient: fullName })
    return { type: 'info', content: `Playing ambient: ${trackName}` }
  }
  ```
- Same fix for `stop` subcommand — broadcast `dm:stop-ambient`

### Sub-Phase F: Fix Fade Race Condition (A6)

**Step 7 — Add Fade Cancellation**
- Open `src/renderer/src/services/sound-playback.ts`
- Add a cancellation token to the fade function:
  ```typescript
  let activeFadeId = 0

  export function fadeAmbient(targetVolume: number, durationMs: number): void {
    const fadeId = ++activeFadeId
    const startVolume = currentAmbient?.volume ?? ambientVol
    const startTime = performance.now()

    function tick(now: number) {
      if (fadeId !== activeFadeId) return  // Cancelled by newer fade
      const elapsed = now - startTime
      const progress = Math.min(1, elapsed / durationMs)
      const eased = easeInOut(progress)
      const vol = startVolume + (targetVolume - startVolume) * eased
      if (currentAmbient) currentAmbient.volume = vol
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  ```
- Each new fade increments `activeFadeId`, causing previous fades to abort on the next frame check

### Sub-Phase G: Fix Audio Cleanup (A7)

**Step 8 — Complete reinit() Cleanup**
- Open `src/renderer/src/services/sound-manager.ts`
- In `reinit()` (lines 294-309), add:
  ```typescript
  export function reinit(): void {
    // Existing pool cleanup...

    // Stop ambient
    stopAmbient()

    // Clear all custom audio
    for (const [path, audio] of customAudioTracks) {
      audio.pause()
      audio.src = ''
    }
    customAudioTracks.clear()

    // Clear overrides
    customOverrides.clear()
  }
  ```
- Call `reinit()` when navigating away from a game session (in the game page unmount effect)

### Sub-Phase H: Fix Live Volume Update (A8)

**Step 9 — Update Playing Audio Element Volume**
- Open `src/renderer/src/components/game/bottom/DMAudioPanel.tsx`
- When the per-track volume slider changes, also update the live audio element:
  ```typescript
  const handleVolumeChange = (fileName: string, newVolume: number) => {
    setTrackVolumes(prev => ({ ...prev, [fileName]: newVolume }))
    // Update the playing audio element immediately
    const fullPath = getFullPath(fileName)
    const audio = customAudioTracks.get(fullPath)
    if (audio) audio.volume = newVolume
  }
  ```
- This requires either accessing the `customAudioTracks` Map from sound-playback, or adding a `setCustomAudioVolume(filePath, volume)` export

### Sub-Phase I: Add Ambient State to Late-Joiner Sync

**Step 10 — Include Audio State in Full Game State Payload**
- Open `src/renderer/src/network/game-sync.ts`
- Find `buildFullGameStatePayload()` (lines 249-292)
- Add current audio state:
  ```typescript
  const payload = {
    // ... existing fields
    audioState: {
      currentAmbient: getCurrentAmbientName(),
      ambientVolume: getAmbientVolume(),
    }
  }
  ```
- On the client side, when receiving the full state, start the ambient:
  ```typescript
  if (payload.audioState?.currentAmbient) {
    playAmbient(payload.audioState.currentAmbient, payload.audioState.ambientVolume)
  }
  ```
- Add `getCurrentAmbientName()` export to sound-playback if it doesn't exist

### Sub-Phase J: Custom Audio Network Sync (A9)

**Step 11 — Add Custom Audio Network Messages**
- Add new message types:
  ```typescript
  'dm:play-custom-audio': { fileName: string; loop: boolean; volume: number }
  'dm:stop-custom-audio': { fileName: string }
  ```
- Problem: Custom audio files exist only on the DM's machine. Options:
  - **Option A (simple):** Encode audio as base64 in the message payload (works for small files < 1MB)
  - **Option B (better):** Transfer the file via PeerJS data channel, then play locally
  - **Option C (best):** Stream the audio from DM to clients via WebRTC audio track
- Start with **Option A** for files under 1MB, with a warning for larger files
- In `DMAudioPanel`, when playing a custom track, also broadcast:
  ```typescript
  if (isHost) {
    const audioData = await window.api.audio.readCustomFile(campaignId, fileName)
    sendMessage('dm:play-custom-audio', {
      fileName,
      audioData: btoa(String.fromCharCode(...new Uint8Array(audioData))),
      loop, volume
    })
  }
  ```
- Client receives and creates a blob URL for playback

### Sub-Phase K: Basic Playlist System (A10)

**Step 12 — Create Simple Playlist Feature**
- Add playlist support to `DMAudioPanel.tsx`:
  ```typescript
  interface Playlist {
    id: string
    name: string
    tracks: string[]  // ambient track names or custom file names
    shuffle: boolean
    currentIndex: number
  }
  ```
- UI: "Create Playlist" button, drag-to-reorder tracks, shuffle toggle, auto-advance on track end
- When the current ambient track ends (via the `ended` event on HTMLAudioElement), auto-play the next track in the playlist
- Store playlists in localStorage per campaign: `dnd-vtt-playlists-{campaignId}`
- Sync current playlist position to clients via existing `dm:play-ambient` messages

---

## ⚠️ Constraints & Edge Cases

### Ambient Path Fix
- **Test all 9 preset tracks** after fixing the path. Play each one and verify audio output.
- **The ambient name format matters**: If `ambient-tracks.json` uses names like `ambient-tavern` and the file is `tavern.mp3`, the strip prefix is needed. If names match filenames directly, no strip needed. Verify the mapping.

### Custom Audio Key
- **The key mismatch is between `fileName` (basename) and `filePath` (absolute path)**. The fix must ensure both the Map key and the stop/delete call use the same format.
- **Alternative fix**: Normalize the Map to use `fileName` as key instead of `filePath`. This is simpler but means two tracks with the same filename from different campaigns would collide. Since custom audio is per-campaign, this is unlikely.

### 3D Dice Sound
- **Avoid double-play**: When the dice tray triggers a roll, it plays sound AND triggers the 3D animation. The 3D animation handler should NOT also play sound in this case. Use a `source: 'tray' | 'command' | 'network'` flag on the dice event.
- **Network-received dice**: When another player's dice roll arrives via network, the 3D animation plays on your screen. This SHOULD play sound — it's a new event for this client.

### Duplicate Handlers
- **Verify removal is safe**: Before removing the hook-based handlers, search for any code that depends on them being in `use-game-network.ts`. If the hook is used in a specific component that doesn't have access to the store handlers, the removal could break that path.

### Custom Audio Sync
- **File size limit for base64**: 1MB of audio = ~1.33MB base64. PeerJS data channels typically handle messages up to 16KB by default, with chunking up to ~256KB. For files > 256KB, implement chunked transfer.
- **Caching**: Once a client receives a custom audio file, cache it locally (in memory or a Blob URL) so it doesn't need to be retransmitted on every play.

### Playlist
- **`ended` event on looping tracks**: When `loop = true`, the `ended` event does NOT fire. Disable loop for playlist tracks and use the `ended` event for auto-advance. Re-enable loop for the last track if the playlist should repeat.

Begin implementation now. Start with Sub-Phase A (Steps 1-2) and Sub-Phase B (Step 3) — these are the two critical bugs where existing features are completely broken (ambient produces silence, custom tracks can't be stopped). Then Sub-Phase C (Step 4) to add sound to 3D dice, and Sub-Phase D (Step 5) to fix the duplicate handler. These four fixes make the existing audio system actually work as intended.
