# PHASE-INDEX — 2026-06-10 backlog phase set

> Meta-file (never moves to `completed/`, never deleted — see INSTRUCTIONS.md Notes).
> The dependency manifest + execution order for the `PHASE-NN-<slug>.md` plans in
> this folder. Authored 2026-06-10 from the consolidated audit; each plan is fully
> self-contained (the audit file no longer exists — plans carry everything).
>
> **Execution:** per `INSTRUCTIONS.md` — phases run in numeric order; 4-gate + one
> commit + one push at each phase end; finished plans move to `completed/`; ONE
> release after PHASE-42 (or an explicit user ask). Update the Status column here
> as phases complete.
>
> **Ordering rule:** Phases 1–19 have NO dependencies (independent — front of the
> set, per owner directive). Later phases list their prerequisites; phases marked
> *(no deps)* there may be freely reordered if priorities change.

| # | Plan file | Domain | Depends on | Status |
|---|---|---|---|---|
| 01 | PHASE-01-ollama-context-window.md | dnd-app | — | pending |
| 02 | PHASE-02-stat-mutation-correctness.md | dnd-app | — | pending |
| 03 | PHASE-03-provider-stream-reliability.md | dnd-app | — | pending |
| 04 | PHASE-04-ai-store-approval-hygiene.md | dnd-app | — | pending |
| 05 | PHASE-05-stream-listener-lifecycle.md | dnd-app | — | pending |
| 06 | PHASE-06-scene-prep-pipeline.md | dnd-app | — | pending |
| 07 | PHASE-07-conversation-persistence.md | dnd-app | — | pending |
| 08 | PHASE-08-executor-batch-correctness.md | dnd-app | — | pending |
| 09 | PHASE-09-chat-commands-cleanup.md | dnd-app | — | pending |
| 10 | PHASE-10-ai-dm-ui-truth.md | dnd-app | — | pending |
| 11 | PHASE-11-prompt-schema-contract.md | dnd-app | — | pending |
| 12 | PHASE-12-i18n-wording-sweep.md | dnd-app | — | pending |
| 13 | PHASE-13-dnd-platform-debt.md | dnd-app | — | pending |
| 14 | PHASE-14-ai-observability.md | dnd-app | 07 | pending |
| 15 | PHASE-15-bmo-hygiene.md | bmo | — | pending |
| 16 | PHASE-16-bmo-blueprint-refactor.md | bmo | 15 | pending |
| 17 | PHASE-17-ds-bug-round.md | dungeon-scholar | — | pending |
| 18 | PHASE-18-ds-security-round.md | dungeon-scholar | — | pending |
| 19 | PHASE-19-ds-a11y-ux-round.md | dungeon-scholar | — | pending |
| 20 | PHASE-20-discord-bridge-foundation.md | cross | — | pending |
| 21 | PHASE-21-discord-voice-quality.md | cross | 20 | pending |
| 22 | PHASE-22-discord-sync-plane.md | cross | 20 | pending |
| 23 | PHASE-23-structured-outputs.md | dnd-app | 03 | pending |
| 24 | PHASE-24-rules-rag-hybrid.md | cross | 01 | pending |
| 25 | PHASE-25-entity-memory-lore.md | dnd-app | 24 | pending |
| 26 | PHASE-26-scene-summarization.md | dnd-app | 01, 07 | pending |
| 27 | PHASE-27-world-state-store.md | dnd-app | 23, 25 | pending |
| 28 | PHASE-28-director-quests-oracle.md | dnd-app | 27 | pending |
| 29 | PHASE-29-model-routing.md | dnd-app | 23 | pending |
| 30 | PHASE-30-combat-automation.md | dnd-app | 08 | pending |
| 31 | PHASE-31-recaps-qa-assistant.md | cross | 25 | pending |
| 32 | PHASE-32-safety-tools.md | dnd-app | *(no deps)* | pending |
| 33 | PHASE-33-image-generation.md | dnd-app | *(no deps)* | pending |
| 34 | PHASE-34-battlemap-generation.md | dnd-app | 08 | pending |
| 35 | PHASE-35-scene-mode.md | dnd-app | *(no deps)* | pending |
| 36 | PHASE-36-async-play-by-post.md | cross | 20 | pending |
| 37 | PHASE-37-seed-packs.md | dnd-app | 25 | pending |
| 38 | PHASE-38-plugin-platform.md | dnd-app | *(no deps)* | pending |
| 39 | PHASE-39-ds-architecture.md | dungeon-scholar | 17–19 recommended | pending |
| 40 | PHASE-40-ds-pwa-cloud.md | dungeon-scholar | 39 | pending |
| 41 | PHASE-41-ds-sealed-tomes-theme.md | dungeon-scholar | 39 | pending |
| 42 | PHASE-42-bmo-deploy-automation.md | bmo | *(no deps)* | pending |
| 43 | PHASE-43-codeql-hardening.md | cross | 15, 16 recommended | pending |
| 44 | PHASE-44-web-build-serving-resilience.md | cross | — | pending |
| 45 | PHASE-45-web-electron-portability.md | dnd-app | — | pending |
| 46 | PHASE-46-web-registry-announce.md | cross | — | pending |
| 47 | PHASE-47-web-reactivity-correctness.md | dnd-app | — | pending |
| 48 | PHASE-48-web-ux-round.md | dnd-app | — | pending |
| 49 | PHASE-49-mp-cloud-dispatch-bus.md | dnd-app | — | shipped v2.6.3 |
| 50 | PHASE-50-mp-character-sharing.md | dnd-app | 49 | shipped v2.6.3 |
| 51 | PHASE-51-mp-cloud-state-sync.md | dnd-app | 49 | shipped v2.6.3 |
| 52 | PHASE-52-mp-lobby-host-resilience.md | dnd-app | — | shipped v2.6.3 |
| 53 | PHASE-53-local-host-turn-fallback.md | cross | — | 53A shipped v2.6.3; 53B implemented (ephemeral TURN) — pending merge+release |
| 54 | PHASE-54-mp-cloud-peer-enrollment.md | cross | 49 | implemented auto/dnd-phase-executer — pending merge+release |
| 55 | PHASE-55-web-asset-base-path.md | dnd-app | — | implemented auto/dnd-phase-executer — pending merge+release |
| 56 | PHASE-56-web-i18n-branding-storage.md | dnd-app | — | implemented auto/dnd-phase-executer — pending merge+release |
| 57 | PHASE-57-web-about-framing-spanish-i18n.md | dnd-app | 45, 56 | implemented auto/dnd-phase-executer — pending merge+release |
| 58 | PHASE-58-web-spanish-i18n-data-labels.md | dnd-app | — (sibling 56, 57) | pending |
| 59 | PHASE-59-web-about-stack-residual-storage-isolation.md | dnd-app | 56, 57 | pending |
| 60 | PHASE-60-web-campaign-version-history-api-parity.md | dnd-app | — | pending |
| 61 | PHASE-61-web-deploy-asset-retention-sweep-precision.md | cross | 44 (lineage) | pending |
| 62 | PHASE-62-web-i18n-brand-terminology-consistency.md | dnd-app | — (sibling 57, 58) | pending |

