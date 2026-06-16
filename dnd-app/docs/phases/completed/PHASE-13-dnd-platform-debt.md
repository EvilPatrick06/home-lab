# PHASE-13 — dnd-app platform debt: security hardening, dead-end wiring, and shared scaffolding

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Close the dnd-app platform-debt grab-bag from the 2026-06-10 audit: one real path-traversal hole (ten AI IPC handlers accept unsanitized `campaignId`s that flow into filesystem paths), one deferred security item (BOOK_IMPORT skips the dialog allowlist that already exists), a set of shipped-but-dead features that either get finished or honestly removed (wizard audio preview/upload, group-roll P2P round-trip, mic settings, trigger spawn placement, trigger kill switch, compendium/map-pin deep-links, library official counts, container weight recursion), shared scaffolding other phases build on (`ModalScaffold`, bundle-size CI guard), the `@google/generative-ai` → `@google/genai` SDK migration (upstream support ended 2025-11-30), dead-code removal (`AttackRequest`, underscore type aliases), 3D-dice texture/UV polish, the config-store content-merge decoupling prerequisite, and the cleanup of five orphaned "logged to ISSUES-LOG" code comments whose log entries never existed. Two audit items turned out already shipped (backup-migration framework, co-DM state filtering) and are closed here with evidence.

## Dependencies & cross-phase notes

- **No prerequisite phases** (index row 13: depends on —). Phases run in numeric order, so PHASE-01–12 land first; the notes below assume that.
- **`src/main/ipc/ai-handlers.ts`** (sub-phase 13A) is also edited by PHASE-02 (mutation validation), PHASE-04 (approval hygiene), PHASE-06 (AI_CANCEL_SCENE), PHASE-07 (restore/load), PHASE-11 (chat schema). All run before 13. Re-verify the handler line numbers cited in 13A before editing; the channel names are the stable anchors, not the line numbers.
- **`src/main/ai/gemini-client.ts`** (sub-phase 13P): PHASE-03 rewrites its streaming path on the OLD SDK (`@google/generative-ai@0.24.1`) — per-request `SingleRequestOptions.signal` + a `createStreamInactivityGuard` helper in `llm-provider.ts` — and creates `gemini-client.test.ts` mocking the old SDK. 13P migrates the whole file to `@google/genai` and MUST preserve PHASE-03's inactivity-guard semantics and rewrite that test's mocks. Read the post-PHASE-03 file top-to-bottom before starting 13P. PHASE-03's "Out of scope" says the migration was "not allocated to any phase" — that text is stale; PHASE-13 owns it (per PHASE-INDEX row 13).
- **`src/renderer/src/components/game/GameLayout.tsx`** (sub-phase 13H) is touched by PHASE-04 (approval-overlay gating, ~lines 877-879/1230-1236) and PHASE-05 (listener lifecycle). 13H edits `handleLinkClick` (~line 271), `onPinClick` (~line 672), and modal-prop threading — disjoint regions, but re-grep the anchors after 04/05 land.
- **`ModalScaffold`** (sub-phase 13L): PHASE-04 explicitly defers shared-scaffold extraction to this phase (PHASE-04 plan: "PHASE-13 owns the `<ModalScaffold>` extraction (former 33c)"; it notes the z-index mismatch — `ui/Modal.tsx` uses Tailwind `z-50` while the AI overlays sit at `Z.MODAL = 60`). PHASE-33 (`AiImageModal`) and PHASE-35 (`SceneModeModal`) build on `ModalScaffold` if it exists at their execution time — keep its prop API stable once landed.
- **`src/renderer/src/services/combat/combat-resolver.ts`** (sub-phase 13C): PHASE-30 (later) verified that nothing consumes `AttackRequest` and explicitly chose NOT to build on it. Deleting it here is safe and expected by PHASE-30.
- **i18n locale files** (sub-phases 13D/13E/13G): PHASE-12 (wording sweep) runs before 13; the key removals/additions here are net-new and do not collide with 12's edits.
- **`docs/AI-DM-AUDIT.md` no longer exists** at execution time. Everything needed is in this file.

## Verified findings

All claims re-verified against the live tree 2026-06-10. Each subsection lists the verification commands; re-run them at execution start (rule 3) — line numbers may drift after PHASE-01–12.

### F1 — TEN AI IPC handlers pass unsanitized `campaignId` into filesystem paths (path traversal) — `security/high`

`sanitizeCampaignId` (NET-1) exists at `src/main/ipc/ai-handlers.ts:92-103`: rejects non-UUID ids (`/^[a-f0-9-]{36}$/i`) AND asserts the resolved path stays under `userData/campaigns` — but it is called only at lines 326, 339, 347, 358, 367, 401, 412 (the conversation/memory-file handlers). Ten other handlers in the same file accept `campaignId` and reach the filesystem without it:

- **Seven direct writers** via `getMemoryManager(campaignId)` → `MemoryManager` whose constructor does `path.join(app.getPath('userData'), 'campaigns', campaignId, 'ai-context')` with zero validation (`src/main/ai/memory-manager.ts:102-103`; `getMemoryManager` at `:644-649` also validates nothing):
  - `AI_SYNC_WORLD_STATE` (ai-handlers.ts:423), `AI_SYNC_COMBAT_STATE` (:434), `AI_LOG_NPC_INTERACTION` (:449), `AI_SET_NPC_RELATIONSHIP` (:462), `AI_SET_NPC_FIELDS` (:487), `AI_UPDATE_QUEST_LOG` (:501), `AI_ADJUST_FACTION_STANDING` (:518).
- **Three indirect**: `AI_PREPARE_SCENE` (:285 — `aiService.prepareScene` ends in conversation auto-save under `campaigns/<id>/`), `AI_TOKEN_BUDGET_PREVIEW` (:301 — `buildContext` reads memory files under the same root), `AI_GENERATE_END_OF_SESSION_RECAP` (:311 — `generateSessionSummary` reads/writes the conversation).

A `campaignId` of `../../x` creates/reads files outside the campaigns root. Handlers are wrapped by the `_safe.ts` `handle` helper, so a thrown `Error('Invalid campaignId')` surfaces as a structured error envelope — same behavior the seven already-sanitized handlers exhibit.

Verification:
```bash
cd dnd-app
grep -n "sanitizeCampaignId" src/main/ipc/ai-handlers.ts          # helper :93; calls only :326-412
grep -n "AI_SYNC_WORLD_STATE\|AI_SYNC_COMBAT_STATE\|AI_LOG_NPC_INTERACTION\|AI_SET_NPC_RELATIONSHIP\|AI_SET_NPC_FIELDS\|AI_UPDATE_QUEST_LOG\|AI_ADJUST_FACTION_STANDING\|AI_PREPARE_SCENE\|AI_TOKEN_BUDGET_PREVIEW\|AI_GENERATE_END_OF_SESSION_RECAP" src/main/ipc/ai-handlers.ts
sed -n '100,105p' src/main/ai/memory-manager.ts                   # unvalidated path.join
```

### F2 — BOOK_IMPORT accepts any absolute renderer-supplied path; the dialog allowlist it should use already exists — `security-debt/medium`

`storage-handlers.ts:404-411` (BOOK_IMPORT) rejects `..`/null-byte but reads ANY other absolute path the renderer sends — the Phase 17a (NET-13) comment at :405-406 says "full dialog-allowlist integration is a follow-up". **Corrected/enriched vs the audit:** the allowlist infrastructure already exists and the legit flow already populates it — `src/main/ipc/index.ts:27-60` has `dialogAllowedPaths` (TTL 5 min), `addDialogPath()` (:30), `isDialogPathValid()` (:34), `isPathAllowed()` (:45, allows userData + dialog-picked); `DIALOG_OPEN` (:88-101) calls `addDialogPath(result.filePaths[0])`; and the only book-import caller (`CoreBooksGrid.tsx:95-105`) picks the file via `window.api.showOpenDialog` (= DIALOG_OPEN) before invoking `window.api.books.import(result, …)`. So enforcement is a near-pure win: the helpers just need to move out of `index.ts` (module-private today; `storage-handlers.ts` is imported BY `index.ts`, so importing back would cycle) into a leaf module.

Verification:
```bash
cd dnd-app
sed -n '404,412p' src/main/ipc/storage-handlers.ts                 # current ..-only check
sed -n '24,62p' src/main/ipc/index.ts                              # allowlist helpers (module-private)
grep -n "showOpenDialog\|books.import" src/renderer/src/components/library/CoreBooksGrid.tsx
```

### F3 — Dead `AttackRequest` interface in combat-resolver — `debt/low`

`src/renderer/src/services/combat/combat-resolver.ts:50` exports `interface AttackRequest` (~40 fields). Zero consumers anywhere: `grep -rn "AttackRequest" src --include="*.ts" --include="*.tsx"` returns only the definition. PHASE-30 independently verified this and builds on `attack-resolver.resolveAttack` / `executeOpportunityAttack` instead.

### F4 — Underscore type aliases keep dead imports alive; stale "future migration" comment — `debt/low`

- `src/renderer/src/components/game/sidebar/SpellsTab.tsx:5-15` imports 9 structured-spell types from `../../../services/character/spell-data` and aliases each to `type _SpellAction = SpellAction` etc. at :21-29 purely to suppress unused-import lint. Nothing else in the file uses them.
- **Corrected path vs audit:** the `_MapPing` alias lives at `src/renderer/src/components/game/map/MapCanvas.tsx:14` (the audit cited `components/game/MapCanvas.tsx` — the file moved to `game/map/`). `type MapPing` is imported at :11 and used only by the alias.
- `src/renderer/src/types/data/spell-data-types.ts:40` comment `// === Structured spell types (for future migration) ===` is stale: the types are live — `services/character/spell-data.ts:7,22` imports and re-exports them for real use.

Verification:
```bash
cd dnd-app
sed -n '5,30p' src/renderer/src/components/game/sidebar/SpellsTab.tsx
grep -rn "_MapPing" src/renderer/src --include="*.tsx"
grep -rn "SpellAction\b" src/renderer/src --include="*.ts" --include="*.tsx" | grep -v test | grep -v SpellsTab
```

### F5 — Microphone settings are a dead end: full panel + persisted store, no consumer — `unfinished/medium`

`useMicSettingsStore` (`src/renderer/src/stores/use-mic-settings-store.ts`, persist key `'mic-settings'` at :42) stores deviceId/gain/pttKey; its ONLY consumer is the panel itself (`src/renderer/src/components/settings/MicrophoneSettings.tsx:17`), mounted at `SettingsPage.tsx:1363-1365`. The component's own docstring admits "This panel does NOT yet route the mic into a voice-chat consumer." No phase in the current set consumes it (PHASE-20/21/22 voice is Pi-side Discord — players use their own Discord clients; no in-app voice capture is planned anywhere). No test files exist for either file. i18n: `settings.microphoneSettings.*` block (en.json:4889-4908, es.json:4889 equivalent) + `pages.settingsPage.microphone` (en.json:6100, es.json:6100).

Verification:
```bash
cd dnd-app
grep -rn "useMicSettingsStore" src/renderer/src --include="*.ts" --include="*.tsx" | grep -v test
grep -rn "mic-settings\|MicrophoneSettings" docs/phases/*.md   # no consumer planned in any phase
```

### F6 — Campaign-wizard AudioStep: preview is a no-op AND the files never upload at all — `unfinished/low`, corrected (worse than audited)

