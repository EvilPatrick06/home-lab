# PHASE-38 — Plugin platform: game-system selection end-to-end, sandbox decision, API-docs decision, 5e encapsulation start

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Make the campaign-level game-system choice (`Campaign.system`) actually mean something end-to-end: today the campaign wizard lets the DM pick a system and the field flows into the game store and LAN announce, but every character-creation entry point, the builder, the routes, and the join handshake hardcode or ignore it — so a registered non-5e system is selectable but never playable, and the failure mode is silent. This phase threads the system id through character-creation routing and the builder with honest gating for unsupported systems, makes the join handshake's documented "host rejects mismatches" behavior true, records the plugin sandbox decision (no runtime sandbox — trust-on-install stays) and aligns the stale code comment + docs to it, adopts TypeDoc for the plugin-facing API surface while formally declining Storybook, and starts the `systems/dnd5e/` encapsulation by collapsing five duplicated 5e skill lists onto one canonical module.

## Dependencies & cross-phase notes

- **Prerequisites:** none (`PHASE-INDEX.md` row 38: *(no deps)*). All work is renderer/main TypeScript plus docs; no Pi code.
- **PHASE-10 / PHASE-12 both touch `src/renderer/src/pages/SettingsPage.tsx`** (AI provider UI truth; wording sweep). This phase only edits the plugin/game-systems region of that file if at all (38D may touch nothing there — the trust banner already exists). Keep edits surgical; re-verify line anchors at execution time if 10/12 already landed.
- **PHASE-12 touches `i18n/locales/en.json` + `es.json`.** 38B adds new keys (additive; run `npm run i18n:gen-keys` after). No conflict expected — different key namespaces.
- **PHASE-13 owns the underscore type-alias cleanup** (`type _X = Y` placeholders). `plugin-registry.ts:20-23` and `use-plugin-store.ts:7` contain the same pattern — do NOT clean them here; leave for 13 (its audit entry cites SpellsTab/MapCanvas, but the pattern-sweep may reach these files; avoid a collision by not touching those lines).
- **PHASE-13 also owns "config-store content decoupling"** which involves the homebrew/plugin content merge in `use-config-store.ts` — this phase does not touch plugin *content* loading paths.
- **The repo-root `docs/PLUGIN-SYSTEM.md` and `dnd-app/docs/PLUGIN-SYSTEM.md` both reference `dnd-app/docs/AI-DM-AUDIT.md`, which no longer exists** (the audit was consumed into this phase set). 38F must replace those references with pointers to this plan / `PHASE-INDEX.md`.
- **PHASE-30 touches combat services** — 38A's skill-list dedup touches `GroupRollModal.tsx` (combat modal) but only the constant at its top; no overlap with 30's monster-turn logic.

## Verified findings

All claims below were re-verified against the live tree on 2026-06-10. Each subsection lists the verification commands; re-run them before implementing (rule 3).

### F1 — Campaign-level system selection EXISTS but is not end-to-end (audit claim corrected)

The audit said "Campaign-level game-system selection is unimplemented — `systemId` appears NOWHERE in src." The token `systemId` is indeed absent, but the claim is materially misleading: **the field exists, named `system`**, and substantial wiring already exists. What is actually missing is downstream consumption.

What exists today:

- `Campaign.system: GameSystem` — `src/renderer/src/types/campaign.ts:98` (interface `Campaign` at `:94`; `GameSystem` imported `:3`).
- `GameSystem = 'dnd5e' | (string & {})` — `src/renderer/src/types/game-system.ts:1`; mutable `GAME_SYSTEMS` config registry with `registerGameSystem`/`unregisterGameSystem` (`:25-31`), only `dnd5e` built in (`:12-21`).
- Campaign wizard has a working **SystemStep**: `src/renderer/src/components/campaign/SystemStep.tsx` renders `Object.values(GAME_SYSTEMS)` as selectable cards; `CampaignWizard.tsx:67` holds the state, `:477` renders the step, `:313` passes `system` into `createCampaign`. A plugin game system that calls `getConfig()` / `api.gameSystem.registerConfig()` therefore DOES appear in the wizard.
- Two parallel registries: the plugin `Map` in `src/renderer/src/systems/registry.ts` (`registerSystem:6`, `getSystem:20` — throws if unregistered, `getAllSystems:26`; `registerSystem` mirrors `plugin.getConfig()` into `GAME_SYSTEMS`), bootstrapped by `systems/init.ts:7` (`registerSystem(dnd5ePlugin)`) from `App.tsx:52`.
- `campaign.system` flows to: game store load (`src/renderer/src/pages/InGamePage.tsx:132` → `loadGameState({ system: campaign.system, ... })`; default `'dnd5e'` at `src/renderer/src/stores/game/types.ts:48`), LAN announce (`src/renderer/src/pages/LobbyPage.tsx:242` `game_system: campaignSystem || 'dnd5e'`), campaign detail display with a graceful unknown-system fallback (`CampaignDetailPage.tsx:250-253`), and adventure filtering (`AdventureSelector.tsx:173`).
- Plugin loading registers plugin game systems into the plugin registry: `src/renderer/src/services/plugin-system/plugin-registry.ts:95-106` (`manifest.type === 'game-system' && module.gameSystemPlugin` → `registerSystem(gsp)`).

What is broken (the real end-to-end gaps):