## Scope allocation (what each phase absorbed from the 2026-06-10 audit)

- **01** Ollama `num_ctx`/`keep_alive` never set (CRITICAL — silent prompt truncation), options-block stability, token-budgets.json reconciliation vs window, curated `contextSize` wiring, prefix-cache prompt ordering (static-first, volatile last), flash-attention + q8_0 KV-cache guidance.
- **02** `add_condition` always-throws (v4 stripped `conditions`), `remove_condition`/`reduce_exhaustion` always-reject, unvalidated numeric mutations → NaN/null HP, long-rest temp-HP clear lost, pact-magic vs regular slot aliasing.
- **03** Cloud 90s whole-stream timeout → inactivity-based, stale timeout comments, openai `max_tokens`/o-series/maxTokens-ignored, `listOllamaModels` no timeout (preflight hang), ollama-manager localhost hardcode vs configured URL, `getConfig()` disk-clobber of in-memory model auto-switch.
- **04** webSearchStatus deadlock (modal wedges app), `reset()`/`initFromCampaign()` not clearing approval queues/timers, second response overwriting undecided pendingActions, `approvePendingActions` discarding ExecutionResult, RulingApprovalModal Dismiss-logs-override, approval overlays isDM vs effectiveIsDM, WebSearchApprovalPrompt Escape/countdown/result-surfacing, MutationApprovalPanel (12 unlabeled types, creature-heal red, 120px reason truncation, no Reject All, no aria-live), DmAlertTray close behavior.
- **05** AI stream listeners killed by campaign object identity change, preload per-listener unsubscribe (root cause), AiProviderSetup + OllamaManagement listener leaks, FILE_READ cancel re-registration leak + post-cancel conversation pollution, new player message cancelling in-flight stream (queueing).
- **06** Scene-prep Cancel (streamId captured renderer-side + AI_CANCEL_SCENE IPC), poll-cap isTyping wedge, error-retry `conv.clear()` history wipe, campaign-not-found dead-end page, post-FILE_READ/WEB_SEARCH restream losing the context block.
- **07** AI_RESTORE_CONVERSATION not refreshing in-memory manager, AI_LOAD restore-on-read race hardening, history-truncation flag false-negative, `lastTokenBreakdown` module-global cross-talk, `contextChunkIds` wire-or-drop.
- **08** Executor pre-batch snapshot staleness (prompted place+start_initiative combo), legendary/recharge enrichment (AI + DM paths), 11 dead duplicate executors + dead `ai-stream-handler.ts`/`finalizeAiResponse` pipeline removal, creature stat-mutation silent failures + prefix fallback, shop open/add/remove broadcast bugs, downtime peerId-as-characterId, drawings unusable (no ids in snapshot), line/cone AoE direction, cast_spell caster-exclusion case bug, bastion no-op verbs.
- **09** 40 duplicate command registrations + triple `/attack`, `/stabilize` shadowing, registry collision test, placeholder commands (clear/log/latency/export/import/ping) honest-or-implemented, undo/redo dead feature decision.
- **10** Hardcoded "Ollama" labels, status bar unknown-as-ready/no-recheck/no-paused, token meter `{{max}}` interpolation, provider-default model IDs from main, AiDmCard wrong-provider prefill + ungated Save, AiProviderSetup silent detect failure + dropdown states + wizard gating, inline AI error affordances, AiContextPanel error states, stream preview tag-stripping + auto-scroll, NarrationOverlay max-height/dialog.
- **11** [DM_ACTIONS]-vs-[STAT_CHANGES] misdocumented trio, `light_source`/`extinguish_source` union gap, GameMode exploration/social collapse-or-implement, bold contradiction, 2024 travel-pace alignment, voice-narration emotion vocabulary ↔ Pi prosody map, `actingCharacterId` end-to-end wiring, AI Vision wire-images-or-strip decision, character-context v4-stripped fields (conditions/weapons/armor/knownSpells/feats invisible to the AI — flagged by PHASE-02 verification; conditions half lands in 02, the context-read side belongs here).
- **12** Hardcoded store strings, full-view Send, "(Phase 16a)" tooltip, "bounds boundaries", spell-end phrasing, "to backup" grammar, AI/AI-DM naming consistency, es.json AI-DM translation consistency.
- **13** BOOK_IMPORT dialog-allowlist, trigger spawn placement, library official counts, underscore type aliases, mic-settings consumer decision, AudioStep preview, group-roll P2P round-trip, container weight recursion, co-DM filter support, compendium + map-pin deep-links, config-store content decoupling, 3D dice polish, orphaned-comment pointer updates, backup-migration framework (33a), ModalScaffold (33c), bundle-size CI guard (33d), trigger-observer kill-switch wiring, **TEN unsanitized-campaignId AI IPC handlers (path-traversal — extend NET-1 `sanitizeCampaignId` to the world-state/NPC/quest/faction/scene handlers)**, dead `AttackRequest` interface in combat-resolver (flagged by PHASE-30), `@google/generative-ai` → `@google/genai` SDK migration decision (upstream-deprecated; flagged by PHASE-03).
- **14** Context-inspector panel (token breakdown surfacing), truncation alert wiring (`wasContextTruncated`), connection-status badge, fileReadStatus indicator + clearing.
- **15** Agent-registry ImportError silent-drop, DM rest gamestate persistence, fish_audio key-on-cmdline + `--fail` (security), DndDmAgent inert tools decision, IDE "under construction" marker, flask-talisman headers, venv pip-tools note.
- **16** app.py Flask-blueprint refactor (calendar/music/tv/chat/system/realtime) + AppState consolidation.
- **17** ds H5/M5 setState side-effects, H3 deploy branches, H2/H1 fork-hostile config, M13 daily-reward clocks, M10 silent localStorage failures, M6 oracle JSON regex, M4 stale-closure progress clobber, M3 vault dedup guard, M2 AbortController, Foresight Scroll + Tinker's Oil no-op effects.
- **18** ds H6 prod error logging, M11 RLS runtime check, M9 oracle endpoint env, M8 CSP/referrer, L13 redirect diagnostics, L9 channel UUID, L7 logger module, L10 answer-key README flag.
- **19** ds H7 color-only feedback, H4 modal a11y wrapper, M12 hover-only warning, M7 reduced-motion, L17 empty-state CTAs, L16 audio unmute prompt, L5/L4 aria-live, L3 icon aria-hidden, L1 tap targets, bestiary difficulty/Bloom badges.
- **20** Discord process split (control endpoint or in-process bot), honest + idempotent narrate (spoken/queued/dropped + eventId), single narration sender + toggle actually gating, in-app session start/stop/status UI, 4xx-as-unreachable fix, bridge-start initiative/text-channel parity, guild/channel config, `_log` kwargs crash, start-endpoint error truthfulness, VC reconnect handling, auto-leave VTT callback, `/initiative` promise fix.
- **21** Sentence-chunked streaming TTS (stream2sentence/RealtimeTTS; Kokoro-FastAPI + Piper split) replacing `text[:500]`, barge-in cancellation through the pipeline, per-NPC voice casting, emotion-prosody map completion.
- **22** VTT↔Discord sync plane finish-or-delete decision: preload channels + renderer listeners, `register_sync_routes`, bot push-helper wiring, bind + bearer auth, `vtt_state` consumption, apply_patch.py removal, push-to-Discord text narration wiring.
- **23** Two-call structured extraction (`format` = JSON schema, stream:false constraints), flat small-model schema redesign, value validation vs game state, repairJson retirement path.
- **24** Hybrid BM25+vector rules retrieval, markdown-header chunking + contextual chunk headers, campaign-content (journals/handouts/lore) indexing.
- **25** Entity records (NPC/location/item/faction) auto-extraction, player-editable lore pages joining AI context as labeled blocks, keyword/state-triggered world-info injection.
- **26** Scene-boundary layered summarization (scene→session→campaign) replacing token-threshold compaction; KV-cache synergy.
- **27** Durable world-state store (engine owns truth, LLM emits deltas), per-NPC opinion persistence, spatial consistency.
- **28** Director/narrator agent split, structured quest objectives with auto-checked completion + chapter advancement, dice-driven oracle/GME randomness injection.
- **29** Per-task model routing (small model for mechanics/extraction/summaries), mid-campaign model swap UI, llama-server speculative-decoding option.
- **30** Automated monster turns (heuristic action engine + LLM flavor only), suggest-tactical-action assistant.
- **31** "Previously on" session recaps + private campaign Q&A side-channel assistant (BMO session_recap tie-in).
- **32** Lines/veils as hard prompt constraints (session-zero panel) + X-card halt/regenerate/ban-list command.
- **33** Inline image generation (NPC portraits, scene art, items) — local SD endpoint + cloud fallback, token/handout attachment.
- **34** Text-to-battlemap structured spec (rooms/walls/doors/lights/spawns) rendered by a procedural tile engine.
- **35** Cinematic scene-mode toggle (full-bleed art + ambient + particles ↔ tactical grid).
- **36** Async play-by-post mode: persistent per-scene turn queue on the Pi + Discord turn pings.
- **37** Scenario/world seed-pack format (export/import) + curated starter packs.
- **38** Campaign-level `systemId` game-system selection end-to-end, plugin sandbox decision + docs truth, TypeDoc/Storybook decision, `systems/dnd5e/` encapsulation start.
- **39** ds App.jsx (9,278 lines) feature-module split + study-mode code-splitting + browser router/deep links (F2/F4 + chunk-size).
- **40** ds PWA offline-first (F6), encrypted per-tome notes (F5), cloudSync conflict tests (L18), defensive copies (L15), import size cap (L14), AudioContext close (L8).
- **41** ds sealed/proctored tomes (F3), full light theme (QA16), Phase-30 QA coverage gaps list.
- **42** bmo deploy automation: GitHub-Actions SSH deploy, blue/green on :5002, Docker deploy option.
- **43** CodeQL alert triage + hardening (552 open alerts from the first default-setup "extended" scan, 2026-06-10). **Mandatory first sub-phase — refresh the data before acting on ANY 2026-06-10 numbers:** (a) pull the CURRENT alert sets (`gh api repos/EvilPatrick06/home-lab/code-scanning/alerts?state=open --paginate` and `…/dependabot/alerts?state=open`) and diff against the 2026-06-10 baseline for new/modified/auto-closed entries — many phases land between now and then and will have fixed or moved alerts; (b) trigger a FRESH CodeQL scan (default setup scans on push to master — push a trivial commit or re-run the latest CodeQL workflow run via `gh api -X POST repos/…/actions/runs/<id>/rerun`, or convert to advanced setup first and dispatch it) and a fresh Dependabot check (`gh api -X POST repos/…/dependabot/alerts` is not a thing — instead bump-check via the Insights → Dependency graph refresh or push a manifest-touching commit), and wait for both to complete before triage; (c) re-derive ALL counts from the fresh scan. Then: scan-scope noise exclusion — **VERIFY the ~164 "noise" candidates individually before excluding** (each alert in `_archive/`, dev scratch, `*.test.*`, build scripts must be confirmed non-production: archived = quarantined dead code, dev/ai-temp = scratch, tests = no prod surface, scripts = local-run only; any alert that actually reaches production behavior gets PROMOTED to the triage list, not excluded) — then convert to advanced setup with `paths-ignore` config or UI filtering. **Triage philosophy (owner directive 2026-06-10): "not currently used" is NEVER a reason to dismiss a dangerous sink — judge by whether the sink is REACHABLE/plantable by an attacker, not by current usage.** A code path that does something unsafe with attacker-controllable input is an attack surface even if no caller/file exercises it today (a future bug, a restored backup, a path-traversal write, or a compromised data dir can reach it); the fix is to remove the unsafe capability, not to dismiss-as-unused. Apply this to the whole sweep: bmo Flask hardening sweep (2026-06-10 baseline: 162 `py/stack-trace-exposure`, 115 `py/path-injection`, 81 `py/log-injection`, 19 clear-text-logging); **DELETE the two `pickle.load` legacy-migration shims (`voice_pipeline.py:284`, `camera_service.py:235`) — `pickle.load` on a file path is an arbitrary-code-execution sink; remove the capability entirely (drop the pickle branch + the migration, or replace with a safe loader). The absence of `.pkl` files on the Pi 2026-06-10 is NOT the safety argument — a planted file would execute code, so the sink itself must go**; dnd-app's 60 production alerts (request-forgery family — judge each by reachability: a fetch to a URL the LOCAL user configures in Settings is low-risk by design and may be dismissed-with-reason, but any URL influenced by remote/peer/AI input is real and gets fixed — do not blanket-dismiss the family); 5 `actions/missing-workflow-permissions`; torch CVE-2025-3000 Dependabot pair (re-check for a patched release at execution time; if still none, dismiss-with-reason or monitor). Cross-refs: `cloud_providers.py` command-injection criticals are ALREADY owned by PHASE-15 (curl config-file helper); campaignId path-injection in dnd-app owned by PHASE-13 — both should be CLOSED by the fresh scan if those phases ran first; verify rather than re-fix.

