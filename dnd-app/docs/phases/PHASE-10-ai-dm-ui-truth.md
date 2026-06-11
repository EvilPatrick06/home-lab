# PHASE-10 — AI DM UI truth: honest status, provider-correct labels, error affordances

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Make every AI-DM-facing surface in the renderer tell the truth. Today the DM tab and settings dropdown hardcode "Ollama" regardless of the configured provider; the chat status bar shows a green "AI ready" dot while readiness is unknown, never re-checks after the one probe at mount, and hides the paused state; the token meter hardcodes "23,000" in both locale files while the real budget lives main-side; the provider-setup wizard hardcodes default model IDs that drift from main, silently swallows Ollama-detection failures, renders an empty model dropdown on cloud-list failure, and lets any non-empty garbage API key pass the wizard gate; the campaign AiDmCard prefills the API key from the wrong provider and persists it under the new provider on an ungated Save that swallows configure errors; the inline AI error line has no dismiss/retry; AiContextPanel renders list failures as "no files" and clears memory silently even when clearing fails; the live stream preview shows raw `[STAT_CHANGES]`/`[DM_ACTIONS]` JSON and sits below the fold with no auto-scroll; and NarrationOverlay grows unbounded past the viewport with no dialog semantics. This phase fixes all fourteen findings — pure renderer/i18n work plus one tiny read-only IPC endpoint — with no behavior change to the AI pipeline itself.

## Dependencies & cross-phase notes

PHASE-INDEX lists no formal dependency for this phase, but phases execute in numeric order, so 01–09 have landed when this runs. That matters in four places:

- **PHASE-01 (`ollama-context-window`)** — 10C's token-meter max comes from the `getEffectiveBudgets()` / `getActiveContextWindow()` exports PHASE-01 added to `src/main/ai/token-budget.ts` (PHASE-01 explicitly states: "This phase exposes `getEffectiveBudgets()` / `getActiveContextWindow()` from `token-budget.ts` so PHASE-10 can interpolate the real cap; it adds NO renderer UI controls"). Verify they exist before starting 10C:
  `grep -n "export function getEffectiveBudgets\|export function getActiveContextWindow" dnd-app/src/main/ai/token-budget.ts`
  If missing (PHASE-01 drifted), that is a rule-9 stop.
- **PHASE-03 (`provider-stream-reliability`)** — made main's `getConfig()` a pure in-memory read (no disk clobber), so 10B's periodic renderer probe calling `window.api.ai.getConfig()` + `checkProviders()` is safe and cannot revert the Ollama model auto-switch. PHASE-03 also gave `listOllamaModels()` a timeout, so the probe cannot hang.
- **PHASE-04 (`ai-store-approval-hygiene`)** — edited `use-ai-dm-store.ts` (status clearing in `cancelStream`/`reset`/`initFromCampaign`/`handleDone`) and the GameLayout overlay mount gates. 10E adds one new store action (`clearLastError`) to the same store — additive, no overlap. PHASE-04's plan noted "PHASE-10 owns handleDone stream-preview tag-stripping changes"; this phase deliberately does NOT touch `handleDone` — preview sanitization happens at the display site (ChatPanel) so the dead `ai-renderer-actions` strip call in `handleDone` stays untouched for **PHASE-08** (which owned that pipeline's removal — re-check what `handleDone` looks like post-08 before editing the store).
- **PHASE-05 (`stream-listener-lifecycle`)** — sub-phase 05D rewrote `AiProviderSetup.tsx`'s `onOllamaProgress` listener registration (removed the `progressListenerRegistered` ref, added a dedicated effect with cleanup) and created `AiProviderSetup.test.tsx`. 10G edits other parts of the same file — do NOT touch the progress-listener effect; EXTEND the existing test file rather than creating it.

Coordinate forward:

- **PHASE-12 (`i18n-wording-sweep`)** owns the hardcoded full-view `Send` literal at `ChatPanel.tsx:465` and the AI/AI-DM naming-consistency sweep across `en.json`/`es.json`. This phase only ADDS new keys (both locales) and rewrites the `game.chatPanel.tokens` key — it does not rewrite existing wording.
- **PHASE-14 (`ai-observability`)** builds the connection-status badge, truncation alert, and `fileReadStatus` indicator. 10B extracts the status bar into a dedicated `AiDmStatusBar` component precisely so PHASE-14 has a clean mount point — keep that component presentational (props in, JSX out).
- **PHASE-13** touches `GameLayout.tsx`; this phase does NOT (NarrationOverlay changes are entirely inside the overlay component file; its `GameLayout.tsx:1025` call site is unchanged).

All line numbers below were verified 2026-06-10 against the pre-phase-run tree; phases 01–09 will have shifted some of them. Re-run each finding's verification commands (rule 3) and trust symbols over line numbers.

## Verified findings

### F1 — DMTabPanel + SettingsDropdown hardcode "Ollama" as the AI label (UX/medium)

`src/renderer/src/components/game/bottom/DMTabPanel.tsx:51` declares `const aiModel = 'Ollama'`, rendered at `:209` via `t('game.dmTabPanel.aiDmLabel', { model: aiModel })` (en: `"AI DM ({{model}})"`, es: `"DM de IA ({{model}})"`). `src/renderer/src/components/game/overlays/SettingsDropdown.tsx:99` declares the same literal inside `AiDmSettingsSection()` (defined at `:96`, rendered at `:107` with a `capitalize` class). Claude/OpenAI/Gemini campaigns therefore display "AI DM (Ollama)". Neither site reads the campaign's actual config even though both have access: `DMTabPanel` receives `campaign: Campaign` as a prop (`DMTabPanel.tsx:17`), and `SettingsDropdown`'s parent holds `campaign` (`SettingsDropdown.tsx:32`) and mounts the section at `:392` gated on `campaign.aiDm?.enabled && isDM` — but passes nothing down. The truth source is `campaign.aiDm` (`src/renderer/src/types/campaign.ts:63-74`: `provider?: AiProviderType`, `model?: string`, deprecated `ollamaModel?: string`), the same source `AiDmCard` already uses for its display (`AiDmCard.tsx:53-54`). Provider display names exist at `src/renderer/src/constants/app-constants.ts:110-115` (`AI_PROVIDER_LABELS`).

Verification:
```bash
grep -n "aiModel" dnd-app/src/renderer/src/components/game/bottom/DMTabPanel.tsx \
  dnd-app/src/renderer/src/components/game/overlays/SettingsDropdown.tsx
# → DMTabPanel.tsx:51 const aiModel = 'Ollama' / :209 use; SettingsDropdown.tsx:99 / :107
grep -n "AiDmSettingsSection" dnd-app/src/renderer/src/components/game/overlays/SettingsDropdown.tsx
# → defined :96 (no props), mounted :392
```

Known limitation (accepted): `campaign.aiDm` can lag the live config if main auto-switches the model mid-session (`model_switched`); the store already posts a chat note + DM alert for that event, so the label staying on the configured model is acceptable.

### F2 — Chat status bar: unknown-as-ready, never re-checks, paused invisible (UX/medium)

`src/renderer/src/components/game/bottom/ChatPanel.tsx`:

- Readiness state `aiUsable: boolean | null` (`:151`, null = unknown/still-checking). The probe effect (`:152-179`) runs once per `[isDM, aiEnabled]` change, calls `window.api.ai.getConfig()` + `window.api.ai.checkProviders()` (`:160`), and its `catch` resets to `null` (`:172-174`) — so a FAILED probe and a not-yet-finished probe are indistinguishable from each other.
- The dot (`:420-425`) renders `aiIsTyping ? accent-pulse : aiUsable === false ? amber : green` — i.e. `null` (unknown or check-failed) renders the GREEN ready dot. Same for the label (`:426-431`): `null` → `t('game.chatPanel.aiReady')`.
- No re-check ever happens: Ollama dying mid-session leaves the dot green until the user leaves the game.
- `aiPaused` is read at `:141` and consulted for routing at `:262` but never displayed anywhere in the status bar — a paused AI shows "AI ready".
- `checkProviders()` (main: `src/main/ai/ai-service.ts:415-428`) returns `{ ollama, ollamaModels, ollamaHasUsableModel, claude, openai, gemini }`; the renderer picks the field matching `cfg.provider` (`:163-171`). The `false` branch label is `aiNoModel` ("No model installed — pull one in AI settings", `en.json:905`) — wrong for cloud providers, where `false` means key invalid/endpoint unreachable.