1. **Character creation hardcodes 5e at every entry point.** `src/renderer/src/pages/CreateCharacterPage.tsx:37-41` — `if (phase === 'system-select' && !id) selectGameSystem('dnd5e')`. Routes are 5e-literal: `App.tsx:236` redirects `/characters/create` → `/characters/5e/create`; `:238` `/characters/5e/create`; `:246` `/characters/5e/edit/:id`; `:254` `/characters/5e/:id`; `:262` levelup. The route helper `src/renderer/src/utils/character-routes.ts` returns 5e-literal paths from all four functions. Navigation call sites: `ViewCharactersPage.tsx:198,254`, `components/lobby/CharacterSelector.tsx:230` (already has `campaign` in scope at `:35` via `useCampaignStore`), `CampaignWizard.tsx:267`.
2. **The builder ignores the system argument.** `src/renderer/src/stores/builder/slices/core-slice.ts:40-47` — `selectGameSystem: (system) => { const slots = generate5eBuildSlots(1); ... }` always generates 5e slots and opens the 5e class modal regardless of `system`.
3. **The plugin registry's rules methods are never consumed in production.** `grep -rn "getSystem(\|getAllSystems(" src --include="*.ts" --include="*.tsx" | grep -v test` → only `SettingsPage.tsx:1839` (the "Registered Game Systems" list, section at `:1837`, remove-button guard `sys.id !== 'dnd5e'` at `:1851`) and `data-provider.ts:161` (inside `resolveDataPath`, `:158-170`; plus the internal `resolvePath` helper at `:125-128` which passes a hardcoded `'dnd5e'`). None of `dnd5ePlugin`'s methods (`getSpellSlotProgression`, `getSheetConfig`, `getSkillDefinitions`, …, defined `systems/dnd5e/index.ts:86-192`) are invoked through the registry — this confirms the audit's "registry consumed only by SettingsPage + resolveDataPath".
4. **`CharacterBuilder5e.tsx:114`** calls `resolveDataPath('dnd5e', 'species')` — acceptable inside a 5e-only component, noted for completeness.

Verification commands:

```bash
cd dnd-app
grep -rn "systemId" src/ --include="*.ts" --include="*.tsx"        # → no hits (token absent)
grep -n "system: GameSystem" src/renderer/src/types/campaign.ts    # → :98
grep -rn "getSystem(\|getAllSystems(" src --include="*.ts" --include="*.tsx" | grep -v test
grep -n "selectGameSystem" src/renderer/src/pages/CreateCharacterPage.tsx src/renderer/src/stores/builder/slices/core-slice.ts
grep -rn "characters/5e/create" src/renderer/src --include="*.tsx" --include="*.ts" | grep -v test
grep -n "SystemStep" src/renderer/src/components/campaign/CampaignWizard.tsx
```

### F2 — Join handshake "host rejects mismatches" is documented but FALSE (new finding, sharpens the audit)

`src/renderer/src/network/message-types.ts:117-118` declares `JoinPayload.gameSystem?: string` with the doc comment *"Game system ID the client supports (e.g. 'dnd5e'). Host rejects mismatches."* Reality:

- The client never sends it: the join payload is built at `src/renderer/src/network/client-manager.ts:271-285` — no `gameSystem` key.
- The zod wire schema strips it even if sent: `JoinPayloadSchema` at `src/renderer/src/network/schemas.ts:32-45` has no `gameSystem` field (zod objects strip unknown keys by default).
- The host never checks it: `handleJoin` (`src/renderer/src/network/host-connection.ts:210-300`) performs ban checks, name checks, and role-cap checks only. The host has no notion of the campaign's system — `host-manager.ts` holds `maxPlayers`/`maxSpectators` (set via `setHostCaps:523`, called from `LobbyPage.tsx:198`) and `campaignId` (`setCampaignId:529`) but no game system.
- Rejection plumbing that CAN be reused: `JoinRejectedPayloadSchema` (`schemas.ts:263-266`) with `reason: z.enum(['full','banned','spectator-cap','name-conflict','invalid'])` and the cap-rejection pattern in `host-connection.ts:266-290` (`buildMessage('player:join-rejected', {...})` → `disconnectPeer`).

```bash
grep -n "gameSystem" src/renderer/src/network/message-types.ts src/renderer/src/network/schemas.ts src/renderer/src/network/client-manager.ts src/renderer/src/network/host-connection.ts
# → only the message-types.ts declaration
grep -n "join-rejected" src/renderer/src/network/host-connection.ts | head
```

### F3 — Sandbox state: no sandbox module, stale "Phase 1 C2" promise, but a trust model + permission gating already shipped (audit claim partially corrected)

Confirmed as the audit said:

- No `plugin-runner.ts` anywhere: `find src -name "plugin-runner*"` → empty.
- `isolated-vm` is not a dependency: `grep -n "isolated-vm" package.json` → empty.
- `src/main/plugins/plugin-installer.ts:162-164` comment: *"unverified installs are 'install at your own risk' until Phase 1 C2 sandboxing lands."* — promises sandbox work that no phase owns.

What the audit under-credits (already shipped, Phase 28g.2):

- A documented trust model: `dnd-app/docs/PLUGIN-SYSTEM.md` §"Trust model (Phase 28g.2)" — explicitly "Plugins are NOT sandboxed", trust-on-install.
- An install-UI warning banner: `SettingsPage.tsx:361-364` renders `t('pages.settingsPage.pluginTrustWarning')` (en.json:6023 / es.json:6023).
- Permission gating on the convenience API: `services/plugin-system/plugin-api.ts:109-113` — `requirePermission` throws when a manifest lacks a declared `PluginPermission` (`src/shared/plugin-types.ts:100-107`: `commands | ui-extensions | game-events | combat-hooks | dm-actions | sounds | storage`). Note this gates only the `PluginAPI` object handed to `activate()`; a plugin module still executes as ordinary renderer JS, so permissions are a guard against *benign mistakes*, not a security boundary.
- Structural install validation + checksum pinning + security-event logging in `plugin-installer.ts` (path-traversal-constrained plugin id; `plugin.install.success` event records `sha256` + `verified`).

So the remaining deliverable is the **decision** (sandbox: yes/no), making the installer comment truthful, and documenting the decision with rationale — not building trust infrastructure from scratch.