The audit said the Preview button is a no-op placeholder (`AudioStep.tsx:133-137`: "In the wizard, this is a no-op placeholder"). **Verification found the deeper break:** `handleFilesAdded` (`AudioStep.tsx:39-56`) drops the `File` objects entirely — it stores only `{id, fileName, displayName, category}`. The comment "actual upload happens on campaign create" (:51) is false: `CampaignWizard.tsx:360-367` persists the same metadata onto the campaign (`customAudio`), and `window.api.audioUploadCustom` — the only byte-upload path (`src/main/ipc/audio-handlers.ts:31-67`, writes to `userData/campaigns/<id>/custom-audio/` with magic-byte validation) — is called ONLY from `DMAudioPanel.tsx:246`. Wizard-added audio is metadata with no backing file until the DM re-uploads in-game.

Verification:
```bash
cd dnd-app
sed -n '39,56p' src/renderer/src/components/campaign/AudioStep.tsx        # File object dropped
grep -rn "audioUploadCustom" src/renderer/src --include="*.tsx" | grep -v test   # only DMAudioPanel
grep -n "customAudio" src/renderer/src/components/campaign/CampaignWizard.tsx
```

### F7 — Group-roll P2P round-trip: the infrastructure ALREADY exists; only the DM modal isn't wired to it — corrected vs audit

The audit said "`dm:group-roll-request`/`player:group-roll-result` message types exist nowhere". True for those exact names, but the equivalent round-trip shipped for the AI's `request_roll` action (P6.3) under different names, end to end:

- `dm:roll-request` message type (`network/message-types.ts:45`) + `RollRequestPayloadSchema` (`network/schemas.ts:316-325`, registered :614); broadcast by `executeRequestRoll` (`services/game-actions/effect-actions.ts:64-105`).
- Client side: `client-handlers.ts:459` → `handleRollRequest` (`client-handlers/game-action-handlers.ts:100-112`) → `setPendingGroupRoll`; `GameLayout.tsx:1029-1045` mounts `RollRequestOverlay` for non-DM peers, whose `onRoll` sends `player:roll-result` (`message-types.ts:71`, `RollResultPayloadSchema` schemas.ts:327-335, registered :583).
- Host side: `host-handlers.ts:510-514` → `useGameStore.addGroupRollResult`. Store state: `pendingGroupRoll`/`groupRollResults`/`clearGroupRollResults` (`stores/game/types.ts:241-245`). Types: `GroupRollRequest`/`GroupRollResult` (`types/game-state.ts:109-128`; note `GroupRollResult` has NO `requestId` field — results are globally accumulated and cleared per request).

Meanwhile `GroupRollModal.tsx:77-114` (the DM tool) ignores all of it: the Phase 26a comment (:77-80) says the round-trip "is deferred; logged in the phase plan" (a plan that is not in the repo), and `handleRequestRoll` (:101-115) rolls 1d20 locally for every connected player using `computeModifier` from their synced character.

Verification:
```bash
cd dnd-app
grep -rn "dm:roll-request\|player:roll-result" src/renderer/src --include="*.ts" --include="*.tsx" | grep -v test
sed -n '77,116p' src/renderer/src/components/game/modals/combat/GroupRollModal.tsx
sed -n '1029,1046p' src/renderer/src/components/game/GameLayout.tsx
```

### F8 — Container `contents[]` weight recursion: `EquipmentItem` has no `contents` field — `debt/low`

`src/shared/types/character-5e.ts:248-268` (`EquipmentItem`) has no `contents`. `weight-calculator.ts:64-67` comment: "Container `contents[]` recursion is deferred: EquipmentItem has no contents field to recurse into (logged to ISSUES-LOG-DNDAPP)" — that log entry never existed (orphaned comment, see F13). The loop at :68-70 sums `(item.weight ?? 0) * (item.quantity ?? 1)` flat.

Verification:
```bash
cd dnd-app
sed -n '248,268p' src/shared/types/character-5e.ts
sed -n '60,72p' src/renderer/src/utils/weight-calculator.ts
```

### F9 — Co-DM filter support ALREADY SHIPPED; only the comment is stale — corrected vs audit (already implemented)

The audit claimed "only the literal host is treated as DM; a co-DM peer never receives DM-only fields". **Refuted by verification:** `network-store/index.ts:349-366` (`setGameStateProvider`, Phase 29e) computes `seesAll = peerInfo.isHost || peerInfo.isCoDM === true || (hasPermission(view_hidden_tokens) && hasPermission(view_dm_only_stats))` and serves such peers the unfiltered `'host'` bucket; `isCoDM` is carried in `message-types.ts:260`, `schemas.ts:223,236`, `state-types.ts:18`. The shard pipeline's per-recipient `permissionFilter` (game-sync.ts:123-141 comments, 31g/31h/31i) uses the same role bucketing. The ONLY stale artifact is the comment at `network-state-filter.ts:8-10`: "Currently only the literal host is treated as DM; co-DM is a future feature (see SUGGESTIONS-LOG-DNDAPP.md if/when added)." Work = rewrite the comment (13Q). No feature gap.

Verification:
```bash
cd dnd-app
sed -n '349,367p' src/renderer/src/stores/network-store/index.ts
sed -n '1,18p' src/renderer/src/stores/network-store/network-state-filter.ts
grep -rn "isCoDM" src/renderer/src/network/state-types.ts src/renderer/src/network/schemas.ts
```

### F10 — Compendium deep-link discards its arguments; map-pin deep-links open the generic journal; `linkedNpcId`/`linkedLocationId` have zero consumers — `unfinished/low`

- `GameLayout.tsx:271-276`: `handleLinkClick = useCallback((_category, _name) => { setActiveModal('compendium') })` — both args dropped; the comment cites "ISSUES-LOG-DNDAPP — compendium deep-link" (orphaned, F13). Chat links flow from `utils/chat-links.ts` `renderChatContent` (:159) / `linkTypeToCategory` (:152-157 — maps `monster→monsters`, `item→magic-items`, `spell→spells`, else passthrough) via `ChatPanel.tsx:92` to this callback.
- `CompendiumModal.tsx` (`modals/utility/`) keeps `activeTab`/`search`/`selectedItem` as internal state (:38-43) with a `TABS` list (:15-34) and a per-tab `loadCategoryItems` cache (:66-86) — no props to preselect anything (`onClose` only).
- `GameLayout.tsx:670-678` `onPinClick`: `linkedJournalId` → `setActiveModal('sharedJournal')` (no entry focus), else toast the label. `SharedJournalModal.tsx` (props `isDM/playerName/localPeerId/onClose`) has no entry-focus prop. Modal mounting chain: GameLayout:1134 `GameModalDispatcher` → `modal-groups/UtilityModals.tsx` (`sharedJournal` :127, `compendium` :131).
- `MapPin.linkedNpcId`/`linkedLocationId` (`types/map.ts:52-53`): zero readers or writers anywhere (`grep -rn "linkedNpcId\|linkedLocationId" src` → only the type). `PinCreateModal.tsx` captures only `linkedJournalId` (:35,:49,:119). The fields are dead surface promising a feature that doesn't exist.

Verification:
```bash
cd dnd-app
sed -n '271,277p;670,679p' src/renderer/src/components/game/GameLayout.tsx
grep -rn "linkedNpcId\|linkedLocationId" src --include="*.ts" --include="*.tsx"
grep -n "interface CompendiumModalProps" -A 3 src/renderer/src/components/game/modals/utility/CompendiumModal.tsx
```

### F11 — Library official categories show no counts — `unfinished/low`

`LibraryPage.tsx:159-160`: "Item counts per category (homebrew only for now — static counts are too expensive to load all at once)"; `itemCounts = homebrewCounts` (homebrew tallies from :146-152). `loadCategoryCounts` (the old official-count helper) was deleted by the knip prune — `grep -rn "loadCategoryCounts" src` → nothing. The "too expensive" rationale is weakened: the favorites effect at :366 already does `Promise.all(allCats.map((cat) => loadCategoryItems(cat, [])))` over ~40 categories, and `loadCategoryItems` is backed by the config-store TTL cache (coalesced, 1 fetch per category per TTL). Counts render in `LibraryCategoryGrid.tsx` (prop `itemCounts: Record<string, number>` :7, read at :25).

Verification:
```bash
cd dnd-app
sed -n '155,162p;364,370p' src/renderer/src/pages/LibraryPage.tsx
grep -rn "loadCategoryCounts" src/renderer/src
```

### F12 — Config-store content decoupling: the homebrew/plugin merge lives only in `use-config-store` — `debt/medium`

`use-config-store.ts:19-23` docstring (debt logged 2026-05-28): decoupling content reads onto the library truth store "requires wiring the truth store's homebrew/plugin merge first — today that merge lives only here". Verified mechanics: the `get()` loader (:196-263) merges via private `mergeHomebrew` (:276-309, campaign-scope filter + `.data` unwrap + `source:'homebrew'` tag), `mergePluginData` (:310-326), `categoryToHomebrewKey` (:328-414, the full DataCategory→kebab map). The truth store receives content only as a side-effect: `loadCategoryItems` (library-service.ts:61) calls `load5e*` loaders (already config-store-merged) and `toLibraryItems` → `ingestIntoLibraryStore` (`services/library/library-item-builders.ts:15-57`) side-writes into `useLibraryStore`. So plugin/homebrew-merged content reaches the truth store only when something happens to call `loadCategoryItems`, and the merge logic itself is unreusable (module-private, entangled with the zustand store).

Verification:
```bash
cd dnd-app
sed -n '5,24p;196,263p;276,330p' src/renderer/src/stores/use-config-store.ts
grep -n "ingestIntoLibraryStore" -r src/renderer/src --include="*.ts" | grep -v test
```

### F13 — Five orphaned "logged to ISSUES-LOG/SUGGESTIONS-LOG" code comments — `docs/low`

The referenced log entries never existed (audit verified against HEAD logs, resolved archives, and `git log -S`). The comments, verified present:
1. `src/renderer/src/utils/weight-calculator.ts:64-67` — "(logged to ISSUES-LOG-DNDAPP)" (container recursion — fixed by 13I).
2. `src/renderer/src/components/game/GameLayout.tsx:272-274` — "(see ISSUES-LOG-DNDAPP — compendium deep-link)" (fixed by 13H).
3. `src/renderer/src/components/game/dice3d/dice-physics.ts:21-23` — "logged as a follow-up" (fixed by 13M).
4. `src/renderer/src/stores/use-config-store.ts:19-23` — "Remaining debt (logged 2026-05-28)" (addressed by 13K).
5. `src/renderer/src/stores/network-store/network-state-filter.ts:9-10` — "(see SUGGESTIONS-LOG-DNDAPP.md if/when added)" (stale per F9 — fixed by 13Q).

### F14 — Backup-migration framework (former Phase 33a) ALREADY SHIPPED — corrected vs audit (already implemented)

The audit claimed "No `migrateBackup`/format-version scaffolding found in `dnd-app/src/main` or `src/shared`" — the grep was scoped to the wrong directories. The framework lives in the RENDERER: `src/renderer/src/services/io/import-export.ts:136` (`BACKUP_VERSION = 4`), `:148-178` (`BACKUP_MIGRATIONS` keyed by target version, v2/v3/v4 transforms), `:184-194` (`migrateBackupPayload` walker, exported), `:411-414` (import path: reject newer, migrate older). Unit-tested at `import-export.test.ts:497+`. **No work needed**; closed by this evidence. The walker pattern mirrors `src/main/storage/migrations.ts`.

Verification:
```bash
cd dnd-app
grep -n "BACKUP_VERSION\|migrateBackupPayload\|BACKUP_MIGRATIONS" src/renderer/src/services/io/import-export.ts
grep -n "migrateBackupPayload" src/renderer/src/services/io/import-export.test.ts
```

### F15 — No shared `ModalScaffold`; `ui/Modal.tsx` exists but uses the wrong z-layer — `debt/medium`