### Web-build QA addendum (2026-06-23, from WEB-QA-report-2026-06-22)

Phases 44-48 were authored by phase-maker from the first WEB-build QA report (Dungeon Table Online, the Pi-served browser SPA), distinct from the desktop-build phase set above. They are independent (no prerequisites) and may be reordered.

- **44** web-build serving & deploy resilience: Critical `BMO_API_KEY` 401 of the public web surface (ALREADY FIXED in live tree by integrator commit a4059f99 — kept as a regression-guarded finding), High redeploy stale-chunk hard-crash (`rsync --delete` removes old hashed chunks an in-flight SPA still imports → `Failed to fetch dynamically imported module` to the error boundary): drop `--delete`/add retention, catch chunk-load failures → reload-to-latest, optional PWA app shell.
- **45** web Electron-feature portability sweep (gate desktop-only affordances behind `isWebBuild()`): About "Check for Updates" hangs on "Checking…" (shim resolves `{state:'web'}`, no matching handler; `onStatus` no-op), About copy "desktop application … no browser required", Settings Updates section + auto-check-on-launch (default ON), Ollama "Install Ollama" button + local-AI reachability, WebRTC signaling status stuck on "Checking…".
- **46** web public-registry announce null-deref ("Cannot read properties of null (reading 'ok')"): web shim `registry.*` returns bare `null` on failure → `host-announce.ts` `if(result.ok)` throws; make the shim honor the `{ok}` contract + guard the renderer; document that `/api/games` isn't in the public-unauth exemption so hardened anonymous web hosts can't announce (owner decision).
- **47** web reactivity & data-correctness: Bastion (and all `saveEntity`-backed stores) don't re-render until reload (web `saveEntity` returns the entity, not `{success:true}`, so the store's `!result.success` guard bails before `set()`); saved AC 6 vs builder AC 16 (two divergent AC paths + starting armor likely unequipped); Weather roll table `[object Object]` (array branch stringifies an object entry instead of reading its display field; + a d20-range-weighting bug).
- **48** web UX round: no unsaved-changes guard on builder exit (draft silently discarded; existing `draftPrompt` is the unrelated resume prompt), builder Spells tab ~30s freeze at level 10 (non-virtualized list), keybinding conflict on rebind (conflict+swap system EXISTS — verify/close the gap; + a duplicate `c` default), Create Bastion empty-state CTA when no characters exist.