```bash
cd dnd-app
find src -name "plugin-runner*"                                   # → nothing
grep -n "isolated-vm\|typedoc\|storybook" package.json            # → nothing
grep -n "Phase 1 C2" src/main/plugins/plugin-installer.ts         # → :164
grep -n "pluginTrustWarning" src/renderer/src/pages/SettingsPage.tsx src/renderer/src/i18n/locales/en.json
sed -n '105,115p' src/renderer/src/services/plugin-system/plugin-api.ts   # permission gate
```

### F4 — PLUGIN-SYSTEM docs were already truth-patched on 2026-06-10, but the patches are now imprecise (audit claim corrected)

The audit said "both PLUGIN-SYSTEM docs claim campaigns carry `systemId`". That was fixed in the 2026-06-10 doc-drift commit: both docs now carry "Reality check (2026-06-10)" callouts stating the opposite:

- Repo root `docs/PLUGIN-SYSTEM.md:71-78` — "campaigns do NOT yet carry a `systemId` — the field appears nowhere in `dnd-app/src/`".
- `dnd-app/docs/PLUGIN-SYSTEM.md:35-40` — "there is currently NO campaign-level `systemId` field anywhere in `src/`".

Both callouts are literally true for the token `systemId` but wrong in spirit — `Campaign.system` exists and the wizard sets it (F1). Both docs also point readers to `dnd-app/docs/AI-DM-AUDIT.md` (root doc `:75`, dnd-app doc §Future improvements), which is deleted. 38F rewrites both callouts to the post-phase truth and fixes the dangling references.

```bash
grep -n "Reality check" docs/PLUGIN-SYSTEM.md dnd-app/docs/PLUGIN-SYSTEM.md   # run from repo root
grep -rn "AI-DM-AUDIT" docs/PLUGIN-SYSTEM.md dnd-app/docs/PLUGIN-SYSTEM.md
```

### F5 — TypeDoc and Storybook: neither installed; TS is 6.0.3 (audit claim confirmed)

`grep -n "typedoc\|storybook" dnd-app/package.json` → no hits. `"typescript": "^6.0.3"` at `package.json:218`. Relevant for tooling choice: TypeDoc added TypeScript 6.0 support in v0.28.18 ("Support TypeScript 6.0, #3084" — typedoc.org changelog); latest is v0.28.19 (2026-04-12). `tsconfig.web.json` `include` covers `src/renderer/src/**/*` and `src/shared/**/*` (`tsconfig.web.json:24-30`), so a TypeDoc run against the plugin-facing surface can reuse it directly.

### F6 — 5e sprawl + five duplicate full skill lists (audit claim confirmed, dedup targets pinned)

`systems/dnd5e/` contains only `index.ts` (192 lines) + `index.test.ts`; the actual 5e implementation sprawls across `components/sheet/` (98 files), `components/builder/` (64), `components/levelup/` (11), `services/combat/` (54) per `dnd-app/docs/PLUGIN-SYSTEM.md` §"Current D&D 5e system". The canonical 18-skill definition lives in `systems/dnd5e/index.ts:52-72` (`SKILL_DEFINITIONS`, returned by `getSkillDefinitions()` at `:186`) and is duplicated five times:

| File | Line | Symbol | Shape |
|---|---|---|---|
| `components/game/modals/combat/GroupRollModal.tsx` | 36 | `SKILLS` | `string[]` (18 names) |
| `components/game/modals/utility/HelpModal.tsx` | 23 | `ASSIST_SKILLS` | `string[]` (18 names) |
| `components/game/dm/StatBlockEditor.tsx` | 28 | `COMMON_SKILLS` | `string[]` (18 names) |
| `components/game/player/MacroBar.tsx` | 27 | `SKILL_ABILITIES` | `Record<string, string>` (18 entries) |
| `services/character/auto-populate-5e.ts` | 7 | `SKILL_ABILITY_MAP_5E` | `Record<string, AbilityName>` (exported; consumed by `populateSkills5e` at `:29`, which `stores/builder/slices/build-character-5e.ts:277` uses) |

NOT a dedup target: `stores/level-up/apply-level-up.ts:33-55` `MULTICLASS_SKILL_GRANTS` — those are class-specific multiclass skill *option* subsets, not the full list (the audit-era grep over-matched).

```bash
cd dnd-app
grep -rn "Sleight of Hand" src/renderer/src --include="*.ts" --include="*.tsx" | grep -v test
grep -n "SKILL_DEFINITIONS" src/renderer/src/systems/dnd5e/index.ts
```

## Sub-phases

### 38A — `systems/dnd5e/skills.ts`: single source for 5e skill definitions

**Objective:** start the `systems/dnd5e/` encapsulation with a measurable, low-risk slice: one canonical skills module, five duplicate constants deleted.

**Files:**
- NEW `src/renderer/src/systems/dnd5e/skills.ts` (+ colocated `skills.test.ts`)
- `src/renderer/src/systems/dnd5e/index.ts`
- `src/renderer/src/components/game/modals/combat/GroupRollModal.tsx`
- `src/renderer/src/components/game/modals/utility/HelpModal.tsx`
- `src/renderer/src/components/game/dm/StatBlockEditor.tsx`
- `src/renderer/src/components/game/player/MacroBar.tsx`
- `src/renderer/src/services/character/auto-populate-5e.ts`

**Steps:**
1. Create `systems/dnd5e/skills.ts` exporting:
   ```ts
   import type { AbilityName } from '../../types/character-common'

   export const SKILL_DEFINITIONS_5E: ReadonlyArray<{ name: string; ability: AbilityName }> = [ /* the 18 entries moved verbatim from index.ts:53-72 */ ]
   export const SKILL_NAMES_5E: readonly string[] = SKILL_DEFINITIONS_5E.map((s) => s.name)
   export const SKILL_ABILITY_MAP_5E: Readonly<Record<string, AbilityName>> =
     Object.fromEntries(SKILL_DEFINITIONS_5E.map((s) => [s.name, s.ability]))
   ```