`grep -rn "ModalScaffold" src` → nothing. `src/renderer/src/components/ui/Modal.tsx` (107 lines) implements the full WAI-ARIA dialog pattern (focus trap :26-53, focus restore, Escape, `role="dialog"`/`aria-modal`/`aria-labelledby`) but hardcodes Tailwind `z-50` on its root (:75) while the design-system constants are `Z.MODAL_BACKDROP = 50` / `Z.MODAL = 60` (`constants/z-index.ts:28-30`) — the mismatch PHASE-04 called out. 157 modal files exist under `components/game/modals/*/`; only 2 import `ui/Modal`. PHASE-33/35 expect a `ModalScaffold` to build new AI modals on.

### F16 — No bundle-size CI guard — `debt/low`

`grep -rn "size-limit\|bundlesize\|bundle-size" dnd-app/package.json .github/workflows/*.yml` → nothing. `dnd-app-ci.yml` already runs `npx electron-vite build` + a "Verify build artifacts" step (out/main/index.js, out/renderer/index.html) — the natural place to add a size gate. No `ANALYZE` CI usage; `rollup-plugin-visualizer` is local-only (`electron.vite.config.ts:16`).

### F17 — Trigger-observer kill switch is unreachable — `stub/low`

`src/main/ai/ai-trigger-observer.ts:84-96`: `setTriggerObserverEnabled(enabled)` (resets `previousState`/`combatWasActive` on disable) and `isTriggerObserverEnabled()` are exported with zero production callers (`grep -rn "setTriggerObserverEnabled\|isTriggerObserverEnabled" src --include="*.ts" | grep -v test | grep -v ai-trigger-observer` → empty). `running = true` forever. Existing plumbing to mirror: `AI_TRIGGER_STATE_UPDATE` channel (`ipc-channels.ts:129`), handler (ai-handlers.ts:644-651), preload `ai.triggerStateUpdate` (preload/index.ts:167-168), renderer pusher `use-dm-triggers.ts` (debounced snapshot push, only when ≥1 enabled trigger). DM trigger UI: `modals/dm-tools/TriggerManagerModal.tsx`.

### F18 — Trigger `spawn_creature` always places at map center — `unfinished/low`

`src/renderer/src/services/trigger-action-executor.ts:43-61`: the case computes `gridX/gridY` = map center (`Math.floor(map.width / cell / 2)`) because "The trigger UI captures only a creatureId, not coordinates … precise/region placement is a follow-up". `TriggerManagerModal.tsx` captures only `creatureId` for this action (:68, :90-91, :405-411). The executor delegates to `executeDmActions([{ action: 'place_creature', creatureId, gridX, gridY }])`, which already accepts arbitrary grid coords. The renderer `DmTrigger.actionPayload` is `Record<string, unknown>` (`types/game-state.ts:325`), and the main-process observer's `DmTrigger.actionPayload` likewise (`ai-trigger-observer.ts:25`) — adding `gridX`/`gridY` keys requires no type/schema change on the wire.

### F19 — 3D dice: numbers off-center on triangular faces; d12 UVs tile a triangle across each pentagon — `polish/low`

- `dice-textures.ts:6-45` `createDieTexture` draws the number at canvas center `(size/2, size/2)` = UV `(0.5, 0.5)`.
- Triangular-face dice (d4 `dice-meshes.ts:123-129`, d8 :161-166, d20 :303-314 via `buildTriangularFaceDie` :95-121) map each face to UV triangle `(0.5,1.0) (0,0) (1,0)` (`buildTriangleFaceUVs` :69-84). That triangle's centroid is UV `(0.5, 1/3)` → canvas `(size/2, size·2/3)`; the number therefore renders well above the visible face center, and 2-digit d20 labels approach the triangle's edges (font `size*0.38` for 2 chars at :22).
- d10 (:169-262) maps kite faces symmetrically around UV (0.5,0.5) — centered, OK.
- d12 (:263-303) is the worst: it tiles the SAME `(0.5,1)(0,0)(1,0)` UV triangle across all 3 sub-triangles of each pentagon (:276-291), so each pentagon face renders three distorted copies of the number texture instead of one centered number — the concrete "numbers not centered / sides not evenly sized" complaint in the dice-physics comment (`dice-physics.ts:21-23`).
- Tests mock the 2D canvas context (`dice-textures.test.ts:21-47`) so `fillText` coordinates are assertable; `dice-meshes.test.ts` exists for geometry.

### F20 — `@google/generative-ai` is EOL upstream; migrate to `@google/genai` — `debt/medium`

