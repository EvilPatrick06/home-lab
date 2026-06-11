# PHASE-35 — Cinematic scene mode (full-bleed art + ambient + particles ↔ tactical grid)

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Add a DM-triggered "scene mode" to the VTT: one click swaps the tactical grid for a full-bleed, theater-of-the-mind view — evocative scene art (from upload, the image library, or the current map background), an optional caption in a cinematic letterbox, an ambient-particle layer (embers, fireflies, snow, rain, fog, dust motes), and an ambient soundscape driven through the existing `dm:play-ambient` pipeline — and one click (or combat starting) brings the grid back. The scene view syncs to every connected player, hydrates for late joiners through the existing full-state snapshot, and leaves the map canvas mounted underneath so camera/zoom/PIXI state survives the round-trip. Alchemy VTT built its product on exactly this scenes-for-story / grid-for-fights split; Foundry's Storyteller's Cinema module retrofits the same idea. Nothing in the app changes unless the DM explicitly enters a scene — the feature is inert by default.

## Dependencies & cross-phase notes

- **No prerequisite phases** (PHASE-INDEX row 35: *(no deps)*). Everything this phase builds on (game-store slices, the `dm:*` broadcast message pattern, the ambient-sound pipeline, the full-state join snapshot, the image library, the DM modal infrastructure) already exists and is verified below.
- **PHASE-33 (image-generation)** saves AI-generated scene art to the image library with stable `aiimg-<uuid>` ids and explicitly names this phase as the consumer ("PHASE-35 will want full-bleed scene art. The `scene` subject preset + image-library persistence added here is its natural source"). Sub-phase 35E adds the `image-library:read-data` IPC that makes ANY library image (including `aiimg-*` ones, if PHASE-33 has landed) usable as scene art. There is no hard dependency in either direction — the picker simply lists whatever is in the library.
- **PHASE-33 file collisions** — both phases edit `src/shared/ipc-channels.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/components/game/active-modal-types.ts` (+ its test), `modal-groups/DmModals.tsx`, `bottom/DMTabPanel.tsx`, and both locale files. All edits on both sides are additive (new channels, new union literals, new render branches, new keys); apply this phase's additions wherever the file is at execution time.
- **PHASE-12 (i18n-wording-sweep)** — all new UI strings land in BOTH `en.json` and `es.json` with `npm run i18n:gen-keys` re-run, so PHASE-12's parity tests stay green regardless of execution order.
- **PHASE-08 (executor-batch-correctness)** owns the AI DM action executors. This phase deliberately adds **no** new AI-emittable DM action (no `enter_scene` verb) — see Out of scope.
- **PHASE-09 (chat-commands-cleanup)** owns the chat-command registry. No `/scene` command in this phase.
- **PHASE-13** contains a "ModalScaffold (33c)" item. If a shared `ModalScaffold` exists at execution time, build `SceneModeModal` on it; otherwise mirror `AiMapAnalysisModal.tsx` (verified structure below, F11).
- **PHASE-34 (battlemap-generation)** generates *tactical* maps; this phase's overlay is the *non*-tactical view. No shared files beyond the modal-registration trio listed above.
- **Pre-existing latent bug found during verification (do NOT fix here; log per INSTRUCTIONS rule 12 if not already logged):** `MapConfigStep.tsx:97` writes `map.imagePath = \`image-library://${imageId}\`` but no `image-library://` protocol handler is registered anywhere in `src/main` — `grep -rn "image-library://" dnd-app/src` returns only that one writer. Library-backed campaign maps therefore cannot render their background. This phase's `image-library:read-data` IPC (35E) is also the natural future fix for that bug, but rewiring `MapConfigStep` is out of scope here.

## Verified findings

All verification run 2026-06-10 against the live tree. Commands are written runnable from the repo root. `grep -rn "sceneMode\|scene-mode\|SceneMode" dnd-app/src --include="*.ts" --include="*.tsx"` returns **zero hits** — the feature is net-new; the audit's one-line recommendation matched reality and nothing needed correcting.

### F1 — The game screen layout: where a full-bleed overlay slots in

`src/renderer/src/components/game/GameLayout.tsx` (1239 lines) renders the whole in-game screen:

- The **map layer** is an `absolute inset-0` container (`GameLayout.tsx:618`) holding `<MapCanvas …/>` (line 619) plus ambient-light tint overlays at `z-[1]` (`ambientLight === 'dim'` → line 688-690, `'darkness'` → 691-693, `underwaterCombat` → 694) and `<DiceTray />` (line 702).
- Docked chrome sits above it: left sidebar at `z-10` (line 707), bottom bar at `z-10` (line 750), the floating top-right control cluster at `z-40` (line 816) containing Reset View (line 823-833), `ViewModeToggle` (834), `ViewAsSelector` (836), `MapSelector` (837-858, DM-only, only when >1 map), `ClockOverlay`, `DmAlertTray`, `SettingsDropdown`.
- `NarrationOverlay` renders `fixed inset-0 z-50` (lazy, line 95 + 1022-1028) — it will sit **above** a scene overlay placed inside the map layer, which is correct (dramatic read-alouds stay visible during a scene).
- The centralized z-scale is `src/renderer/src/constants/z-index.ts:15-37` (`Z.MAP_CANVAS: 0`, `SIDEBAR/BOTTOM_BAR: 10`, `TOOLBAR: 20`, `OVERLAY: 30`, `DROPDOWN: 40`, `MODAL_BACKDROP: 50`, `MODAL: 60`).
- `effectiveIsDM = isDM && viewMode === 'dm'` (`GameLayout.tsx:278`) is the gate every DM-only overlay uses. The existing `viewMode` ('dm' | 'player', `game-layout/use-view-mode.ts:25-73`) is the DM's *view-as-player* preview — a different feature; do not conflate.