2. In `systems/dnd5e/index.ts`: delete the inline `SKILL_DEFINITIONS` (`:52-72`), import `SKILL_DEFINITIONS_5E` from `./skills`, and have `getSkillDefinitions()` (`:186`) return a mutable copy (`[...SKILL_DEFINITIONS_5E]`) to preserve the `Array<{...}>` return type of `GameSystemPlugin.getSkillDefinitions` (`systems/types.ts:37`).
3. Replace the five duplicates: `SKILLS` (GroupRollModal), `ASSIST_SKILLS` (HelpModal), `COMMON_SKILLS` (StatBlockEditor) → import `SKILL_NAMES_5E`; `SKILL_ABILITIES` (MacroBar) → import `SKILL_ABILITY_MAP_5E`; in `auto-populate-5e.ts` delete the inline map and re-export it (`export { SKILL_ABILITY_MAP_5E } from '../../systems/dnd5e/skills'`) so `populateSkills5e` and any external importer keep working unchanged. If a consumer's local list intentionally differed (diff before deleting — they should all be the identical 18), keep the local list and note it in Completed; verified 2026-06-10: all five are the full identical 18.
4. These components ARE D&D flows, so importing from `systems/dnd5e/` is allowed under the documented anti-pattern rules (`dnd-app/docs/PLUGIN-SYSTEM.md` §Anti-patterns prohibits such imports only *outside* D&D flows).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/systems/dnd5e/skills.test.ts src/renderer/src/systems/dnd5e/index.test.ts`.

**Acceptance:** `grep -rn "'Sleight of Hand'" src/renderer/src --include="*.ts" --include="*.tsx" | grep -v test | grep -v systems/dnd5e | grep -v import-` hits only `apply-level-up.ts` (multiclass subsets) — the five full-list duplicates are gone; `skills.test.ts` asserts 18 entries, unique names, all abilities ∈ the six `AbilityName` values, and map/names derivations consistent with the array.

### 38B — System-aware character-creation routing + honest builder gating

**Objective:** character creation derives its game system from the route (and callers pass the campaign's system) instead of hardcoding `'dnd5e'`; picking a system without builder support shows an honest notice instead of a silently-5e builder.

**Files:**
- `src/renderer/src/utils/character-routes.ts` (+ NEW colocated `character-routes.test.ts`)
- `src/renderer/src/App.tsx`
- `src/renderer/src/pages/CreateCharacterPage.tsx`
- `src/renderer/src/stores/builder/slices/core-slice.ts`
- `src/renderer/src/pages/ViewCharactersPage.tsx`
- `src/renderer/src/components/lobby/CharacterSelector.tsx`
- `src/renderer/src/components/campaign/CampaignWizard.tsx`
- `src/renderer/src/i18n/locales/en.json`, `es.json`, regenerated `src/renderer/src/i18n/generated-keys.ts`

**Steps:**
1. `character-routes.ts` — add the route-segment mapping (the URL segment is `5e`, the system id is `dnd5e`):
   ```ts
   import { GAME_SYSTEMS, type GameSystem } from '../types/game-system'

   const SEGMENT_BY_SYSTEM: Record<string, string> = { dnd5e: '5e' }
   export function routeSegmentForSystem(system: GameSystem): string {
     return SEGMENT_BY_SYSTEM[system] ?? system
   }
   export function systemIdFromRouteSegment(segment: string): GameSystem | null {
     if (segment === '5e') return 'dnd5e'
     return segment in GAME_SYSTEMS ? segment : null
   }
   export function getBuilderCreatePath(system: GameSystem = 'dnd5e'): string {
     return `/characters/${routeSegmentForSystem(system)}/create`
   }
   ```
   Leave `getCharacterSheetPath`/`getBuilderEditPath`/`getLevelUpPath` 5e-literal (sheets/levelup for non-5e are out of scope — the gate in step 3 prevents non-5e characters from existing).
2. `App.tsx:238` — change the create route from `path="/characters/5e/create"` to `path="/characters/:systemSeg/create"` (same element). The literal URL `/characters/5e/create` still matches; the `:236` redirect and the other 5e-literal routes stay untouched. Route-order note: react-router v7 ranks static segments above dynamic ones, so `/characters/create` (the `:236` redirect) still wins over `:systemSeg/create` for that exact URL.
3. `CreateCharacterPage.tsx` — read `const { systemSeg } = useParams<{ systemSeg?: string }>()`; resolve `const resolvedSystem = systemIdFromRouteSegment(systemSeg ?? '5e')`. Replace the `:37-41` effect:
   - `resolvedSystem === 'dnd5e'` → `selectGameSystem('dnd5e')` (today's behavior, unchanged).
   - `resolvedSystem === null` (unknown segment) or a registered system that is not playable (i.e. `resolvedSystem !== 'dnd5e'` — no non-5e builder exists) → render an honest notice instead of the builder: heading + body explaining the system "<name>" is registered but character creation for it is not yet supported, plus a link back to `/characters`. Resolve the display name via `GAME_SYSTEMS[resolvedSystem]?.name ?? systemSeg`. Implement inline in CreateCharacterPage (small conditional block, no new page component).
   - Editing flows (`id` param present) are 5e-only routes and bypass this logic, exactly as today.
4. `core-slice.ts:40-47` — make `selectGameSystem` defensive: if `system !== 'dnd5e'`, log a warning and return without flipping `phase` to `'building'` (the page-level gate in step 3 should make this unreachable; the guard keeps the store honest if a future caller forgets). 5e path byte-for-byte unchanged.
5. Update navigation call sites to the helper: `ViewCharactersPage.tsx:198,254` → `getBuilderCreatePath()` (no campaign context, default 5e); `CharacterSelector.tsx:230` → `getBuilderCreatePath(campaign?.system ?? 'dnd5e')` (the `campaign` object is already in scope at `:35`); `CampaignWizard.tsx:267` → `getBuilderCreatePath(system ?? 'dnd5e')` (the wizard's chosen system state, `:67`).
6. i18n: add keys under `pages.createCharacterPage.` — `unsupportedSystemTitle`, `unsupportedSystemBody` (with `{{name}}` interpolation), `unsupportedSystemBack` — to `en.json` AND `es.json`, then `npm run i18n:gen-keys` (regenerates `generated-keys.ts`; do not hand-edit it).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/utils/character-routes.test.ts`.