`package.json:224` pins `"@google/generative-ai": "^0.24.1"`. Upstream support (including bug fixes) **ended 2025-11-30** ([deprecated-generative-ai-js](https://github.com/google-gemini/deprecated-generative-ai-js)) — already past. Replacement: [`@google/genai`](https://github.com/googleapis/js-genai) (v2.8.0 as of 2026-06-03; requires Node ≥ 20 — satisfied: dev Node 22, Electron 42 bundles Node ≥ 22). Current client surface to migrate (`src/main/ai/gemini-client.ts`, 125 lines pre-PHASE-03): `GoogleGenerativeAI` ctor (:13), `getGenerativeModel({model, systemInstruction}, {timeout})` (:34-37), `startChat({history})` + `sendMessageStream` (streaming), `chatOnce` (non-stream), `validateKey`/`listModels` already use raw `fetch` against `generativelanguage.googleapis.com/v1beta/models` (:99-121) — those two need no SDK at all. New SDK shapes (researched, see Research notes): `new GoogleGenAI({apiKey})`; `ai.chats.create({model, history, config:{systemInstruction}})`; `await chat.sendMessageStream({message, config:{abortSignal}})` returns `Promise<AsyncGenerator<GenerateContentResponse>>`; chunks expose `.text` as a **property** (old SDK: `.text()` method); `GenerateContentConfig` supports `abortSignal`, `httpOptions` (timeout), `maxOutputTokens`, `temperature`.

## Sub-phases

Execute in order. Sub-phase checks are CHEAP/TARGETED only (rule 5); the full 4-gate runs once at phase end.

### 13A — Sanitize `campaignId` in the ten AI IPC handlers

**Objective:** close the F1 path traversal.
**Files:** `src/main/ipc/ai-handlers.ts`, `src/main/ipc/ai-handlers.test.ts`.
**Steps:**
1. In each of the ten handlers (channel anchors, not line numbers: `AI_PREPARE_SCENE`, `AI_TOKEN_BUDGET_PREVIEW`, `AI_GENERATE_END_OF_SESSION_RECAP`, `AI_SYNC_WORLD_STATE`, `AI_SYNC_COMBAT_STATE`, `AI_LOG_NPC_INTERACTION`, `AI_SET_NPC_RELATIONSHIP`, `AI_SET_NPC_FIELDS`, `AI_UPDATE_QUEST_LOG`, `AI_ADJUST_FACTION_STANDING`), add `sanitizeCampaignId(campaignId)` as the first statement, mirroring the existing call shape at the `AI_LOAD_CONVERSATION` handler (ai-handlers.ts:326). For handlers that return `{success:false,error}` envelopes in their own try/catch (the seven memory handlers), place the call INSIDE the try so a hostile id returns the structured envelope rather than an unhandled throw; for `AI_PREPARE_SCENE` (no try/catch) rely on the `_safe.ts` wrapper exactly as the conversation handlers do.
2. Also add it to `AI_GET_SCENE_STATUS` (ai-handlers.ts:291) for uniformity — it shares the campaignId surface even though today it only reads an in-memory map (defense-in-depth; one line).
3. Tests (`ai-handlers.test.ts`, follow the file's existing register-and-invoke pattern): for `AI_SYNC_WORLD_STATE` and `AI_UPDATE_QUEST_LOG`, invoking with `campaignId: '../../evil'` returns `{success:false}` (or error envelope) and `getMemoryManager` is NOT called (mock it); for `AI_PREPARE_SCENE`, the error envelope surfaces and `aiService.prepareScene` is not called; a valid 36-char UUID still passes through.
**Checks:** `npx tsc --noEmit -p tsconfig.node.json`; `npx vitest run src/main/ipc/ai-handlers.test.ts`.
**Acceptance:** all ten (plus `AI_GET_SCENE_STATUS`) reject non-UUID campaignIds before any filesystem-reaching call; tests prove the reject + pass-through.

### 13B — Enforce the dialog allowlist on BOOK_IMPORT

**Objective:** finish the Phase 17a NET-13 deferral (F2).
**Files:** new `src/main/ipc/dialog-allowlist.ts`, `src/main/ipc/index.ts`, `src/main/ipc/storage-handlers.ts`, `src/main/ipc/storage-handlers.test.ts`.
**Steps:**
1. Extract the allowlist into a leaf module `src/main/ipc/dialog-allowlist.ts` (no imports from other ipc modules): move `dialogAllowedPaths`, `DIALOG_PATH_TTL`, `addDialogPath`, `isDialogPathValid`, `isPathAllowed` verbatim from `index.ts:27-60` (keep the userData-subtree allowance inside `isPathAllowed`). Export `addDialogPath` and `isPathAllowed`. `index.ts` imports them; delete the originals.
2. In `storage-handlers.ts` BOOK_IMPORT handler: keep the existing `..`/null-byte rejection, then add `if (!isPathAllowed(sourcePath)) throw new Error('Invalid source path: not a dialog-selected file')`. Update the NET-13 comment to state the allowlist is now enforced (no log pointer).
3. Do NOT touch `BOOK_READ_FILE` — it reads from the app-managed books dir under userData, which `isPathAllowed` would allow anyway, and its callers pass stored paths, not dialog picks; adding the check there is harmless but pointless. Leave as-is.
4. Tests (`storage-handlers.test.ts`): BOOK_IMPORT with a path never registered via `addDialogPath` → rejects; after `addDialogPath('/tmp/x.pdf')` the same path passes validation (mock `importBook`); a userData-subtree path passes without dialog registration.
**Checks:** `npx tsc --noEmit -p tsconfig.node.json`; `npx vitest run src/main/ipc/storage-handlers.test.ts src/main/ipc/ai-handlers.test.ts`.
**Acceptance:** BOOK_IMPORT only accepts dialog-picked or userData paths; existing CoreBooksGrid flow (dialog → import) still passes (its dialog pick registers the path).

### 13C — Delete dead `AttackRequest` + underscore type aliases; fix the stale type comment

**Objective:** F3 + F4 removal.
**Files:** `src/renderer/src/services/combat/combat-resolver.ts`, `src/renderer/src/components/game/sidebar/SpellsTab.tsx`, `src/renderer/src/components/game/map/MapCanvas.tsx`, `src/renderer/src/types/data/spell-data-types.ts`.
**Steps:**
1. Delete `export interface AttackRequest { … }` from combat-resolver.ts (anchor: `combat-resolver.ts:50`); also delete `AttackType` IF it is referenced only by `AttackRequest` (verify with `grep -rn "AttackType" src --include="*.ts" --include="*.tsx" | grep -v combat-resolver` first; if it has consumers, keep it).
2. SpellsTab.tsx: delete the 9 type names from the import block (:5-15) and the 9 `type _X = Y` aliases (:21-29). Keep `SpellIndexEntry` (used).
3. MapCanvas.tsx (`game/map/`): remove `type MapPing` from the import (:11) and the `type _MapPing = MapPing` alias (:14).
4. spell-data-types.ts:40 — replace `// === Structured spell types (for future migration) ===` with `// === Structured spell types (consumed by services/character/spell-data.ts) ===`.
**Checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npm run lint` is end-of-phase, but a quick `npx biome check src/renderer/src/components/game/sidebar/SpellsTab.tsx src/renderer/src/components/game/map/MapCanvas.tsx` catches unused-import fallout early.
**Acceptance:** `grep -rn "AttackRequest\|_SpellAction\|_MapPing" src` → empty; web tsc green.

### 13D — Wire the trigger-observer kill switch + trigger spawn placement

**Objective:** F17 + F18 — make the hard-stop reachable and spawn placement precise.
**Files:** `src/shared/ipc-channels.ts`, `src/main/ipc/ai-handlers.ts`, `src/main/ipc/ai-handlers.test.ts`, `src/preload/index.ts`, `src/renderer/src/components/game/modals/dm-tools/TriggerManagerModal.tsx`, `src/renderer/src/services/trigger-action-executor.ts`, `src/renderer/src/services/trigger-action-executor.test.ts` (create if absent), `src/renderer/src/i18n/locales/en.json`, `es.json`, regenerate `src/renderer/src/i18n/generated-keys.ts`.
**Steps:**
1. `ipc-channels.ts`: add `AI_TRIGGER_SET_ENABLED: 'ai:trigger-set-enabled'` and `AI_TRIGGER_GET_ENABLED: 'ai:trigger-get-enabled'` next to `AI_TRIGGER_STATE_UPDATE` (:129).
2. `ai-handlers.ts`: register both next to the existing `AI_TRIGGER_STATE_UPDATE` handler (:644). SET uses the `withArgsSchema` helper (`_safe.ts:75`) with `z.tuple([z.boolean()])`, calls `setTriggerObserverEnabled(enabled)`, returns `{ enabled: isTriggerObserverEnabled() }`. GET takes no args, returns the same shape. (Repo convention: channels in `ipc-channels.ts`; zod at the boundary — tuple schema here, nothing to add to `ipc-schemas.ts` since no shared payload object type is needed.)
3. `preload/index.ts`: in the `ai` namespace next to `triggerStateUpdate` (:167), add `setTriggerObserverEnabled: (enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.AI_TRIGGER_SET_ENABLED, enabled)` and `getTriggerObserverEnabled: () => ipcRenderer.invoke(IPC_CHANNELS.AI_TRIGGER_GET_ENABLED)`. Mirror in the preload `d.ts` typing the same way sibling entries are typed.
4. `TriggerManagerModal.tsx`: add a header toggle "Pause all triggers" — local state seeded from `getTriggerObserverEnabled()` on mount, flipped via `setTriggerObserverEnabled(!paused)`. Render an amber "Triggers paused" pill while disabled. Default stays ENABLED (no behavior change for existing users; the switch is opt-in). i18n keys: `game.triggerManagerModal.pauseAll`, `.resumeAll`, `.pausedBadge` (en + es), then `npm run i18n:gen-keys`.
5. Spawn placement: in `TriggerManagerModal.tsx`'s `spawn_creature` action section (:405-411), add two optional numeric inputs "Grid X / Grid Y" (and a hint "blank = map centre"); on save, write `actionPayload.gridX`/`gridY` only when both are valid non-negative integers (:90-91 area).
6. `trigger-action-executor.ts` `spawn_creature` case (:43-61): read `payload.gridX`/`payload.gridY`; when both are finite numbers ≥ 0, clamp each to the active map's grid bounds (`Math.min(value, Math.floor(map.width / cell) - 1)` etc.) and use them; else keep the existing centre computation. Update the case comment (the "follow-up" sentence) to describe the implemented behavior.
7. Tests: `ai-handlers.test.ts` — SET flips what GET returns; non-boolean arg rejected by schema. `trigger-action-executor.test.ts` — payload coords used when present + clamped when out of bounds; centre fallback when absent (mock `useGameStore.getState` and the dynamic `game-action-executor` import per existing patterns in sibling executor tests).
**Checks:** `npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json`; `npx vitest run src/main/ipc/ai-handlers.test.ts src/renderer/src/services/trigger-action-executor.test.ts`.
**Acceptance:** DM can pause/resume all trigger processing from the Trigger Manager; spawn triggers place at configured coordinates; defaults unchanged.

### 13E — Remove the dead microphone-settings surface

**Objective:** F5 decision implemented: no consumer exists or is planned → remove honestly rather than ship config for a phantom feature.
**Files (delete):** `src/renderer/src/components/settings/MicrophoneSettings.tsx`, `src/renderer/src/stores/use-mic-settings-store.ts`. **Files (edit):** `src/renderer/src/pages/SettingsPage.tsx` (import :3, section :1363-1365), `src/renderer/src/i18n/locales/en.json` (`settings.microphoneSettings` block :4889-4908; `pages.settingsPage.microphone` :6100), `es.json` (same keys), regenerate `generated-keys.ts` (`npm run i18n:gen-keys`).
**Steps:**
1. Delete the two files; remove the SettingsPage import + `<Section title={t('pages.settingsPage.microphone')}>…</Section>` block.
2. Remove the i18n keys from BOTH locales; run `npm run i18n:gen-keys` so the key union drops them (tsc will then catch any stragglers).
3. Sweep: `grep -rn "useMicSettingsStore\|MicrophoneSettings\|microphoneSettings\|mic-settings" src` must return nothing. (The persisted localStorage key `mic-settings` simply orphans — app is in testing, no cleanup migration needed.)
**Checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/pages/SettingsPage.test.tsx` if that test exists (`ls src/renderer/src/pages/SettingsPage.test.tsx`).
**Acceptance:** grep sweep empty; Settings page compiles and renders without the section.

### 13F — Make wizard AudioStep real: object-URL preview + upload-on-create

**Objective:** F6 — preview works in the wizard and files actually upload when the campaign is created.
**Files:** `src/renderer/src/components/campaign/AudioStep.tsx`, `src/renderer/src/components/campaign/CampaignWizard.tsx`, `src/renderer/src/components/campaign/AudioStep.test.tsx` (create).
**Steps:**
1. `AudioStep.tsx`: extend the component contract so the wizard can hold the bytes: change `AudioStepProps.onChange` to also surface files — simplest stable shape: add optional prop `onFilesChange?: (files: Map<string, File>) => void` and keep an internal `filesRef: Map<string, File>` (entry id → File). In `handleFilesAdded`, store `filesRef.set(entry.id, file)` and call `onFilesChange?.(new Map(filesRef))`; in `handleRemove`, delete from the map and re-emit.
2. Preview (`handlePreviewToggle`): when `filesRef` has the id, `const url = URL.createObjectURL(file)`; create/reuse a single `Audio` element (`audioElRef`), set `src`, `play()`, set `previewingId`; on stop/replace/unmount, `pause()` and `URL.revokeObjectURL(url)` (track the active url in a ref). Delete the "no-op placeholder" comment + `logger.debug` branch. Stop button (existing `■`/`▶` glyphs) now actually toggles playback.
3. `CampaignWizard.tsx`: hold `const audioFilesRef = useRef<Map<string, File>>(new Map())`, pass `onFilesChange` to `<AudioStep>` (:569). In the create handler (where the campaign object is built, :340-380): after the campaign is persisted with its id, for each `customAudio` entry with a held File, `await window.api.audioUploadCustom(campaignId, file.name, await file.arrayBuffer(), entry.displayName, entry.category)`; on per-file failure, `addToast` a warning naming the file and continue (do not block creation). Update the stale "actual upload happens on campaign create" comment in AudioStep to describe the now-true flow.
4. Persisted `customAudio` metadata should record the SANITIZED filename returned by the upload (`result.data.fileName`) so DMAudioPanel resolves it later — adjust the `customAudio.map(...)` at :360-367 to use upload results when available.
5. Test (`AudioStep.test.tsx`): adding a file emits both metadata and the File map; preview toggles call `URL.createObjectURL`/`revokeObjectURL` (stub `URL.createObjectURL`, stub `Audio` with a `play`/`pause` spy via `vi.stubGlobal`); removing an entry drops it from the emitted map.
**Checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/components/campaign/AudioStep.test.tsx`.
**Acceptance:** wizard preview audibly plays the picked file (object URL path exercised in test); created campaigns have real files in `userData/campaigns/<id>/custom-audio/` via the existing validated handler; failures surface as toasts.

### 13G — Wire GroupRollModal onto the existing P2P round-trip

**Objective:** F7 — players roll their own group checks; DM-on-behalf becomes the fallback, not the only mode.
**Files:** `src/renderer/src/components/game/modals/combat/GroupRollModal.tsx`, `src/renderer/src/components/game/modals/combat/GroupRollModal.test.tsx` (extend/create), `src/renderer/src/i18n/locales/en.json`, `es.json`, regen keys.
**Steps:**
1. In `handleRequestRoll`, replace the roll-for-everyone loop: (a) `useGameStore.getState().clearGroupRollResults()`; (b) build `id = crypto.randomUUID()` and `setPendingGroupRoll({id, type: checkType, ability, skill, dc, scope, isSecret, targetEntityIds})` locally (host store — mirrors `executeRequestRoll`, effect-actions.ts:84); (c) broadcast `sendMessage('dm:roll-request', {id, type: checkType, ability, skill, dc, isSecret, requesterId: localPeerId, requesterName})` exactly as `executeRequestRoll` does (effect-actions.ts:95-105). Reuse the network store via the same hooks the modal already imports for lobby data.
2. Live results: subscribe `const results = useGameStore((s) => s.groupRollResults)` and render incoming `GroupRollResult` rows as they arrive (name, roll, modifier, total, pass/fail vs `dc`), with a "waiting for N of M" line (M = connected players from `useLobbyStore`).
3. Fallback ("Roll for remaining"): a button enabled once ≥1 player hasn't responded; for each non-responder, compute via the EXISTING `computeModifier` + `rollSingle(20)` path and `addGroupRollResult` directly (preserves solo/offline play and AFK players). Keep `trigger3dDice` for DM-side rolls only.
4. Done/close: `setPendingGroupRoll(null)` + `clearGroupRollResults()` on close (check what `handleDone` does today and keep its chat-summary behavior, now sourced from the live results array).
5. Update the Phase 26a comment block (:77-80) to describe the implemented round-trip (no dead "logged in the phase plan" pointer).
6. i18n: keys for "Waiting for {{count}} player(s)…", "Roll for remaining" (en + es); regen keys.
7. Tests: requesting broadcasts `dm:roll-request` with the modal's dc/type (mock network store `sendMessage`); incoming `addGroupRollResult` renders a row; "Roll for remaining" fills only missing players.
**Checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/components/game/modals/combat/GroupRollModal.test.tsx`.
**Acceptance:** connected players get their `RollRequestOverlay` (already-shipped client path, F7) and their results stream into the DM modal; solo/AFK fallback preserved; no behavior change for the AI `request_roll` path (untouched).

### 13H — Compendium + map-pin deep-links; drop dead pin fields

**Objective:** F10 — clicked chat links open the compendium AT the entry; journal-linked pins open the journal AT the entry; stop promising NPC/location pin links that don't exist.
**Files:** `src/renderer/src/components/game/modals/utility/CompendiumModal.tsx` (+ test), `src/renderer/src/components/game/modals/utility/SharedJournalModal.tsx` (+ test), `src/renderer/src/components/game/GameLayout.tsx`, `src/renderer/src/components/game/GameModalDispatcher.tsx`, `src/renderer/src/components/game/modal-groups/UtilityModals.tsx`, `src/renderer/src/types/map.ts`.
**Steps:**
1. `CompendiumModal`: add optional props `initialCategory?: LibraryCategory`, `initialQuery?: string`. Seed `activeTab` from `initialCategory` **when it appears in `TABS`** (else keep `'actions'` and seed `search` with the name so global fuzzy search still surfaces it); seed `search` from `initialQuery`. After the active tab's data loads (the existing `loadTabData` effect), if `initialQuery` is set and no item is selected yet, auto-`setSelectedItem` on the first case-insensitive exact `name` match; run this seed exactly once (a `didSeedRef`).
2. `GameLayout.tsx`: replace `handleLinkClick`'s arg-dropping body (:271-276) with `setCompendiumTarget({ category, name }); setActiveModal('compendium')` (new local state, cleared when the modal closes). Thread `compendiumTarget` through `GameModalDispatcher` → `UtilityModals` → `<CompendiumModal initialCategory={target?.category} initialQuery={target?.name}>` (compendium mount: UtilityModals.tsx:131). Delete the orphaned ISSUES-LOG comment.
3. `SharedJournalModal`: add optional `initialEntryId?: string`. On mount, if set and the entry exists in `visibleEntries`, scroll it into view (`ref` + `scrollIntoView({block:'center'})`) and apply a temporary highlight class (amber ring, cleared after ~2s timeout).
4. `GameLayout.tsx` `onPinClick` (:670-678): when `pin.linkedJournalId`, set `journalFocusEntryId = pin.linkedJournalId` (new state) before `setActiveModal('sharedJournal')`; thread to the modal (UtilityModals.tsx:127) like step 2. Update the Phase 16b comment to drop the "(NPC/location deep-links are a follow-up…)" clause.
5. `types/map.ts`: delete `linkedNpcId?` and `linkedLocationId?` from `MapPin` (:52-53) — zero readers/writers repo-wide (F10). Re-grep first: `grep -rn "linkedNpcId\|linkedLocationId" src` must show only the type. (Persisted maps carrying the old keys keep working — extra keys are ignored on read.)
6. Tests: CompendiumModal — `initialCategory`+`initialQuery` lands on the right tab with the item auto-selected (mock `loadCategoryItems` to return a known item); unknown category falls back to search seeding. SharedJournalModal — `initialEntryId` highlights/scrolls (assert the highlight class; stub `scrollIntoView`).
**Checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/components/game/modals/utility/CompendiumModal.test.tsx src/renderer/src/components/game/modals/utility/SharedJournalModal.test.tsx`.
**Acceptance:** chat-link click opens compendium pre-navigated; journal pin click opens the journal at the entry; `MapPin` no longer declares unimplemented link fields.

### 13I — Container `contents[]` weight recursion

**Objective:** F8 — nested container weights count toward carry weight.
**Files:** `src/shared/types/character-5e.ts`, `src/renderer/src/utils/weight-calculator.ts`, `src/renderer/src/utils/weight-calculator.test.ts`.
**Steps:**
1. `character-5e.ts` `EquipmentItem` (:248): add `/** Items stored inside this container; their weight counts toward carry weight (recursive). */ contents?: EquipmentItem[]`.
2. `weight-calculator.ts`: replace the flat equipment loop (:68-70) with a recursive helper `function equipmentItemWeight(item: EquipmentItem, depth = 0): number` — `(item.weight ?? 0) * (item.quantity ?? 1)` plus `sum(item.contents.map(c => equipmentItemWeight(c, depth + 1)))`, with a `depth >= 8` cutoff returning 0 for deeper nesting (cycle/abuse guard — `contents` is plain JSON so true cycles can't persist, but imported data is untrusted). Replace the orphaned-log comment (:64-67) with one sentence describing the recursion + depth cap.
3. Tests: container with two contents items sums all three; quantity multiplies at each level; depth-9 nesting truncates; `contents: undefined` behaves exactly as before (regression rows for the existing flat cases).
**Checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/utils/weight-calculator.test.ts`.
**Acceptance:** recursion correct + capped; no change for characters without `contents`.

### 13J — Library official category counts

**Objective:** F11 — the category grid shows real counts for official+homebrew content.
**Files:** `src/renderer/src/pages/LibraryPage.tsx`, `src/renderer/src/components/library/LibraryCategoryGrid.tsx`, `src/renderer/src/pages/LibraryPage.test.tsx` (extend if present).
**Steps:**
1. In `LibraryPage`, add `const [officialCounts, setOfficialCounts] = useState<Record<string, number>>({})` and an on-mount effect that (a) defers to idle (`const idle = window.requestIdleCallback ?? ((cb) => setTimeout(cb, 200))`), then (b) walks `getAllCategories()` SEQUENTIALLY (for…of with `await`, not `Promise.all` — avoids a 40-category fetch burst on page open; each `loadCategoryItems(cat, [])` is TTL-cached so revisits are free), accumulating `counts[cat] = items.filter(i => i.source === 'official').length`, with per-category `.catch(() => 0)` and a `cancelled` flag. Update state incrementally every few categories so counts populate progressively.
2. `const itemCounts = useMemo(() => merge of officialCounts + homebrewCounts (sum per key))` replaces `itemCounts = homebrewCounts` (:160). Update the "homebrew only for now" comment.
3. `LibraryCategoryGrid.tsx`: it already renders `itemCounts[cat.id]` (:25) — verify the rendering treats 0/undefined gracefully (show nothing until a count exists, then `N items`); adjust the label if it currently says anything homebrew-specific.
4. Test: mock `loadCategoryItems` to return fixed arrays for two categories; the merged counts include official + homebrew sums; a rejecting category contributes 0 without breaking the rest.
**Checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/pages/LibraryPage.test.tsx` (or the grid's test).
**Acceptance:** official categories show counts; page open does not block on the count walk (idle + sequential); failures degrade to no count.

### 13K — Config-store content-merge decoupling (the prerequisite step)

**Objective:** F12 — extract the homebrew/plugin merge into a reusable library module so the truth store no longer depends on `use-config-store` internals; honest comment updates.
**Files:** new `src/renderer/src/services/library/content-merge.ts` (+ `content-merge.test.ts`), `src/renderer/src/stores/use-config-store.ts`.
**Steps:**
1. Create `services/library/content-merge.ts` exporting PURE functions moved verbatim from `use-config-store.ts`: `mergeHomebrew` (:276-309), `mergePluginData` (:310-326), `categoryToHomebrewKey` (:328-414), plus their `DataCategory` typing needs (import the `DataCategory` type from the config store — type-only import, no cycle; or move the type alias too if cleaner under tsc).
2. `use-config-store.ts`: delete the private copies; import from the new module; behavior unchanged (the `get()` loader calls the same functions with the same args).
3. Rewrite the docstring debt paragraph (:19-23): the merge is now a standalone library module; the remaining (NOT this phase) step is migrating `load5e*` content reads onto the truth store per-consumer — state that plainly with no log-file pointer (the phase-plan history in `docs/phases/completed/` is the record).
4. `content-merge.test.ts`: homebrew campaign-scope filter (global entry always merges; campaign-scoped only when active id matches); `.data` unwrap + `source:'homebrew'` tagging; plugin entries appended; non-array baseData passthrough; unknown category no-op.
**Checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/services/library/content-merge.test.ts` + any existing `use-config-store` test.
**Acceptance:** merge logic importable without the zustand store; config-store behavior byte-identical (existing tests stay green); comments truthful.

### 13L — `ModalScaffold` extraction (former 33c)

**Objective:** F15 — one shared, correctly-layered dialog scaffold; `ui/Modal.tsx` becomes a thin wrapper; PHASE-33/35 build on it.
**Files:** new `src/renderer/src/components/ui/ModalScaffold.tsx` (+ `ModalScaffold.test.tsx`), `src/renderer/src/components/ui/Modal.tsx`, `src/renderer/src/components/ui/index.ts` (export).
**Steps:**
1. `ModalScaffold.tsx`: props `{ open: boolean; onClose: () => void; labelledBy?: string; ariaLabel?: string; initialFocusRef?: React.RefObject<HTMLElement>; zIndex?: number; backdropClassName?: string; children: ReactNode }`. Render `null` when closed; else a fixed `inset-0` wrapper at `style={{ zIndex: zIndex ?? Z.MODAL }}` (import `Z` from `constants/z-index`), backdrop div (click → `onClose`, `aria-hidden`), and a focus-managed container with `role="dialog"`, `aria-modal="true"`, `aria-labelledby`/`aria-label`. Move Modal.tsx's focus-trap/Escape/focus-restore mechanics (:26-70) here verbatim; honor `initialFocusRef` (focus it instead of the first focusable — the WAI-ARIA "least destructive action" hook PHASE-04 wanted).
2. Refactor `ui/Modal.tsx` to render `<ModalScaffold open onClose labelledBy={titleId}>` around its existing header/children markup, deleting its duplicated trap/Escape code. NOTE the layer change: Modal's root moves from Tailwind `z-50` to `Z.MODAL = 60` — intentional (fixes the F15 mismatch; modals must sit above `Z.MODAL_BACKDROP`-level overlays). Keep Modal's public props identical so its existing consumers (CompendiumModal etc.) need no edits.
3. Do NOT convert the 150+ game modals in this phase — out of scope (each conversion is a behavior-risk review); new modals (PHASE-33/35) adopt the scaffold directly.
4. `ModalScaffold.test.tsx`: open renders dialog semantics; Escape calls `onClose`; backdrop click calls `onClose`; Tab cycles within; `initialFocusRef` receives focus; closed renders nothing. Keep Modal.test.tsx (if present) green.
**Checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/components/ui/ModalScaffold.test.tsx src/renderer/src/components/ui/Modal.test.tsx`.
**Acceptance:** scaffold exported from `components/ui`; Modal consumers unaffected; dialog semantics covered by tests.

### 13M — 3D dice texture/UV polish

**Objective:** F19 — numbers centered on every die face; d12 shows ONE number per pentagon.
**Files:** `src/renderer/src/components/game/dice3d/dice-textures.ts` (+ test), `dice-meshes.ts` (+ test), `dice-physics.ts` (comment only).
**Steps:**
1. `createDieTexture(faceText, bgColor, textColor, size = 256, opts?: { centerV?: number; fontScale?: number })`: draw at `(size/2, size * (1 - (opts?.centerV ?? 0.5)))`; font size = `size * (opts?.fontScale ?? <existing length-based scale>)`. Keep the 6/9 underline anchored to the new center.
2. `createFaceMaterials(faceLabels, colors, isHidden, opts?)` forwards `opts` to `createDieTexture`.
3. `buildTriangularFaceDie` (d4/d8/d20): pass `{ centerV: 1/3, fontScale: faceText.length > 1 ? 0.26 : 0.34 }` — the UV triangle `(0.5,1)(0,0)(1,0)` has centroid v=1/3 and an inscribed circle ≈ 0.31·size, so 2-digit d20 labels at 0.26·size stay inside the face. (d4 keeps its current single-number-at-centroid look — the resting-face read at `dice-meshes.ts:128` is unaffected by texture placement.)
4. d10: unchanged (kite UVs are symmetric about (0.5,0.5)).
5. d12 (`_createD12`): replace the tiled triangle UVs (:276-291) with planar per-face projection: for each pentagon (3 sub-triangles, 9 verts), compute the face normal (from `computeFaceNormalsFromGeo`-style cross product), build an orthonormal basis `(u, v)` in the face plane, project the 9 vertices, then normalize the projected coords into `[0.1, 0.9]` (min/max box per face) as UVs. Each pentagon then samples the texture once, number centered. Add helper `buildPlanarFaceUVs(geo: THREE.BufferGeometry, faceCount: number, vertsPerFace: number): Float32Array` in dice-meshes.ts.
6. `dice-physics.ts:21-23`: replace "out of scope for the physics file; logged as a follow-up" with a pointer to the implemented texture/UV behavior in dice-meshes/dice-textures (one line, no log pointer).
7. Tests: `dice-textures.test.ts` — `fillText` y-coordinate honors `centerV` (mocked ctx, F19 evidence pattern at :21-47); font string honors `fontScale`. `dice-meshes.test.ts` — for the d12, assert UVs are NOT the repeated `(0.5,1,0,0,1,0)` pattern, every UV ∈ [0,1], and within one face the 3 sub-triangles have distinct UV triples; for d20, materials were created with `centerV: 1/3` (spy on `createFaceMaterials`).
**Checks:** `npx vitest run src/renderer/src/components/game/dice3d/dice-textures.test.ts src/renderer/src/components/game/dice3d/dice-meshes.test.ts`; `npx tsc --noEmit -p tsconfig.web.json`.
**Acceptance:** tests prove centroid-anchored text + planar d12 UVs; no physics/result-reading changes (faceNormals computation untouched).

### 13N — Backup-migration framework: close as already shipped

**Objective:** F14 — no implementation; record the evidence so the former 33a item dies.
**Steps:** none beyond this plan's Verified findings (F14) + the execution-time re-verification:
```bash
cd dnd-app && grep -n "BACKUP_VERSION\|BACKUP_MIGRATIONS\|migrateBackupPayload" src/renderer/src/services/io/import-export.ts && npx vitest run src/renderer/src/services/io/import-export.test.ts
```
**Acceptance:** commands above confirm the framework + green tests; note the result in `## Completed`. If (unexpectedly) the framework is missing at execution time, that contradicts this plan — rule 9 STOP-and-ask.

### 13O — Bundle-size CI guard (former 33d)

**Objective:** F16 — fail CI when built bundles grow past budget.
**Files:** new `dnd-app/scripts/maintenance/check-bundle-size.mjs`, new `dnd-app/scripts/maintenance/bundle-budgets.json`, `dnd-app/package.json` (script), `.github/workflows/dnd-app-ci.yml` (one step).
**Steps:**
1. `check-bundle-size.mjs` (node ≥20, zero deps): read `bundle-budgets.json` (shape: `{ "out/renderer": { "totalBytes": N, "maxChunkGzipBytes": M }, "out/main": { "totalBytes": N2 }, "out/preload": { "totalBytes": N3 } }`); walk each dir recursively summing file sizes; for renderer also gzip (`zlib.gzipSync`) each `.js` chunk and track the max. Print a table (actual vs budget, % headroom); exit 1 listing offenders when any budget is exceeded; exit 2 with a clear message if `out/` is missing (must run after a build).
2. Set the budgets empirically: run `npx electron-vite build` locally, run the script in report-only mode (a `--write-budgets` flag that records actual×1.25 rounded up to the nearest 50 KB), commit the generated `bundle-budgets.json`. Headroom rationale: catch runaway regressions (accidental heavyweight import) without flaking on routine growth; future phases bump the file deliberately in-diff.
3. `package.json`: `"check:bundle-size": "node scripts/maintenance/check-bundle-size.mjs"`.
4. `dnd-app-ci.yml`: add a step `- name: Bundle size guard (33d)\n  run: npm run check:bundle-size` immediately after "Verify build artifacts" (the build already ran). BLOCKING (no `continue-on-error`) — a deliberate growth edits the budgets file in the same PR/commit.
5. Test: none in vitest (script is exercised by CI itself); a local `npx electron-vite build && npm run check:bundle-size` run before the phase commit is the gate evidence — record both exit codes in `## Completed`.
**Checks:** the local build+script run above; `node --check scripts/maintenance/check-bundle-size.mjs`.
**Acceptance:** committed budgets reflect the current build +25%; CI step green on the phase commit; script fails correctly when fed a tiny fake budget (spot-check locally with `--budgets <tmpfile>` or by temporarily editing the json — do not commit that state).

### 13P — Migrate `@google/generative-ai` → `@google/genai`

**Objective:** F20 — off the EOL SDK with zero behavior change to the provider contract (streaming callbacks, inactivity guard, error classification).
**Files:** `dnd-app/package.json` (+ lockfile), `src/main/ai/gemini-client.ts`, `src/main/ai/gemini-client.test.ts` (created by PHASE-03 — rewrite mocks).
**Steps:**
1. Read the POST-PHASE-03 `gemini-client.ts` first (rule 3): PHASE-03 removes the model-level `timeout` for streaming, adds `createStreamInactivityGuard` (from `llm-provider.ts`) and passes `{ signal: guard.signal }` per request; `chatOnce` keeps a wall-clock timeout. Preserve exactly those semantics on the new SDK.
2. `npm uninstall @google/generative-ai && npm install @google/genai@^2` (Node ≥20 required — satisfied; verify `node_modules/@google/genai/package.json` engines after install).
3. Rewrite `gemini-client.ts`:
   - `import { GoogleGenAI } from '@google/genai'`; `getClient()` returns `new GoogleGenAI({ apiKey })`.
   - `streamChat`: `const chat = ai.chats.create({ model, history, config: { systemInstruction: systemPrompt } })` where `history` is the same `{role: 'user'|'model', parts: [{text}]}` mapping (`toGeminiRole` unchanged). Then `const stream = await chat.sendMessageStream({ message: lastMessage.content, config: { abortSignal: guard.signal } })`; `for await (const chunk of stream) { guard.bump(); const text = chunk.text; if (text) { fullText += text; callbacks.onText(text) } }` — **`.text` is a property in the new SDK, not a `.text()` method.** `guard.clear()` before `onDone(fullText)` and in the catch; keep PHASE-03's catch ordering + "timed out" message contract and `classifyProviderError`.
   - `chatOnce`: `await ai.models.generateContent({ model, contents, config: { systemInstruction, abortSignal: withRequestTimeout(undefined, PROVIDER_REQUEST_TIMEOUT_MS) } })` (or `httpOptions.timeout` — prefer `abortSignal` + the existing `withRequestTimeout` helper for one timeout idiom across providers); return `response.text`.
   - `validateKey`/`listModels`: UNCHANGED — they already use raw `fetch` against `generativelanguage.googleapis.com/v1beta/models` and carry no SDK dependency.
   - Caveat to encode in a comment: the new SDK's `abortSignal` is client-side only (server still completes/charges) — same as the old SDK's behavior, no contract change.
4. Rewrite `gemini-client.test.ts` mocks: `vi.mock('@google/genai', ...)` exposing a `GoogleGenAI` class whose `chats.create` returns `{ sendMessageStream: vi.fn(async () => asyncIterableOfChunks) }` and `models.generateContent` returns `{ text: '...' }`. Re-assert PHASE-03's contract: no wall-clock timeout on the streaming path; abortSignal present per-request; guard timeout surfaces "timed out" via `onError`; chunks flow to `onText`/`onDone`; `chatOnce` bounded.
5. Sweep: `grep -rn "@google/generative-ai" src package.json` → empty (lockfile will drop it on install).
**Checks:** `npx tsc --noEmit -p tsconfig.node.json`; `npx vitest run src/main/ai/gemini-client.test.ts`; `npm run audit:ci` quick-look for the new dep.
**Acceptance:** old package gone from `package.json` + `src`; provider contract tests green; streaming/once behavior byte-compatible at the `LLMProvider` interface.

### 13Q — Orphaned-comment sweep + co-DM comment correction

**Objective:** F13 + F9 — no comment in the tree points at log entries that never existed; the network-state-filter comment tells the truth.
**Files:** `src/renderer/src/stores/network-store/network-state-filter.ts` (+ any stragglers the sweep finds).
**Steps:**
1. Rewrite `network-state-filter.ts:8-10` to match reality (F9): role bucketing happens in `network-store/index.ts` `setGameStateProvider` (Phase 29e) — co-DMs and permission-granted peers receive the unfiltered `'host'` bucket; this module only implements the per-role strip. Delete the "(see SUGGESTIONS-LOG-DNDAPP.md if/when added)" clause.
2. Sweep for leftovers — the other four F13 comments must already be gone via 13I/13H/13M/13K:
```bash
grep -rn "logged to ISSUES-LOG\|logged as a follow-up\|see ISSUES-LOG\|see SUGGESTIONS-LOG" dnd-app/src --include="*.ts" --include="*.tsx"
```
Any hit that refers to a NON-EXISTENT log entry for one of this phase's items gets rewritten to describe the implemented state. Hits referring to REAL, current log entries (check `docs/ISSUES-LOG-DNDAPP.md` / `docs/SUGGESTIONS-LOG-DNDAPP.md`) are left alone.
**Checks:** the grep above; `npx tsc --noEmit -p tsconfig.web.json` (comments only — cheap sanity).
**Acceptance:** sweep returns no orphaned pointers tied to this phase's findings.

## Research notes

- **`@google/genai` migration (13P).** Old SDK support permanently ended 2025-11-30 ([deprecated-generative-ai-js](https://github.com/google-gemini/deprecated-generative-ai-js)); the official [migration guide](https://ai.google.dev/gemini-api/docs/migrate) maps `getGenerativeModel`→constructor-less `ai.models`/`ai.chats` calls, `startChat({history})`→`ai.chats.create({model, history, config})`, and moves `systemInstruction` into `config`. The new SDK ([googleapis/js-genai](https://github.com/googleapis/js-genai), v2.8.0 2026-06-03, Node ≥20) exposes `GenerateContentConfig.abortSignal` + `httpOptions` + `maxOutputTokens` ([GenerateContentConfig docs](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html)); `chat.sendMessageStream({message, config})` returns `Promise<AsyncGenerator<GenerateContentResponse>>` with `chunk.text` as a property ([Chat class docs](https://googleapis.github.io/js-genai/release_docs/classes/chats.Chat.html)). Caveat: `abortSignal` cancels client-side only — the service still completes the request ([npm @google/genai](https://www.npmjs.com/package/@google/genai)). Alternative considered: pinning the dead SDK indefinitely — rejected; no security fixes post-EOL and PHASE-03 already verified the per-request signal merge quirks that the new SDK eliminates.
- **BOOK_IMPORT allowlist (13B).** Electron security guidance: never trust renderer-supplied paths; the main process should restrict file access to user-dialog-selected paths or app-owned directories ([Electron security tutorial](https://www.electronjs.org/docs/latest/tutorial/security), [Electron IPC patterns](https://www.electronjs.org/docs/latest/tutorial/ipc)). The repo already implements exactly this for `FS_READ`/`FS_WRITE` (TTL'd dialog-path map + userData subtree, `src/main/ipc/index.ts:27-60`); 13B reuses it rather than inventing a second mechanism.
- **ModalScaffold (13L).** WAI-ARIA APG modal-dialog pattern: `role="dialog"`, `aria-modal`, labelled-by, focus containment, Escape, focus-restore, and initial focus on the least-destructive control for high-risk dialogs ([APG dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)). The repo's `ui/Modal.tsx` already implements the mechanics; the extraction is about (a) the `Z.MODAL` layering fix and (b) a headless scaffold new feature modals (PHASE-33/35) can adopt without Modal's header chrome.
- **Bundle-size guard (13O).** Alternatives: [size-limit](https://github.com/ai/size-limit) (plugin ecosystem, PR comments) and bundlesize — both add deps and assume web-app entry points; an Electron out/-dir walker with gzip via node `zlib` needs zero deps and exactly matches the existing CI build artifact step. The +25% budget convention follows the common "budget = current + headroom, bump deliberately in-diff" practice size-limit documents.
- **Wizard audio preview (13F).** `URL.createObjectURL(file)` + `Audio` element is the standard in-renderer preview for not-yet-persisted user files; object URLs must be explicitly revoked to avoid leaks ([MDN createObjectURL](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static)). Upload-at-create reuses the magic-byte-validated `AUDIO_UPLOAD_CUSTOM` handler rather than adding a path-based import (consistent with the Electron path-trust guidance above).
- **d12 planar UVs (13M).** Projecting a planar polygon's vertices onto an in-plane orthonormal basis and box-normalizing is the standard per-face UV mapping for flat-faced polyhedra (three.js `BufferGeometry` UV attribute semantics: [three.js BufferGeometry docs](https://threejs.org/docs/#api/en/core/BufferGeometry)); it guarantees one undistorted texture sample per face, which is precisely what the tiled-triangle shortcut broke.
- **Group roll (13G).** No external research needed — the repo's own `request_roll` pipeline (P6.3) is the proven in-house pattern; reusing it avoids a second message vocabulary (`dm:group-roll-request`) that the audit assumed would be needed.

## Test plan

Per sub-phase (cheap, targeted — listed in each sub-phase): new/updated files —
- 13A/13D: `src/main/ipc/ai-handlers.test.ts` (sanitize rejects; kill-switch SET/GET).
- 13B: `src/main/ipc/storage-handlers.test.ts` (allowlist enforce/pass).
- 13D: `src/renderer/src/services/trigger-action-executor.test.ts` (coords/clamp/fallback).
- 13F: new `src/renderer/src/components/campaign/AudioStep.test.tsx`.
- 13G: `src/renderer/src/components/game/modals/combat/GroupRollModal.test.tsx`.
- 13H: `CompendiumModal.test.tsx`, `SharedJournalModal.test.tsx`.
- 13I: `src/renderer/src/utils/weight-calculator.test.ts`.
- 13J: `LibraryPage.test.tsx` / grid test.
- 13K: new `src/renderer/src/services/library/content-merge.test.ts`.
- 13L: new `src/renderer/src/components/ui/ModalScaffold.test.tsx`.
- 13M: `dice-textures.test.ts`, `dice-meshes.test.ts`.
- 13P: `src/main/ai/gemini-client.test.ts` (mock rewrite onto `@google/genai`).

End-of-phase 4-gate (rule 5, once):
```bash
cd dnd-app
npm run lint
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
npx vitest run
```
Plus the 13O evidence run: `npx electron-vite build && npm run check:bundle-size`. No Pi code touched — no pytest. One commit + one push for the whole phase; move this file to `completed/` per rule 8.

## Acceptance criteria

- [ ] All ten F1 handlers (+ `AI_GET_SCENE_STATUS`) call `sanitizeCampaignId` before any filesystem-reaching work; traversal ids return error envelopes (tests).
- [ ] BOOK_IMPORT rejects paths that are neither dialog-selected nor under userData; the allowlist lives in a leaf module shared with `index.ts`.
- [ ] `AttackRequest`, the 9 SpellsTab aliases, and `_MapPing` are gone; no underscore-alias lint shims remain in those files.
- [ ] Trigger observer pausable from the Trigger Manager UI (default enabled); spawn triggers honor optional grid coordinates.
- [ ] Microphone settings UI/store fully removed; i18n keys pruned from both locales; key union regenerated.
- [ ] Wizard audio: preview plays; campaign creation uploads file bytes via `AUDIO_UPLOAD_CUSTOM`; metadata records sanitized filenames.
- [ ] DM group rolls ride `dm:roll-request`/`player:roll-result` with live results + roll-for-remaining fallback.
- [ ] Chat links open the compendium pre-navigated to category+entry; journal pins focus their entry; `MapPin` drops `linkedNpcId`/`linkedLocationId`.
- [ ] Container `contents[]` weights recurse (depth-capped) and are typed on `EquipmentItem`.
- [ ] Library grid shows official+homebrew counts, loaded idle/sequential.
- [ ] `content-merge.ts` extracted + tested; config-store delegates; debt comments rewritten truthfully.
- [ ] `ModalScaffold` shipped at `Z.MODAL` with APG semantics; `ui/Modal.tsx` delegates with an unchanged public API.
- [ ] Dice numbers centroid-anchored on triangular faces; d12 renders one number per pentagon (planar UVs); tests prove both.
- [ ] Backup-migration framework confirmed shipped (F14 evidence rerun recorded in Completed).
- [ ] `check-bundle-size.mjs` + committed budgets + blocking CI step green.
- [ ] `@google/generative-ai` fully replaced by `@google/genai`; provider contract tests green; no references remain.
- [ ] Orphaned-log-pointer sweep clean; co-DM comment corrected.
- [ ] End-of-phase 4-gate green; single phase commit pushed; plan moved to `completed/`.

## Out of scope

- **AI chat/schema `campaignId` validation beyond the ten handlers** (e.g. `AiChatRequestSchema` shape changes) — PHASE-11 owns the prompt/schema contract.
- **Gemini streaming timeout/inactivity-guard design** — PHASE-03 (this phase only ports its result to the new SDK).
- **Converting existing game modals onto `ModalScaffold`** — adopt-on-touch; PHASE-33 (`AiImageModal`) and PHASE-35 (`SceneModeModal`) consume it for new UI.
- **AI-driven `request_roll` behavior** — untouched here (PHASE-08/30 own executor changes).
- **Full content-read migration onto the library truth store** (every `load5e*` consumer) — 13K lands only the merge-extraction prerequisite; the consumer migration is future work noted in the rewritten comment.
- **In-app voice chat** (what mic settings were for) — not planned in any phase; Discord voice is Pi-side (PHASE-20/21/22).
- **`rollup-plugin-visualizer` rolldown successor** — separate Future item, not allocated here.
- **Trigger region-based spawn placement** (named region targeting) — 13D ships coordinate placement; region targeting would need region pickers in the trigger UI and is not promised anywhere in the current UI copy.
- **Compendium tab coverage for every `LibraryCategory`** — 13H falls back to search-seeding for categories without a tab; expanding `TABS` is a content/UX decision outside this debt phase.

## Completed

- **13Q (2026-06-11):** Orphaned-comment sweep + co-DM comment correction (F13 + F9). Step 1 — `network-store/network-state-filter.ts` header now states the truth: role bucketing happens upstream in `network-store/index.ts` `setGameStateProvider` (Phase 29e) where the literal host, co-DMs (`isCoDM`), and peers with both `view_hidden_tokens`+`view_dm_only_stats` get the unfiltered `'host'` bucket; this module only strips the non-DM bucket — the stale "(see SUGGESTIONS-LOG…)" clause is gone. Step 2 — final sweep `grep -rn "logged to ISSUES-LOG|logged as a follow-up|see ISSUES-LOG|see SUGGESTIONS-LOG|logged in the phase plan|tracked as a follow-up|deferred; logged" src` → empty, and a broad `grep -rn "ISSUES-LOG|SUGGESTIONS-LOG|SECURITY-LOG" src` → empty: every orphaned pointer this phase's items left behind (13A/13C/13D/13F/13G/13H/13I/13K/13M) was rewritten to describe the implemented state as it landed. No code behavior change.
- **13P (2026-06-11):** Migrated `@google/generative-ai` → `@google/genai@^2` (F20). `npm uninstall @google/generative-ai && npm install @google/genai@2.8.0` (engines node ≥20 ✓). `gemini-client.ts` rewritten on the new SDK: `getClient()` → `new GoogleGenAI({ apiKey })`; `streamChat` uses `ai.chats.create({ model, history, config: { systemInstruction } })` + `chat.sendMessageStream({ message, config: { abortSignal: guard.signal } })` and reads `chunk.text` (a PROPERTY, not `.text()`); `chatOnce` uses `ai.models.generateContent({ model, contents, config: { systemInstruction, abortSignal: withRequestTimeout(undefined, PROVIDER_REQUEST_TIMEOUT_MS) } })` returning `response.text ?? ''`. PHASE-03 semantics preserved EXACTLY: no wall-clock timeout on the streaming path (inactivity guard only), per-request abortSignal, `guard.bump/clear/timedOut` + the "timed out" message contract + `classifyProviderError` catch ordering; `validateKey`/`listModels` untouched (raw `fetch`, no SDK dep). Encoded the caveat that the new SDK's `abortSignal` is client-side only (service still completes/bills) — same as the old SDK. Test mocks rewritten for `GoogleGenAI` (`chats.create`→`sendMessageStream` async-iterable, `models.generateContent`→`{text}`); re-asserts: streaming abortSignal present + systemInstruction forwarded + chunks→onDone('Hello'); chatOnce bounded abortSignal; inactivity → "timed out" onError. tsc node clean; 3 tests green. Sweep `grep -rn "@google/generative-ai\|GoogleGenerativeAI\|getGenerativeModel" src package.json` → empty; lockfile drops it; `audit:ci` 0 vulnerabilities.
- **13O (2026-06-11):** Bundle-size CI guard (F16 / former 33d). New zero-dep `scripts/maintenance/check-bundle-size.mjs` (Node ≥20): walks `out/renderer|main|preload` summing file sizes, gzips each renderer `.js` chunk for a max-chunk metric, prints an actual/budget/%-headroom table; exit 1 listing offenders on breach, exit 2 if `out/` is missing, `--write-budgets` records actual×1.25 rounded up to 50 KB, `--budgets <f>` overrides the budgets path. New `scripts/maintenance/bundle-budgets.json` set empirically from a local `npx electron-vite build` (BUILD_EXIT=0): renderer total 143600 KB / maxChunkGzip 250 KB, main 1100 KB, preload 50 KB. (Renderer total is dominated by copied static `public/data` content — maps/5e JSON — so the gzip-chunk metric is the real code-regression signal; +25% headroom absorbs routine content growth, deliberate jumps re-run `--write-budgets` in-diff.) `package.json`: `check:bundle-size`. `.github/workflows/dnd-app-ci.yml`: BLOCKING step "Bundle size guard (13O)" right after "Verify build artifacts" (build already ran). Verified locally: `--write-budgets` then check = exit 0 (all within budget); a tiny fake budget via `--budgets` = exit 1; missing `out/` = exit 2. `node --check` clean.
- **13H (2026-06-11):** Compendium + map-pin deep-links; dropped dead pin fields (F10). `CompendiumModal` — new optional `initialCategory?: LibraryCategory` + `initialQuery?: string`; seeds `activeTab` from the category when it's in `TABS` (else `'actions'` + search-seeds the name for global fuzzy search), seeds `search` from the query, and after the first NON-EMPTY tab load auto-selects the first case-insensitive exact `name` match exactly once (`didSeedRef`, skips empty loads so the homebrew re-run still gets a chance). `GameLayout` — `handleLinkClick(category, name)` now `setCompendiumTarget({category, name})` + opens the modal (was arg-dropping); `onPinClick` sets `journalFocusEntryId = pin.linkedJournalId` before opening the journal; both targets cleared by an effect once their modal closes; threaded through `GameModalDispatcher` → `UtilityModals` → the modals. `SharedJournalModal` — new optional `initialEntryId?`; on mount (once, `didFocusRef`) scrolls the entry into view (`scrollIntoView({block:'center'})`) + flashes a 2s amber `ring-2 ring-amber-400`. `types/map.ts` — deleted `linkedNpcId?`/`linkedLocationId?` from `MapPin` (zero readers/writers repo-wide; re-grep confirmed only the type; persisted maps with the old keys keep working — extra keys ignored on read). Orphaned ISSUES-LOG / "(NPC/location deep-links are a follow-up)" comments rewritten. Tests: `CompendiumModal.test.tsx` (deep-link lands on the spells tab + auto-selects Fireball; unknown category → actions tab + search-seeded, no auto-select); `SharedJournalModal.test.tsx` (initialEntryId scrolls + highlights; none → no highlight). tsc web clean; 4 tests green.
- **13G (2026-06-11):** GroupRollModal onto the existing P2P round-trip (F7). `handleRequestRoll` no longer rolls for everyone immediately — it `clearGroupRollResults()`, `setPendingGroupRoll({id, type, ability/skill, dc, scope, isSecret})`, and `sendMessage('dm:roll-request', {...requesterId/requesterName})` (byte-mirrors `executeRequestRoll`, effect-actions.ts) so every connected player's already-shipped `RollRequestOverlay` pops; their `player:roll-result`s stream into `groupRollResults` (host-handler `addGroupRollResult`). The modal now subscribes `useGameStore((s)=>s.groupRollResults)` + `useLobbyStore((s)=>s.players)`, renders rows live (entityName/roll/modifier/total/success) with a "Waiting for N player(s)…"/"All responded" line. New "Roll for remaining" fallback (shown when ≥1 connected player hasn't responded — matched by characterId or display name) rolls DM-side via `computeModifier`+`rollSingle(20)`+`addGroupRollResult` (keeps `trigger3dDice` DM-side only), preserving solo/AFK play. `handleClose` (Escape/backdrop/×) + `handleDone` clear the pending roll + results; `handleDone` still posts the chat summary, now sourced from the live array. Dead `RollResult` type + Phase-26a "deferred" comment removed. i18n (en+es): `waitingForPlayers`/`allResponded`/`rollForRemaining`. Tests (real zustand stores + mocked dice): broadcast carries the modal dc/type + sets pending; an incoming `addGroupRollResult` renders a row; "Roll for remaining" fills only the missing player (Alice not re-rolled). tsc web clean; 3 tests green; keys regenerated. AI `request_roll` path untouched.
- **13F (2026-06-11):** Wizard AudioStep real preview + upload-on-create (F6). `AudioStep.tsx` — new optional `onFilesChange?: (files: Map<string, File>) => void` prop + internal `filesRef` (entry id → File); `handleFilesAdded` now batches ALL picked files into one `onChange` (the old per-file loop with stale `audioEntries` dropped all but the last) and emits the File map; `handlePreviewToggle(id)` plays the real bytes via `URL.createObjectURL` on a lazily-created `Audio` element, revoking the URL on stop/replace/remove/unmount (`stopPreview` + cleanup effect) — the dead "no-op placeholder" branch + `logger` import removed; `handleRemove` drops the File + re-emits. `CampaignWizard.tsx` — `audioFilesRef` holds the map via `onFilesChange`; after `createCampaign` + the id is known, each held File uploads via `window.api.audioUploadCustom(campaign.id, file.name, await file.arrayBuffer(), displayName, category)`, the entry's `fileName` is rewritten to the handler's SANITIZED `result.data.fileName` (so DMAudioPanel resolves it later), and the campaign re-saves when audio changed; per-file failures `addToast` a warning (`campaign.campaignWizard.audioUploadFailed`, en+es) and continue — never block creation. Tests: new `AudioStep.test.tsx` (adds → emits metadata + File map; non-audio ignored; preview toggles createObjectURL→play then pause→revokeObjectURL; remove drops from the map). tsc web clean; 4 tests green; keys regenerated.
- **13M (2026-06-11):** 3D dice texture/UV polish (F19). `dice-textures.ts` — `createDieTexture(..., size=256, opts?: { centerV?; fontScale? })` draws the glyph at `(size/2, size*(1-(centerV ?? 0.5)))` with font `size*(fontScale ?? <triangular-aware length default>)`; the 6/9 underline re-anchors to the shifted center; `createFaceMaterials` forwards `opts`. **Rule-3 drift correction:** the plan named `dice-meshes.ts`/`_createD12`, but the LIVE render path is `dice-generators.ts` (`createDie`→`genD12`/`genD20`); the `_create*` in dice-meshes are dead `_`-prefixed code. So the actual fix landed in `dice-generators.ts`: `makeMaterials` gained the `opts` param; d4/d8/d20 pass `{ centerV: 1/3 }` (triangular centroid; `createDieTexture` auto-shrinks 2-digit d20 labels to 0.26·size so they stay inside the smaller inscribed circle); new exported `buildPlanarFaceUVs(geo, faceCount, vertsPerFace)` projects each face onto an in-plane orthonormal basis + box-normalizes into [0.1,0.9], and d12 now uses it (one centred sample per pentagon, replacing the tiled triangle UVs) with NO centerV. The dead `dice-meshes._createD12`/`buildTriangularFaceDie` were kept consistent (import the single-source helper; no second copy). `dice-physics.ts:21-23` follow-up comment rewritten to point at the implemented behavior (no log pointer). Tests: `dice-textures.test.ts` (+centerV y-coord, fontScale font string, 2-digit shrink, underline anchor); `dice-generators.test.ts` (+createFaceMaterials 4th-arg spy: d4/d8/d20 `centerV 1/3`, d12 none; +`.sub` on the Vector3 mock); new real-three `dice-planar-uvs.test.ts` (108-vert dodecahedron → UVs ∈[0,1], NOT the `(0.5,1,0,0,1,0)` tile, 3 distinct sub-triangle triples per face, [0.1,0.9] box-normalized both axes). tsc web clean; 65 tests green across the 4 files.
- **13L (2026-06-11):** `ModalScaffold` extraction (F15). New headless `ui/ModalScaffold.tsx` owns the WAI-ARIA modal mechanics (`role="dialog"`+`aria-modal`, focus trap, Escape, focus restore, `initialFocusRef` for least-destructive initial focus) at `Z.MODAL` (60) — fixing the old `z-50` mismatch. `ui/Modal.tsx` refactored to a thin header-chrome wrapper around it (public props unchanged, so CompendiumModal etc. need no edits; its duplicated trap/Escape code deleted). Exported from `components/ui`. 150+ game modals NOT converted (out of scope). Tests: `ModalScaffold.test.tsx` (closed→null, dialog semantics, Escape, backdrop click, initialFocusRef focus). tsc web clean; 5 tests green.
- **13J (2026-06-11):** Library official category counts (F11). `LibraryPage` — new `officialCounts` state populated by an idle-callback SEQUENTIAL walk over `getAllCategories()` (`loadCategoryItems(cat.id, [])` → count `source==='official'`; progressive updates every 5 categories; per-category `.catch`→0; cancelled flag) instead of a 40-category fetch burst on page open; passed to `LibraryCategoryGrid` as `totalCounts` (the grid already renders official `totalCounts` + homebrew `itemCounts` separately). "homebrew only" comment updated. Test: new `LibraryCategoryGrid.test.tsx` (official count renders, official + homebrew render together, no chip when both zero). tsc web clean; 4 tests green.
- **13N (2026-06-11):** Backup-migration framework — closed as ALREADY SHIPPED (F14, no code change). Verified `import-export.ts` has `BACKUP_VERSION = 4`, the per-target-version `BACKUP_MIGRATIONS` map, and the `migrateBackupPayload` chain walker (import normalizes older backups, rejects newer); `import-export.test.ts` green (32 tests). The former 33a item is dead.
- **13K (2026-06-11):** Config-store content-merge decoupling (F12). New `services/library/content-merge.ts` exports the `DataCategory` type + `mergeHomebrew`/`mergePluginData`/`categoryToHomebrewKey` (moved verbatim from `use-config-store.ts`). `use-config-store.ts` imports them (the loader calls the same functions with the same args — behavior byte-identical) and dropped the private copies + the local `DataCategory` union; debt docstring rewritten (merge is now a standalone module; the remaining per-consumer truth-store migration is noted plainly, no log pointer). Tests: `content-merge.test.ts` (global vs campaign-scoped homebrew filter, `.data` unwrap + `source:'homebrew'`, plugin append, non-array passthrough, no-entry no-op, kebab key map). tsc web clean; 8 new + existing config-store tests green.
- **13I (2026-06-11):** Container `contents[]` weight recursion (F8). `EquipmentItem` (`character-5e.ts`) gains `contents?: EquipmentItem[]`. `weight-calculator.ts` — new `equipmentItemWeight(item, depth)` helper sums `(weight ?? 0) * (quantity ?? 1)` plus each `contents` child recursively, depth-8 capped (cycle/abuse guard for untrusted imports); the flat equipment loop now calls it; orphaned-log comment replaced. Tests: nested container sums all; quantity multiplies per level; 10-deep nesting truncates at 8; no-contents regression unchanged. tsc web clean; 31 tests green.
- **13E (2026-06-11):** Removed the dead microphone-settings surface (F5 — no consumer or planned consumer). `git rm` `MicrophoneSettings.tsx` + `use-mic-settings-store.ts`; dropped the SettingsPage import + `<Section>` block; deleted the `settings.microphoneSettings` namespace (its only contents) from both locales + the `pages.settingsPage.microphone` key; regenerated keys. `grep useMicSettingsStore|MicrophoneSettings|microphoneSettings|mic-settings src` → empty. tsc web clean; locale-parity/generated-keys/key-check + SettingsPage smoke green.
- **13D (2026-06-11):** Trigger kill switch + spawn placement (F17/F18). New channels `AI_TRIGGER_SET_ENABLED`/`AI_TRIGGER_GET_ENABLED`; handlers (SET via `withArgsSchema(z.tuple([z.boolean()]))` → `setTriggerObserverEnabled` + returns `{enabled}`; GET returns `{enabled: isTriggerObserverEnabled()}`); preload `setTriggerObserverEnabled`/`getTriggerObserverEnabled` (+ d.ts). `TriggerManagerModal` — a header "Pause all triggers"/"Resume all" toggle (seeded from `getTriggerObserverEnabled()`, default enabled) + an amber "Triggers paused" pill; the `spawn_creature` form gains Grid X/Y inputs ("blank = map centre") written to `actionPayload.gridX/gridY` only when both are valid non-negative integers. `trigger-action-executor.ts` `spawn_creature` uses `payload.gridX/gridY` clamped to the map's grid bounds, else the centre fallback. New i18n keys (en+es): `gridX`/`gridY`/`spawnCoordsHint`/`pauseAll`/`resumeAll`/`pausedBadge`. Tests: SET flips GET + non-boolean rejected; executor uses configured coords, clamps OOB, falls back to centre. tsc web+node clean; 25 tests green across 2 files.
- **13C (2026-06-11):** Dead-code removal (F3/F4). Deleted `AttackType` + the ~40-field `AttackRequest` interface from `combat-resolver.ts` (zero consumers; AttackType referenced only by AttackRequest). Removed the 9 structured-spell type imports + their `type _X = Y` lint-suppression aliases from `SpellsTab.tsx`. Removed `type MapPing` import + `type _MapPing` alias from `MapCanvas.tsx`. Fixed the stale `// === Structured spell types (for future migration) ===` comment in `spell-data-types.ts` → "(consumed by services/character/spell-data.ts)". `grep AttackRequest|_SpellAction|_MapPing src` → empty; tsc web clean.
- **13B (2026-06-11):** Enforced the dialog allowlist on `BOOK_IMPORT` (F2). New leaf module `src/main/ipc/dialog-allowlist.ts` holds `dialogAllowedPaths`/TTL + `addDialogPath`/`isPathAllowed`/`consumeDialogPath` (moved verbatim from `index.ts`, which now imports them — no cycle since storage-handlers is imported BY index). `BOOK_IMPORT` (`storage-handlers.ts`) adds `if (!isPathAllowed(sourcePath)) throw` after the existing `..`/null-byte check; comment updated. Index's FS_WRITE/WRITE_BINARY one-shot path consumption uses `consumeDialogPath`. Tests: unregistered path → `{success:false}` + importBook not called; `addDialogPath` then import passes; userData-subtree path passes without registration. tsc node clean; 9+15 tests green.
- **13A (2026-06-11):** Closed the F1 path-traversal hole. Added `sanitizeCampaignId(campaignId)` as the first filesystem-reaching guard in the 10 unguarded AI handlers (`AI_PREPARE_SCENE`, `AI_TOKEN_BUDGET_PREVIEW`, `AI_GENERATE_END_OF_SESSION_RECAP`, the 7 memory handlers) + `AI_GET_SCENE_STATUS` for uniformity. For handlers with their own try/catch the call sits inside it (structured `{success:false}` envelope); the rest rely on the `_safe` wrapper. Tests (new memory-manager mock): `../../evil` → `{success:false}` + `getMemoryManager` never called; valid UUID passes through; AI_PREPARE_SCENE traversal → error envelope + `prepareScene` not called. tsc node clean; 15 tests green.
