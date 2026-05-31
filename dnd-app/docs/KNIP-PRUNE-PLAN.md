# Knip unused-exports prune — ready-to-apply plan

> Classified by the `w5b-curation` workflow (2026-05-30) + verified. dnd-app is an
> internal Electron app (no external consumers), so a truly-unimported export is dead.
> **Non-blocking** — knip runs `continue-on-error` in CI. This is dead-code cleanup, not a
> correctness fix. Apply in tsc(both)+knip+test+build-gated waves; per item, remove the
> `export` keyword if the symbol is still used in its own file, else delete the declaration.

- **89 safe-delete** (22 types, 67 exports)
- **229 keep-intentional** (public API / barrels / `@internal` knip-wired re-exports — do NOT delete; consider a knip-ignore)
- **6 unsure** (review before touching)

## Safe-delete (by file)

### `src/main/ai/ai-trigger-observer.ts`
- `evaluateTriggers` (export) — ai-handlers imports only processStateUpdate + GameStateSnapshot from this module; evaluateTriggers has zero consumers an
- `isObserverRunning` (export) — Zero consumers; not imported by ai-handlers, no dynamic ref.
- `startObserver` (export) — Zero consumers; ai-handlers does not import it and there is no dynamic/IPC ref to this name.
- `stopObserver` (export) — Zero consumers; not imported by ai-handlers, no dynamic ref.

### `src/main/ai/ai-vision.ts`
- `captureTokenPositions` (export) — ai-handlers imports only analyzeMapState/captureMapScreenshot/MapStateForVisionAnalysis; this export has zero consumers 
- `encodeForVision` (export) — Zero consumers; not imported by ai-handlers, no dynamic ref.

### `src/main/ai/claude-client.ts`
- `getClaudeApiKey` (export) — Getter half of a set/get pair; setClaudeApiKey is used but the getter has zero consumers in repo and no dynamic ref.

### `src/main/ai/gemini-client.ts`
- `getGeminiApiKey` (export) — Getter half of a set/get pair; setGeminiApiKey is used by provider-registry but the getter has zero consumers and no dyn