**Acceptance:** `grep -rn "'/characters/5e/create'" src/renderer/src --include="*.tsx" | grep -v test` → only the `App.tsx:236` redirect target remains (all navigation goes through the helper); `character-routes.test.ts` covers `'5e' → 'dnd5e'`, unknown segment → `null`, registered-plugin id passthrough, and `getBuilderCreatePath('dnd5e') === '/characters/5e/create'`; with only dnd5e registered, the existing create-character UX is pixel-identical (default path unchanged); navigating to `/characters/xyz/create` renders the notice, not a 5e builder.

### 38C — Make the join-handshake system check true

**Objective:** the `JoinPayload.gameSystem` comment claims "Host rejects mismatches" — make it true with full wire back-compat: clients advertise the system they intend to play; the host compares against the hosted campaign's system and rejects mismatches; absent field (pre-38 clients) = compatible.

**Files:**
- `src/renderer/src/network/schemas.ts`
- `src/renderer/src/network/client-manager.ts`
- `src/renderer/src/network/host-manager.ts`
- `src/renderer/src/network/host-connection.ts` (+ its test `host-connection.test.ts`)
- `src/renderer/src/pages/LobbyPage.tsx`
- `src/renderer/src/network/index.ts` (re-export)

**Steps:**
1. `schemas.ts:32-45` — add `gameSystem: z.string().max(64).optional()` to `JoinPayloadSchema` (the declared-but-stripped field from `message-types.ts:118`; the TS type already has it, so no type change).
2. `host-manager.ts` — module-level `let hostGameSystem: string | null = null`; `export function setHostGameSystem(system: string | null): void` next to `setHostCaps` (`:523`); expose `getGameSystem: () => hostGameSystem` on the `HostStateAccessors` object built around `:241` (where `getMaxPlayers` lives). Add the accessor to the `HostStateAccessors` interface in `host-connection.ts` (top of file, alongside `getMaxPlayers`/`getMaxSpectators`). Reset it wherever `setHostCaps`-adjacent teardown resets host state (mirror existing lifecycle; verify with `grep -n "maxPlayers = 8" src/renderer/src/network/host-manager.ts`).
3. `LobbyPage.tsx:198` — alongside `setHostCaps(...)`, call `setHostGameSystem(campaign.system ?? 'dnd5e')`. Re-export `setHostGameSystem` from `network/index.ts` (pattern: `:31-33`).
4. `host-connection.ts` `handleJoin` — after the role-cap checks (`:266-290`), add:
   ```ts
   const clientSystem = message.payload.gameSystem
   const hostSystem = state.getGameSystem()
   if (clientSystem && hostSystem && clientSystem !== hostSystem) {
     const rejectMsg = state.buildMessage('player:join-rejected', {
       reason: 'invalid' as const,
       message: `Game system mismatch: this game runs "${hostSystem}", your client joined for "${clientSystem}".`
     })
     state.disconnectPeer(peerId, rejectMsg)
     return
   }
   ```
   Reuse `reason: 'invalid'` — do NOT extend the `JoinRejectedPayloadSchema` enum (`schemas.ts:263-266`); an unknown enum value would fail zod parsing on older clients and swallow the rejection message entirely.
5. `client-manager.ts:271-285` — include `gameSystem: 'dnd5e'` in the join payload via the game-store/system default. Concretely: thread the system the client intends to play into `connectToHost(...)`'s options the same way `displayName`/`characterId` arrive (verify the call chain with `grep -rn "connectToHost(" src/renderer/src --include="*.ts" --include="*.tsx" | grep -v test`); if threading a new parameter through the join page is disproportionate, sending the literal `'dnd5e'` constant is honest today (clients can only build 5e characters after 38B's gate) — choose at execution time and record which in Completed.
6. Update the `message-types.ts:117` comment to describe the actual semantics ("Optional; absent = pre-2026-06 client, treated as compatible").