### Multiplayer QA addendum (2026-06-24, from QA-report-2026-06-24-multiplayer)

Phases 49-53 were authored by phase-maker from the first MULTIPLAYER QA report (dnd-vtt v2.6.2, Cloud Relay + Local/Direct P2P) — the two-window MP matrix that prior single-player/web passes left untested. Findings cluster by subsystem (transport/dispatch, character-sharing, state-sync, roles, local-host NAT). The transport + shard layers themselves are sound (report SS-2); the breakage is client-app wiring. **Two drift corrections were folded in during authoring (verify-don't-rebuild, per the PHASE-17/48 precedent):** the report's `sync/*` paths are actually `network/sync/*`, and `dm:character-update` is ALREADY dispatcher-wired (Phase 23c dual-write), so symptom 6's player-apply is likely already fixed — confirm, don't rebuild.

- **49** MP cloud dispatch-bus adapter (TR-1, **Critical**, keystone — unblocks the most symptoms): the cloud relay feeds only the store dispatcher, never the legacy P2P UI bridges (`useChatBridge`/`useCharacterSelectBridge`/etc. subscribe `onHostMessage`/`onClientMessage` = the P2P emitters), so `chat:message`/`chat:file` (symptom 3) and `player:character-select` characterData (symptom 5) die in any cloud game. Adapter re-feeds the bridge-only types over the relay (idempotent for the already-dispatcher-handled `dm:character-update`/`dm:chat-timeout`). PHASE-50/51 depend on this.
- **50** MP character sharing & persistence (CH-1, CH-2): cloud DM clicking a player's PC gets "no character found" (`remoteCharacters` never populated — downstream of 49 + a missing host-side `setRemoteCharacter`); and editing a player's sheet leaks the PC into the DM's own library (`saveAndBroadcast` persists unconditionally — an ownership guard). CH-2a (player-apply) is verified already-fixed by the 23c dual-write.
- **51** MP cloud state-sync roster/permission (SS-1, SS-2): cloud DM↔player canvas divergence (tokens/drawings differ) — the shard plane is relay-wired, but the per-recipient `permissionFilter` (`network/sync/broadcaster.ts:81-89`) denies state to a cloud joiner whose `clientId` isn't enrolled in the campaign roster. Enroll the relay peer; add a filtered-shard regression test. Records SS-2 (relay carries state, not just presence).
- **52** MP cloud lobby host-state resilience (RL-1): cloud DM has no Start Game / DM chat controls (symptoms 1, 2) and promote/demote doesn't propagate (symptom 4) — the gates + setter are individually correct, so the failure is a runtime reset of `isHost` on a recoverable relay reconnect (`LobbyPage` `resetLobby()`). Needs a live two-window repro; fix = don't drop `isHost` on a recoverable blip while `role === 'host'`.
- **53** Local-host TURN / relay fallback (TR-2, independent of the cloud cluster): local/direct host can't open a WebRTC data channel (symptom 9) — default self-host ICE is STUN-only with no TURN and no auto relay fallback. App-logic fix = auto-fallback to the cloud relay on data-channel timeout (lowest-dependency); infra fix = coturn on the Pi in the default ICE set.

### Multiplayer repro addendum (2026-06-24, from QA-report-2026-06-24-multiplayer-repro.md)

Phase 54 was authored by phase-maker from the live two-window **MULTIPLAYER REPRO** pass (the cloud-relay confirmation the first MP triage deferred as "needs a live repro"). It drove a real DM window + a distinct player window over the Pi relay and **materially corrected two phases that were closed on static reading** (verify-don't-rebuild): it **re-opens PHASE-51 SS-1** (the enrollment fix 51A punted on is still reproducing in v2.6.3) and **refutes PHASE-52's `isHost`-reset hypothesis** (`isHost` was never cleared; symptoms #2/#4 did not reproduce). The unifying root cause is **cloud peer enrollment / roster churn**: a cloud joiner is keyed on an ephemeral `cloud-<uuid>`/`sid` and never reconciled to its stable `dndapp:client-id`, so it shows relay-connected yet absent from the host roster, and reconnect churn split-brains both sides.

- **54** MP cloud peer enrollment & readiness resilience: key cloud peers on the stable `dndapp:client-id` end-to-end — reconcile a re-joining client on the Pi relay (`game_relay.py`, sid-keyed today) and dedupe `addPeer`/`getRecipients` by `clientId` (renderer), so the permission-filtered broadcasts (tokens/map/drawings + chat) reach the live peer (**MP-EN-2, re-opens PHASE-51 SS-1**) and the Start readiness gate clears instead of pinning "Waiting for Players…" (**MP-EN-3, re-scopes PHASE-52 RL-1 from `isHost` to readiness+enrollment**). Builds on PHASE-49 (still required, not sufficient alone). Carries forward PHASE-50 (#5 untested — player had no character) and PHASE-53 (local TURN not exercised) for the next MP pass. Cross-domain (renderer + Pi).
  - **Carry-forward (Phase 54D, recorded 2026-06-28):** PHASE-50 symptom #5 (DM clicking a player PC -> "no character found") still needs a live repro with a player character actually selected; PHASE-53 local/direct-host TURN/relay fallback was not exercised this run. The next multiplayer QA pass should create a player character and drive the local/direct host path. No code change in 54D.

### Web-build QA addendum (2026-06-28, from WEB-QA-report-2026-06-28.md)

Phases 55-56 were authored by phase-maker from the v2.6.3 WEB-build QA pass, which re-verified every prior WEB finding against the deployed v2.6.3 build — **all still reproduce** (the v2.6.2→v2.6.3 diff touched campaign-detail/web-DM/cloud-relay, not these). None had a phase doc (44-48 came from the 2026-06-22 report and don't cover them). Independent (no prerequisites); may be reordered.

- **55** web runtime asset base-path resolution: High built-in-map 404 — `use-map-background.ts` calls `Assets.load(map.imagePath)` with a raw `./data/...` path, ignoring Vite `base=/DungeonTableOnline/`, so every preset map renders as an empty grid + a persistent error toast. Resolve runtime `public/data` URLs against `import.meta.env.BASE_URL` (one loader chokepoint, no data migration); sweep portraits/sounds/fonts; harden the sticky error toast (auto-dismiss/close).
- **56** web i18n/branding/storage round: `<html lang>` never updates on language change (medium a11y/SEO — no `languageChanged` handler in `i18n/index.ts`); Audio sliders use browser-default blue vs the themed amber `accent-amber-500` (low); public name "Dungeon Table Online" vs in-app "D&D Virtual Tabletop" never cross-reference (low, owner decision); `library-recent` + `lobby-chat-*` localStorage keys un-namespaced on the shared `bmo.mybmoai.work` origin (low, migrate-on-read). Carries the unverified Spanish-walk i18n leaks (menu hero + character-card nouns) as a verification-gated sub-phase.

### Web-build QA addendum (2026-06-29, from WEB-QA-report-2026-06-29.md)

Phases 58-59 were authored by phase-maker from the v2.6.4 WEB-build QA pass that **re-verified the deployed 2026-06-29 build** (after PHASE-55/56/57 landed). That run found **no new Critical/High issues** and confirmed every prior WEB finding FIXED (`<html lang>`/`dir`, storage namespacing, About web-framing, slider theming, the built-in-map base-path 404). What remained were small **new Spanish-locale leaks** and two **portability residuals** — the basis for these two independent phases (may be reordered). The carried character-card noun leak is NOT re-authored (owned by PHASE-56 56E / pinned by PHASE-57 WEB-I18N-5).

- **58** web Spanish i18n leaks — data-driven labels & locale-aware dates: four low/high-visibility leaks where a label is rendered from a hardcoded English source instead of `t(...)`. DM command-tab strip (`public/data/ui/dm-tabs.json` 13 English `label`s → `DMTabPanel.tsx:414` raw `{tab.label}`); map-editor right-panel tabs (`MapEditorRightPanel.tsx:117-127` literal id array rendered `{tab}` + CSS `capitalize` → "Npcs"); Library group + category labels (`types/library.ts` `LIBRARY_GROUPS` ~70 English `label`s → `LibraryCategoryGrid.tsx:21,36` raw render); Calendar month/weekday/selected-day (`CalendarPage.tsx:19` English `DAYS_OF_WEEK` + `:29-32`/`:240-242` `toLocaleDateString('en-US',…)` → locale-aware `Intl`). 58A/58C/58D also improve desktop (shared data); 58B fixes the "Npcs" casing too.
- **59** web About tech-stack residual + shared-origin storage isolation: residual tails of PHASE-57/56. WEB-ABOUT-2 — the web `techStack` override (`AboutPage.tsx:29-30`) only swapped index 0, so the trailing `electron-vite` entry (`:21`) still shows on web, and the OSS-libraries string (`en.json:5724`) still names "Electron" (rendered ungated `:395`); gate both on `isWebBuild()`. WEB-STORAGE-1 (downgraded — namespacing already closed the collision risk in PHASE-56) — web build still shares the `bmo.mybmoai.work` origin with BMO storage (isolation ergonomics; owner decision: document, or dedicate a subdomain), plus a residual bare `player-notes-` key (`PlayerNotesPanel.tsx:28`) to fold into the PHASE-56 namespacing migration.

### Web-build QA addendum (2026-06-29 v2.7.0, from WEB-QA-report-2026-06-29-v2.7.0.md)

Phases 60-62 were authored by phase-maker from the v2.7.0 WEB-build QA pass — a static + deployed-artifact run (no browser connected) that inspected the deployed v2.7.0 bundle/chunks and the v2.7.0 source. It found **no new Critical/High issues**; the most severe verified finding is **Medium** (the new campaign version-history restore UI is dead on web). The carried character-card data-noun leak is NOT re-authored (owned by PHASE-56 56E / pinned by PHASE-57 WEB-I18N-5 / referenced by PHASE-58). **Two report premises were corrected during authoring (verify-don't-rebuild):** the deploy is not additive-without-pruning (a bounded 24h retention sweep already exists, PHASE-44 lineage), and the service worker does not precache hashed chunks (it precaches only the app shell), so the report's "unbounded growth" and "stale precache" risks do not apply — PHASE-61 records the corrections and narrows to the one real residual. Independent (no prerequisites beyond PHASE-44 lineage on 61); may be reordered.

- **60** web campaign version-history `window.api` parity (**Medium**, the headline): v2.7.0's Campaign Version History panel (`CampaignVersionHistory.tsx:37,49`) calls `window.api.listCampaignVersions`/`restoreCampaignVersion`, which exist only in the Electron preload+main (`preload/index.ts:40-41`, `main/storage/campaign-storage.ts`); the web shim `src/web/web-api.ts` never mirrored them (only the character equivalents at `:226-227`, themselves on the wrong bare-value envelope vs the `{success,data}` the call sites expect). The panel is rendered ungated (`CampaignDetailPage.tsx:331`), so on web it throws `TypeError: …is not a function` → load/restore-failed toasts. Default fix: gate `<CampaignVersionHistory>` behind `!isWebBuild()` (or add envelope-returning stubs). 60B optionally corrects the character-version stub shape. Web-only; desktop unaffected.
- **61** web deploy asset-retention prune precision (**low, debt** — mostly a verify-don't-rebuild correction): the report's "additive deploy never purged / unbounded growth" and "SW precache could pin a stale chunk" are both stale — `.github/workflows/dnd-web-deploy.yml` already runs a bounded `find -mmin +1440 -delete` sweep (no `--delete` rsync, PHASE-44 lineage), and `src/renderer/public/sw.js` precaches only the shell (hashed assets are cache-first/immutable under per-version caches evicted on activate). The one real residual: the prune predicate is mtime-only (reference-blind), so a chunk byte-identical across >24h of builds could be deleted while still referenced. Fix = make the prune reference-aware (exclude the current generation, or `touch` current assets post-rsync) while keeping the 24h grace + no-`--delete` invariant. Deploy-workflow only; no app code.
- **62** web i18n brand/terminology consistency (**low**, owner-decision): the same-value scan flagged `pages.mainMenuPage.appTitle` left English ("D&D Virtual Tabletop") in `es.json:6156` while About is "Mesa virtual de D&D" (`es.json:5691`) — same product, two Spanish names; and "Dungeon Master" untranslated across four `es` keys (`game.chatPanel.dungeonMaster`, `lobby.characterSelector.dungeonMaster`, `campaign.hostNamePrompt.hostNamePlaceholder`, `pages.campaignDetailPage.defaultHostName`). 62A unifies the app title on "Mesa virtual de D&D"; 62B applies the owner localization policy (translate to "Director de Juego"/"Máster" or document keep-English per PHASE-57). Value-only `es.json` edits; en/es parity already 6541/6541; desktop benefits identically. The v2.7.0 status-badge localization (statusRetired/statusDeceased) is already done+correct and not re-filed.
