# PHASE-33 — Inline AI image generation (NPC portraits, scene art, items)

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Add opt-in, DM-triggered AI image generation to the VTT: a DM opens an "AI Image" tool, describes an NPC / scene / item / creature (or pre-fills from the last AI DM narration), and the app generates an image via a locally hosted Stable Diffusion endpoint (AUTOMATIC1111-compatible `/sdapi/v1/txt2img`) with an optional cloud fallback (OpenAI `gpt-image-*` or Gemini `gemini-2.5-flash-image`, reusing the API keys the AI DM config already stores). The result is saved to the existing image library and can be attached in one click as a handout (shareable to players), an NPC portrait, or a map-token image — all through pipelines that already exist and already accept base64 data URLs. The whole feature is **off by default** (`enabled: false`); when disabled, nothing changes in the app beyond a settings card and a tool button that opens an "enable it in settings" empty state. This is the "in-game image generation" competitor-parity feature (Friends & Fables ships it; Foundry's Cibola 8 wires OpenAI/Stability/BFL image models into the VTT).

## Dependencies & cross-phase notes

- **No prerequisite phases** (PHASE-INDEX row 33: *(no deps)*). Everything this phase builds on (image library storage, handout pipeline, token/NPC image fields, AI config persistence, IPC scaffolding) already exists and was verified below.
- **PHASE-10 (ai-dm-ui-truth)** edits `src/renderer/src/components/campaign/AiProviderSetup.tsx` and `src/renderer/src/pages/campaign-detail/AiDmCard.tsx`. This phase does NOT touch `AiProviderSetup.tsx` at all; it adds a **new sibling component** (`AiImageSetup.tsx`) and one small additive `<Card>` block in `AiDmCard.tsx`. If PHASE-10 has already landed, re-read `AiDmCard.tsx` before editing (its Save gating may have changed); the addition stays additive either way.
- **PHASE-11 (prompt-schema-contract)** owns the "AI Vision wire-images-or-strip" decision for `src/main/ai/ai-vision.ts`. Do NOT touch `ai-vision.ts` in this phase — image *generation* and image *understanding* are separate surfaces.
- **PHASE-09 (chat-commands-cleanup)** owns the chat-command registry and adds a duplicate-name collision test. This phase deliberately adds **no** chat command (no `/image`), avoiding registry churn. A command can be layered later.
- **PHASE-12 (i18n-wording-sweep)** — all new UI strings in this phase land in BOTH `en.json` and `es.json` with `npm run i18n:gen-keys` re-run, so PHASE-12's parity tests stay green regardless of execution order.
- **PHASE-13** contains a "ModalScaffold (33c)" item. If a shared `ModalScaffold` component exists at execution time, build `AiImageModal` on it; otherwise mirror `AiMapAnalysisModal.tsx` (verified structure below).
- **PHASE-14 (ai-observability)** also adds IPC channels/preload entries. Both phases append to `src/shared/ipc-channels.ts`, `src/preload/index.ts`, `src/preload/index.d.ts` — purely additive on both sides; trivial merge.
- **PHASE-34 (battlemap-generation)** is the *structured-spec* map generator (rooms/walls/doors JSON rendered procedurally) — image-model battlemaps are explicitly NOT this phase and NOT that phase's approach. Do not add a "battlemap" subject preset here.
- **PHASE-35 (scene-mode)** will want full-bleed scene art. The `scene` subject preset + image-library persistence added here is its natural source; keep generated-image library IDs stable (`aiimg-<uuid>`).

## Verified findings

All verification run 2026-06-10 against the live tree at the repo root (`dnd-app/` prefix omitted inside commands where `cd dnd-app` is implied; commands below are written runnable from the repo root).

### F1 — No image generation exists anywhere in the app today

```bash
grep -rn "txt2img\|imageGen\|image-gen\|generateImage" dnd-app/src --include="*.ts" --include="*.tsx"
```
returns **zero hits**. The feature is net-new. The audit's one-line recommendation ("In-game image generation for scenes/NPC portraits … Optional, behind provider config") matched reality; nothing to correct.

### F2 — AI provider config: shape, persistence, key encryption (the pattern to mirror)

- `src/main/ai/types.ts:5-14` — `AiConfig { provider, model, ollamaUrl, claudeApiKey?, openaiApiKey?, geminiApiKey?, ollamaModel? }`.
- `src/main/ai/llm-provider.ts:3` — `AiProviderType = 'ollama' | 'claude' | 'openai' | 'gemini'`. The `LLMProvider` interface (`llm-provider.ts:21-39`) is **text-only** (`streamChat`/`chatOnce`/`isAvailable`/`listModels`) — image generation must be a separate adapter type, not a `LLMProvider` extension.
- `src/main/ai/ai-service.ts:299-301` — config persists to `join(app.getPath('userData'), 'ai-config.json')`; `configure()` (`ai-service.ts:325-375`) writes via `atomicWriteFile` with API keys passed through `encryptOptional`; `getConfig()` (`ai-service.ts:376-401`) reads back through `decryptOptional`. `src/main/storage/safe-secret-storage.ts:10,28` exports `encryptOptional` / `decryptOptional`.
- Cloud key setters per provider live in the clients: `src/main/ai/openai-client.ts:7-9` `setOpenAIApiKey`; `src/main/ai/gemini-client.ts:7-9` `setGeminiApiKey`. The `openai` SDK is a direct dependency (`package.json:231` — `"openai": "^6.39.1"`), and `@google/generative-ai` `^0.24.1` (`package.json:224`) is the **deprecated** Google SDK (no image-output support) — Gemini image calls must go over raw REST (see Research).

Verify:
```bash
sed -n '5,14p' dnd-app/src/main/ai/types.ts
sed -n '299,301p;325,330p;376,380p' dnd-app/src/main/ai/ai-service.ts
grep -n '"openai"\|@google/generative-ai\|@anthropic-ai/sdk' dnd-app/package.json
```

### F3 — IPC boundary conventions (zod at the boundary, safe envelopes)

- `src/shared/ipc-channels.ts` — flat `IPC_CHANNELS` const; AI channels at lines 58-140 (`ai:*` namespace), image-library channels at lines 227-230 (`image-library:*`). New channels get a commented `// === AI Image Generation ===` section.
- `src/shared/ipc-schemas.ts:5-13` — `AiConfigSchema` (zod, defaults inline) is the model for a new `AiImageConfigSchema`. `ai-handlers.ts:108-112` shows the consumption pattern: `AiConfigSchema.safeParse(config)` → error envelope on failure → use `parsed.data`.
- `src/main/ipc/_safe.ts:38-40` — `handle(channel, handler)` registers with throw-containment (`{ success: false, error }` envelope); `_safe.ts:51-66` — `withSchema(channel, Schema, fn)` validates the first arg with zod before the body runs. Use `handle` + `withSchema` for all new handlers.
- `src/main/ipc/index.ts:64-248` — `registerIpcHandlers()` calls each `registerXxxHandlers()`; new file `image-gen-handlers.ts` registers there.

Verify:
```bash
grep -n "AI_CONFIGURE\|IMAGE_LIBRARY_SAVE" dnd-app/src/shared/ipc-channels.ts
sed -n '38,40p;51,66p' dnd-app/src/main/ipc/_safe.ts
grep -n "registerAiHandlers()" dnd-app/src/main/ipc/index.ts
```

### F4 — Image library storage: ready-made persistence for generated images

`src/main/storage/image-library-storage.ts`:
- `saveImage(id, name, buffer, extension)` (lines 38-74) → writes to `userData/image-library/<id><ext>` + `<id>.meta.json` via `atomicWriteFile`. Constraints: `IMAGE_ID_RE = /^[a-zA-Z0-9_-]+$/` (line 7), allowed extensions include `.png` (line 8), **`MAX_IMAGE_SIZE = 10 MB`** (line 9) — a 1024×1024 generated PNG (typically 1.2-2.5 MB) fits comfortably.
- `listImages()` / `getImage(id)` / `deleteImage(id)` (lines 79-176).
- The IPC wrapper (`src/main/ipc/storage-handlers.ts:367-377`) additionally runs `validateUploadExtension` (magic-byte check, `src/main/upload-validation.ts:64-72`) — call the same validator on generated bytes before `saveImage` for symmetry (a provider returning JPEG bytes labeled PNG would otherwise slip through).

Verify:
```bash
sed -n '7,9p;38,46p' dnd-app/src/main/storage/image-library-storage.ts
sed -n '64,72p' dnd-app/src/main/upload-validation.ts
sed -n '366,378p' dnd-app/src/main/ipc/storage-handlers.ts
```

### F5 — Handout pipeline already carries base64 images end-to-end (attachment target #1)

- `src/renderer/src/types/game-state.ts:242-250` — `Handout { id, title, contentType: 'image' | 'text', content /* base64 for images */, visibility: 'all' | 'dm-only', createdAt, pages? }`.
- `src/renderer/src/stores/game/time-slice.ts:191-201` — `addHandout` / `updateHandout` / `removeHandout` store actions; `stores/game/types.ts:299-301` declares them on the store type.
- `HandoutModal.tsx:42-48` builds image handouts with `FileReader.readAsDataURL` — i.e. handout image `content` is a **data URL**, the exact thing a generation result can produce.
- Network share: `DmModals.tsx:184-186` sends `sendMessage('dm:share-handout', { handout })`; the AI executor path `src/renderer/src/services/game-actions/effect-actions.ts:652-675` (`executeShareHandout`) does `gameStore.addHandout(handout)` + the same `dm:share-handout` broadcast. An AI-emittable `share_handout` DM action already exists (`src/main/ai/dm-actions.ts:475`, prompt-documented at `src/main/ai/prompt-sections/dm-actions-schema.ts:227`) — so once an image handout exists, every existing share path works unchanged.

Verify:
```bash
sed -n '242,250p' dnd-app/src/renderer/src/types/game-state.ts
grep -n "readAsDataURL" dnd-app/src/renderer/src/components/game/modals/dm-tools/HandoutModal.tsx
grep -n "share_handout" dnd-app/src/main/ai/dm-actions.ts dnd-app/src/renderer/src/services/game-actions/effect-actions.ts
```

### F6 — NPC portraits and map tokens already accept data-URL images (attachment targets #2 and #3)

- `src/renderer/src/types/campaign.ts:189-208` — `NPC { id, name, description, portraitPath?, … }`; NPCs live on `campaign.npcs` (`campaign.ts:111`) and are persisted by spreading + `saveCampaign` (pattern at `src/renderer/src/components/game/sidebar/LeftSidebar.tsx:154-155`: `await saveCamp({ ...campaign, npcs, updatedAt: new Date().toISOString() })`). `useCampaignStore` exposes `saveCampaign` (`src/renderer/src/stores/use-campaign-store.ts:61,135`). `portraitPath` is consumed as a raw `<img src>` via `IconPicker.getCharacterIconProps` (`src/renderer/src/components/builder/shared/IconPicker.tsx:140-150`) — data URLs work.
- `src/renderer/src/types/map.ts:91-96` — `MapToken { …, imagePath?: string }`. `TokenEditorModal.tsx:112-113` **already sets `imagePath` to a `FileReader` data URL** (`applyUpdate({ imagePath: dataUrl })`), so a generated data URL is byte-for-byte the same shape tokens use today, and it syncs to clients through existing game-state sync. Token updates: `updateToken(mapId, tokenId, updates)` (`stores/game/types.ts:112`).

Verify:
```bash
sed -n '189,196p' dnd-app/src/renderer/src/types/campaign.ts
sed -n '91,97p' dnd-app/src/renderer/src/types/map.ts
sed -n '110,114p' dnd-app/src/renderer/src/components/game/modals/dm-tools/TokenEditorModal.tsx
grep -n "updateToken" dnd-app/src/renderer/src/stores/game/types.ts
```

### F7 — DM-tools modal infrastructure (where the new UI plugs in)

- `src/renderer/src/components/game/active-modal-types.ts` — `ActiveModal` string-literal union (≈60 entries incl. `'handout'`, `'aiMapAnalysis'`); colocated test `active-modal-types.test.ts` enumerates every literal in a `validModals` array — **adding a literal requires adding it to that test array too**.
- `src/renderer/src/components/game/modal-groups/DmModals.tsx:181-203` — render pattern: `{activeModal === 'aiMapAnalysis' && effectiveIsDM && <AiMapAnalysisModal onClose={close} />}` (note `effectiveIsDM` gating, not `isDM`).
- `src/renderer/src/components/game/bottom/DMTabPanel.tsx:349-366` — the `'utility'` tab's button row (`onOpenModal('handout')` etc.; `onOpenModal: (modal: string) => void` at line 16) is where the launcher button goes.
- `AiMapAnalysisModal.tsx:1-60` is the closest structural reference: `useT()`, `useEscapeKey(onClose)`, local `loading/error/result` state, async handler calling `window.api.ai.*`.

Verify:
```bash
grep -n "aiMapAnalysis" dnd-app/src/renderer/src/components/game/active-modal-types.ts dnd-app/src/renderer/src/components/game/modal-groups/DmModals.tsx
sed -n '349,356p' dnd-app/src/renderer/src/components/game/bottom/DMTabPanel.tsx
```

### F8 — Preload exposure + type declarations

- `src/preload/index.ts:80-185` — `ai: { … }` namespace of `ipcRenderer.invoke` wrappers; event listeners use `ipcRenderer.on` + a matching `removeXxxListener` that calls `removeAllListeners` (e.g. `onTriggerFired`/`removeTriggerListener` at lines 170-181). A new sibling `aiImage: { … }` namespace follows the same shape.
- `src/preload/index.d.ts:196` — `interface AiAPI`; `index.d.ts:813-826` — `interface Window { api: CharacterAPI & … }` with `ai: AiAPI` at line 826 inside `WindowAPI` (line 342). Add `AiImageAPI` + wire it the same way.

Verify:
```bash
grep -n "ai: {" dnd-app/src/preload/index.ts
grep -n "interface AiAPI\|interface WindowAPI\|ai: AiAPI" dnd-app/src/preload/index.d.ts
```

### F9 — AI DM settings surface (where the config UI plugs in)

- `src/renderer/src/pages/campaign-detail/AiDmCard.tsx` (133 lines) renders a `<Card title={t('pages.aiDmCard.title')}>` plus a `<Modal>` hosting `<AiProviderSetup …>`. Campaign-level AI config is `campaign.aiDm?: AiDmConfig` (`types/campaign.ts:63-74`); app-level config is the main-process `ai-config.json` (F2). Image-gen config is **app-level** (an endpoint + model choice, like `ollamaUrl`), so it gets its own `ai-image-config.json` and its own settings component; only the card hosting it is campaign-page UI.
- `src/renderer/src/stores/use-ai-dm-store.ts:61` — `messages: AiMessage[]` exists on the AI DM store; the modal's "use last narration" prefill reads the last assistant message from it.

Verify:
```bash
grep -n "AiProviderSetup\|Card" dnd-app/src/renderer/src/pages/campaign-detail/AiDmCard.tsx | head
grep -n "messages: AiMessage\[\]" dnd-app/src/renderer/src/stores/use-ai-dm-store.ts
```

### F10 — i18n conventions

- Locales: `src/renderer/src/i18n/locales/en.json` + `es.json`; top-level groups `common, builder, campaign, game, levelup, library, settings, lobby, notify, pages, sheet, ui`. DM-panel strings live under `game.dmTabPanel.*`; campaign-config strings under `campaign.*` / `pages.aiDmCard.*`.
- Key-union codegen: `npm run i18n:gen-keys` (`package.json:34` → `scripts/i18n/gen-key-union.mjs` → writes `src/renderer/src/i18n/generated-keys.ts`). Parity/key tests exist (`i18n/locale-parity.test.ts`, `i18n/key-check.test.ts`) — adding a key to only one locale fails the suite.

Verify:
```bash
grep -n "i18n:gen-keys" dnd-app/package.json
ls dnd-app/src/renderer/src/i18n/locales
```

### F11 — Adjacent-but-not-this-phase surfaces (do not touch)

- `src/main/ai/ai-vision.ts:103-196` — vision/screenshot path is text-only today (`encodeForVision` produces `imageBase64` that is never sent; only a "(A screenshot … captured for reference.)" string is appended). PHASE-11 owns the fix/strip decision. Confirmed unchanged:
```bash
grep -n "captured for reference" dnd-app/src/main/ai/ai-vision.ts
```
- `src/renderer/src/services/chat-commands/` — command registry; PHASE-09 owns it; no new commands here.

## Sub-phases

Order keeps the tree green: shared contracts → main logic → handlers/preload → renderer settings → renderer modal. Per INSTRUCTIONS rule 5, run only the listed cheap checks per sub-phase; the full 4-gate runs once at phase end.

### 33A — Shared contracts: channels, schemas, config store (main + shared)

**Objective.** Define the IPC channel names, zod schemas, and the main-process config persistence module for image generation. No behavior yet.

**Files.**
- `src/shared/ipc-channels.ts` (edit — add channels)
- `src/shared/ipc-schemas.ts` (edit — add schemas)
- `src/main/ai/image/image-gen-config.ts` (new)
- `src/main/ai/image/image-gen-config.test.ts` (new)

**Steps.**
1. In `ipc-channels.ts`, after the `AI_TRIGGER_STATE_UPDATE` block (line ≈129), add:
   ```ts
   // === AI Image Generation (Phase 33) ===
   AI_IMAGE_GET_CONFIG: 'ai-image:get-config',
   AI_IMAGE_CONFIGURE: 'ai-image:configure',
   AI_IMAGE_CHECK_PROVIDERS: 'ai-image:check-providers',
   AI_IMAGE_GENERATE: 'ai-image:generate',
   // main → renderer progress event (sd-webui polling)
   AI_IMAGE_PROGRESS: 'ai-image:progress',
   ```
2. In `ipc-schemas.ts`, add (mirroring `AiConfigSchema` style, defaults inline):
   ```ts
   export const AiImageProviderTypeSchema = z.enum(['sd-webui', 'openai', 'gemini'])
   export const AiImageSizeSchema = z.enum(['1024x1024', '1024x1536', '1536x1024'])
   export const AiImageConfigSchema = z.object({
     enabled: z.boolean().default(false),
     provider: AiImageProviderTypeSchema.default('sd-webui'),
     fallbackProvider: AiImageProviderTypeSchema.or(z.literal('none')).default('none'),
     sdWebuiUrl: z.string().url().default('http://127.0.0.1:7860'),
     sdModel: z.string().max(200).optional(),       // override_settings.sd_model_checkpoint
     sdSteps: z.number().int().min(1).max(150).default(28),
     sdSampler: z.string().max(60).default('Euler a'),
     sdCfgScale: z.number().min(1).max(30).default(7),
     openaiModel: z.string().max(80).default('gpt-image-1'),
     openaiQuality: z.enum(['low', 'medium', 'high', 'auto']).default('low'),
     geminiModel: z.string().max(80).default('gemini-2.5-flash-image'),
     size: AiImageSizeSchema.default('1024x1024')
   })
   export type ValidatedAiImageConfig = z.infer<typeof AiImageConfigSchema>

   export const AiImageSubjectSchema = z.enum(['npc-portrait', 'scene', 'item', 'creature', 'custom'])
   export const AiImageGenerateRequestSchema = z.object({
     subjectType: AiImageSubjectSchema,
     description: z.string().min(1).max(4000),
     stylePreset: z.enum(['painterly', 'ink-sketch', 'photorealistic', 'isometric']).optional(),
     negativePrompt: z.string().max(2000).optional(),
     size: AiImageSizeSchema.optional()
   })
   export type ValidatedAiImageGenerateRequest = z.infer<typeof AiImageGenerateRequestSchema>
   ```
   Deliberate: **no API-key fields** — cloud calls reuse `claudeApiKey`-style keys already persisted/encrypted by `ai-service.ts` (F2); the SD endpoint is keyless on a LAN.
3. New `src/main/ai/image/image-gen-config.ts`:
   - `getImageGenConfigPath()` → `join(app.getPath('userData'), 'ai-image-config.json')`.
   - `getImageGenConfig(): ValidatedAiImageConfig` — read file if present, `AiImageConfigSchema.parse({ ...defaults, ...saved })` (parse of `{}` yields all defaults → `enabled:false`), in-memory cache mirroring `ai-service.ts:376-401`.
   - `configureImageGen(config: ValidatedAiImageConfig): Promise<void>` — set cache + `atomicWriteFile(path, JSON.stringify(config))` (import from `../../storage/atomic-write` like `ai-service.ts` does). Nothing here is secret, so no `encryptOptional` needed.
4. Test `image-gen-config.test.ts`: mock `electron`'s `app.getPath` to a temp dir (copy the mocking approach used by `src/main/storage/settings-storage.test.ts`); assert (a) missing file → defaults with `enabled === false`, (b) configure→get roundtrip, (c) corrupt JSON on disk → defaults, not a throw.

**Cheap checks.**
```bash
cd dnd-app && npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json
npx vitest run src/main/ai/image/image-gen-config.test.ts
```

**Acceptance.** Channels + schemas compile in both tsconfigs; config module roundtrips with `enabled` defaulting to `false`; test file green.

### 33B — Provider clients + fallback orchestrator (main)

**Objective.** Three image-provider adapters behind a single `generateImage()` entry point with primary→fallback ordering.

**Files.**
- `src/main/ai/image/image-provider.ts` (new — types + orchestrator)
- `src/main/ai/image/sd-webui-client.ts` (new)
- `src/main/ai/image/sd-webui-client.test.ts` (new)
- `src/main/ai/image/openai-image-client.ts` (new)
- `src/main/ai/image/openai-image-client.test.ts` (new)
- `src/main/ai/image/gemini-image-client.ts` (new)
- `src/main/ai/image/gemini-image-client.test.ts` (new)
- `src/main/ai/image/image-provider.test.ts` (new)

**Steps.**
1. `image-provider.ts` — contracts:
   ```ts
   export interface ImageGenRequest { prompt: string; negativePrompt?: string; width: number; height: number }
   export type ImageGenOutcome =
     | { success: true; base64: string; mimeType: 'image/png' | 'image/jpeg'; provider: AiImageProviderType; model: string }
     | { success: false; error: string }
   export interface ImageProviderAdapter {
     type: AiImageProviderType
     isAvailable(config: ValidatedAiImageConfig): Promise<boolean>
     generate(req: ImageGenRequest, config: ValidatedAiImageConfig, signal?: AbortSignal): Promise<ImageGenOutcome>
   }
   ```
   Orchestrator `generateImage(req, config)`: resolve primary adapter from `config.provider`; on `{ success: false }` (or thrown) and `config.fallbackProvider !== 'none'` and ≠ primary, try the fallback once; return outcome plus `usedFallback: boolean`. Hard timeout per attempt: `IMAGE_REQUEST_TIMEOUT_MS = 300_000` (image gen is much slower than chat — A1111 on CPU/older GPUs can take minutes; do NOT reuse the chat `PROVIDER_REQUEST_TIMEOUT_MS`). Build the per-attempt signal with `AbortSignal.any([callerSignal, AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS)])` guarded for caller-signal absence.
2. `sd-webui-client.ts` (AUTOMATIC1111-compatible — also covers SD.Next and Forge, which expose the same `/sdapi/v1` routes):
   - `generate`: `fetch(`${config.sdWebuiUrl}/sdapi/v1/txt2img`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal })` with body `{ prompt, negative_prompt, steps: config.sdSteps, sampler_name: config.sdSampler, cfg_scale: config.sdCfgScale, width, height, ...(config.sdModel ? { override_settings: { sd_model_checkpoint: config.sdModel }, override_settings_restore_afterwards: true } : {}) }`. Response JSON `{ images: string[], parameters, info }` — `images[0]` is base64 PNG (no data-URL prefix). Unset fields use server defaults per the upstream API contract.
   - `isAvailable`: `GET ${url}/sdapi/v1/sd-models` with a 3 s `AbortSignal.timeout`; `res.ok` → true; any throw → false.
   - `getProgress(url, signal)`: `GET ${url}/sdapi/v1/progress?skip_current_image=true` → `{ progress: number /* 0..1 */, eta_relative: number }`; export for 33C's poller. Tolerate non-OK/parse failure by returning `null`.
3. `openai-image-client.ts`:
   - Key from `aiService.getConfig().openaiApiKey` (import `* as aiService from '../ai-service'`); `isAvailable` = key non-empty.
   - `generate`: `new OpenAI({ apiKey })` then `client.images.generate({ model: config.openaiModel, prompt, size: `${width}x${height}` as never, quality: config.openaiQuality }, { signal })`. For `gpt-image-*` models the response is base64 by default (`response.data[0].b64_json`); when `config.openaiModel.startsWith('dall-e')` additionally pass `response_format: 'b64_json'`. Missing `b64_json` → `{ success: false }` with a clear error. Note: `gpt-image-*` ignores `negativePrompt` — fold avoid-lists into the prompt (33C handles this).
   - Factor the params object into an exported pure `buildOpenAiImageParams(config, prompt, width, height)` so the unit test needs no SDK mock.
4. `gemini-image-client.ts` — **raw REST** (the installed `@google/generative-ai` 0.24.x SDK is deprecated and lacks image-output modality support; do not add a new SDK dep):
   - Key from `aiService.getConfig().geminiApiKey`; `isAvailable` = key non-empty.
   - `POST https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent` with headers `{ 'x-goog-api-key': key, 'Content-Type': 'application/json' }` and body `{ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }`.
   - Parse `candidates[0].content.parts[]`, find the part with `inlineData` (`{ mimeType, data }`, camelCase in the REST JSON) → base64 + mimeType. No image part (safety block etc.) → `{ success: false, error }` including any `promptFeedback.blockReason`. Gemini ignores explicit size — request the aspect ratio in prose (33C) and accept the returned dimensions.
5. Tests (all with `vi.stubGlobal('fetch', vi.fn())` / restoring after):
   - `sd-webui-client.test.ts` — payload field mapping (incl. `override_settings` only when `sdModel` set), base64 extraction from `images[0]`, non-OK HTTP → failure outcome, `isAvailable` true/false paths, `getProgress` parse + null on failure.
   - `openai-image-client.test.ts` — `buildOpenAiImageParams`: gpt-image model gets no `response_format`, dall-e gets `b64_json`; quality/size mapping.
   - `gemini-image-client.test.ts` — body shape (responseModalities), inlineData extraction, text-only response → failure with blockReason surfaced.
   - `image-provider.test.ts` — fallback fires only on primary failure, respects `'none'`, never retries the same adapter, reports `usedFallback`.

**Cheap checks.**
```bash
cd dnd-app && npx tsc --noEmit -p tsconfig.node.json
npx vitest run src/main/ai/image/sd-webui-client.test.ts src/main/ai/image/openai-image-client.test.ts src/main/ai/image/gemini-image-client.test.ts src/main/ai/image/image-provider.test.ts
```

**Acceptance.** All four test files green; no renderer/preload changes yet; `tsconfig.node` clean.

### 33C — Prompt builder (main)

**Objective.** Deterministic prompt templates per subject type so a DM's plain-English description becomes a competent image prompt, with provider-aware negative-prompt handling.

**Files.**
- `src/main/ai/image/image-prompt.ts` (new)
- `src/main/ai/image/image-prompt.test.ts` (new)

**Steps.**
1. `buildImagePrompt(subjectType, description, stylePreset, providerType)` → `{ prompt, negativePrompt }`:
   - `npc-portrait`: `Fantasy character portrait, head and shoulders, ${description}, detailed face, dramatic lighting, neutral dark background` 
   - `scene`: `Fantasy landscape illustration, wide establishing shot, ${description}, atmospheric depth, cinematic composition`
   - `item`: `Single fantasy item illustration, ${description}, centered on a plain parchment background, no hands, studio lighting`
   - `creature`: `Fantasy monster illustration, full body, ${description}, dynamic pose, dungeon ambiance`
   - `custom`: `description` verbatim.
   - Style suffixes: `painterly` → `, oil painting style, visible brushwork`; `ink-sketch` → `, black ink sketch, crosshatching, monochrome`; `photorealistic` → `, photorealistic, 8k detail`; `isometric` → `, isometric view, game asset style`.
2. Default negative prompt (SD only): `text, watermark, signature, logo, blurry, lowres, deformed hands, extra fingers, extra limbs, jpeg artifacts` — merged with a user-supplied `negativePrompt` (user's first, comma-joined, deduplicated). For `openai`/`gemini` providers return `negativePrompt: undefined` and instead append `\nDo not include any text, lettering, watermarks, or signatures in the image.` to the prompt (those APIs have no negative-prompt parameter).
3. Export `SUBJECT_TEMPLATES` keyed by `AiImageSubjectSchema` values so the test can assert exhaustiveness against the zod enum (`AiImageSubjectSchema.options`).
4. Tests: every enum option produces a non-empty distinct prompt; `custom` is verbatim; style suffix appended exactly once; SD gets the negative list, cloud gets the appended instruction instead; user negative merged ahead of defaults.

**Cheap checks.**
```bash
cd dnd-app && npx vitest run src/main/ai/image/image-prompt.test.ts && npx tsc --noEmit -p tsconfig.node.json
```

**Acceptance.** Pure module, fully unit-tested, exhaustive over the subject enum.

### 33D — IPC handlers + preload exposure (main + preload)

**Objective.** Wire config/check/generate over IPC with validation, single-flight guarding, library persistence, and sd-webui progress events.

**Files.**
- `src/main/ipc/image-gen-handlers.ts` (new)
- `src/main/ipc/image-gen-handlers.test.ts` (new)
- `src/main/ipc/index.ts` (edit — import + call `registerImageGenHandlers()`)
- `src/preload/index.ts` (edit — `aiImage` namespace)
- `src/preload/index.d.ts` (edit — `AiImageAPI` + wire into `WindowAPI`)

**Steps.**
1. `registerImageGenHandlers()` using `handle` from `./_safe`:
   - `AI_IMAGE_GET_CONFIG` → `getImageGenConfig()`.
   - `AI_IMAGE_CONFIGURE` → `handle(ch, withSchema(ch, AiImageConfigSchema, async (_e, cfg) => { await configureImageGen(cfg); return { success: true } }))`.
   - `AI_IMAGE_CHECK_PROVIDERS` → `{ sdWebui: await sdAdapter.isAvailable(cfg), openai: Boolean(aiService.getConfig().openaiApiKey), gemini: Boolean(aiService.getConfig().geminiApiKey) }`.
   - `AI_IMAGE_GENERATE` → `withSchema(ch, AiImageGenerateRequestSchema, …)`:
     a. `const cfg = getImageGenConfig(); if (!cfg.enabled) return { success: false, error: 'Image generation is disabled. Enable it in the AI DM settings.' }` (renderer maps this to the i18n empty state — match on a stable `disabled` flag in the envelope: return `{ success: false, error, disabled: true }`).
     b. Single-flight: module-level `let inFlight = false`; if set, return `{ success: false, error: 'A generation is already in progress.' }`; `try/finally` resets.
     c. `buildImagePrompt(...)` with the **effective provider** (primary), parse `size` → width/height.
     d. If primary is `sd-webui`: start a 1 s `setInterval` poller calling `getProgress(cfg.sdWebuiUrl)` and `event.sender.send(IPC_CHANNELS.AI_IMAGE_PROGRESS, { progress, etaSeconds })` (guard `event.sender.isDestroyed()`); clear in `finally`.
     e. `const result = await generateImage(req, cfg)`; on failure return the envelope.
     f. On success: `const buf = Buffer.from(result.base64, 'base64')`; `const ext = result.mimeType === 'image/jpeg' ? '.jpg' : '.png'`; run `validateUploadExtension(buf, ext)` (mismatch → failure envelope); `const id = `aiimg-${randomUUID()}``; name = first 60 chars of description prefixed by subject type; `await saveImage(id, name, buf, ext)`.
     g. Return `{ success: true, imageId: id, dataUrl: `data:${result.mimeType};base64,${result.base64}`, provider: result.provider, model: result.model, usedFallback: result.usedFallback }`.
2. `src/main/ipc/index.ts`: `import { registerImageGenHandlers } from './image-gen-handlers'` + call it next to `registerAiHandlers()` (`index.ts:218`).
3. Preload `src/preload/index.ts` — after the `ai` namespace:
   ```ts
   aiImage: {
     getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.AI_IMAGE_GET_CONFIG),
     configure: (config: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.AI_IMAGE_CONFIGURE, config),
     checkProviders: () => ipcRenderer.invoke(IPC_CHANNELS.AI_IMAGE_CHECK_PROVIDERS),
     generate: (request: Record<string, unknown>) => ipcRenderer.invoke(IPC_CHANNELS.AI_IMAGE_GENERATE, request),
     onProgress: (cb: (data: { progress: number; etaSeconds: number }) => void) => {
       ipcRenderer.on(IPC_CHANNELS.AI_IMAGE_PROGRESS, (_e, data) => cb(data))
     },
     removeProgressListener: () => {
       ipcRenderer.removeAllListeners(IPC_CHANNELS.AI_IMAGE_PROGRESS)
     }
   },
   ```
4. `src/preload/index.d.ts`: add `interface AiImageAPI { … }` mirroring the above (config type: a local `AiImageConfigData` interface with the schema's fields, all optional like `AiConfigData` at `index.d.ts:137-145`; generate result: `{ success: boolean; error?: string; disabled?: boolean; imageId?: string; dataUrl?: string; provider?: string; model?: string; usedFallback?: boolean }`), then `aiImage: AiImageAPI` next to `ai: AiAPI` (line ≈826).
5. `image-gen-handlers.test.ts`: follow the existing main-handler test pattern (see `src/main/ipc/storage-handlers.test.ts` for the electron/ipcMain mocking approach already in the tree): capture registered handlers, then assert (a) generate with `enabled:false` config → `{ success:false, disabled:true }` and **no provider call**, (b) generate happy path (stub `generateImage` + `saveImage` via `vi.mock`) returns `dataUrl` with correct prefix and calls `saveImage` with an `aiimg-` id and `.png`, (c) second concurrent generate → already-in-progress error, (d) configure rejects an invalid payload (bad URL) via envelope.

**Cheap checks.**
```bash
cd dnd-app && npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json
npx vitest run src/main/ipc/image-gen-handlers.test.ts
```

**Acceptance.** Handlers registered + validated + single-flight; disabled-by-default short-circuit proven by test; preload/API types compile in both configs.

### 33E — Renderer: settings card (opt-in surface)

**Objective.** A DM-facing settings panel to enable the feature, pick providers, set the SD endpoint, and test connectivity — without touching `AiProviderSetup.tsx`.

**Files.**
- `src/renderer/src/components/campaign/AiImageSetup.tsx` (new)
- `src/renderer/src/components/campaign/AiImageSetup.test.tsx` (new)
- `src/renderer/src/pages/campaign-detail/AiDmCard.tsx` (edit — additive Card)
- `src/renderer/src/i18n/locales/en.json` + `es.json` (edit — new keys)
- `src/renderer/src/i18n/generated-keys.ts` (regenerated)

**Steps.**
1. `AiImageSetup.tsx`: on mount `window.api.aiImage.getConfig()` into local state. Controls (reuse `components/ui` primitives used by `AiProviderSetup`): enabled toggle; primary-provider select (`sd-webui` / `openai` / `gemini`); fallback select (`none` + the other two); `sdWebuiUrl` text input with inline hint that the server needs the `--api` flag; collapsible "Advanced (Stable Diffusion)" group (`sdModel`, `sdSteps`, `sdSampler`, `sdCfgScale`); cloud group (`openaiModel` text input — default shown, NOT a hardcoded dropdown, per the PHASE-10 lesson about renderer model-id literals; `openaiQuality` select; `geminiModel` text input); size select. "Test connection" button → `checkProviders()` → per-provider ✓/✗ chips (openai/gemini chips read "API key present" semantics — label them accordingly). Save → `configure(config)`; surface the error envelope on failure. Cloud-key absence note links the user to the AI DM provider setup (keys are managed there; this panel stores none).
2. `AiDmCard.tsx`: below the existing AI-DM `<Card>`, add `<Card title={t('pages.aiDmCard.imageGenTitle')}>` containing a one-line description + a Configure button opening a second `<Modal>` hosting `<AiImageSetup />`. Keep the edit additive (PHASE-10 coordination, see Dependencies).
3. i18n: add `campaign.aiImageSetup.*` (≈25 keys: title, enable, provider, fallback, none, sdUrl, sdUrlHint, advanced, sdModel, steps, sampler, cfgScale, cloud, openaiModel, quality, geminiModel, size, testConnection, connectionOk, keyPresent, keyMissing, save, saved, error, disabledNote) and `pages.aiDmCard.imageGenTitle`, `pages.aiDmCard.imageGenDescription`, `pages.aiDmCard.imageGenConfigure` to **both** `en.json` and `es.json` (translate es properly; AI-DM naming consistency per PHASE-12 conventions), then `npm run i18n:gen-keys`.
4. `AiImageSetup.test.tsx`: mock `window.api.aiImage`; assert (a) renders with `enabled:false` from getConfig, (b) toggling + Save calls `configure` with `enabled:true` and the edited URL, (c) Test connection renders the three status chips from a mocked `checkProviders`, (d) configure failure envelope surfaces the error text.

**Cheap checks.**
```bash
cd dnd-app && npm run i18n:gen-keys && npx tsc --noEmit -p tsconfig.web.json
npx vitest run src/renderer/src/components/campaign/AiImageSetup.test.tsx src/renderer/src/i18n/locale-parity.test.ts
```

**Acceptance.** Settings card reachable from the campaign-detail AI DM area; saving persists through main; locale parity test green; `AiProviderSetup.tsx` untouched (`git diff --stat` shows no change to it).

### 33F — Renderer: AI Image modal + attachment actions

**Objective.** The generation UI: describe → generate (with progress) → preview → attach as handout / NPC portrait / token image; library save is automatic.

**Files.**
- `src/renderer/src/components/game/active-modal-types.ts` (edit — add `'aiImage'`)
- `src/renderer/src/components/game/active-modal-types.test.ts` (edit — add to `validModals`)
- `src/renderer/src/components/game/modals/dm-tools/AiImageModal.tsx` (new)
- `src/renderer/src/components/game/modals/dm-tools/AiImageModal.test.tsx` (new)
- `src/renderer/src/components/game/modal-groups/DmModals.tsx` (edit — render branch)
- `src/renderer/src/components/game/bottom/DMTabPanel.tsx` (edit — utility-tab button)
- `src/renderer/src/i18n/locales/en.json` + `es.json` (edit), `generated-keys.ts` (regenerated)

**Steps.**
1. `active-modal-types.ts`: append `| 'aiImage'`; add `'aiImage'` to the `validModals` array in `active-modal-types.test.ts` (F7 — the test enumerates literals).
2. `AiImageModal.tsx` (model on `AiMapAnalysisModal.tsx`, F7; use ModalScaffold if PHASE-13's landed):
   - State: `config` (from `getConfig()` on mount), `subjectType`, `description`, `stylePreset`, `loading`, `progress`, `result`, `error`, `attachMsg`.
   - Disabled gate: when `config.enabled === false` (or a generate envelope returns `disabled: true`) render an empty state — `t('game.aiImageModal.disabledTitle')` + hint pointing at campaign settings — with no generate button.
   - "Use last narration" button: `useAiDmStore` → last message with `role === 'assistant'`; prefill `description` with its `content` truncated to 600 chars; hidden when no messages.
   - Generate: subscribe `window.api.aiImage.onProgress` before invoking, render a progress bar (sd-webui only; indeterminate spinner otherwise), `await generate({ subjectType, description, stylePreset })`, cleanup with `removeProgressListener()` on done AND on unmount (`useEffect` cleanup — listener-leak lesson from PHASE-05's findings).
   - Preview: `<img src={result.dataUrl}>` capped height, plus provider/model/`usedFallback` caption and "saved to image library" note with the `imageId`.
   - Attach actions (visible only with a result):
     - **Handout**: build `{ id: crypto.randomUUID(), title: <description ≤60 chars>, contentType: 'image', content: result.dataUrl, visibility, createdAt: Date.now() }`; `useGameStore.addHandout(handout)`; a "share with players" checkbox switches `visibility` to `'all'` and additionally `useNetworkStore.getState().sendMessage('dm:share-handout', { handout })` (mirrors `effect-actions.ts:670-673`).
     - **NPC portrait**: select from `useCampaignStore((s) => s.currentCampaign)?.npcs ?? []`; on apply `saveCampaign({ ...campaign, npcs: npcs.map((n) => n.id === selId ? { ...n, portraitPath: result.dataUrl } : n), updatedAt: new Date().toISOString() })` (LeftSidebar pattern, F6).
     - **Token image**: select from active map tokens (`useGameStore` `maps`/`activeMapId`); on apply `updateToken(activeMapId, tokenId, { imagePath: result.dataUrl })` (TokenEditorModal precedent, F6).
   - Each attach sets a transient success message; keep the modal open for multi-attach.
3. `DmModals.tsx`: `{activeModal === 'aiImage' && effectiveIsDM && <AiImageModal onClose={close} />}` (match the `aiMapAnalysis` branch incl. `effectiveIsDM`).
4. `DMTabPanel.tsx` utility tab (after the `handout` button, line ≈351): `<button className={btnClass} onClick={() => onOpenModal('aiImage')}>{t('game.dmTabPanel.aiImage')}</button>`.
5. i18n: `game.dmTabPanel.aiImage` + `game.aiImageModal.*` (≈30 keys: title, subjectType + 5 option labels, description, descriptionPlaceholder, useLastNarration, style + 4 option labels, generate, generating, progressEta, disabledTitle, disabledHint, savedToLibrary, provider, fallbackUsed, attachHandout, shareWithPlayers, handoutAdded, attachNpc, npcUpdated, attachToken, tokenUpdated, noNpcs, noTokens, error, close) in both locales; `npm run i18n:gen-keys`.
6. `AiImageModal.test.tsx`: mock `window.api.aiImage` + stores; assert (a) disabled config renders the empty state and never calls `generate`, (b) happy path renders the preview `img` with the returned dataUrl, (c) handout attach adds a handout with `contentType: 'image'` and dm-only visibility by default, and the share checkbox triggers `sendMessage('dm:share-handout', …)`, (d) progress listener removed on unmount.

**Cheap checks.**
```bash
cd dnd-app && npm run i18n:gen-keys && npx tsc --noEmit -p tsconfig.web.json
npx vitest run src/renderer/src/components/game/modals/dm-tools/AiImageModal.test.tsx src/renderer/src/components/game/active-modal-types.test.ts
```

**Acceptance.** DM utility tab shows the button; modal gates on the opt-in flag; all three attach paths drive existing store actions only (no new sync message types); modal test + modal-types test green.

## Research notes

**Why these three providers.** The benchmark integrations are Friends & Fables (in-game scene/NPC image generation as a GM feature — [fables.gg](https://fables.gg/)) and Foundry's Cibola 8, which wires "OpenAI, Google, Stability AI, Black Forest Labs, Recraft, Ideogram" image models into the VTT for character portraits, item illustrations, and scene art, with a client-only bring-your-own-OpenAI-key mode ([foundryvtt.com/packages/cibola8](https://foundryvtt.com/packages/cibola8)). This app already persists OpenAI and Gemini keys for the AI DM (F2), so those two cloud providers are free to support — no new key UX. Stability AI ([platform.stability.ai](https://platform.stability.ai/)) and BFL FLUX ([docs.bfl.ai](https://docs.bfl.ai/)) would each need new key fields + storage and are deferred (Out of scope). The local-first primary is an AUTOMATIC1111-compatible endpoint because that one API shape covers A1111, SD.Next, and Forge, runs fully offline (fits the app's local-Ollama ethos), and is trivially testable.

**AUTOMATIC1111 API specifics.** Server must run with `--api`; endpoints under `/sdapi/v1/*`; `POST /sdapi/v1/txt2img` accepts a partial payload (`prompt`, `negative_prompt`, `steps`, `sampler_name`, `cfg_scale`, `width`, `height`, …) and "the API will use the defaults for anything I don't set"; the response carries `images` (base64 strings), `parameters`, `info`. Per-request model override goes through `override_settings: { sd_model_checkpoint }` rather than mutating server options; persistent switching is `POST /sdapi/v1/options`. Sources: [A1111 API wiki](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/API), [API discussion #3734](https://github.com/AUTOMATIC1111/stable-diffusion-webui/discussions/3734), [randombits txt2img guide](https://randombits.dev/articles/stable-diffusion/txt2img), [randombits API guide](https://randombits.dev/articles/stable-diffusion/api). Progress polling: `GET /sdapi/v1/progress?skip_current_image=true` → `{ progress: 0..1, eta_relative, state }` (same wiki; also surfaced by the [webuiapi PyPI wrapper](https://pypi.org/project/webuiapi/)). Caveat: A1111 supports optional `--api-auth user:pass` basic auth — not modeled here (LAN/self-host assumption); if a user runs with auth the request fails with 401 and the error envelope surfaces it.

**OpenAI Images API.** `client.images.generate({ model, prompt, size, quality })`; for `gpt-image-1`-family models the image returns base64 by default (`data[0].b64_json`), `quality ∈ low|medium|high|auto`, `size ∈ 1024x1024|1024x1536|1536x1024`; `response_format: 'b64_json'` is only needed (and only valid) for `dall-e-2/3`. There is also a `moderation` parameter (`low` relaxes false positives) and newer models (`gpt-image-1.5`, `gpt-image-1-mini`) share the parameter surface — which is why `openaiModel` is a free-text config field (defaulting to `gpt-image-1`), not a hardcoded dropdown. Cost reality (why `quality` defaults to `low`): roughly $0.02 / $0.07 / $0.19 per square image at low/medium/high for gpt-image-1; gpt-image-1-mini from ~$0.005. Sources: [API reference — create image](https://developers.openai.com/api/reference/python/resources/images/methods/generate), [image-generation guide](https://platform.openai.com/docs/guides/image-generation), [OpenAI cookbook — GPT Image](https://cookbook.openai.com/examples/generate_images_with_gpt_image), [pricing](https://developers.openai.com/api/docs/pricing), [third-party price tracker](https://costgoat.com/pricing/openai-images).

**Gemini image generation.** Model `gemini-2.5-flash-image` ("Nano Banana"), `POST …/v1beta/models/<model>:generateContent` with `x-goog-api-key` header; request `generationConfig.responseModalities: ['TEXT','IMAGE']`; the image arrives as `candidates[0].content.parts[].inlineData.data` (base64) with `mimeType`. Aspect ratios are supported via `imageConfig`/prompt phrasing; exact pixel sizes are not honored — the plan treats Gemini size as advisory. The installed `@google/generative-ai` SDK is the deprecated generation (superseded by `@google/genai`) and predates image-output modality, hence raw `fetch` instead of an SDK upgrade in this phase. Sources: [Gemini image generation docs](https://ai.google.dev/gemini-api/docs/image-generation), [production announcement + aspect ratios](https://developers.googleblog.com/en/gemini-2-5-flash-image-now-ready-for-production-with-new-aspect-ratios/), [intro post](https://developers.googleblog.com/introducing-gemini-2-5-flash-image/).

**Design choices.**
- *Opt-in, DM-only, user-triggered.* Generation is never AI-initiated in this phase (no new DM action verb): cloud images cost real money per call and local SD calls take 10 s–minutes; an LLM free to emit "generate" actions could burn both. The existing `share_handout` action means an AI-initiated pathway can be added later as a small follow-up once usage patterns are known.
- *Data URLs over file paths for attachments.* Handouts (F5), NPC portraits and tokens (F6) all already consume data URLs and replicate through existing campaign-save/game-state sync; introducing file-path references would add a cross-machine resolution problem (clients don't share the host's `userData`). The library copy (F4) is the durable artifact; the data URL is the wire format. A 1024×1024 PNG data URL is ~1.5-2.5 MB — the same magnitude as user-uploaded handout images today.
- *Separate config file (`ai-image-config.json`) instead of extending `ai-config.json`.* Keeps `AiConfigSchema`/`configure()` untouched (PHASE-03/04/10 all orbit that file) and avoids the `getConfig()` disk-clobber interaction documented in the PHASE-03 allocation.
- *Single-flight guard.* Local SD servers queue requests but a second click would double cloud spend; one in-flight generation per app instance is the honest UX.
- *Timeout.* 300 s per attempt — image generation on consumer GPUs/CPU regularly exceeds the 120 s chat timeout; reusing the chat constant would make slow-but-healthy local generations look like failures (the exact failure mode the Ollama prefill-timeout work fixed for text).

## Test plan

- **33A** `src/main/ai/image/image-gen-config.test.ts` — defaults (enabled:false), roundtrip, corrupt-file fallback.
- **33B** `sd-webui-client.test.ts`, `openai-image-client.test.ts`, `gemini-image-client.test.ts`, `image-provider.test.ts` — payload mapping, base64 extraction, error envelopes, availability checks, fallback ordering.
- **33C** `image-prompt.test.ts` — exhaustive over `AiImageSubjectSchema.options`, provider-aware negative handling.
- **33D** `src/main/ipc/image-gen-handlers.test.ts` — disabled gate, happy path (library save + dataUrl), single-flight, invalid-config rejection.
- **33E** `AiImageSetup.test.tsx` — load/edit/save, provider check chips, error surfacing. Locale parity (`i18n/locale-parity.test.ts`, `key-check.test.ts`) must stay green after key additions.
- **33F** `AiImageModal.test.tsx` — disabled empty state, generate→preview, handout attach (+share message), progress-listener cleanup; `active-modal-types.test.ts` updated for `'aiImage'`.
- **End-of-phase 4-gate** (INSTRUCTIONS rule 5, run once after 33F): `cd dnd-app && npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run`. No Pi code is touched, so no pytest leg.

## Acceptance criteria

1. With a fresh profile (no `ai-image-config.json`), the app behaves identically to before except: a new "AI image generation" card on the campaign-detail AI DM area and a new utility-tab button whose modal shows the disabled empty state. `getImageGenConfig().enabled === false` by default (test-proven).
2. With the feature enabled and a reachable A1111-compatible server, Generate produces an image, saves it to `userData/image-library/aiimg-<uuid>.png` with metadata, and renders a preview; sd-webui generations show live progress.
3. With `fallbackProvider` set and the primary failing, the request succeeds via the fallback and the UI reports `usedFallback`.
4. A generated image attaches as (a) a dm-only handout — and broadcasts via `dm:share-handout` when sharing is checked, (b) an NPC `portraitPath`, (c) a token `imagePath` — each via existing store actions, verified by the modal test plus the existing handout/token pipelines.
5. No new API-key storage; OpenAI/Gemini image calls reuse the keys from `ai-config.json`; missing key → clean per-provider error, never a crash.
6. All new IPC inputs are zod-validated (`withSchema`); every new channel is in `ipc-channels.ts`; schemas in `ipc-schemas.ts`; no `any` without a biome-ignore reason; all new strings exist in both locales; full 4-gate green.
7. `AiProviderSetup.tsx`, `ai-vision.ts`, and the chat-command registry are untouched.

## Out of scope

- **Text-to-battlemap generation** (structured room/wall/door specs) — PHASE-34.
- **Cinematic scene-mode** full-bleed art consumption — PHASE-35 (this phase only produces and stores `scene` images it can use).
- **AI vision / sending images TO providers** (`ai-vision.ts` wire-or-strip) — PHASE-11.
- **A `/image` chat command** — deferred until after PHASE-09's registry cleanup + collision test land; the modal is the only entry point this phase.
- **AI-initiated generation** (a `generate_image` DM action the model can emit) — future follow-up; cost/latency guardrails first.
- **Stability AI / Black Forest Labs (FLUX) / Recraft / Ideogram providers** — would each require new key storage + UX; the adapter interface added in 33B is the extension point.
- **ComfyUI workflow-API support** — different (graph-based) API shape; A1111-compatible servers only in this phase.
- **img2img / inpainting / upscaling / background removal** (Cibola-8-style canvas tools) — txt2img only.
- **Per-NPC automatic portrait generation on first appearance** — pairs with PHASE-25 entity records, not here.

## Completed

<!-- Filled during execution per INSTRUCTIONS.md rule 17 (per-sub-phase file:line citations + one-line summaries). -->