**Behavior risk note:** with only dnd5e shipped, client `'dnd5e'` vs host `'dnd5e'` never mismatches, and pre-38 clients omit the field — so this lands as a no-op for every real session today. The check only activates when a future plugin system hosts a game.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/network/host-connection.test.ts src/renderer/src/network/schemas.test.ts`.

**Acceptance:** new `host-connection.test.ts` cases — (a) join with `gameSystem` matching host system → accepted; (b) mismatch → `player:join-rejected` with `reason: 'invalid'` and a message containing both system ids, peer disconnected; (c) join with NO `gameSystem` → accepted (back-compat); (d) host with `getGameSystem() === null` → accepted regardless. `schemas.test.ts` accepts a join payload with and without `gameSystem`.

### 38D — Sandbox decision: no runtime sandbox (recorded), installer comment made truthful

**Objective:** close the open "plugin sandbox" question with a recorded decision and remove the stale promise in code.

**Decision (rationale in Research notes): NO runtime sandbox.** Trust-on-install remains the model. Keep and rely on: structural zip/manifest validation + charset-constrained plugin id, sha256 checksum pinning (`verified` flag), security-event logging, the Settings install warning banner, and the permission-gated `PluginAPI`. Revisit triggers: shipping a plugin marketplace/downloader, accepting community submissions, or any path where users install plugins they did not personally obtain.

**Files:**
- `src/main/plugins/plugin-installer.ts`
- `dnd-app/docs/PLUGIN-SYSTEM.md`

**Steps:**
1. `plugin-installer.ts:162-164` — rewrite the comment: drop "until Phase 1 C2 sandboxing lands"; state that unverified installs are trust-on-install **by design** (decision 2026-06-10) and reference `docs/PLUGIN-SYSTEM.md` §Trust model. No behavior change; the `logSecurityEvent` call stays byte-identical.
2. `dnd-app/docs/PLUGIN-SYSTEM.md` §"Trust model (Phase 28g.2)" — append a "Sandbox decision (2026-06-10)" block: options evaluated (isolated-vm: maintenance mode, native module requiring per-Electron-ABI rebuilds, no documented Electron support; vm2: deprecated then revived with a critical sandbox-escape CVE in 2026-01; `node:vm`: explicitly not a security mechanism; `utilityProcess`/child-process isolation: real OS boundary but renderer plugins need the DOM + the live `PluginAPI`, which would force a full async-RPC rewrite of the plugin surface; QuickJS-wasm: same API-surface problem), the decision, what mitigations remain in force, and the revisit triggers above. Include source URLs (listed in Research notes). Clarify explicitly that `PluginPermission` gates the `PluginAPI` convenience surface only and is NOT a security boundary against malicious code.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json`; `npx vitest run src/main/plugins/plugin-installer.test.ts`.

**Acceptance:** `grep -rn "Phase 1 C2" src/` → no hits; the docs section exists with all five evaluated options + revisit triggers; installer tests still green.

### 38E — TypeDoc adopted for the plugin-facing API; Storybook formally declined

**Objective:** resolve the "TypeDoc API docs + Storybook" open item with one adoption and one recorded declination.

**Files:**
- `dnd-app/package.json` (devDep + script)
- NEW `dnd-app/typedoc.json`
- `dnd-app/.gitignore`
- `dnd-app/docs/PLUGIN-SYSTEM.md` (tooling note)

**Steps:**
1. `npm i -D typedoc@^0.28.19` (TS 6.0 support landed in 0.28.18 — see Research notes; the repo is on `typescript ^6.0.3`, `package.json:218`). Pure-JS package; safe on the Pi (ARM).
2. Create `dnd-app/typedoc.json`:
   ```json
   {
     "$schema": "https://typedoc.org/schema.json",
     "entryPoints": [
       "src/renderer/src/systems/types.ts",
       "src/renderer/src/systems/registry.ts",
       "src/renderer/src/services/plugin-system/plugin-api.ts",
       "src/shared/plugin-types.ts"
     ],
     "tsconfig": "tsconfig.web.json",
     "out": "docs/api",
     "excludePrivate": true,
     "excludeInternal": true,
     "readme": "docs/PLUGIN-SYSTEM.md"
   }
   ```
   These four files are the surface a plugin author programs against (`GameSystemPlugin`, the registry, `PluginAPI`, the manifest types). If TypeDoc errors on a renderer-specific import chain, trim entry points rather than widening tsconfig — the goal is plugin-author docs, not whole-app docs.
3. `package.json` scripts: `"docs:api": "typedoc"`.
4. `.gitignore`: add `docs/api/` (generated output stays untracked).
5. **Storybook: declined.** Record in `dnd-app/docs/PLUGIN-SYSTEM.md` (same tooling note as the TypeDoc mention): Storybook 10 is an ESM-only breaking release with its own builder/addon stack — meaningful recurring maintenance for a solo-maintained app whose component contracts are already covered by ~6000 vitest tests and the library boundary test; component isolation has no current consumer. Decision recorded with sources; revisit if a design-system/theming workstream appears.

**Cheap checks:** `cd dnd-app && npm run docs:api` exits 0 and emits `docs/api/index.html`; `git status` shows no tracked generated files.

**Acceptance:** script runs green from a clean checkout (`npm ci && npm run docs:api`); `grep -n "docs:api\|typedoc" package.json` shows the script + devDep; docs note covers both the adoption and the declination.

### 38F — Docs truth pass on both PLUGIN-SYSTEM docs

**Objective:** both PLUGIN-SYSTEM docs describe post-phase reality precisely, and no doc references the deleted audit file.

**Files:**
- `docs/PLUGIN-SYSTEM.md` (repo root)
- `dnd-app/docs/PLUGIN-SYSTEM.md`

**Steps:**
1. Root `docs/PLUGIN-SYSTEM.md:71-78` — replace the "Reality check (2026-06-10)" callout: campaigns DO carry `system: GameSystem` (`types/campaign.ts:98`); the wizard's SystemStep sets it; it reaches the game store, LAN announce, and (new in this phase) character-creation routing and the join handshake; non-5e systems gate to an honest unsupported notice at character creation pending a system-provided builder. Replace the `AI-DM-AUDIT.md` pointer (`:75`) with a pointer to `dnd-app/docs/phases/completed/PHASE-38-plugin-platform.md`.
2. Same rewrite for `dnd-app/docs/PLUGIN-SYSTEM.md:35-40`, and update its §"Future improvements" closing paragraph (currently "Tracked in the consolidated backlog — `dnd-app/docs/AI-DM-AUDIT.md` …") to enumerate the still-open future items inline instead: full 5e encapsulation into `systems/dnd5e/` (38A started it: skills), system-specific renderer modules, plugin marketplace/downloader UI, content-schema versioning, community submission vetting — no phase currently owns these.
3. Sweep both docs for line anchors invalidated by 38A-38E edits (`grep -n "AI-DM-AUDIT" docs/PLUGIN-SYSTEM.md dnd-app/docs/PLUGIN-SYSTEM.md` must return nothing).