Verification:
```bash
sed -n '150,180p' dnd-app/src/renderer/src/components/game/bottom/ChatPanel.tsx   # probe effect
sed -n '417,438p' dnd-app/src/renderer/src/components/game/bottom/ChatPanel.tsx   # status bar render
grep -n "aiPaused" dnd-app/src/renderer/src/components/game/bottom/ChatPanel.tsx  # :141 read, :262 routing — no render
sed -n '415,428p' dnd-app/src/main/ai/ai-service.ts                               # ProviderStatus shape
```

### F3 — Token meter hardcodes "23,000" in locale strings; real budget lives main-side (verified rec)

`en.json:907`: `"tokens": "~{{used}} / 23,000 tokens"`; es.json same key: `"~{{used}} / 23.000 tokens"`. `ChatPanel.tsx:432-437` passes only `{ used }` (sum of AI-conversation message chars / 4, `.toLocaleString()`). Pre-PHASE-01 `src/main/data/token-budgets.json` declared `total: 25000` (PHASE-01 step 01C rewrites it to `21500` and makes budgets dynamic), so the string disagreed with the engineered budget and goes staler still after 01. The honest comparison for "Estimated conversation tokens" (`tokensTitle`, `en.json:906`) is the **conversation-history effective budget** — the slice of the window the conversation actually gets (`getEffectiveBudgets().conversationHistory`, default raw value 4000) — not the whole window. No renderer-reachable source for that number exists: `AI_TOKEN_BUDGET` (`src/main/ipc/ai-handlers.ts:297-299`) returns `getLastTokenBreakdown()` (the last *measured* context build), not the budgets. `token-budgets.json` is imported only by `src/main/ai/token-budget.ts:21` — main-process only; the renderer cannot import it.

Verification:
```bash
python3 - <<'EOF'
import json
for loc in ('en','es'):
    d = json.load(open(f'dnd-app/src/renderer/src/i18n/locales/{loc}.json'))
    print(loc, repr(d['game']['chatPanel']['tokens']))
EOF
# → '~{{used}} / 23,000 tokens' / '~{{used}} / 23.000 tokens'
sed -n '432,438p' dnd-app/src/renderer/src/components/game/bottom/ChatPanel.tsx   # only `used` interpolated
grep -rn "token-budgets" dnd-app/src --include='*.ts' --include='*.tsx'           # sole importer: token-budget.ts
grep -n "AI_TOKEN_BUDGET\b" dnd-app/src/main/ipc/ai-handlers.ts                   # returns last breakdown, not budgets
```

### F4 — Provider-default model IDs hardcoded in the renderer, duplicated in three places (verified rec)

`src/renderer/src/components/campaign/AiProviderSetup.tsx:284-289` hardcodes the provider-switch defaults inline: `{ ollama: 'llama3.2:3b', claude: 'claude-sonnet-4-6', openai: 'gpt-4o', gemini: 'gemini-2.0-flash' }` (consumed at `:293`). `DEFAULT_AI_MODEL = 'llama3.2:3b'` is defined twice more: `src/main/ai/ai-service.ts:269` (main; re-exported and `require`d by `ai-vision.ts:213-217`) and `src/renderer/src/constants/app-constants.ts:108` (renderer; imported by PlayerList, CampaignWizard, AiDmCard). There is no main-side per-provider default to source from: all three cloud clients' `listModels()` are live API calls that return `[]` without a key (`claude-client.ts:123-133`, `openai-client.ts:101-114`, `gemini-client.ts:108-125`), so the fix is a **shared constant** (`src/shared/` is the established cross-process home — both tsconfigs include `src/shared/**/*`; main already imports from it, e.g. `src/main/ipc/index.ts:5`).

Verification:
```bash
grep -rn "llama3.2:3b\|gpt-4o\|claude-sonnet-4-6\|gemini-2.0-flash" dnd-app/src \
  --include='*.ts' --include='*.tsx' | grep -v test
# → ai-service.ts:269, app-constants.ts:108, AiProviderSetup.tsx:285-288 (+ comment hits)
grep -rn "DEFAULT_AI_MODEL" dnd-app/src --include='*.ts' --include='*.tsx' | grep -v test
# → importers: ai-vision (require from ai-service), PlayerList, CampaignWizard, AiDmCard
```

### F5 — AiDmCard prefills the API key from the WRONG provider (bug/medium)

`src/renderer/src/pages/campaign-detail/AiDmCard.tsx:30-40` (`openConfigure`): `apiKey: dm?.claudeApiKey ?? dm?.openaiApiKey ?? dm?.geminiApiKey ?? ''` (`:37`) — first non-null key wins regardless of `dm?.provider`. Switch a campaign from Claude to Gemini, open Configure: the Claude key prefills the (single) key field; Save then persists it as `geminiApiKey` (`:106-108`: `geminiApiKey: aiDmConfig.provider === 'gemini' ? aiDmConfig.apiKey : undefined`). **Verification also found an adjacent defect the audit missed:** Save sets the non-selected providers' keys to `undefined` (`:106-108`), so switching provider DESTROYS the previously saved keys for the other providers — switching Claude→Gemini and back loses the Claude key.

Verification:
```bash
sed -n '30,40p' dnd-app/src/renderer/src/pages/campaign-detail/AiDmCard.tsx    # :37 fallback-chain prefill
sed -n '98,112p' dnd-app/src/renderer/src/pages/campaign-detail/AiDmCard.tsx   # per-provider persist, others → undefined
```

### F6 — AiDmCard Save: no readiness signal, no busy state, configure errors swallowed (UX/medium)

Same file: the modal mounts `AiProviderSetup` with `onProviderReady={() => {}}` (`:90`) — readiness is computed and thrown away. The Save button (`:98-127`) has no `disabled`/busy state (double-click → two `saveCampaign` + two `configure` calls), ignores `window.api.ai.configure(...)`'s `{ success, error }` result (preload type: `src/preload/index.d.ts:197`), and wraps it in `catch { /* ignore configure errors */ }` (`:121-123`) — a failed configure (invalid config, main error) closes the modal as if everything worked.

Verification:
```bash
grep -n "onProviderReady={() => {}}" dnd-app/src/renderer/src/pages/campaign-detail/AiDmCard.tsx  # :90
grep -n "ignore configure errors" dnd-app/src/renderer/src/pages/campaign-detail/AiDmCard.tsx     # :122
```

### F7 — AiProviderSetup: Ollama detection failure is fully silent (UX/medium)

`src/renderer/src/components/campaign/AiProviderSetup.tsx:106-136` (`detectOllamaStatus`): the `catch` (`:132-135`) sets `setSetupPhase('idle')` + `onProviderReady(false)` and never sets `errorMessage` — if `detectOllama`/`getVram`/`getCuratedModels`/`listInstalledModels` IPC fails, the user sees three gray status circles and a generic setup button with zero explanation, indistinguishable from "nothing installed yet".

Verification:
```bash
sed -n '106,136p' dnd-app/src/renderer/src/components/campaign/AiProviderSetup.tsx
# catch at :132-135: setSetupPhase('idle'); onProviderReady(false) — no setErrorMessage
```

### F8 — Cloud model dropdown: no loading/empty/error state; dangling "—" separator (UX/low)