Placing the scene overlay inside the map-layer container at `z-[2]` (above the tint overlays' `z-[1]`, below the `z-10` chrome) keeps the sidebar, bottom bar, chat, and all floating controls fully usable during a scene, and keeps `MapCanvas` mounted (PIXI camera/zoom state survives).

Verify:
```bash
sed -n '278p;618,619p;688,695p;702p;707p;750p;816p;1022,1028p' dnd-app/src/renderer/src/components/game/GameLayout.tsx
sed -n '15,37p' dnd-app/src/renderer/src/constants/z-index.ts
```

### F2 — Game store: slice composition, reset, and generic state loading

- `src/renderer/src/stores/game/index.ts:26-52` composes the store from per-feature slices (`createShopSlice`, `createTimerSlice`, … 20 slices) spread over `initialState`. A new `createSceneSlice` composes the same way.
- `stores/game/types.ts:496-519` — `GameStoreState = GameState & ShopSliceState & … & GameFlowState` (intersection of slice-state interfaces). A new `SceneSliceState` joins the intersection.
- `stores/game/timer-slice.ts:1-32` is the minimal slice pattern to copy: `export const createTimerSlice: StateCreator<GameStoreState, [], [], TimerSliceState> = (set, get) => ({ … })`.
- `loadGameState` (`stores/game/index.ts:125-184`) destructures ~17 known special keys and **spreads every remaining key directly into the store** (`...gameState` → `set({ ...gameState, … })`). A `sceneMode` key carried in a network snapshot therefore lands in the store with no further wiring — verified by reading the destructure list (no allowlist filtering).
- `reset()` (`stores/game/index.ts`, the `reset: () =>` block) re-sets `initialState` plus an explicit enumeration of slice fields (`shopOpen: false`, `timerSeconds: 0`, `ambientLight: 'bright'`, …). Scene fields must be added to that enumeration or they survive a session reset.

Verify:
```bash
sed -n '26,52p;125,145p' dnd-app/src/renderer/src/stores/game/index.ts
grep -n "export type GameStoreState" dnd-app/src/renderer/src/stores/game/types.ts   # → 496
grep -n "reset: () =>" dnd-app/src/renderer/src/stores/game/index.ts
sed -n '1,32p' dnd-app/src/renderer/src/stores/game/timer-slice.ts
```

### F3 — Network message plumbing: the four-file pattern for a new `dm:*` broadcast

- `src/renderer/src/network/message-types.ts:1-96` — `MESSAGE_TYPES` const tuple (`'dm:narration'` at line 50, `'dm:play-ambient'` at 52, `'batch'` last at 95); `MessageType` + `KNOWN_MESSAGE_TYPES` derive from it. Payload interfaces live in the same file (`NarrationPayload` 398-401, `PlayAmbientPayload` 473-476).
- `src/renderer/src/network/schemas.ts` — one zod schema per payload (`NarrationPayloadSchema` 400-403, `PlayAmbientPayloadSchema` 409-412); size caps are precedented: `MAX_CUSTOM_AUDIO_BASE64 = 1.5 * 1024 * 1024` (line ~418) caps `dm:play-custom-audio`'s base64 field. Schemas register in `PAYLOAD_SCHEMAS` (line 569; `'dm:play-ambient'` entry at 620). `validateNetworkMessage` (line ~660) validates envelope then payload.
- Client dispatch: `src/renderer/src/stores/network-store/client-handlers.ts` switch — `case 'dm:narration'` at 507 → `handleNarration` (in `client-handlers/chat-handlers.ts:122-131`), `case 'dm:play-ambient'` at 517 → `handlePlayAmbient` (in `client-handlers/audio-handlers.ts:31-39`, which calls `setAmbientVolume` + `playAmbient` on the sound manager). Self-contained handler modules under `client-handlers/` are the convention.
- Host→clients sends use `useNetworkStore((s) => s.sendMessage)` — e.g. `DMAudioPanel.tsx:207-212` does `playAmbient(ambient)` locally then `sendMessage('dm:play-ambient', { ambient, volume: ambientVol / 100 })`; `MapSelector`'s explicit `dm:map-change` broadcast (`GameLayout.tsx:843-856`) is the belt-and-suspenders precedent for store-set-then-broadcast.
- Message-type tests are additive (`message-types.test.ts:5-40` asserts tuple shape + KNOWN set consistency — no exhaustive schema-per-type assertion exists, but adding the schema is the convention).

Verify:
```bash
grep -n "'dm:narration'\|'dm:play-ambient'\|'batch'" dnd-app/src/renderer/src/network/message-types.ts
grep -n "PlayAmbientPayloadSchema\|MAX_CUSTOM_AUDIO_BASE64\|PAYLOAD_SCHEMAS" dnd-app/src/renderer/src/network/schemas.ts | head
grep -n "case 'dm:narration'\|case 'dm:play-ambient'" dnd-app/src/renderer/src/stores/network-store/client-handlers.ts
sed -n '205,213p' dnd-app/src/renderer/src/components/game/bottom/DMAudioPanel.tsx
```

### F4 — Late-joiner hydration: the full-state snapshot already carries ad-hoc fields

- `src/renderer/src/network/game-sync.ts:179-235` — `buildFullGameStatePayload()` enumerates the game-store fields that join/resync snapshots carry, **plus** the non-store field `currentAmbient` (lines 188-198: lazy-imports `getCurrentAmbient` from the sound manager so a late joiner hears the running soundscape). The return object is an explicit field list — a new `sceneMode: gs.sceneMode` line is required for late joiners to receive an active scene.
- Callers: `stores/network-store/index.ts:162` (join snapshot) and `:312` (resync) both lazy-import and send the payload as `game:state-full`.
- Client application: `client-handlers.ts:88-121` — `case 'game:state-full'` maps `imageData` onto `imagePath` for maps, calls `applyGameState(gs)` (→ `loadGameState`, which spreads unknown keys per F2 — `sceneMode` lands automatically), then reads `currentAmbient` out-of-band and plays/stops it (lines 112-119).
- `src/renderer/src/network/state-types.ts:76-105` — `NetworkGameState` interface; complex fields are typed `unknown` (`initiative: unknown`, line 80). An optional `sceneMode?: unknown` is the matching addition.
- `stores/network-store/network-state-filter.ts:129-186` — `filterGameStateForRole` strips DM-only data from non-host snapshots via an explicit strip-list; un-listed fields pass through. Scene mode is player-visible **by design** (the whole point is that players see the art/caption), so pass-through is correct — but it means the caption must never carry DM-secret text; the panel UI labels it "visible to all players" (35E).
- Per-map-image budget precedent: `game-sync.ts:10` — `MAX_IMAGE_BYTES = 4 * 1024 * 1024`; `encodeMapImage` (lines 14-43) canvas-re-encodes to JPEG q0.85 and downscales if the data URL exceeds 4 MB. Scene art uses the same 4 MB data-URL budget (new local helper in 35E; `encodeMapImage` is module-private and map-specific).

Verify:
```bash
sed -n '10p;14,43p;179,235p' dnd-app/src/renderer/src/network/game-sync.ts
grep -n "buildFullGameStatePayload" dnd-app/src/renderer/src/stores/network-store/index.ts
sed -n '76,105p' dnd-app/src/renderer/src/network/state-types.ts
sed -n '88,121p' dnd-app/src/renderer/src/stores/network-store/client-handlers.ts
```

### F5 — Ambient sound: a complete, synced pipeline already exists

- `src/renderer/src/services/sound-manager.ts:140-149` — `AmbientSound` union: `'ambient-tavern' | 'ambient-dungeon' | 'ambient-forest' | 'ambient-cave' | 'ambient-city' | 'ambient-battle' | 'ambient-tension' | 'ambient-victory' | 'ambient-defeat'` (9 bundled loops under `public/sounds/ambient/`, resolved Pi-first via `resolveSoundUrl`, `sound-playback.ts:44-48`).
- Store-level API: `playAmbient(ambient, opts?)` (`sound-manager.ts:471-479`, applies mute/volume internally), `stopAmbient()` (485-489), `getCurrentAmbient()` (494-496), `subscribeToCurrentAmbient(cb)` (513-518), `getAllAmbientSounds()` (614-616).
- Network sync: `dm:play-ambient` / `dm:stop-ambient` messages (F3) — host plays locally and broadcasts; clients replay via `audio-handlers.ts`. Late joiners get `currentAmbient` via the full snapshot (F4).
- The AI DM can already emit `play_ambient` / `stop_ambient` / `sound_effect` actions (`src/main/ai/dm-actions.ts:390-392`; executors `executePlayAmbient`/`executeStopAmbient` in `services/game-actions/visibility-actions.ts:112-127`) — those executors only play **locally on the host** and do not broadcast; that known gap belongs to the executor phases, not here. Scene mode drives ambient through the DMAudioPanel-style play-and-broadcast pattern (F3), not through the AI executors.

Verify:
```bash
sed -n '140,149p;471,479p;485,496p;513,518p;612,616p' dnd-app/src/renderer/src/services/sound-manager.ts
sed -n '112,127p' dnd-app/src/renderer/src/services/game-actions/visibility-actions.ts
grep -n "play_ambient\|stop_ambient" dnd-app/src/main/ai/dm-actions.ts
```

### F6 — Particle/animation precedent + accessibility hooks

- The map already has a PIXI particle system: `components/game/map/weather-overlay.ts` — `WeatherType = 'rain' | 'snow' | 'ash' | 'hail' | 'sandstorm'`, per-type `{ color, particleCount (100-500), speed, radius, angle }` configs, class `WeatherOverlayLayer` drawing via a single `Graphics` + ticker. It is welded to the PIXI `Application` inside MapCanvas (`MapCanvas.tsx:114,251,278-280`) and renders **under** the DOM overlay stack — not reusable for a DOM overlay that covers the canvas, but its config-table-of-presets shape and particle struct (`{ x, y, phase, speedMul, alpha }`, lines 63-72) are the model for the new Canvas-2D layer.
- Reduced motion: `stores/use-accessibility-store.ts:19` — `reducedMotion: boolean`, defaulted from the OS `prefers-reduced-motion` media query (lines 72-79, persisted at 57/97). New animation honors `useAccessibilityStore((s) => s.reducedMotion)`.
- `crypto-random` helper used by the weather overlay: `cryptoRandom` from `utils/crypto-random` — reuse for particle jitter.

Verify:
```bash
sed -n '1,75p' dnd-app/src/renderer/src/components/game/map/weather-overlay.ts
grep -n "reducedMotion" dnd-app/src/renderer/src/stores/use-accessibility-store.ts | head -5
```

### F7 — Initiative state: the combat-start signal

- `gameStore.initiative` is `null` outside combat; `startInitiative(entries)` (`stores/game/initiative-slice.ts:52-66`) sets it non-null; `endInitiative` returns it to null (line ~298). GameLayout already derives turn state from it (`GameLayout.tsx:281-309`).
- Initiative changes reach clients through the initiative shard / full snapshot, so a **host-side** "initiative became non-null → exit scene" watcher is sufficient: the host exits the scene and broadcasts `dm:scene-mode` with `scene: null`; clients never need their own watcher (and must not have one — only the authoritative side decides).

Verify:
```bash
sed -n '52,66p' dnd-app/src/renderer/src/stores/game/initiative-slice.ts
sed -n '281,290p' dnd-app/src/renderer/src/components/game/GameLayout.tsx
```

### F8 — Image library: storage exists; renderer-readable bytes do NOT

- `src/main/storage/image-library-storage.ts` — `IMAGE_ID_RE = /^[a-zA-Z0-9_-]+$/` (line 7), `ALLOWED_EXTENSIONS = {.png,.jpg,.jpeg,.gif,.webp,.svg}` (line 8), `MAX_IMAGE_SIZE = 10 MB` (line 9). `listImages()` (79-107) returns `{ id, name, fileName, savedAt }[]`; `getImage(id)` (112-128) returns **only a filesystem path** `{ path, name }`.
- IPC: `IMAGE_LIBRARY_SAVE/LIST/GET/DELETE` channels (`src/shared/ipc-channels.ts:227-230`), handlers in `src/main/ipc/storage-handlers.ts:366-388` (save runs `validateUploadExtension` magic-byte check), preload namespace `imageLibrary` (`src/preload/index.ts:460-466`), types `ImageLibraryAPI` (`src/preload/index.d.ts:597-609`, wired at 831).
- **No path → renderer pipeline exists**: nothing registers an `image-library://` protocol (F-dep note above), and no IPC returns image bytes. Every working image consumer in the renderer uses **data URLs** (handout images via `FileReader.readAsDataURL` in `HandoutModal.tsx`, token `imagePath` data URLs in `TokenEditorModal.tsx:112-113`, map `imageData` data URLs on the wire). Conclusion: scene art must be a data URL, and using library images requires a new read-bytes IPC (35E adds `image-library:read-data`).

Verify:
```bash
sed -n '7,9p;79,107p;112,128p' dnd-app/src/main/storage/image-library-storage.ts
sed -n '366,388p' dnd-app/src/main/ipc/storage-handlers.ts
sed -n '460,466p' dnd-app/src/preload/index.ts
grep -rn "image-library://" dnd-app/src --include="*.ts" --include="*.tsx"     # exactly one hit: MapConfigStep.tsx:97
```

### F9 — Map background as a scene-art source

`types/map.ts:8` — `GameMap.imagePath: string`. On the host it may be a bundled relative path (`./maps/…`) or (after client sync) a data URL (`client-handlers.ts:96-101` maps `imageData` → `imagePath`). `MapCanvas` loads it via `Assets.load(map.imagePath)` (`map-canvas/use-map-background.ts:39-43`). A "use current map art" scene source can pass `activeMap.imagePath` through the same canvas-re-encode helper as uploads (drawing a same-origin relative path or data URL into a canvas does not taint it).

Verify:
```bash
sed -n '8p' dnd-app/src/renderer/src/types/map.ts
sed -n '39,43p' dnd-app/src/renderer/src/components/game/map/map-canvas/use-map-background.ts
```

### F10 — Transport budget for the scene broadcast

The transport already carries multi-MB single messages: `dm:map-change` ships map `imageData` up to the 4 MB cap (F4) and `dm:play-custom-audio` ships 1.5 MB base64 audio (F3). There is no application-level chunker in `src/renderer/src/network/transport/` (`grep -rn "chunk" dnd-app/src/renderer/src/network/transport/` → no hits) — whatever the active transport does for 4 MB map images it will do identically for ≤4 MB scene images. Matching the established 4 MB ceiling (rather than inventing a new one) keeps scene mode inside the already-exercised envelope. (Upstream WebRTC guidance recommends ≤16 KiB chunks for raw RTCDataChannel cross-browser use — see Research notes — but this app's Electron-to-Electron transports already accept the 4 MB precedent in production paths.)

Verify:
```bash
grep -rn "chunk" dnd-app/src/renderer/src/network/transport/ | grep -v test    # no hits
grep -n "MAX_IMAGE_BYTES\|MAX_CUSTOM_AUDIO_BASE64" dnd-app/src/renderer/src/network/game-sync.ts dnd-app/src/renderer/src/network/schemas.ts
```

### F11 — DM modal + panel infrastructure (where the control UI plugs in)

- `components/game/active-modal-types.ts` — `ActiveModal` string-literal union (62 lines; `'handout'` at 44, `'aiMapAnalysis'` at 58). Colocated `active-modal-types.test.ts:11` enumerates every literal in a `validModals` array — **adding a literal requires adding it to that array**.
- `modal-groups/DmModals.tsx` — lazy-imports each DM modal (lines 13-30), props `{ activeModal, close, effectiveIsDM, character, activeMap, campaign, broadcast, sendMessage, … }` (lines 33-47); render branches like `{activeModal === 'aiMapAnalysis' && effectiveIsDM && <AiMapAnalysisModal onClose={close} />}` (line 203). `GameModalDispatcher.tsx:134-148` passes the props through.
- `bottom/DMTabPanel.tsx` — `onOpenModal: (modal: string) => void` (line 16); the `'utility'` tab's button row (lines 348-370) is where the launcher button goes (pattern: `<button className={btnClass} onClick={() => onOpenModal('handout')}>{t('game.dmTabPanel.handouts')}</button>`).
- Structural reference for a new dm-tools modal: `modals/dm-tools/AiMapAnalysisModal.tsx:1-30` — `useT()`, `useEscapeKey(onClose)` (hook at `hooks/use-escape-key.ts:10`), local state, store reads via `useGameStore`.

Verify:
```bash
grep -n "aiMapAnalysis\|'handout'" dnd-app/src/renderer/src/components/game/active-modal-types.ts
grep -n "validModals" dnd-app/src/renderer/src/components/game/active-modal-types.test.ts
sed -n '33,47p;203p' dnd-app/src/renderer/src/components/game/modal-groups/DmModals.tsx
sed -n '16p;348,370p' dnd-app/src/renderer/src/components/game/bottom/DMTabPanel.tsx
```

### F12 — i18n conventions

Locales `src/renderer/src/i18n/locales/en.json` + `es.json`; in-game strings live under the `game` group (`game.dmTabPanel` at en.json:949, `game.narrationOverlay.*` exists). Key-union codegen: `npm run i18n:gen-keys` (`package.json:34` → `scripts/i18n/gen-key-union.mjs` → `src/renderer/src/i18n/generated-keys.ts`). Parity tests (`i18n/locale-parity.test.ts`, `key-check.test.ts`) fail if a key exists in only one locale.

Verify:
```bash
grep -n "i18n:gen-keys" dnd-app/package.json
grep -n '"dmTabPanel"' dnd-app/src/renderer/src/i18n/locales/en.json | head -1
```

### F13 — Persistence convention for DM-local preferences

`src/renderer/src/constants/settings-keys.ts:1-21` — `SETTINGS_KEYS` const of `dnd-vtt-*` localStorage keys (e.g. `BOTTOM_BAR_HEIGHT`), consumed via `localStorage.getItem(SETTINGS_KEYS.X)` with try/catch (GameLayout.tsx:115-128 pattern). Scene-panel preferences (last particle choice, auto-exit-on-combat flag) persist the same way.

Verify:
```bash
sed -n '1,21p' dnd-app/src/renderer/src/constants/settings-keys.ts
```

### F14 — `dm:narration` precedent for a host-originated, no-response broadcast

`use-game-handlers.ts:88-92` (`handleReadAloud`: host applies locally + `sendMessage('dm:narration', …)`), `use-game-network.ts:155-169` (in-game listener → `setNarrationText`), `client-handlers/chat-handlers.ts:122-131` (chat fallback). This is the exact lifecycle `dm:scene-mode` copies: host mutates its own store and broadcasts; clients apply on receipt; no acks, no client-originated sends.

Verify:
```bash
sed -n '88,92p' dnd-app/src/renderer/src/hooks/use-game-handlers.ts
sed -n '122,131p' dnd-app/src/renderer/src/stores/network-store/client-handlers/chat-handlers.ts
```

## Sub-phases

Order keeps the tree green: store slice → network plumbing → particle layer → overlay → control UI/IPC → combat auto-exit + polish. Per INSTRUCTIONS rule 5, run only the listed cheap checks per sub-phase; the full 4-gate runs once at phase end.

### 35A — Scene slice in the game store

**Objective.** A typed, test-covered `sceneMode` field on the game store with set/clear actions and reset integration. No UI, no network.

**Files.**
- `src/renderer/src/stores/game/scene-slice.ts` (new)
- `src/renderer/src/stores/game/scene-slice.test.ts` (new)
- `src/renderer/src/stores/game/types.ts` (edit — types + intersection)
- `src/renderer/src/stores/game/index.ts` (edit — compose slice + reset fields)

**Steps.**
1. In `types.ts`, near the other slice-state interfaces (after `TimerSliceState`, line ~220), add:
   ```ts
   // --- Scene mode (Phase 35) ---
   export type SceneParticleEffect = 'none' | 'embers' | 'fireflies' | 'snow' | 'rain' | 'fog' | 'motes'

   /** Player-visible cinematic scene state. `null` = tactical grid (default). */
   export interface SceneModeState {
     /** JPEG/PNG data URL (≤ 4 MB, re-encoded renderer-side) or null for the gradient backdrop. */
     imageData: string | null
     /** Letterbox caption — VISIBLE TO ALL PLAYERS; never DM-secret text. */
     caption: string | null
     particleEffect: SceneParticleEffect
     /** Epoch ms; lets clients key fade-in transitions on scene identity. */
     enteredAt: number
   }

   export interface SceneSliceState {
     sceneMode: SceneModeState | null
     /** Host-local snapshot of the ambient track playing before the scene started (not synced). */
     sceneModePrevAmbient: string | null
     setSceneMode: (scene: SceneModeState | null) => void
     setSceneModePrevAmbient: (ambient: string | null) => void
   }
   ```
   Add `SceneSliceState` to the `GameStoreState` intersection (line ~496).
2. New `scene-slice.ts` mirroring `timer-slice.ts:1-32`:
   ```ts
   export const createSceneSlice: StateCreator<GameStoreState, [], [], SceneSliceState> = (set) => ({
     sceneMode: null,
     sceneModePrevAmbient: null,
     setSceneMode: (scene) => set({ sceneMode: scene }),
     setSceneModePrevAmbient: (ambient) => set({ sceneModePrevAmbient: ambient })
   })
   ```
3. `index.ts`: import + spread `...createSceneSlice(...a)` in the slice block (lines 32-52); add `sceneMode: null, sceneModePrevAmbient: null` to the `reset()` enumeration.
4. `scene-slice.test.ts`: (a) initial `sceneMode === null`; (b) `setSceneMode({...})` → readback; (c) `setSceneMode(null)` clears; (d) `reset()` clears an active scene; (e) `loadGameState({ sceneMode: { imageData: null, caption: 'x', particleEffect: 'embers', enteredAt: 1 } } as never)` lands `sceneMode` in the store (the F2 generic-spread guarantee — this test pins the late-joiner path).

**Cheap checks.**
```bash
cd dnd-app && npx tsc --noEmit -p tsconfig.web.json
npx vitest run src/renderer/src/stores/game/scene-slice.test.ts
```

**Acceptance.** Slice composed; reset clears it; loadGameState spread-path test green; web tsconfig clean.

### 35B — `dm:scene-mode` network message + late-joiner snapshot

**Objective.** Scene state propagates host → clients live and to late joiners via the full snapshot; payloads are zod-validated and size-capped.

**Files.**
- `src/renderer/src/network/message-types.ts` (edit)
- `src/renderer/src/network/schemas.ts` (edit)
- `src/renderer/src/network/schemas.test.ts` (edit — additive cases)
- `src/renderer/src/network/state-types.ts` (edit)
- `src/renderer/src/network/game-sync.ts` (edit)
- `src/renderer/src/network/game-sync.test.ts` (edit — additive case)
- `src/renderer/src/stores/network-store/client-handlers/game-action-handlers.ts` (edit — new handler)
- `src/renderer/src/stores/network-store/client-handlers.ts` (edit — switch case)
- `src/renderer/src/stores/network-store/client-handlers.test.ts` (edit — additive case)

**Steps.**
1. `message-types.ts`: add `'dm:scene-mode'` to `MESSAGE_TYPES` (after `'dm:stop-custom-audio'`, line ~55). Add the payload interface near `NarrationPayload` (line ~398):
   ```ts
   // Phase 35 — cinematic scene mode. `scene: null` returns everyone to the tactical grid.
   export interface SceneModePayload {
     scene: {
       imageData: string | null
       caption: string | null
       particleEffect: 'none' | 'embers' | 'fireflies' | 'snow' | 'rain' | 'fog' | 'motes'
       enteredAt: number
     } | null
   }
   ```
2. `schemas.ts`: near `PlayAmbientPayloadSchema` (line ~409) add:
   ```ts
   // Phase 35 — scene art rides the same 4 MB data-URL budget as dm:map-change imageData.
   const MAX_SCENE_IMAGE_DATA = 4 * 1024 * 1024
   const SceneModePayloadSchema = z.object({
     scene: z
       .object({
         imageData: z.string().max(MAX_SCENE_IMAGE_DATA).nullable(),
         caption: z.string().max(500).nullable(),
         particleEffect: z.enum(['none', 'embers', 'fireflies', 'snow', 'rain', 'fog', 'motes']),
         enteredAt: z.number()
       })
       .nullable()
   })
   ```
   Register `'dm:scene-mode': SceneModePayloadSchema` in `PAYLOAD_SCHEMAS` (line ~624, next to the other `dm:` audio entries).
3. `state-types.ts`: add `sceneMode?: unknown` to `NetworkGameState` (after `partyVisionCells?`, line ~104). (`unknown` matches the `initiative: unknown` convention; the wire shape is enforced by the dm:scene-mode schema, and the snapshot path is host-built/trusted.)
4. `game-sync.ts` `buildFullGameStatePayload()`: add `sceneMode: gs.sceneMode,` to the return object (next to `currentAmbient`, line ~234). Per F2, no client-side change is needed for application — `loadGameState` spreads it — but the 35A test already pins that.
5. `client-handlers/game-action-handlers.ts`: add
   ```ts
   export function handleSceneMode(message: NetworkMessage): void {
     const payload = message.payload as SceneModePayload
     useGameStore.getState().setSceneMode(payload.scene as SceneModeState | null)
   }
   ```
   (import types from `'../../../network'` / `'../../game/types'`; follow the file's existing import style).
6. `client-handlers.ts`: `case 'dm:scene-mode': { handleSceneMode(message); break }` next to the `dm:narration` case (line ~507).
7. Tests (additive):
   - `schemas.test.ts`: `dm:scene-mode` envelope with a valid scene validates; `scene: null` validates; bad `particleEffect` enum rejects; `imageData` over 4 MB rejects (build with `'a'.repeat(MAX + 1)`).
   - `client-handlers.test.ts`: dispatching a `dm:scene-mode` message sets `useGameStore.getState().sceneMode`; a `scene: null` message clears it.
   - `game-sync.test.ts`: `buildFullGameStatePayload()` includes `sceneMode` (set a scene on the store first; follow the file's existing store-seeding pattern).

**Cheap checks.**
```bash
cd dnd-app && npx tsc --noEmit -p tsconfig.web.json
npx vitest run src/renderer/src/network/schemas.test.ts src/renderer/src/stores/network-store/client-handlers.test.ts src/renderer/src/network/game-sync.test.ts
```

**Acceptance.** New message type, schema, handler, and snapshot field all in place and test-pinned; no UI yet; tree green.

### 35C — `SceneParticles` Canvas-2D layer

**Objective.** A self-contained, dependency-free DOM particle layer with six presets, DPR-aware sizing, rAF lifecycle hygiene, and reduced-motion support. Pure step logic is exported for unit tests.

**Files.**
- `src/renderer/src/components/game/overlays/scene/scene-particles-engine.ts` (new — pure logic)
- `src/renderer/src/components/game/overlays/scene/scene-particles-engine.test.ts` (new)
- `src/renderer/src/components/game/overlays/scene/SceneParticles.tsx` (new — React/canvas shell)
- `src/renderer/src/components/game/overlays/scene/SceneParticles.test.tsx` (new)

**Steps.**
1. `scene-particles-engine.ts` (no React, no DOM beyond types — fully unit-testable):
   ```ts
   import type { SceneParticleEffect } from '../../../../stores/game/types'

   export interface SceneParticle { x: number; y: number; phase: number; speedMul: number; alpha: number; size: number }
   export interface ParticlePresetConfig {
     count: number          // at 1920×1080 reference; scale by area
     color: string          // canvas fillStyle
     baseSpeed: number      // px/frame at 60fps, scaled by dt
     baseSize: number
     drift: number          // horizontal sine amplitude
     direction: 'down' | 'up' | 'float'
     blur?: number          // shadowBlur for glow (fireflies/embers)
   }
   export const PARTICLE_PRESETS: Record<Exclude<SceneParticleEffect, 'none'>, ParticlePresetConfig> = {
     embers:    { count: 90,  color: '#ff9a3c', baseSpeed: 0.7, baseSize: 2.2, drift: 18, direction: 'up',    blur: 6 },
     fireflies: { count: 40,  color: '#d8ff7a', baseSpeed: 0.25, baseSize: 2.0, drift: 40, direction: 'float', blur: 8 },
     snow:      { count: 180, color: '#ffffff', baseSpeed: 0.9, baseSize: 2.4, drift: 24, direction: 'down' },
     rain:      { count: 260, color: '#9ec8ef', baseSpeed: 7.5, baseSize: 1.2, drift: 4,  direction: 'down' },
     fog:       { count: 14,  color: '#cfd8dc', baseSpeed: 0.15, baseSize: 160, drift: 60, direction: 'float' },
     motes:     { count: 70,  color: '#e8dcb8', baseSpeed: 0.2, baseSize: 1.6, drift: 30, direction: 'float' }
   }
   export function spawnParticles(effect, width, height, rand?: () => number): SceneParticle[]
   export function stepParticles(particles, config, width, height, dt): void   // mutates in place; wraps at edges
   ```
   `stepParticles`: `down` falls +y and re-spawns at top on exit; `up` rises −y and re-spawns at bottom; `float` sine-drifts both axes via `phase`; all use `speedMul`/`alpha` per-particle variation (model: `weather-overlay.ts:63-72,…` particle struct). Count scales by `(width * height) / (1920 * 1080)` clamped to `[0.25, 1.5]`.
2. `scene-particles-engine.test.ts`: (a) `PARTICLE_PRESETS` covers every `SceneParticleEffect` except `'none'` (assert against a locally-typed exhaustive list — keeps the zod enum in 35B and this table from drifting); (b) `spawnParticles` returns `count`-scaled particles inside bounds (inject a seeded `rand`); (c) `stepParticles` wraps a particle pushed past the bottom edge back to the top for `direction: 'down'` (and the inverse for `'up'`); (d) `dt` scaling: doubling dt doubles displacement.
3. `SceneParticles.tsx`:
   - Props: `{ effect: SceneParticleEffect }`. `effect === 'none'` → return null.
   - `useAccessibilityStore((s) => s.reducedMotion)` → if true, return null (motion suppressed entirely — the static art still communicates the scene; per research, replacing motion with stillness is the recommended fallback).
   - `useRef<HTMLCanvasElement>`; `useEffect` keyed on `effect`: size canvas to container × `devicePixelRatio` (cap DPR at 2 for fill-rate), `spawnParticles`, then a rAF loop computing `dt = Math.min(now - last, 50)` and calling `stepParticles` + a draw pass (single `beginPath`-per-frame batched fills; `shadowBlur` only when the preset sets it). Observe container size with `ResizeObserver` → re-size + re-spawn. Cleanup: `cancelAnimationFrame` + `ResizeObserver.disconnect()` on unmount/effect-change. Per-frame state lives in refs, never React state (re-render-free animation).
   - Render: `<canvas className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />`.
4. `SceneParticles.test.tsx` (jsdom): (a) `effect='none'` renders nothing; (b) `reducedMotion: true` (seed the accessibility store) renders nothing even for `'embers'`; (c) `'embers'` renders a canvas with `aria-hidden`; (d) unmount does not throw (rAF mocked via `vi.stubGlobal('requestAnimationFrame', …)` — jsdom lacks a real one; stub `ResizeObserver` likewise).

**Cheap checks.**
```bash
cd dnd-app && npx tsc --noEmit -p tsconfig.web.json
npx vitest run src/renderer/src/components/game/overlays/scene/scene-particles-engine.test.ts src/renderer/src/components/game/overlays/scene/SceneParticles.test.tsx
```

**Acceptance.** Six presets implemented + exhaustiveness-pinned; reduced-motion suppresses animation; rAF/observer lifecycle leak-free; tree green (component not yet mounted anywhere).

### 35D — `SceneModeOverlay` rendered in GameLayout

**Objective.** The player-facing scene view: full-bleed art (or gradient fallback), vignette, particles, caption letterbox, fade-in, and a DM-only Exit button — driven entirely by `gameStore.sceneMode`.

**Files.**
- `src/renderer/src/components/game/overlays/scene/SceneModeOverlay.tsx` (new)
- `src/renderer/src/components/game/overlays/scene/SceneModeOverlay.test.tsx` (new)
- `src/renderer/src/components/game/GameLayout.tsx` (edit — one render block)
- `src/renderer/src/i18n/locales/en.json` + `es.json` (edit — overlay keys), `generated-keys.ts` (regenerated)

**Steps.**
1. `SceneModeOverlay.tsx`:
   - Props: `{ isDM: boolean; onExit: () => void }`. Reads `const scene = useGameStore((s) => s.sceneMode)`; `if (!scene) return null`.
   - Container: `absolute inset-0 z-[2] overflow-hidden bg-base` (sits inside GameLayout's map-layer div per F1 — above the `z-[1]` tint overlays, below the `z-10` chrome). Intentionally **interactive** (no `pointer-events-none`) so it blocks map clicks/drags underneath while active.
   - Fade-in: mount with `opacity-0`, flip to `opacity-100` on the next rAF, `transition-opacity duration-700`; key the inner content on `scene.enteredAt` so updating a live scene re-fades.
   - Art: `scene.imageData` → `<img src={scene.imageData} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />` (cover-fit — the map-background COVER lesson); else a fallback `bg-gradient-to-b from-gray-900 via-slate-800 to-black`.
   - Vignette: `absolute inset-0` div with `boxShadow: 'inset 0 0 18vmin 6vmin rgba(0,0,0,0.7)'` + top/bottom letterbox bars (`h-[7vh] bg-black/80`) for the cinematic frame.
   - `<SceneParticles effect={scene.particleEffect} />` above the art, below the caption.
   - Caption: when `scene.caption`, a bottom-centered serif block (NarrationOverlay typography: `font-serif text-lg leading-relaxed`, light text with `drop-shadow`, max-w-3xl, `aria-live="polite"`) inside the lower letterbox area.
   - DM Exit affordance: when `isDM`, a top-center pill button (`absolute top-[8vh] left-1/2 -translate-x-1/2`) labeled `t('game.sceneMode.exitScene')` calling `onExit` — mirrors the view-as banner pattern (`GameLayout.tsx:607-615`). Players get no dismiss control (DM-driven view, like handout shares).
   - A11y: container `role="img"` + `aria-label={scene.caption ?? t('game.sceneMode.sceneActive')}`.
2. `GameLayout.tsx`: inside the map-layer container, after the `underwaterCombat` tint (line ~694) and before `<WeatherBanner …/>`, add:
   ```tsx
   <SceneModeOverlay isDM={effectiveIsDM} onExit={handleExitScene} />
   ```
   with a `handleExitScene` `useCallback` that calls `exitSceneMode(sendMessage)` (controller lands in 35E — for THIS sub-phase, inline the two store/broadcast calls and swap to the controller in 35E, or land 35D and 35E in one edit pass; either way the tree stays green because 35E follows immediately). Static import (the overlay is tiny and null-fast; lazy would flash on first scene).
3. i18n: add `game.sceneMode.exitScene`, `game.sceneMode.sceneActive` to both locales; `npm run i18n:gen-keys`.
4. `SceneModeOverlay.test.tsx`: seed `useGameStore` directly; (a) `sceneMode: null` renders nothing; (b) active scene renders the `img` with the data URL and the caption text; (c) `imageData: null` renders the gradient fallback (assert by class) and no `img`; (d) Exit button rendered only when `isDM` and fires `onExit`; (e) `particleEffect: 'none'` renders no canvas.

**Cheap checks.**
```bash
cd dnd-app && npm run i18n:gen-keys && npx tsc --noEmit -p tsconfig.web.json
npx vitest run src/renderer/src/components/game/overlays/scene/SceneModeOverlay.test.tsx src/renderer/src/i18n/locale-parity.test.ts
```

**Acceptance.** With `sceneMode` set on the store (e.g. via devtools or the 35B handler), every role sees the full-bleed scene above the map and below all chrome; DM sees Exit; null state renders nothing; tests green.

### 35E — Scene controller, library-read IPC, and the DM control modal

**Objective.** The DM-facing workflow: a `SceneModeModal` for composing/entering/updating/exiting scenes (image from library / upload / current map / none, caption, particles, ambient), a shared enter/exit controller that owns broadcast + ambient handling, and the `image-library:read-data` IPC that turns stored library images into renderer-usable data URLs.

**Files.**
- `src/shared/ipc-channels.ts` (edit — `IMAGE_LIBRARY_READ_DATA: 'image-library:read-data'` next to lines 227-230)
- `src/main/storage/image-library-storage.ts` (edit — `readImageData(id)`)
- `src/main/storage/image-library-storage.test.ts` (new or edit — readImageData cases)
- `src/main/ipc/storage-handlers.ts` (edit — handler, next to lines 377-388)
- `src/preload/index.ts` (edit — `imageLibrary.readData`)
- `src/preload/index.d.ts` (edit — `ImageLibraryAPI.readData`, line ~609)
- `src/renderer/src/services/game/scene-mode-controller.ts` (new)
- `src/renderer/src/services/game/scene-mode-controller.test.ts` (new)
- `src/renderer/src/services/game/scene-image.ts` (new — downscale/re-encode helper)
- `src/renderer/src/services/game/scene-image.test.ts` (new)
- `src/renderer/src/components/game/modals/dm-tools/SceneModeModal.tsx` (new)
- `src/renderer/src/components/game/modals/dm-tools/SceneModeModal.test.tsx` (new)
- `src/renderer/src/components/game/active-modal-types.ts` + `active-modal-types.test.ts` (edit — `'sceneMode'`)
- `src/renderer/src/components/game/modal-groups/DmModals.tsx` (edit — lazy import + branch)
- `src/renderer/src/components/game/bottom/DMTabPanel.tsx` (edit — utility-tab button)
- `src/renderer/src/components/game/GameLayout.tsx` (edit — top-right quick button + swap inline exit to controller)
- `src/renderer/src/constants/settings-keys.ts` (edit — `SCENE_MODE_PREFS: 'dnd-vtt-scene-mode-prefs'`)
- `src/renderer/src/i18n/locales/en.json` + `es.json` (edit), `generated-keys.ts` (regenerated)

**Steps.**
1. **Main: `readImageData(id)`** in `image-library-storage.ts`: validate `IMAGE_ID_RE`; read `<id>.meta.json` for `fileName`; map extension → mime (`.png→image/png`, `.jpg/.jpeg→image/jpeg`, `.gif→image/gif`, `.webp→image/webp`, `.svg→image/svg+xml`); `readFile` the bytes (≤ `MAX_IMAGE_SIZE` already guaranteed by save); return `{ success: true, data: { dataUrl: \`data:${mime};base64,${buf.toString('base64')}\`, name } }`, error envelope otherwise. Handler: `handle(IPC_CHANNELS.IMAGE_LIBRARY_READ_DATA, async (_e, id: string) => readImageData(id))`. Preload: `readData: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.IMAGE_LIBRARY_READ_DATA, id)`; `index.d.ts`: `readData: (id: string) => Promise<{ success: boolean; data?: { dataUrl: string; name: string }; error?: string }>`. Test (mock `app.getPath` to a temp dir, same approach as the existing storage tests): roundtrip save→readData yields a parseable data URL with the right mime; bad id → error; missing file → error.
2. **Renderer: `scene-image.ts`** — `export async function prepareSceneImage(src: string): Promise<string>`: load `src` (data URL or same-origin path) into an `Image`, draw to canvas capped at 2560×1440 (downscale preserving aspect), `toDataURL('image/jpeg', 0.85)`; if result `> 4 * 1024 * 1024`, rescale by `Math.sqrt(4MB / length) * 0.9` and re-encode at q0.7 (exact `encodeMapImage` algorithm, F4 — reimplemented here because that one is module-private and map-specific). Reject on image load error. Test with a tiny programmatic data URL (1×1 canvas in jsdom — `HTMLCanvasElement.prototype.getContext`/`toDataURL` need a vi mock; assert the cap/branch logic via the mock, mirroring whatever canvas-mock approach `game-sync.test.ts` uses).
3. **Renderer: `scene-mode-controller.ts`** — the single owner of enter/exit semantics (imports `useGameStore`, `useNetworkStore`, sound-manager directly — components-only consumer, no accessor indirection needed):
   ```ts
   export interface EnterSceneOptions {
     imageData: string | null
     caption: string | null
     particleEffect: SceneParticleEffect
     ambient: 'keep' | 'stop' | AmbientSound
     ambientVolume?: number          // 0..1, only when ambient is a track
   }
   export function enterSceneMode(opts: EnterSceneOptions): void
   export function exitSceneMode(): void
   export function isSceneActive(): boolean
   ```
   - `enterSceneMode`: build `scene = { imageData, caption, particleEffect, enteredAt: Date.now() }`; if no scene is currently active, snapshot `setSceneModePrevAmbient(getCurrentAmbient())` (first-enter only — updates keep the original snapshot); `setSceneMode(scene)`; `sendMessage('dm:scene-mode', { scene })`; ambient: `'keep'` → nothing; `'stop'` → `stopAmbient()` + `sendMessage('dm:stop-ambient', {})`; a track → `playAmbient(track)` + `sendMessage('dm:play-ambient', { ambient: track, volume: ambientVolume })` (DMAudioPanel pattern, F3/F5).
   - `exitSceneMode`: no-op when `sceneMode` is null; else `setSceneMode(null)` + `sendMessage('dm:scene-mode', { scene: null })`; ambient restore: read `sceneModePrevAmbient`; if it differs from `getCurrentAmbient()`, restore it (string → `playAmbient(prev)` + broadcast; null → `stopAmbient()` + broadcast); clear the snapshot.
   - Test: mock the three modules (`vi.mock`); assert (a) enter sets store + broadcasts the exact payload, (b) ambient `'keep'` sends no audio message, (c) track-enter then exit restores the pre-scene ambient and broadcasts, (d) double-exit is a no-op (single broadcast), (e) re-enter (update) while active does not overwrite `sceneModePrevAmbient`.
4. **`SceneModeModal.tsx`** (model `AiMapAnalysisModal` per F11; `useEscapeKey(onClose)`):
   - State: `imageSource: 'none' | 'upload' | 'library' | 'current-map'`, `imageData: string | null`, `imageBusy`, `caption` (≤500 chars, with a visible "(visible to all players)" hint — F4 pass-through note), `particleEffect`, `ambientChoice: 'keep' | 'stop' | AmbientSound` (options from `getAllAmbientSounds()`, F5), `autoExitOnCombat: boolean`.
   - Prefs: on mount, hydrate `particleEffect`/`ambientChoice`/`autoExitOnCombat` from `localStorage[SETTINGS_KEYS.SCENE_MODE_PREFS]` (JSON, try/catch per F13); persist on every change. Default `autoExitOnCombat: true` (the headline "grid for fights" behavior; only ever consulted while a DM-initiated scene is active, so default-on is not a behavior change for anyone not using the feature).
   - Image sources: **Upload** — `<input type="file" accept="image/*">` → `FileReader.readAsDataURL` → `prepareSceneImage`; **Library** — `window.api.imageLibrary.list()` into a name-sorted select/grid (show `aiimg-*` entries like any other), on pick `window.api.imageLibrary.readData(id)` → `prepareSceneImage`; **Current map** — `prepareSceneImage(activeMap.imagePath)` (F9; disabled when no active map); **None** → gradient backdrop. Show a small preview `<img>` when `imageData` set; surface helper errors inline.
   - Actions: when no scene active → "Enter scene" calls `enterSceneMode({...})` and closes; when active (`useGameStore((s) => s.sceneMode)` non-null) → "Update scene" (same call; keeps `prevAmbient` per controller) and "Exit scene" (`exitSceneMode()`).
   - Test: mock `window.api.imageLibrary`, the controller module, and stores; assert (a) Enter passes the composed options to `enterSceneMode`, (b) library pick calls `readData` with the chosen id, (c) Exit button only when a scene is active and calls `exitSceneMode`, (d) prefs roundtrip localStorage, (e) caption input caps at 500.
5. **Registration**: `active-modal-types.ts` append `| 'sceneMode'`; add `'sceneMode'` to `validModals` in the test (F11). `DmModals.tsx`: `const SceneModeModal = lazy(() => import('../modals/dm-tools/SceneModeModal'))` + `{activeModal === 'sceneMode' && effectiveIsDM && <SceneModeModal onClose={close} />}` (next to the `aiMapAnalysis` branch, line ~203). `DMTabPanel.tsx` utility tab (line ~351): `<button className={btnClass} onClick={() => onOpenModal('sceneMode')}>{t('game.dmTabPanel.sceneMode')}</button>`.
6. **GameLayout quick toggle**: in the top-right cluster next to `MapSelector` (line ~837), DM-only:
   ```tsx
   {effectiveIsDM && (
     <button type="button" onClick={() => (gameStore.sceneMode ? handleExitScene() : setActiveModal('sceneMode'))} … >
       {gameStore.sceneMode ? t('game.sceneMode.backToGrid') : t('game.sceneMode.openScene')}
     </button>
   )}
   ```
   (reuse the Reset View button's classes; active state gets the amber accent like ViewModeToggle's player state). Swap 35D's inline `handleExitScene` body to `exitSceneMode()` from the controller.
7. i18n: `game.dmTabPanel.sceneMode` + `game.sceneMode.*` (≈28 keys: title, imageSource, sourceNone, sourceUpload, sourceLibrary, sourceCurrentMap, uploadButton, libraryEmpty, libraryPickLabel, imageBusy, imageError, preview, caption, captionHint, captionPlaceholder, particles + 7 option labels (none/embers/fireflies/snow/rain/fog/motes), ambient, ambientKeep, ambientStop, autoExitOnCombat, enterScene, updateScene, exitScene, backToGrid, openScene, sceneActive, combatAutoExit) in BOTH locales (proper Spanish); `npm run i18n:gen-keys`.

**Cheap checks.**
```bash
cd dnd-app && npm run i18n:gen-keys && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json
npx vitest run src/main/storage/image-library-storage.test.ts src/renderer/src/services/game/scene-mode-controller.test.ts src/renderer/src/services/game/scene-image.test.ts src/renderer/src/components/game/modals/dm-tools/SceneModeModal.test.tsx src/renderer/src/components/game/active-modal-types.test.ts
```

**Acceptance.** DM can compose and enter a scene from all four image sources; enter/update/exit round-trips through the controller with correct broadcasts and ambient snapshot/restore; library images resolve to data URLs through the new IPC (magic-byte-validated at save time, id-validated at read); quick toggle in the control cluster; all registration tests green.

### 35F — Combat auto-exit + session-lifecycle hygiene

**Objective.** "One-click toggle back to the tactical map when combat starts" becomes automatic: when initiative begins while a scene is active (and the DM pref is on), the host exits the scene for everyone, with a toast explaining why.

**Files.**
- `src/renderer/src/hooks/use-scene-auto-exit.ts` (new)
- `src/renderer/src/hooks/use-scene-auto-exit.test.ts` (new)
- `src/renderer/src/components/game/GameLayout.tsx` (edit — mount the hook)

**Steps.**
1. `use-scene-auto-exit.ts`:
   ```ts
   export function useSceneAutoExit(isAuthority: boolean): void
   ```
   - Subscribes `useGameStore((s) => s.initiative !== null)` (boolean selector → renders only on transitions).
   - `useEffect` on that boolean + `isAuthority`: on a `false → true` transition (track previous in a ref, F7 turn-banner pattern at `GameLayout.tsx:293-309`) when `isAuthority && useGameStore.getState().sceneMode` and the persisted pref `autoExitOnCombat !== false` (read `SETTINGS_KEYS.SCENE_MODE_PREFS`, try/catch): call `exitSceneMode()` + `addToast(t('game.sceneMode.combatAutoExit'), 'info')`.
   - `isAuthority` = the side that owns game state: pass `networkRole !== 'client'` from GameLayout (host or solo — matches the auto-token-placement gate at `GameLayout.tsx:407-408`; clients receive the resulting `dm:scene-mode` broadcast instead of deciding locally).
2. GameLayout: `useSceneAutoExit(networkRole !== 'client')` near the other hook mounts (after `useGameNetwork`, line ~513).
3. `use-scene-auto-exit.test.ts` (renderHook): seed store with an active scene; flip `initiative` from null to a populated object; assert `exitSceneMode` (mocked) fires once for authority + pref-on, not for `isAuthority: false`, not when pref is `false`, not when no scene is active, and not on subsequent initiative *changes* (only the null→non-null edge).

**Cheap checks.**
```bash
cd dnd-app && npx tsc --noEmit -p tsconfig.web.json
npx vitest run src/renderer/src/hooks/use-scene-auto-exit.test.ts
```

**Acceptance.** Starting initiative with a scene up returns every connected view to the grid (host decision, broadcast-propagated); pref-off leaves the scene up; edge-triggered (round advances don't re-fire).

## Research notes

- **Product pattern (why a scene/grid split, not a new "scene" document type).** Alchemy VTT is built scene-first — "cinematic immersion and theater of the mind" with ambient sound, motion effects, and immersive art as the GM's primary tools, grid combat as the secondary mode ([alchemyrpg.com](https://alchemyrpg.com/), [StartPlaying's Alchemy guide](https://startplaying.games/blog/virtual-table-tops/the-new-players-guide-to-alchemy-rpg), [Alchemy VTT overview](https://startplaying.games/blog/posts/alchemy-vtt-what-how-to)). Foundry retrofits prove the demand and validate the overlay approach: **Storyteller's Cinema** activates a "Cinematic Mode" that *hides tactical elements (grid, tiles, drawings, non-portrait tokens)* behind full-screen mood overlays (film grain / vignette), driven from a GM control tray, with per-scene default modes and instant cross-client sync ([foundryvtt.com/packages/storyteller-cinema](https://foundryvtt.com/packages/storyteller-cinema)); **Theater of the Mind Manager** tags *sounds and lights to images* so switching the displayed image switches the soundscape — the image+ambient coupling this phase's modal implements ([foundryvtt.com/packages/totm-manager](https://foundryvtt.com/packages/totm-manager), [GitHub](https://github.com/LichFactory-Games/TotM-Manager)). Both ship as overlays on the existing scene rather than a separate document — confirming the "leave MapCanvas mounted, draw on top" design.
- **Canvas-2D + rAF over PIXI or CSS for the particle layer.** The map's PIXI weather overlay lives inside the map's `Application` and z-stack (F6) and cannot draw above DOM chrome; a second full PIXI app for ~100 particles is wasteful. MDN/web.dev canvas guidance: batch draw calls, avoid per-frame state churn, size for DPR, and prefer `requestAnimationFrame` over timers ([MDN Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas), [web.dev canvas performance](https://web.dev/articles/canvas-performance), [DebugBear on rAF](https://www.debugbear.com/blog/requestanimationframe)). React specifics: keep per-frame mutable state in refs (never `useState`), set up/tear down the loop in `useEffect` with `cancelAnimationFrame` cleanup ([CSS-Tricks canvas particles](https://css-tricks.com/adding-particle-effects-to-dom-elements-with-canvas/), [io digital particle background walkthrough](https://techhub.iodigital.com/articles/particle-background-effect-with-canvas)). Clamping `dt` (≤50 ms) prevents teleporting particles after a background-tab stall.
- **Reduced motion.** Honoring `prefers-reduced-motion` for canvas animation means replacing motion with a static alternative, and reacting to live preference changes ([web.dev prefers-reduced-motion](https://web.dev/articles/prefers-reduced-motion), [Josh Comeau's React patterns](https://www.joshwcomeau.com/react/prefers-reduced-motion/), [MDN reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)). The app already centralizes this (accessibility store seeds from the media query, F6), so the particle layer reads the store rather than the raw media query — user overrides in Settings are respected automatically.
- **Payload size.** Raw RTCDataChannel guidance is conservative (≤16 KiB chunks cross-browser; Chromium's receive ceiling historically 256 KiB) ([Lennart Grahl's analysis](https://lgrahl.de/articles/demystifying-webrtc-dc-size-limit.html), [WebRTC for the Curious — data communication](https://webrtcforthecurious.com/docs/07-data-communication/), [Mozilla on large data-channel messages](https://blog.mozilla.org/webrtc/large-data-channel-messages/)). This app's transports already ship 4 MB map images and 1.5 MB audio payloads in production paths (F10), so the scene image reuses the proven 4 MB data-URL ceiling and the same canvas-JPEG re-encode that enforces it, rather than introducing a chunker in this phase.
- **Alternatives considered.** (a) *A `scenes` campaign collection with its own editor* — rejected for v1: the modal + image library covers the workflow with zero new persistence surfaces; a scene library can layer on later (pairs with PHASE-37 seed packs). (b) *Syncing scene state through a new sync shard* — rejected: shards exist for high-churn diffable collections; scene mode is a single low-frequency value, and the `dm:narration` broadcast + full-snapshot pattern (F14/F4) is simpler and already battle-tested. (c) *Hiding/unmounting MapCanvas during scenes* — rejected: destroys PIXI camera state and risks WebGL context churn; overlaying is what Storyteller's Cinema does and keeps the grid one state-flip away. (d) *CSS-only particle effects* — rejected: per-particle DOM nodes (100-260 elements animating) cost more than one canvas, and the presets need per-particle randomness.

## Test plan

- **35A** `stores/game/scene-slice.test.ts` — defaults, set/clear, reset, `loadGameState` spread path.
- **35B** `network/schemas.test.ts` (+valid/null/enum-reject/size-reject for `dm:scene-mode`), `stores/network-store/client-handlers.test.ts` (+apply/clear), `network/game-sync.test.ts` (+snapshot field).
- **35C** `overlays/scene/scene-particles-engine.test.ts` — preset exhaustiveness, spawn bounds, wrap/step/dt math; `SceneParticles.test.tsx` — none/reduced-motion/canvas render, clean unmount.
- **35D** `overlays/scene/SceneModeOverlay.test.tsx` — null state, art + caption render, gradient fallback, DM-only exit, particles gating; locale parity stays green.
- **35E** `main/storage/image-library-storage.test.ts` (readData roundtrip/mime/errors), `services/game/scene-mode-controller.test.ts` (broadcast + ambient snapshot/restore), `services/game/scene-image.test.ts` (downscale/cap), `modals/dm-tools/SceneModeModal.test.tsx` (sources, prefs, enter/update/exit), `active-modal-types.test.ts` (+`'sceneMode'`).
- **35F** `hooks/use-scene-auto-exit.test.ts` — edge-trigger, authority gate, pref gate, idle when no scene.
- **End-of-phase 4-gate** (INSTRUCTIONS rule 5, once after 35F): `cd dnd-app && npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run`. No Pi code is touched, so no pytest leg.

## Acceptance criteria

1. With no scene entered, the app is behaviorally identical to before except: a "Scene" button in the DM utility tab + top-right cluster, and the new (inert) IPC/message registrations. `useGameStore.getState().sceneMode === null` by default (test-proven).
2. DM enters a scene → DM and every connected player see the full-bleed art (or gradient), caption, and particle layer above the map and below all chrome; map interaction beneath is blocked; sidebar/chat/bottom bar remain usable. The broadcast is a schema-validated `dm:scene-mode` message ≤ 4 MB.
3. A player joining mid-scene receives the scene via the `game:state-full` snapshot (snapshot field test-pinned) and, per the existing `currentAmbient` hydration, the running ambient loop.
4. Scene ambient selection plays host-side and broadcasts through the existing `dm:play-ambient`/`dm:stop-ambient` messages; exiting restores the pre-scene ambient state (controller test-pinned).
5. Starting initiative while a scene is active auto-exits the scene everywhere (host-decided, default-on, DM-disableable via the persisted pref) with an explanatory toast; manual exit works from the overlay button, the modal, and the quick toggle.
6. Image sources all work: file upload, image-library entries (via the new `image-library:read-data` IPC — id-regex-validated, mime-mapped), the active map's background, and "none". Every image is re-encoded/downscaled renderer-side to the 4 MB ceiling before broadcast.
7. `reducedMotion` users get static art (no particle animation). Caption is announced via `aria-live`; the overlay carries `role="img"` + label.
8. All new strings exist in both locales (parity tests green); all new IPC channels in `ipc-channels.ts`; the new network message is in `MESSAGE_TYPES` + `PAYLOAD_SCHEMAS`; TS strict throughout (no bare `any`); full 4-gate green.

## Out of scope

- **AI-emittable scene actions** (an `enter_scene`/`exit_scene` DM action the model can emit) — future follow-up after the executor work (PHASE-08) settles; would also need the broadcast gap in `executePlayAmbient` (F5) fixed first.
- **A `/scene` chat command** — PHASE-09 owns the command registry cleanup; the modal + toggle are the only entry points this phase.
- **AI generation of scene art** — PHASE-33 (its `scene` preset outputs land in the image library, which this phase's picker reads).
- **Text-to-battlemap / tactical map generation** — PHASE-34.
- **Fixing `MapConfigStep.tsx:97`'s orphaned `image-library://` scheme** for campaign map backgrounds — pre-existing bug; log it (INSTRUCTIONS rule 12) if not already in `docs/ISSUES-LOG-DNDAPP.md`; the 35E `read-data` IPC is the building block a future fix can use.
- **Broadcasting the AI executors' ambient actions** (`executePlayAmbient` is host-local-only, F5) — belongs with the executor-correctness work, not here.
- **A persisted scene library / scene documents with per-scene light+sound tags** (TotM-Manager-style) — v2 candidate; pairs with PHASE-37 seed packs.
- **Animated scene art (video/webm backdrops)** and **audio-reactive effects** — out entirely; static art + particles only.
- **Per-scene NPC portrait "stage" / dialogue subtitles** (Storyteller's Cinema's Director Mode) — would couple to PHASE-25 entity records; not here.

## Completed

<!-- Filled during execution per INSTRUCTIONS.md rule 17 (per-sub-phase file:line citations + one-line summaries). -->