**Cheap checks:** `grep -rn "AI-DM-AUDIT" docs/ dnd-app/docs/PLUGIN-SYSTEM.md` → no hits in the two files; manual read-through of both callouts against the shipped code.

**Acceptance:** both docs' system-selection narrative matches the shipped behavior with correct file:line cites; no dangling audit references; the sandbox + TypeDoc/Storybook decisions are discoverable from `dnd-app/docs/PLUGIN-SYSTEM.md`.

## Completed

- **38A — skills dedup.** NEW `systems/dnd5e/skills.ts` (`SKILL_DEFINITIONS_5E` + derived
  `SKILL_NAMES_5E` / `SKILL_ABILITY_MAP_5E`) + test. Collapsed all five duplicates (GroupRollModal,
  HelpModal, StatBlockEditor, MacroBar, auto-populate-5e — which re-exports the map) onto it, and
  `index.ts` imports the canonical list. Acceptance grep: only `apply-level-up.ts` (the allowed
  multiclass subset) still inlines a skill name.
- **38B — system-aware creation.** `character-routes.ts` `routeSegmentForSystem` /
  `systemIdFromRouteSegment` / `getBuilderCreatePath(system)` (+ tests). `App.tsx` create route →
  `/characters/:systemSeg/create`. `CreateCharacterPage` derives the system from the route; a non-5e /
  unknown system renders an honest "not yet supported" notice (no silently-5e builder). `core-slice`
  `selectGameSystem` guards non-5e. Nav call sites (ViewCharactersPage, CharacterSelector,
  CampaignWizard) route through the helper. i18n keys + parity.
- **38C — join handshake.** `gameSystem` added to `JoinPayloadSchema`; `host-manager` `hostGameSystem`
  + `setHostGameSystem` + `getGameSystem` accessor; `host-connection` `HostStateAccessors` + handleJoin
  reject-on-mismatch (`reason:'invalid'`, both ids in the message); `LobbyPage` sets it; client advertises
  `gameSystem:'dnd5e'` (honest constant — only 5e is buildable today); `message-types` comment fixed.
  Tests: 4 handleJoin cases (match/mismatch/absent/null-host) + a schema case. No-op for every real
  session today (5e vs 5e); activates only when a non-5e plugin system hosts.
- **38D — sandbox decision.** `plugin-installer.ts` comment rewritten (no "Phase 1 C2"; trust-on-install
  by design). `dnd-app/docs/PLUGIN-SYSTEM.md` gained a "Sandbox decision (2026-06-10)" block (five
  evaluated options + sourced rationale + revisit triggers) and the explicit note that `PluginPermission`
  is a convenience gate, not a security boundary. Grep: no "Phase 1 C2" in src.
- **38E — TypeDoc / Storybook.** `typedoc@^0.28.19` devDep + `typedoc.json` (4 plugin-author entry
  points) + `docs:api` script + `.gitignore docs/api/`. `npm run docs:api` emits `docs/api/index.html`
  (0 errors). Storybook formally declined in the docs. `audit:ci` (prod-only) clean — typedoc's dev-only
  js-yaml advisory is excluded by `--omit=dev`.
- **38F — docs truth pass.** Both PLUGIN-SYSTEM.md docs' system-selection callouts rewritten to the
  shipped reality (Campaign.system wired through store/announce/routing/handshake; honest non-5e gate);
  sandbox + TypeDoc/Storybook decisions discoverable. The dead `AI-DM-AUDIT.md` refs were already cleaned.
- **Gate.** lint + tsc (web+node) green; 71 tests across the touched suites green; `validate:5e` clean;
  no bmo/pi touched. The PHASE-13-owned underscore type-aliases were left untouched as instructed.

## Research notes

**Sandbox decision (38D).**
- `isolated-vm` is explicitly in **maintenance mode** ("New features are not actively being added"); it is a native module needing a C++ toolchain and tracks Node's patched V8 — in Electron that means rebuilding against Electron's ABI every Electron bump, and the README documents no Electron support at all. The maintainers also warn that safe use demands deep V8/security expertise and that hostile code can still crash the process via OOM. https://github.com/laverdet/isolated-vm
- `vm2` was deprecated for critical sandbox escapes, revived in 2025-10, and promptly hit another critical escape (CVE-2026-22709) in 2026-01 — proxy-layer sandboxes keep failing. https://thehackernews.com/2026/01/critical-vm2-nodejs-flaw-allows-sandbox.html , https://www.endorlabs.com/learn/cve-2026-22709-critical-sandbox-escape-in-vm2-enables-arbitrary-code-execution
- `node:vm` documents itself as "not a security mechanism". https://nodejs.org/api/vm.html
- Electron's own guidance: real isolation comes from the Chromium sandbox + `contextIsolation` + treating IPC as the security boundary; for truly untrusted *code*, the supported pattern is a separate OS process (`utilityProcess` + `MessageChannelMain`). https://www.electronjs.org/docs/latest/tutorial/sandbox , https://www.electronjs.org/docs/latest/tutorial/security
- Why "no sandbox" is the right call here: dnd-app plugins are renderer extensions that need synchronous access to the DOM, zustand stores, and the `PluginAPI` object. A V8-isolate or out-of-process sandbox cannot hand over those objects; sandboxing would mean redesigning the entire plugin API as an async RPC protocol — disproportionate for a self-hosted app whose plugins are hand-installed zips from the owner. The shipped mitigations (checksum pinning, structural validation, charset-constrained ids, security-event log, warning banner, permission-gated API) match the actual threat model (accidental damage + casual tampering), and the decision documents the explicit triggers that would reopen it.