Same file: the cloud-models effect (`:88-103`) calls `window.api.ai.listCloudModels(provider, apiKey)` and `.catch(() => setCloudModels([]))` (`:102`) — failure and empty-success are identical, rendering an empty `<select>` (`:350-364`) with no hint. **Correction found during verification:** the main handler (`src/main/ipc/ai-handlers.ts:134-151`) returns `ids.map((id) => ({ id, name: id }))` — there is NO `desc` field on the wire (the renderer's `desc: m.desc ?? ''` normalization at `:92-96` always produces `''`), so every option renders as `"<name> — "` with a dangling separator (`:358-360`: `{m.name} — {m.desc}`). With no key, `listModels()` legitimately returns `[]` (documented in the handler comment), so the empty state's most useful copy is "enter a valid API key".

Verification:
```bash
sed -n '88,103p' dnd-app/src/renderer/src/components/campaign/AiProviderSetup.tsx   # catch → []
sed -n '350,364p' dnd-app/src/renderer/src/components/campaign/AiProviderSetup.tsx  # bare select, "{m.name} — {m.desc}"
sed -n '134,151p' dnd-app/src/main/ipc/ai-handlers.ts                               # wire shape: {id, name} only
```

### F9 — Wizard readiness gating inconsistent: cloud = any non-empty key; Validate gates nothing (UX/medium)

`AiProviderSetup.tsx:148-159` (cloud branch of the `[enabled, provider, apiKey, detectOllamaStatus, onProviderReady]` effect): `if (apiKey) { setSetupPhase('ready'); onProviderReady(true) }` — any non-empty string (including garbage) marks the provider ready. `handleValidateKey` (`:216-238`) performs a real key check via `AI_VALIDATE_API_KEY` (`ai-handlers.ts:153-174`) but is purely advisory — readiness was already `true` before the user could click it. The wizard gate consumes this directly: `CampaignWizard.tsx:240-241` `case 'aiDm': return !aiEnabled || ollamaReady`, with `ollamaReady` set by `onProviderReady` (`:97`, `:511`). Ollama, by contrast, requires the full install+run+model-installed chain (`:125-131`). Net: a garbage cloud key passes Next and the first AI message in-game fails.

Verification:
```bash
sed -n '148,160p' dnd-app/src/renderer/src/components/campaign/AiProviderSetup.tsx  # if (apiKey) → ready
sed -n '216,240p' dnd-app/src/renderer/src/components/campaign/AiProviderSetup.tsx  # handleValidateKey (advisory)
grep -n "ollamaReady" dnd-app/src/renderer/src/components/campaign/CampaignWizard.tsx # :97, :241, :511
```

### F10 — Inline AI error line has no dismiss/retry affordance (UX/low)

`ChatPanel.tsx:411-414`: `{aiEnabled && aiLastError && !aiIsTyping && (<div className="py-1 text-xs text-red-400 italic">…)}` — a persistent red line. `lastError` writers in `src/renderer/src/stores/use-ai-dm-store.ts`: safety timeout (`:153`), send/stream error paths (`:372`, `:379`), stream-error event (`:570`); it is cleared ONLY by the next `sendMessage` (`:343`) / `prepareScene` (`:298`) / scene-status flows (`:468`) / `reset` (`:187`). There is no store action to clear it directly and no retry path. A faithful retry exists one call away: `routePlayerMessageToAiDm(campaignId, message, senderName, campaignPlayers, exactTimeDefault)` (`src/renderer/src/services/ai-dm-routing.ts:119-151`) rebuilds fresh context (roster + game-state snapshot) on every call and is already imported and invoked by ChatPanel's `handleSend` (`:262-269`).

Verification:
```bash
sed -n '411,414p' dnd-app/src/renderer/src/components/game/bottom/ChatPanel.tsx
grep -n "lastError" dnd-app/src/renderer/src/stores/use-ai-dm-store.ts   # writers/clearers as cited; no clear-only action
grep -n "routePlayerMessageToAiDm" dnd-app/src/renderer/src/components/game/bottom/ChatPanel.tsx
```

### F11 — AiContextPanel: list failure renders as the empty state; Clear Memory failure is silent (UX/low)

`src/renderer/src/components/game/bottom/AiContextPanel.tsx`: `refresh` (`:28-38`) catches list-IPC failure with `setFiles([])` — the render at `:109-110` then shows `t('game.aiContextPanel.noFiles')`, indistinguishable from a genuinely empty memory dir. `handleClear` (`:65-78`) catches `clearMemory` failure with a bare `// Non-fatal` comment (`:73-74`) — the user confirms a destructive-looking dialog and then nothing happens, with no feedback. The repo's toast mechanism is `addToast` from `src/renderer/src/hooks/use-toast` (pattern: `SettingsDropdown.tsx:5,52,55`).

Verification:
```bash
sed -n '28,38p;65,78p;109,110p' dnd-app/src/renderer/src/components/game/bottom/AiContextPanel.tsx
```

### F12 — Live stream preview displays raw machine tags (UX/medium)

`use-ai-dm-store.ts` `handleChunk` (`:473-481`) appends chunks verbatim: `set({ streamingText: state.streamingText + data.text, … })` (`:477`). Machine blocks are stripped only at stream-done — main-side for `[STAT_CHANGES]`/`[DM_ACTIONS]`/`[RULE_CITATION]`/`[RULING]` (`src/main/ai/ai-response-parser.ts:120`), renderer-side for legacy `[ACTION:]` tags (`:529-531`, slated for removal by PHASE-08). The preview at `ChatPanel.tsx:403-407` renders `aiStreamingText.slice(-200)` — when the model emits its trailing blocks, the user watches raw JSON scroll by. Exact marker grammar (for the sanitizer):

- `[STAT_CHANGES] … [/STAT_CHANGES]` (`src/main/ai/stat-mutations.ts:36` parse, `:72-74` strip)
- `[DM_ACTIONS] … [/DM_ACTIONS]` (`src/main/ai/dm-actions.ts:496` parse, `:531-534` strip)
- `[RULE_CITATION source="…" rule="…"] … [/RULE_CITATION]` (`ai-response-parser.ts:11`)
- `[RULING question="…"] … [/RULING]` (`ai-response-parser.ts:57`)
- `[NPC: archetype]` / `[EMOTION: mood]` voice tags (`ai-response-parser.ts:29-30`, stripped at `:47-54`)

Verification:
```bash
sed -n '473,481p' dnd-app/src/renderer/src/stores/use-ai-dm-store.ts     # verbatim accumulation
sed -n '403,407p' dnd-app/src/renderer/src/components/game/bottom/ChatPanel.tsx  # raw slice(-200) preview
grep -n "STAT_CHANGES\]\|DM_ACTIONS\]" dnd-app/src/main/ai/stat-mutations.ts dnd-app/src/main/ai/dm-actions.ts | head
```

### F13 — Typing indicator / stream preview render below the fold with no auto-scroll (UX/medium)

`ChatPanel.tsx`: the only auto-scroll effect (`:200-204`) fires on `chatMessages.length` change via `virtualizer.scrollToIndex(chatMessages.length - 1, { align: 'end' })`. The typing dots + stream preview (`:392-409`) and the error line (`:411-414`) render AFTER the virtualized list inside the same scroll element (`:357`, `<div ref={scrollRef} className="flex-1 overflow-y-auto …" aria-live="polite">`) — so during a long stream the preview grows clipped below the fold and the user sees nothing until the final message lands (which bumps `chatMessages.length` and finally scrolls).

Verification:
```bash
sed -n '200,204p' dnd-app/src/renderer/src/components/game/bottom/ChatPanel.tsx  # only scroll trigger
sed -n '355,360p' dnd-app/src/renderer/src/components/game/bottom/ChatPanel.tsx  # scroll container
sed -n '392,414p' dnd-app/src/renderer/src/components/game/bottom/ChatPanel.tsx  # indicator+preview+error after the list
```

### F14 — NarrationOverlay: no max-height/scroll, no dialog semantics (UX/low + a11y)

`src/renderer/src/components/game/overlays/NarrationOverlay.tsx`: the parchment box (`:76-79`, `relative max-w-2xl mx-8 … px-10 py-8`) and the text `<p>` (`:84`, `text-lg leading-relaxed whitespace-pre-wrap`) have no max-height/overflow — a 2,000+ char AI scene pushes the countdown (`:87-99`), dismiss hint (`:102-104`) and close button (`:107-114`) off-screen. Escape DOES work (`:55-62`) but is undiscoverable once the hint is off-screen. The overlay root (`:64-70`) has no `role="dialog"`, `aria-modal`, or accessible label, and nothing receives focus on open (keyboard/SR users land nowhere). Mounted from `GameLayout.tsx:1025` (`text` + `onDismiss` only; `autoDismissSeconds` unused there) — call site needs no change.

Verification:
```bash
sed -n '64,84p' dnd-app/src/renderer/src/components/game/overlays/NarrationOverlay.tsx  # no role/aria, unbounded box
grep -n "role=\|aria-\|max-h" dnd-app/src/renderer/src/components/game/overlays/NarrationOverlay.tsx  # → no hits pre-phase
grep -n "NarrationOverlay" dnd-app/src/renderer/src/components/game/GameLayout.tsx       # :95 lazy, :1025 mount
```

## Sub-phases

Order keeps the tree green throughout: each sub-phase is independently compilable and adds its i18n keys (en + es) in the same edit as its consumer.

### 10A — Shared provider-default models + truthful provider/model labels (F4, F1)

**Objective:** one source of truth for default model IDs; DM tab + settings dropdown show the configured provider/model.

**Files:** `src/shared/ai-defaults.ts` (new), `src/shared/ai-defaults.test.ts` (new), `src/main/ai/ai-service.ts`, `src/renderer/src/constants/app-constants.ts`, `src/renderer/src/components/campaign/AiProviderSetup.tsx`, `src/renderer/src/components/game/bottom/DMTabPanel.tsx`, `src/renderer/src/components/game/overlays/SettingsDropdown.tsx`, `src/renderer/src/components/game/bottom/DMTabPanel.test.tsx`, `src/renderer/src/components/game/overlays/SettingsDropdown.test.tsx`.

**Steps:**

1. Create `src/shared/ai-defaults.ts`:
   ```ts
   /** Single source of truth for provider-default model IDs (renderer wizard,
    *  main config defaults). Update HERE when a default should move forward. */
   export const DEFAULT_PROVIDER_MODELS = {
     ollama: 'llama3.2:3b',
     claude: 'claude-sonnet-4-6',
     openai: 'gpt-4o',
     gemini: 'gemini-2.0-flash'
   } as const
   export type AiProviderId = keyof typeof DEFAULT_PROVIDER_MODELS
   export const DEFAULT_AI_MODEL: string = DEFAULT_PROVIDER_MODELS.ollama
   ```
2. `src/main/ai/ai-service.ts:269`: replace the literal with `export { DEFAULT_AI_MODEL } from '../../shared/ai-defaults'`-style sourcing — keep the export name/site so `ai-vision.ts`'s `require('./ai-service').DEFAULT_AI_MODEL` (`:213-217`) keeps working (i.e. `import { DEFAULT_AI_MODEL } from '../../shared/ai-defaults'` + `export { DEFAULT_AI_MODEL }`).
3. `src/renderer/src/constants/app-constants.ts:108`: same treatment — re-export from `'../../../shared/ai-defaults'` so PlayerList/CampaignWizard/AiDmCard imports stay stable. Keep the explanatory comment about `llama3.1` having been non-installable.
4. `AiProviderSetup.tsx:283-293`: delete the inline `defaultModels` literal; `import { DEFAULT_PROVIDER_MODELS } from '../../../shared/ai-defaults'` and use `DEFAULT_PROVIDER_MODELS[p] ?? ''`.
5. `DMTabPanel.tsx:51`: replace `const aiModel = 'Ollama'` with
   ```ts
   const aiDm = campaign.aiDm
   const aiModel = aiDm?.model ?? aiDm?.ollamaModel ?? AI_PROVIDER_LABELS[aiDm?.provider ?? 'ollama'] ?? 'AI'
   ```
   (import `AI_PROVIDER_LABELS` from `'../../../constants'`). `:209` consumes it unchanged.
6. `SettingsDropdown.tsx`: give `AiDmSettingsSection` a prop `aiDm: import('../../../types/campaign').AiDmConfig | undefined`; mount site `:392` becomes `<AiDmSettingsSection aiDm={campaign.aiDm} />`; inside, compute the label as in step 5 and drop the `capitalize` class at `:107` (model IDs like `llama3.2:3b` must render verbatim).
7. Tests: `src/shared/ai-defaults.test.ts` — assert `DEFAULT_PROVIDER_MODELS` has exactly the four provider keys and every value is a non-empty string; assert `DEFAULT_AI_MODEL === DEFAULT_PROVIDER_MODELS.ollama`. Extend `DMTabPanel.test.tsx` / `SettingsDropdown.test.tsx` (currently import-smoke only) with `// @vitest-environment happy-dom` render tests (pattern: `src/renderer/src/components/game/cloud/CloudStatusPanel.test.tsx`) asserting a Gemini campaign (`aiDm: { enabled: true, provider: 'gemini', model: 'gemini-2.0-flash' }`) renders `gemini-2.0-flash` and never the string `Ollama`. Mock the stores/`window.api` surface each component touches on mount (DMTabPanel needs `useAiDmStore`/`useNarrationTtsStore` state + `window.api.ai.getTokenBudget`).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/shared/ai-defaults.test.ts src/renderer/src/components/game/bottom/DMTabPanel.test.tsx src/renderer/src/components/game/overlays/SettingsDropdown.test.tsx`

**Acceptance:** `grep -rn "= 'Ollama'" dnd-app/src/renderer/src` → no hits; `grep -rn "llama3.2:3b" dnd-app/src --include='*.ts' --include='*.tsx' | grep -v test | grep -v shared/ai-defaults` → no literal definitions outside the shared module (comments OK); all three label surfaces show provider/model from `campaign.aiDm`.

### 10B — Honest, live status bar: unknown state, periodic re-check, paused state (F2)

**Objective:** the status dot/label reflects reality — distinct unknown/checking, paused, not-ready (provider-appropriate copy), ready — and re-checks periodically plus after errors.

**Files:** `src/renderer/src/hooks/use-ai-readiness.ts` (new), `src/renderer/src/hooks/use-ai-readiness.test.ts` (new), `src/renderer/src/components/game/bottom/AiDmStatusBar.tsx` (new), `src/renderer/src/components/game/bottom/AiDmStatusBar.test.tsx` (new), `src/renderer/src/components/game/bottom/ChatPanel.tsx`, `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`.

**Steps:**

1. New hook `useAiReadiness(active: boolean): { usable: boolean | null; provider: AiProviderType | null; probeFailed: boolean; recheck: () => void }`:
   - Move the probe body from `ChatPanel.tsx:152-179` (Promise.all of `getConfig` + `checkProviders`, provider→field mapping) into the hook.
   - `probeFailed: true` on catch (replacing the old null-reset, so "check failed" ≠ "still checking"); `usable: null` only while a probe is genuinely in flight with no prior result.
   - Re-probe every 30 s while `active` via `setInterval`, skipping ticks when `document.visibilityState !== 'visible'` (no point polling a hidden window; interval timers also freeze during OS suspend — accepted, the next visible tick corrects) and when a probe is already in flight (in-flight ref). Cancelled-flag every async setState.
   - Expose `recheck` for immediate probes.
2. New presentational `AiDmStatusBar` component (props: `isTyping`, `paused`, `usable`, `probeFailed`, `provider`, `usedTokens: number`, `maxTokens: number | null`, `onRecheck`). Render precedence:
   1. `isTyping` → accent pulsing dot + `aiResponding`
   2. `paused` → gray dot + new key `game.chatPanel.aiPaused` (en "AI paused" / es "IA en pausa")
   3. `usable === null && !probeFailed` → gray pulsing dot + new key `aiChecking` (en "Checking AI status..." / es "Comprobando estado de la IA...")
   4. `usable === false || probeFailed` → amber dot + provider-appropriate copy: `provider === 'ollama'` → existing `aiNoModel`; otherwise new key `aiProviderUnavailable` (en "AI provider unreachable — check the API key in AI settings" / es "Proveedor de IA inaccesible: comprueba la clave de API en los ajustes de IA"). The dot/label row is a click-to-recheck button (`title` = new key `aiRecheckTitle`, en "Click to re-check AI status" / es "Haz clic para volver a comprobar el estado de la IA").
   5. else → green dot + `aiReady`.
   Token meter span renders as today (10C upgrades it; have `maxTokens` prop ready, render the used-only form when `null`).
3. `ChatPanel.tsx`: delete the inline probe state/effect (`:151-179`) and the status-bar JSX (`:417-438`); render `<AiDmStatusBar … />` in its place wired to the hook + `aiPaused` (`:141`) + the existing `aiMessages` token estimate. Call `recheck()` when `aiLastError` transitions to non-null (a stream error is the strongest readiness signal) — one small `useEffect`.
4. i18n: add the four new keys to BOTH locales under `game.chatPanel`.
5. Tests: `AiDmStatusBar.test.tsx` (happy-dom) — one assertion per precedence rule (typing beats paused; paused beats unknown; unknown ≠ ready; cloud-false shows provider copy, ollama-false shows aiNoModel; ready renders green text). `use-ai-readiness.test.ts` — with fake timers + mocked `window.api.ai`: initial probe runs; result mapped per provider; 30 s tick re-probes; hidden document skips the tick; failure sets `probeFailed` instead of silently nulling.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/components/game/bottom/AiDmStatusBar.test.tsx src/renderer/src/hooks/use-ai-readiness.test.ts`

**Acceptance:** status bar shows "Checking AI status..." before the first probe resolves; killing the provider mid-session flips the dot within ≤30 s (poll) or immediately after a failed message (recheck-on-error); pausing the AI shows "AI paused"; no state renders the green dot unless the probe affirmatively succeeded.

### 10C — Token meter: interpolate the real budget (F3)

**Objective:** the meter's max comes from the live effective budgets (PHASE-01's machinery), not a locale-string literal.