### `src/main/ai/llm-provider.ts`
- `AI_PROVIDER_LABELS` (export) — Used in-file by the LLM error classes (lines 75/87/99); the export is unconsumed externally (the renderer imports a diff
- `LLMAuthError` (export) — Instantiated + instanceof-checked in-file by classifyProviderError (lines 117/125); no module imports the class name. Ex
- `LLMProviderError` (export) — Instantiated + instanceof-checked in-file by classifyProviderError (lines 117/134); no external importer. Export keyword
- `LLMRateLimitError` (export) — Instantiated + instanceof-checked in-file by classifyProviderError (lines 117/131); no external importer. Export keyword

### `src/main/ai/ollama-manager.ts`
- `LINUX_INSTALL_MARKER` (export) — Used in-file (lines 234/309) as a sentinel; export keyword unconsumed externally. Drop export only; symbol stays interna
- `MACOS_BREW_MARKER` (export) — Used in-file (lines 239/313) as a sentinel; export keyword unconsumed externally. Drop export only; symbol stays interna

### `src/main/ai/openai-client.ts`
- `getOpenAIApiKey` (export) — Getter half of a set/get pair; setOpenAIApiKey is used by provider-registry but the getter has zero consumers and no dyn

### `src/main/storage/game-state-storage.ts`
- `GAME_STATE_SCHEMA_VERSION` (export) — Used in-file (lines 14/71/94/96/99); export keyword has no external consumer. Drop export only; symbol stays internal.
- `migrateGameState` (export) — Called in-file (lines 94/96/99) inside loadGameState; export keyword has no external consumer. Drop export only; symbol 

### `src/main/storage/image-library-storage.ts`
- `ImageLibraryEntry` (type) — Standalone interface, single occurrence (declaration only), zero importers and no in-file use. Dead.

### `src/main/storage/settings-storage.ts`
- `SETTINGS_SCHEMA_VERSION` (export) — Used in-file (lines 13/77/82/86); export keyword has no external consumer. Drop export only; symbol stays internal.

### `src/renderer/src/components/game/map/light-animation.ts`
- `clearAllAnimations` (export) — Called in-file (line 211); export keyword unconsumed externally. Drop export only; symbol stays internal.
- `unregisterLightAnimation` (export) — Only the definition exists; no in-file caller and no external consumer (unlike its used siblings clearAllAnimations/upda
- `updateLightAnimations` (export) — Called in-file (line 196 in the ticker); export keyword unconsumed externally. Drop export only; symbol stays internal.

### `src/renderer/src/components/game/map/map-canvas/grid-coord.ts`
- `columnLabel` (export) — Used in-file (line 25); map-utils.ts has its own private columnLabel and does not import this one. Export keyword remova

### `src/renderer/src/components/game/map/map-overlay-effects.ts`
- `getActiveEffects` (export) — Not consumed by MapCanvas or any test; no dynamic ref.
- `isEffectPlaying` (export) — Not consumed by MapCanvas or any test; no dynamic ref.
- `startEffect` (export) — MapCanvas imports only the useMapOverlayEffects hook, not this function. Zero consumers in app or tests.
- `stopEffect` (export) — Not consumed by MapCanvas (which uses the hook) or any test; no dynamic ref.

### `src/renderer/src/components/game/map/region-layer.ts`
- `clearRegionLayer` (export) — Only the definition exists; no importer in app or tests, no dynamic ref.

### `src/renderer/src/components/game/map/token-animation.ts`
- `cancelTokenAnimation` (export) — Only the definition exists; no importer in app or tests, no dynamic ref.
- `isTokenAnimating` (export) — Only the definition exists; no importer in app or tests, no dynamic ref.

### `src/renderer/src/components/game/overlays/DmAlertTray.tsx`
- `dismissDmAlert` (export) — Used in-file (line 137 onClick); export keyword has no external consumer. Drop export only; symbol stays internal.

### `src/renderer/src/components/ui/OllamaModelList.tsx`
- `formatBytes` (export) — Used in-file (line 143 JSX); export keyword unconsumed externally. Drop export only; symbol stays internal.
- `timeAgo` (export) — Used in-file (line 145 JSX); export keyword unconsumed externally. Drop export only; symbol stays internal.

### `src/renderer/src/constants/z-index.ts`
- `ZLayer` (type) — `type ZLayer = keyof typeof Z`; appears ONLY in its declaration and the constants/index.ts barrel re-export — no consume

### `src/renderer/src/i18n/config.ts`
- `SUPPORTED_LOCALES` (export) — Used in-file (line 10) to derive SupportedLocale; export keyword unconsumed externally. i18n only has 'en'. Drop export 
- `SupportedLocale` (type) — Derived alias (typeof SUPPORTED_LOCALES)[number]; zero importers and no in-file use. Dead, trivially re-derivable.

### `src/renderer/src/network/host-replay-buffer.ts`
- `unregisterClientBuffer` (export) — Sibling registerClientBuffer is used widely, but unregisterClientBuffer has zero callers (tests only mock registerClient

### `src/renderer/src/network/message-types.ts`
- `BatchPayload` (type) — Standalone payload interface, single occurrence, zero importers, no schema parity check. Dead.
- `ColorPreviewPayload` (type) — Standalone payload interface, zero refs outside file, no schema parity. Dead.
- `ResyncRequestPayload` (type) — Standalone payload interface (line 214), distinct from SyncResyncRequestPayload; zero importers, no schema-parity assert
- `StateResyncPayload` (type) — Standalone payload interface, zero refs outside message-types, no schema/parity counterpart. Dead.
- `StopAmbientPayload` (type) — Canonical source def (Record<string,never>); never used as a type anywhere (only a separate StopAmbientPayloadSchema is 
- `SyncDeltaPayload` (type) — Standalone payload interface, zero refs outside file, no schema parity. Dead.
- `WhisperReceivedPayload` (type) — Standalone payload interface, zero refs outside file, no schema parity. Dead.

### `src/renderer/src/network/msgpack-codec.ts`
- `GZIP_THRESHOLD_BYTES` (export) — Used in-file (line 93 threshold default); export keyword unconsumed externally. Drop export only; symbol stays internal.
- `WIRE_TAG_MSGPACK` (export) — Used in-file by encode/decode (lines 100/112/140); export keyword unconsumed externally. Drop export only; symbol stays 
- `WIRE_TAG_MSGPACK_GZIP` (export) — Used in-file by encode/decode (lines 97/143); export keyword unconsumed externally. Drop export only; symbol stays inter
- `encodeMessageSync` (export) — No in-file caller and no external consumer; the async encodeMessage is the one used by host/client-manager. Genuinely de

### `src/renderer/src/network/peer-manager.ts`
- `getHost` (export) — Not in the network/index.ts barrel, not meta-tested, never called; the customHost var it reads is consumed directly by o
- `setHost` (export) — Not re-exported by network/index.ts barrel, not meta-tested, and never called; customHost is set by setSignalingServer/r

### `src/renderer/src/network/registry-client.ts`
- `heartbeatGame` (export) — Module is imported elsewhere but heartbeatGame specifically has zero callers; host-announce runs its own heartbeat. No d

### `src/renderer/src/pages/library/LibraryFilters.tsx`
- `CR_OPTIONS` (export) — Redundant pass-through re-export from library-constants; LibraryFilters itself doesn't use it and nobody imports it from
- `SIZE_OPTIONS` (export) — Redundant pass-through re-export from library-constants; no importer of LibraryFilters. Real consumers import SIZE_OPTIO
- `TABS` (export) — Redundant pass-through re-export from library-constants; no importer of LibraryFilters. The TABS that appear elsewhere a
- `TYPE_OPTIONS` (export) — Redundant pass-through re-export from library-constants; no importer of LibraryFilters.
- `sizeOrder` (export) — Redundant pass-through re-export from library-constants; no importer of LibraryFilters.

### `src/renderer/src/services/character/spell-data.ts`
- `loadSpells` (export) — No importer; the loadSpells hits in preload are a different window-API IPC method on a different file, not this function

### `src/renderer/src/services/combat/combat-resolver.ts`
- `resolveAttack` (export) — Dead duplicate: the active resolveAttack lives in attack-resolver.ts (imported by chat-commands + 4 tests). This combat-

### `src/renderer/src/services/data-provider.ts`
- `load5eEncounterBudgets` (export) — One of 83 load5e* loaders; this one has no production caller and no dynamic dispatch (each loader is a named export call
- `load5eSounds` (export) — Dead wrapper over load5eSoundEvents; the sound UI uses the static SOUND_INVENTORY, not this loader. No production caller

### `src/renderer/src/services/game/token-stats.ts`
- `lookupTokenStatBlock` (export) — Called in-file (lines 97/132); export keyword has no external consumer. Drop export only; symbol stays internal.

### `src/renderer/src/services/io/combat-log-export.ts`
- `filterCombatLog` (export) — Only the definition exists; no importer in app or tests, no dynamic ref.
- `saveCombatLogToFile` (export) — Only the definition exists; no importer in app or tests, no dynamic ref.

### `src/renderer/src/services/io/homebrew-io.ts`
- `exportHomebrew` (export) — Only the definition exists; no importer in app or tests, no dynamic ref.

### `src/renderer/src/services/io/import-export.ts`
- `isImportablePreferenceKey` (export) — Called in-file (lines 229/504); export keyword has no external consumer. Drop export only; symbol stays internal.

### `src/renderer/src/services/library-service.ts`
- `SOUND_INVENTORY` (export) — Redundant re-export (line 59); the real source is sound-inventory.ts, which library-service already imports directly at 

### `src/renderer/src/services/library-sort-filter.ts`
- `LibrarySortFilterState` (type) — Standalone interface, single occurrence (declaration only), no importer or in-file use. Dead.
- `loadCategoryCounts` (export) — Only the definition exists; no importer, no dynamic ref.

### `src/renderer/src/services/library/library-item-builders.ts`
- `ingestIntoLibraryStore` (export) — Called in-file (line 36) only; the use-config-store hit is a code comment, not an import. Export keyword removable; symb

### `src/renderer/src/services/library/schemas/base.ts`
- `BaseLibraryEntryParsed` (type) — z.infer alias of BaseLibraryEntrySchema with zero importers and no in-file use; trivially re-derivable. Dead alias (sche

### `src/renderer/src/services/library/use-library-entry.ts`
- `useHydratedClassList` (export) — v4->v3 classRef hydration hook with zero consumers in app or tests; no dynamic ref. Part of the documented library-hydra
- `useHydratedInstances` (export) — Library hydration hook with zero consumers in app or tests; no dynamic ref. Part of the documented library-hydration API

### `src/renderer/src/services/macro-engine.ts`
- `MacroSyntaxError` (export) — Thrown + instanceof-checked in-file extensively (lines 150-235); the macro-engine test references the string in a descri

### `src/renderer/src/test-helpers.ts`
- `createLoggerMock` (export) — Shared test helper with zero consumers (only its own JSDoc example references it); no test imports it.
- `setupWindowApiMock` (export) — Shared test helper with zero consumers (only its own JSDoc example references it); no test imports it.

### `src/renderer/src/types/data/world-data-types.ts`
- `CurseData` (type) — Flat standalone interface, zero importers, no aggregate references it. Dead.
- `EnvironmentalEffectData` (type) — Flat standalone interface, zero importers, no aggregate references it. Dead.
- `HazardData` (type) — Flat standalone interface, zero importers, no aggregate references it. Dead.
- `PoisonData` (type) — Flat standalone interface, zero importers, no aggregate references it. Dead.
- `SupernaturalGiftData` (type) — Flat standalone interface, zero importers, no aggregate references it. Dead.
- `TrapData` (type) — Flat standalone interface, zero importers, not a member of any aggregate or live type; only the data barrel forwards it.

### `src/renderer/src/types/library.ts`
- `LibraryArmorEntry` (type) — Standalone interface, zero refs, not consumed. Dead.
- `LibraryMagicItemEntry` (type) — Standalone interface, zero refs, not consumed. Dead.
- `LibrarySpellEntry` (type) — Standalone interface extends BaseLibraryEntry; zero importers, not a member of any used type (LibraryItem/LibraryEntry a
- `LibraryWeaponEntry` (type) — Standalone interface, zero refs anywhere, not used by live LibraryItem/LibraryEntry. Dead.
- `isEntryRef` (export) — Runtime type guard with zero consumers in app or tests; no dynamic/string ref.

### `src/renderer/src/utils/chat-links.ts`
- `parseChatLinks` (export) — Called in-file (line 164); export keyword has no external consumer. Drop export only; symbol stays internal.

### `src/shared/ipc-schemas.ts`
- `AiProviderTypeSchema` (export) — Used in-file (AiConfigSchema line 6) but the export keyword has no external consumer. The renderer's AI_PROVIDER labels 
- `LanGameRemovedSchema` (export) — Only its own ValidatedLanGameRemoved type (itself unused) references it. LAN game-removed validation was never wired int

## Unsure (review first)

- `src/shared/ipc-schemas.ts` :: `ValidatedSecurityEvent` (type) — z.infer alias of used SecurityEventSchema; no TS importer but part of the consistent 'every schema gets a Validated* alias' IPC-validation s
- `src/shared/ipc-schemas.ts` :: `ValidatedLanGameRemoved` (type) — z.infer convenience alias; schema used, alias has no importer. Same schema-surface consistency concern as siblings.
- `src/shared/ipc-schemas.ts` :: `ValidatedSyncEvent` (type) — z.infer alias of SyncEventSchema (schema used at runtime); alias itself unimported, part of Validated* surface.
- `src/shared/ipc-schemas.ts` :: `ValidatedInitiativeSync` (type) — z.infer alias of InitiativeSyncSchema; alias unimported, schema-derived convenience surface.
- `src/main/ipc/cloud-sync-handlers.ts` :: `CloudSyncStatusResult` (type) — IPC return-shape interface mirrored independently in preload/index.d.ts (knip-ignored). No TS importer of the handler-side copy but document
- `src/main/ipc/cloud-sync-handlers.ts` :: `CampaignBackupResult` (type) — IPC return-shape mirrored in preload/index.d.ts; no TS importer of handler copy but documents IPC contract shape.