**TypeDoc (38E).** TypeDoc v0.28.18 changelog: "Support TypeScript 6.0, #3084"; latest v0.28.19 (2026-04-12). TypeDoc's policy is to support the two latest TS releases, so the repo's `typescript ^6.0.3` is inside the support window. Entry-point mode against an existing tsconfig is the documented minimal setup. https://typedoc.org/documents/Changelog.html , https://www.npmjs.com/package/typedoc , https://typedoc.org/documents/Overview.html

**Storybook (38E).** Storybook 10 (2025-11) went ESM-only — a breaking infra change — and its value proposition (isolated component dev, visual review, addon ecosystem) targets team workflows. For a solo-maintained Electron renderer already gated by a large vitest suite, adopting it adds a second build system (its own Vite config, framework package `@storybook/react-vite`, upgrade treadmill) with no current consumer. Declining is the honest decision; the docs record it so the question stops resurfacing. https://storybook.js.org/blog/storybook-10/ , https://storybook.js.org/docs/get-started/frameworks/react-vite , https://storybook.js.org/docs/releases/migration-guide

**Join-handshake design (38C).** Reusing the existing `reason: 'invalid'` enum value avoids a wire-format break: zod `z.enum` on older clients hard-fails on unknown values, which would swallow the entire rejection message — the `message` string carries the specifics instead. Optional-field additivity is the same back-compat pattern Phase 29j used for `clientCapabilities` (`message-types.ts:122-128`).

**Route design (38B).** Replacing one literal segment with a param (`/characters/:systemSeg/create`) preserves every existing URL because react-router v7 route ranking prefers static segments (`/characters/create` redirect) over dynamic ones, and `'5e'` simply binds to the param. This keeps the 5e-literal sheet/edit/levelup routes untouched — those flows stay 5e-only by design until a system plugin can actually supply a sheet. https://reactrouter.com/start/framework/routing

## Test plan

Per sub-phase (cheap, targeted — rule 5):
- **38A:** NEW `systems/dnd5e/skills.test.ts` (18 entries, unique names, valid abilities, derived map/names consistency); existing `systems/dnd5e/index.test.ts` re-run (its `getSkillDefinitions` assertions must stay green).
- **38B:** NEW `utils/character-routes.test.ts` (segment mapping both ways, unknown segment → null, default path identity); `npx tsc --noEmit -p tsconfig.web.json` after the App.tsx/route edits.
- **38C:** extend `network/host-connection.test.ts` (match/mismatch/absent/host-null cases) and `network/schemas.test.ts` (join payload ± `gameSystem`).
- **38D:** `src/main/plugins/plugin-installer.test.ts` re-run (comment-only change; must stay green).
- **38E:** `npm run docs:api` exit-0 check (not a vitest concern).
- **38F:** grep-based doc checks (no audit references).

End-of-phase 4-gate (rule 5, run once): `npm run lint` + `npx tsc --noEmit -p tsconfig.web.json` + `npx tsc --noEmit -p tsconfig.node.json` + `npx vitest run` — all from `dnd-app/`. No Pi code is touched, so no pytest leg.

## Acceptance criteria

- [ ] One canonical 5e skill definition module exists (`systems/dnd5e/skills.ts`); the five duplicate constants (GroupRollModal, HelpModal, StatBlockEditor, MacroBar, auto-populate-5e) are deleted/re-pointed; no behavioral diff in any consumer.
- [ ] `/characters/:systemSeg/create` routing resolves the game system; all four navigation call sites use `getBuilderCreatePath(...)`; campaign-context entry points pass `campaign.system`; an unknown/unsupported system renders the honest notice (i18n'd, en+es) instead of a 5e builder; with only dnd5e registered, the existing UX is unchanged.
- [ ] `selectGameSystem` no longer silently builds 5e for a non-5e argument.
- [ ] The host rejects joins whose advertised `gameSystem` mismatches the hosted campaign's system, via `player:join-rejected` `reason:'invalid'` with an explanatory message; absent field remains compatible (pre-phase clients unaffected); covered by tests.
- [ ] `message-types.ts` `gameSystem` doc comment describes real behavior.
- [ ] Sandbox decision recorded in `dnd-app/docs/PLUGIN-SYSTEM.md` with evaluated options + revisit triggers; `grep -rn "Phase 1 C2" src/` → no hits.
- [ ] `typedoc` is a devDependency, `npm run docs:api` exits 0 producing `docs/api/`, output is gitignored; Storybook declination recorded with rationale.
- [ ] Both PLUGIN-SYSTEM docs describe the shipped system-selection reality and contain zero references to `AI-DM-AUDIT.md`.
- [ ] End-of-phase 4-gate green; ONE commit + ONE push; plan moved to `completed/`.

## Out of scope

- **Generic non-5e character builder / sheet / level-up driven by `getBuilderSteps()` / `getSheetConfig()`** — this phase ships honest gating, not a system-agnostic builder engine. Future work, recorded in PLUGIN-SYSTEM.md §Future improvements (no owning phase).
- **Plugin marketplace/downloader UI, content-schema versioning, community submission vetting** — future items re-enumerated in docs by 38F; no owning phase.
- **Underscore type-alias cleanup** (`plugin-registry.ts:20-23`, `use-plugin-store.ts:7`, SpellsTab, MapCanvas) — PHASE-13.
- **Config-store plugin/homebrew content-merge decoupling** (`use-config-store.ts:14-22`) — PHASE-13.
- **Hardcoded "Ollama"/provider labels in Settings** — PHASE-10; **Settings wording** — PHASE-12.
- **`data-provider.ts` full system-parameterization of every 5e loader** (`load5e*` family) — belongs to the future encapsulation work, not this slice; only the skill lists move in 38A.
- **AI-DM prompt/system awareness of non-5e systems** — the AI DM pipeline is 5e-only by design; revisit only after a second playable system exists.

## Completed

(Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase step with file:line citations.)