**Files:** `src/shared/ipc-channels.ts`, `src/main/ipc/ai-handlers.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/components/game/bottom/AiDmStatusBar.tsx`, `src/renderer/src/components/game/bottom/ChatPanel.tsx`, `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`, `src/main/ipc/ai-handlers.test.ts` (extend if present; otherwise assert via handler unit pattern used by neighboring tests).

**Steps:**

1. `ipc-channels.ts`: add `AI_GET_TOKEN_METER: 'ai:get-token-meter'` next to `AI_TOKEN_BUDGET` (`:120`). No request payload → no zod schema needed in `ipc-schemas.ts` (schemas exist for renderer→main payloads; this is a no-arg read like `AI_GET_CONFIG`).
2. `ai-handlers.ts` (near `:297`): register the handler returning
   ```ts
   { conversationBudget: getEffectiveBudgets().conversationHistory, contextWindow: getActiveContextWindow() }
   ```
   (import both from `../ai/token-budget` — PHASE-01 exports; see Dependencies). Note in a comment: before the first Ollama stream of a session the window is the cloud default, so the budget shown is the raw/unscaled value — it tightens to the scaled value after the first stream sets the window. That is honest "best current knowledge".
3. Preload: `getTokenMeter: () => ipcRenderer.invoke(IPC_CHANNELS.AI_GET_TOKEN_METER)` + typing `getTokenMeter: () => Promise<{ conversationBudget: number; contextWindow: number }>` in `index.d.ts` next to `getTokenBudget` (`:248`).
4. Renderer: fetch the meter inside `useAiReadiness`'s probe (same cadence — readiness and budget refresh together; one extra cheap IPC per 30 s) and expose `conversationBudget: number | null`. ChatPanel passes it to `AiDmStatusBar` as `maxTokens`.
5. i18n: change `game.chatPanel.tokens` in BOTH locales to `"~{{used}} / {{max}} tokens"` (es: `"~{{used}} / {{max}} tokens"`); add `tokensUsedOnly` (en `"~{{used}} tokens"`, es `"~{{used}} tokens"`) for the `maxTokens === null` fallback (meter IPC failed/unavailable). Pass `max: maxTokens.toLocaleString()` matching the existing `used` formatting (`ChatPanel.tsx:434-436` pattern). Update `tokensTitle` in both locales to explain the comparison (en: "Estimated conversation tokens vs. the AI's conversation-history budget — older messages beyond the budget are not sent to the model"; es equivalent).
6. When `usedTokens > maxTokens`, tint the meter amber (`text-amber-500`) — the visible "your old messages are being dropped" signal this meter was always meant to be.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/renderer/src/components/game/bottom/AiDmStatusBar.test.tsx`

**Acceptance:** `grep -n "23,000\|23.000" dnd-app/src/renderer/src/i18n/locales/*.json` → no hits; meter shows the live budget; amber tint when over budget; used-only form when the IPC fails.

### 10D — Stream preview sanitization + stick-to-bottom auto-scroll (F12, F13)

**Objective:** the live preview never shows machine tags; the typing indicator/preview stays visible during streaming without yanking a user who scrolled up.

**Files:** `src/renderer/src/utils/stream-preview.ts` (new), `src/renderer/src/utils/stream-preview.test.ts` (new), `src/renderer/src/components/game/bottom/ChatPanel.tsx`.

**Steps:**

1. New `sanitizeStreamPreview(raw: string): string` in `utils/stream-preview.ts`:
   - Cut the text at the EARLIEST occurrence of any block-opening marker: `[STAT_CHANGES]`, `[DM_ACTIONS]`, `[RULE_CITATION`, `[RULING` (everything from the marker on is machine payload; grammar verified in F12).
   - Strip complete voice tags via the same regexes main uses (`/\[NPC:\s*[a-z_]+\s*\]/gi`, `/\[EMOTION:\s*[a-z_]+\s*\]/gi`).
   - Trim a trailing PARTIAL marker still streaming in: `/\[[A-Za-z_]{0,16}$/` (a lone `[` plus up to 16 marker-ish chars at end-of-string). Document the false-positive trade-off in a comment: a narration line genuinely ending in `[word` loses those chars from a 200-char transient preview — acceptable.
   - Collapse the doubled spaces tag removal leaves (`/[ \t]{2,}/g → ' '`), preserve newlines.
   - Do NOT touch the store (`handleChunk` stays verbatim — final-text correctness is main's job; PHASE-08 owns the dead `[ACTION:]` strip in `handleDone`).
2. `ChatPanel.tsx:403-407`: render `sanitizeStreamPreview(aiStreamingText).slice(-200)`.
3. Stick-to-bottom auto-scroll:
   - Add `const stickToBottomRef = useRef(true)` + an `onScroll` handler on the scroll container (`:357`): `stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48` (one render-free ref write per scroll event; 48 px ≈ one message row of slack).
   - Add an effect on `[aiIsTyping, aiStreamingText]`: if `stickToBottomRef.current && scrollRef.current`, set `scrollRef.current.scrollTop = scrollRef.current.scrollHeight` (direct scroll — the indicator lives outside the virtualizer, so `scrollToIndex` can't reach it).
   - Leave the existing `chatMessages.length` effect (`:200-204`) unchanged (new-message-always-scrolls is established behavior).
4. Tests: `stream-preview.test.ts` — narration passes through unchanged; text + complete `[STAT_CHANGES]{…}[/STAT_CHANGES]` block → block gone; mid-stream partial `…story text [STAT_CH` → partial marker trimmed; `[DM_ACTIONS]`/`[RULE_CITATION`/`[RULING` cuts; voice tags stripped with spacing collapsed; multi-marker input cuts at the earliest.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/utils/stream-preview.test.ts`

**Acceptance:** preview never contains `[STAT_CHANGES]`/`[DM_ACTIONS]`/`[RULE_CITATION`/`[RULING`/`[NPC:`/`[EMOTION:` substrings for any split point of a tagged response; preview/indicator stays in view while streaming when the user was at the bottom; a user scrolled >48 px up is not yanked.

### 10E — Inline AI error: dismiss + retry (F10)

**Objective:** the red error line is actionable — dismiss it, or retry the failed turn.

**Files:** `src/renderer/src/stores/use-ai-dm-store.ts`, `src/renderer/src/stores/use-ai-dm-store.test.ts` (extend), `src/renderer/src/components/game/bottom/ChatPanel.tsx`, `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`.

**Steps:**

1. Store: add `clearLastError: () => set({ lastError: null })` to the actions (type + implementation; additive — coordinate visually with PHASE-04's edits already in this file).
2. `ChatPanel.tsx`: in `handleSend`, when the AI-routing branch fires (`:262-269`), record `lastAiRouteRef.current = { message: trimmed, senderName: playerName }`. Replace the bare error div (`:411-414`) with the message text plus:
   - a dismiss button (`×`, `aria-label` = new key `aiErrorDismiss`: en "Dismiss AI error" / es "Descartar error de IA") calling `clearLastError()`;
   - a retry button (new key `aiErrorRetry`: en "Retry" / es "Reintentar"), rendered only when `lastAiRouteRef.current` is non-null AND `campaign && (networkRole === 'none' || networkRole === 'host') && aiEnabled && !aiPaused` (the same gate as send-time routing), calling `clearLastError()` then `routePlayerMessageToAiDm(campaign.id, ref.message, ref.senderName, campaign.players ?? [], campaign.calendar?.exactTimeDefault)` — fresh context is rebuilt by the routing function, which is strictly better than replaying the stale snapshot.
   - Comment the known minor wart: the failed turn's user message may already sit in main's conversation history, so a retry can produce a duplicated user line in the transcript — accepted (correct fix is main-side turn transactionality, out of scope here).
3. Tests: store test — `clearLastError` nulls `lastError` and touches nothing else.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/stores/use-ai-dm-store.test.ts`

**Acceptance:** error line shows ×; clicking it clears without sending anything; Retry re-routes the last message and clears the error; Retry hidden for non-host clients and when nothing was routed yet.

### 10F — AiContextPanel honest error states (F11)

**Objective:** list failure looks like a failure (with retry); Clear Memory failure surfaces a toast.

**Files:** `src/renderer/src/components/game/bottom/AiContextPanel.tsx`, `src/renderer/src/components/game/bottom/AiContextPanel.test.tsx` (extend), `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`.

**Steps:**

1. Add `const [listError, setListError] = useState(false)`. `refresh` (`:28-38`): set `false` at start; in catch, `setFiles([])` + `setListError(true)`.
2. Render: when `listError && !loading`, replace the `noFiles` branch (`:109-110`) with a red-tinted line using new key `game.aiContextPanel.loadFailed` (en "Couldn't load AI memory files — check the campaign storage and retry." / es "No se pudieron cargar los archivos de memoria de la IA: comprueba el almacenamiento de la campaña y reintenta.") — the existing Refresh button (`:92-98`) is the retry affordance; reference it in the copy by position, not by wiring anything new.
3. `handleClear` (`:65-78`): replace the silent catch with `addToast(t('game.aiContextPanel.clearFailed'), 'error')` (import `addToast` from `'../../../hooks/use-toast'`; key: en "Couldn't clear AI memory — files may still be present." / es "No se pudo borrar la memoria de la IA: puede que los archivos sigan presentes."). Keep `finally { setClearing(false) }`. On SUCCESS also call `refresh()` instead of assuming `setFiles([])` (truth from disk beats optimistic empty).
4. Tests (happy-dom): mock `window.api.ai.listMemoryFiles` to reject → `loadFailed` text renders (and `noFiles` does not); mock `clearMemory` to reject + stub `use-toast` → toast called with error variant; `clearMemory` resolve → `listMemoryFiles` re-invoked.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/components/game/bottom/AiContextPanel.test.tsx`

**Acceptance:** IPC list failure renders the failure line, not "no files yet"; failed clear produces an error toast; successful clear re-lists from disk.

### 10G — AiProviderSetup: visible detect failure, dropdown states, validated-key wizard gating (F7, F8, F9)

**Objective:** every failure mode in provider setup is visible and recoverable; the wizard's cloud gate means "key actually works".

**Files:** `src/renderer/src/components/campaign/AiProviderSetup.tsx`, `src/renderer/src/components/campaign/AiProviderSetup.test.tsx` (extend — created by PHASE-05), `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`. Do NOT touch the `onOllamaProgress` listener effect (PHASE-05's 05D work) or `CampaignWizard.tsx` (its `!aiEnabled || ollamaReady` gate is correct once readiness is honest).

**Steps:**

1. **Detect failure (F7):** add `const [detectError, setDetectError] = useState(false)`. `detectOllamaStatus` (`:106-136`): clear it at start; in the catch, `setDetectError(true)` + `setErrorMessage(t('campaign.aiProviderSetup.errorDetect'))` (new key, en "Couldn't check the local AI install — the app couldn't reach its Ollama integration. Retry, or check the Ollama URL below." / es equivalent) alongside the existing `setSetupPhase('idle')` + `onProviderReady(false)`. In the Ollama section, when `detectError`, render the error message + a `Button` labeled with new key `retryDetect` (en "Retry detection" / es "Reintentar detección") that calls `detectOllamaStatus()` — do NOT reuse `handleAutoSetup` for this (it would start downloading Ollama off stale `ollamaInstalled=false` state).
2. **Dropdown states (F8):** add `const [cloudModelsState, setCloudModelsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')`. The cloud-models effect (`:88-103`): set `'loading'` before the invoke, `'ready'` on resolve, `'error'` on catch (keep `setCloudModels([])`). Render around the `<select>` (`:350-364`):
   - loading → disabled select with a single option using new key `modelsLoading` (en "Loading models..." / es "Cargando modelos...");
   - error → red helper line `modelsError` (en "Couldn't load the model list — check the API key and network." / es equivalent) + small retry button re-running the same fetch (extract the effect body into a `loadCloudModels` callback the effect calls);
   - ready + empty → muted helper line `modelsEmpty` (en "Enter a valid API key to load the model list." / es equivalent);
   - option text: `{m.desc ? \`${m.name} — ${m.desc}\` : m.name}` (kills the dangling "—"; main sends no `desc` today, F8 correction).
3. **Wizard gating (F9):** make cloud readiness mean *validated*:
   - In the cloud branch of the readiness effect (`:148-159`), replace `if (apiKey) { ready }` with: no key → `setSetupPhase('idle')`, `onProviderReady(false)`; key present → `onProviderReady(keyValid === true)`; `setSetupPhase(keyValid === true ? 'ready' : 'idle')`. Add `keyValid` to the effect deps.
   - Add a debounced auto-validate effect: when `enabled && isCloud && apiKey.trim() && keyValid === null && !validatingKey`, start a 600 ms timer that calls `handleValidateKey()`; clear the timer on dep change/unmount. (The key field's `onChange` already resets `keyValid` to `null` (`:325-328`), so each edit re-arms exactly one validation; `validateApiKey` main-side is a real `isAvailable()` round-trip, `ai-handlers.ts:153-174`.) The manual Validate button stays for explicit re-checks.
   - Net effect on the wizard: `CampaignWizard.tsx:241`'s `!aiEnabled || ollamaReady` now blocks Next until the key validates — a garbage key shows the existing `apiKeyInvalid` red status (`:344-349`) and keeps Next disabled. No CampaignWizard change needed.
   - AiDmCard (10H) consumes the same honest readiness via `onProviderReady`.
4. i18n: add `errorDetect`, `retryDetect`, `modelsLoading`, `modelsError`, `modelsEmpty` to `campaign.aiProviderSetup` in BOTH locales.
5. Tests (extend PHASE-05's `AiProviderSetup.test.tsx`, happy-dom, `window.api.ai.*` mocked):
   - `detectOllama` rejects → `errorDetect` text + retry button visible; clicking retry re-invokes detection.
   - `listCloudModels` pending → loading option; rejects → `modelsError` + retry; resolves `[]` with key → `modelsEmpty`; resolves `[{id,name}]` (no desc) → option text has no trailing "—".
   - With provider `claude`, `apiKey: 'garbage'`, `validateApiKey` resolving `{valid:false}`: `onProviderReady` last call is `false`; with `{valid:true}`: eventually `true` (advance fake timers past the 600 ms debounce).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/components/campaign/AiProviderSetup.test.tsx`

**Acceptance:** failed detection is visible and retryable without triggering an install; the model dropdown always communicates loading/error/empty; an unvalidated cloud key can no longer pass the wizard gate; a valid key auto-validates without requiring the button.

### 10H — AiDmCard: provider-correct prefill, key preservation, gated/honest Save (F5, F6)

**Objective:** the configure modal prefills the RIGHT key, stops destroying other providers' keys, and Save is busy-gated with surfaced failures.

**Files:** `src/renderer/src/pages/campaign-detail/AiDmCard.tsx`, `src/renderer/src/pages/campaign-detail/AiDmCard.test.tsx` (extend), `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`.

**Steps:**

1. **Prefill (F5):** add a helper and use it in `openConfigure` (`:30-40`):
   ```ts
   const keyForProvider = (dm: AiDmConfig | undefined, p: AiProviderType): string =>
     (p === 'claude' ? dm?.claudeApiKey : p === 'openai' ? dm?.openaiApiKey : p === 'gemini' ? dm?.geminiApiKey : '') ?? ''
   // in openConfigure:
   const provider = dm?.provider ?? DEFAULT_AI_PROVIDER
   … apiKey: keyForProvider(dm, provider)
   ```
2. **Key preservation (F5 extension, found in verification):** Save (`:99-108`) currently nulls the non-selected providers' keys. Build the persisted object preserving them:
   ```ts
   claudeApiKey: aiDmConfig.provider === 'claude' ? aiDmConfig.apiKey || undefined : campaign.aiDm?.claudeApiKey,
   openaiApiKey: aiDmConfig.provider === 'openai' ? aiDmConfig.apiKey || undefined : campaign.aiDm?.openaiApiKey,
   geminiApiKey: aiDmConfig.provider === 'gemini' ? aiDmConfig.apiKey || undefined : campaign.aiDm?.geminiApiKey
   ```
   (`|| undefined` so an intentionally-cleared field erases the selected provider's key.)
3. **Honest Save (F6):** add `const [saving, setSaving] = useState(false)` and `const [providerReady, setProviderReady] = useState(false)`; pass `onProviderReady={setProviderReady}` at `:90`. Save handler:
   - `setSaving(true)` / `finally setSaving(false)`; `<Button disabled={saving}>` (Button extends `ButtonHTMLAttributes`, `components/ui/Button.tsx:5-7`) with label `saving ? t('pages.aiDmCard.saving') : t('common.actions.save')`.
   - Check the configure result instead of swallowing: `const res = await window.api.ai.configure({…}); if (!res.success) throw new Error(res.error ?? 'configure failed')`. Wrap `saveCampaign` + configure in one try; on ANY failure `addToast(t('pages.aiDmCard.saveFailed', { error: msg }), 'error')` and DO NOT close the modal; close only on full success.
   - **Deliberate decision — Save is NOT hard-disabled on readiness:** hard-gating would trap users saving a remote-Ollama URL that isn't reachable yet (detection probes the *configured* main-side URL, not the unsaved field). Instead, when `aiDmConfig.enabled && !providerReady`, render an inline amber note above the buttons using new key `notReadyWarning` (en "This provider isn't ready yet — the AI DM may not respond until setup completes." / es equivalent). Combined with 10G's honest readiness this is informative, not obstructive. (If a future phase wants hard gating, the `providerReady` state is now wired.)
4. i18n: add `pages.aiDmCard.saving` (en "Saving..." / es "Guardando..."), `saveFailed` (en "Couldn't apply the AI settings: {{error}}" / es "No se pudieron aplicar los ajustes de IA: {{error}}"), `notReadyWarning` (above) to BOTH locales.
5. Tests (extend `AiDmCard.test.tsx`, happy-dom): campaign with `provider:'gemini'` + both `claudeApiKey:'ck'` and `geminiApiKey:'gk'` → opening Configure prefills `gk` (assert via the password input's value); Save with provider switched to claude preserves `geminiApiKey` in the `saveCampaign` argument; `configure` resolving `{success:false,error:'x'}` → toast fired, modal still open; `saveCampaign` pending → Save button disabled.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/pages/campaign-detail/AiDmCard.test.tsx`

**Acceptance:** switching providers never shows or persists another provider's key, and never destroys stored keys; double-click cannot double-save; configure failures are visible and keep the modal open; not-ready state is visible at Save time.

### 10I — NarrationOverlay: bounded height + dialog semantics (F14)

**Objective:** long narrations scroll inside the parchment box with the countdown/hint/close always visible; the overlay is a real dialog for AT users.

**Files:** `src/renderer/src/components/game/overlays/NarrationOverlay.tsx`, `src/renderer/src/components/game/overlays/NarrationOverlay.test.tsx` (extend), `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`.

**Steps:**

1. Wrap the text `<p>` (`:84`) in `<div className="max-h-[60vh] overflow-y-auto">…</div>` so only the narration scrolls — countdown (`:87-99`), dismiss hint (`:102-104`) and close button (`:107-114`) stay on-screen. Keep `max-w-2xl` on the box.
2. Dialog semantics per the WAI-ARIA APG modal-dialog pattern (see Research notes): on the parchment box div (`:76-79`) add `role="dialog"`, `aria-modal="true"`, `aria-label={t('game.narrationOverlay.ariaLabel')}` (new key, en "DM narration" / es "Narración del DM").
3. Focus on open: `const closeRef = useRef<HTMLButtonElement>(null)` + a mount effect `closeRef.current?.focus()` on the close button (the dialog's only tabbable element, satisfying "focus moves to an element inside the dialog"; Escape-to-close already exists at `:55-62`). Full focus trap/restore is overkill for a single-button transient overlay — document with a one-line comment.
4. The text container also gets `tabIndex={0}` + `aria-label={t('game.narrationOverlay.ariaLabel')}` so keyboard users can scroll long narrations with arrow keys (a scrollable region must be focusable).
5. Tests (extend `NarrationOverlay.test.tsx`, happy-dom): renders `role="dialog"` with `aria-modal`; close button has focus after mount; the text wrapper has the `max-h-[60vh]`/`overflow-y-auto` classes; Escape calls `onDismiss` (after the 300 ms fade `setTimeout` — use fake timers).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/components/game/overlays/NarrationOverlay.test.tsx`

**Acceptance:** a 5,000-char narration keeps countdown/hint/close visible with the text scrolling; screen readers announce a dialog; Escape/click dismiss unchanged.

## Research notes

- **Modal-dialog a11y (10I):** the W3C ARIA Authoring Practices Guide requires `role="dialog"` + `aria-modal="true"` + an accessible name (`aria-labelledby` or `aria-label`), focus moved INSIDE the dialog on open, Escape to close, and focus kept within the dialog while open. NarrationOverlay already has Escape; this phase adds role/aria-modal/label + initial focus on the close button. A full roving focus trap is intentionally skipped — the dialog has exactly one tabbable control plus a focusable scroll region, so Tab cannot escape to anything harmful before the overlay auto-dismisses; documented as a deliberate simplification. Source: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- **Stick-to-bottom chat scroll (10D):** the minimal "scroll on every update" pattern (e.g. `useChatScroll` watching the streaming value — https://davelage.com/posts/chat-scroll-react/) yanks users who scrolled up; production chat UIs add an "is at bottom" check and only auto-scroll when the user was already at the bottom (threshold on `scrollHeight - scrollTop - clientHeight`), as covered in the scroll-aware streaming writeups (https://tuffstuff9.hashnode.dev/intuitive-scrolling-for-chatbot-message-streaming, https://dev.to/deepcodes/automatic-scrolling-for-chat-app-in-1-line-of-code-react-hook-3lm1). This phase uses the ref-based threshold variant (48 px) because the indicator/preview live OUTSIDE the TanStack virtualizer (its `scrollToIndex` can only target list items), so direct `scrollTop = scrollHeight` on the container is the correct mechanism. Alternative considered and rejected: an IntersectionObserver anchor element — heavier, and the existing `chatMessages.length` effect already covers the message-arrival case.
- **Status polling cadence (10B):** renderer `setInterval` timers freeze during OS suspend and don't back-fill missed ticks; the robust Electron fix is `powerMonitor.on('resume')` → IPC → refetch (see https://github.com/TanStack/query/discussions/10224). For a 30 s readiness dot that self-corrects one tick after resume, that machinery isn't warranted — the plan documents the limitation and instead adds `document.visibilityState` gating (skip hidden-window polls) plus recheck-on-error and click-to-recheck, which together bound staleness to ≤30 s while visible. Alternative considered: main-process push of provider status (an `AI_PROVIDER_STATUS_CHANGED` event) — better long-term, but it belongs with PHASE-14's observability/connection-badge work, which owns the `consecutiveFailures` surface.
- **Locale-aware number interpolation (10C):** i18next ≥21.3 supports Intl-based `{{val, number}}` formatting keyed to the active locale (https://www.i18next.com/translation-function/formatting). The plan nevertheless passes pre-formatted `toLocaleString()` strings because that is the file's existing convention for `{{used}}` (`ChatPanel.tsx:434-436`) — mixing conventions inside one string risks "1,234 / 4.000". A repo-wide migration to `{{val, number}}` is PHASE-12 territory (wording/i18n sweep).
- **Why the meter max is `conversationHistory`, not the context window (10C):** the meter's `used` counts conversation chars/4 — comparing that against the whole window (which also holds rules/system prompt/game state) would overstate headroom. PHASE-01's `getEffectiveBudgets().conversationHistory` is the actual slice the conversation competes for; when `used` exceeds it, trimming is REALLY happening (`conversation-manager.ts` drops oldest-first), which is exactly the signal the amber tint surfaces. The full per-section breakdown panel ("what did the AI actually see") is PHASE-14's context-inspector.
- **Validated-key gating (10G):** `AI_VALIDATE_API_KEY` main-side performs a real provider `isAvailable()` round-trip (`ai-handlers.ts:153-174` — models-list call for Claude/OpenAI, REST models endpoint for Gemini), so `keyValid === true` is a genuine liveness check, strictly stronger than the current non-empty-string gate and the same check the Validate button already runs. Debounced auto-validation (600 ms) matches the existing per-keystroke `listCloudModels` refetch cadence in the same component.

## Test plan

Per sub-phase (all colocated, vitest; component tests use the `// @vitest-environment happy-dom` pragma + `@testing-library/react`, matching `CloudStatusPanel.test.tsx`):

- 10A: `src/shared/ai-defaults.test.ts` (new); `DMTabPanel.test.tsx`, `SettingsDropdown.test.tsx` (extended with provider-label render tests).
- 10B: `src/renderer/src/hooks/use-ai-readiness.test.ts` (new, fake timers); `src/renderer/src/components/game/bottom/AiDmStatusBar.test.tsx` (new, one test per precedence rule).
- 10C: `AiDmStatusBar.test.tsx` (meter max/used-only/amber-over-budget cases); handler addition covered by tsc + the existing ai-handlers test harness if present.
- 10D: `src/renderer/src/utils/stream-preview.test.ts` (new, pure-function table tests).
- 10E: `use-ai-dm-store.test.ts` (extended: `clearLastError`).
- 10F: `AiContextPanel.test.tsx` (extended: list-reject, clear-reject toast, clear-success re-list).
- 10G: `AiProviderSetup.test.tsx` (extended — file created by PHASE-05: detect-failure UI, dropdown states, debounced validation gating).
- 10H: `AiDmCard.test.tsx` (extended: provider-correct prefill, key preservation, busy state, configure-failure toast).
- 10I: `NarrationOverlay.test.tsx` (extended: dialog semantics, focus, scroll container, Escape).

End-of-phase 4-gate (INSTRUCTIONS.md rule 5): `npm run lint`, `npx tsc --noEmit -p tsconfig.web.json`, `npx tsc --noEmit -p tsconfig.node.json`, `npx vitest run` — all green before the single phase commit + push. No Pi code is touched (no pytest leg).

## Acceptance criteria

- No renderer surface hardcodes "Ollama" or a model ID: `grep -rn "= 'Ollama'" dnd-app/src/renderer/src` → empty; default model IDs exist exactly once, in `src/shared/ai-defaults.ts`.
- Status bar: distinct visual states for checking / paused / not-ready (provider-appropriate copy) / ready; readiness re-checked every ≤30 s while visible, on stream error, and on click; green never shown without an affirmative probe result.
- Token meter: no literal budget number in any locale file; max interpolated from `getEffectiveBudgets().conversationHistory` via the new `AI_GET_TOKEN_METER` IPC (channel registered in `ipc-channels.ts`); amber when over budget; graceful used-only fallback.
- Stream preview: `sanitizeStreamPreview` guarantees no machine-tag substrings for any streaming split point (property exercised in tests); preview/indicator auto-scrolls only when the user was at the bottom.
- Inline AI error is dismissible and (host/solo) retryable through the real routing path.
- AiContextPanel distinguishes list-failure from empty; failed clears toast.
- Provider setup: detect failures visible + retryable; dropdown has loading/error/empty states and no dangling "—"; wizard Next requires a VALIDATED cloud key.
- AiDmCard: prefill matches the configured provider; other providers' keys survive a provider switch; Save is busy-gated; configure failures surface and keep the modal open; not-ready warning visible.
- NarrationOverlay: text scrolls within `max-h-[60vh]`; countdown/hint/close always visible; `role="dialog"` + `aria-modal` + label; close button focused on open.
- All new user-facing strings exist in BOTH `en.json` and `es.json`.
- 4-gate green; one phase commit; plan moved to `completed/`.

## Out of scope

- `ChatPanel.tsx:465` literal `Send` button + AI/AI-DM terminology consistency + es.json naming sweep — **PHASE-12**.
- Connection-status badge (`consecutiveFailures` surfacing), context-truncation alert wiring (`wasContextTruncated`), `fileReadStatus` indicator + clearing, context-inspector token-breakdown panel — **PHASE-14** (mounts into 10B's `AiDmStatusBar`).
- `handleDone`'s `parseRendererActions`/`stripActionTags` call and the dead `ai-renderer-actions.ts` module — **PHASE-08**.
- `AiProviderSetup` / `OllamaManagement` IPC listener leaks + preload per-listener unsubscribe — **PHASE-05** (landed before this phase).
- `num_ctx`/`keep_alive`, token-budget reconciliation, `getEffectiveBudgets` machinery itself — **PHASE-01** (this phase only reads its exports).
- Main-side `getConfig()` disk-clobber and provider stream timeouts — **PHASE-03**.
- Approval-overlay fixes (WebSearchApprovalPrompt, MutationApprovalPanel, RulingApprovalModal, DmAlertTray) and store approval-queue hygiene — **PHASE-04**.
- ScenePrepPage campaign-not-found dead-end page — **PHASE-06**.
- ollama-manager localhost-vs-configured-URL targeting (Install pulls to localhost while the dropdown lists the remote) — **PHASE-03** (manager URL plumbing); 10G only adds UI states around the existing calls.

## Completed

(Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations.)
