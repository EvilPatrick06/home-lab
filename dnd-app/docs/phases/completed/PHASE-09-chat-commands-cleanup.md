# PHASE-09 — Chat-commands cleanup: registry dedup, collision test, honest placeholders, undo/redo decision

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Make the slash-command registry truthful and collision-free. Today `allCommands` in
`src/renderer/src/services/chat-commands/index.ts` contains **235 command registrations for 194
distinct names**: 40 names are registered two or three times (41 registrations are dead — shadowed
by an earlier registration), `/attack` resolves to a text-only stub that hides BOTH full attack
implementations, `/stabilize` is unreachable for players because a DM-only `/revive` alias shadows
it, and `/light` runs the player torch command instead of the DM map-light command. Separately,
`commands-utility.ts` ships placeholder commands that claim actions they never perform
(`/clear`, `/log clear`, `/latency`, `/export`, `/import`, both `/ping` copies), and `/undo`/`/redo`
plus the Ctrl+Z / Ctrl+Y shortcut entries are a dead feature end-to-end. This phase deletes every
shadowed duplicate (keeping the richer implementation when copies diverge), fixes the two
alias-shadowing bugs, adds a registry collision test so duplicates can never land again, implements
the placeholder commands for real against the stores/IPC that already exist, and wires `/undo`,
`/redo`, Ctrl+Z and Ctrl+Y to the existing `undo-manager` with honest feedback.

## Dependencies & cross-phase notes

- **No prerequisite phases** (index row 09: no deps; phases 1–19 are independent).
- **PHASE-08 (executor-batch-correctness)** also deletes dead code, but in
  `services/game-actions/` and `src/main/ai/` — no file overlap with this phase
  (`services/chat-commands/` is untouched by 08).
- **PHASE-12 (i18n-wording-sweep)** owns hardcoded user-facing strings. All chat-command result
  strings are hardcoded English today and STAY hardcoded English in this phase — new strings added
  here should be plain English literals matching the module's existing style; do NOT introduce
  `t()` calls into `services/chat-commands/` here (PHASE-12 decides that policy in one sweep).
- **PHASE-13 (dnd-platform-debt)** owns the `_MapPing` underscore alias in `MapCanvas.tsx:14` and
  other dead type aliases. This phase touches `services/map/map-utils.ts`,
  `stores/network-store/client-handlers/chat-handlers.ts`, and `stores/network-store/host-handlers.ts`
  for the real `/ping`, but NOT `MapCanvas.tsx` — leave its imports/aliases alone.
- **PHASE-22 (discord-sync-plane)** may add network message types. This phase adds ONE new message
  type (`chat:clear`) to `src/renderer/src/network/message-types.ts` + `network/schemas.ts`;
  coordinate if both phases are in flight (append-only edits, low conflict risk).
- **PHASE-30 (combat-automation)** consumes initiative APIs but does not modify
  `stores/game/conditions-slice.ts` / `effects-slice.ts`, where this phase adds two bulk-clear
  actions.

## Verified findings

All claims below were re-verified against the live tree on 2026-06-10. The registry enumeration was
produced by a static scan that follows the exact registration order of
`index.ts` `allCommands` (`index.ts:72-135`) and parses every module's exported `commands` array
plus the individually imported command consts. Re-run it any time with the script in
“Verification commands” at the end of this section.

### F1 — 40 names registered 2-3×; 41 dead registrations; `/attack` registered three times

(The 2026-06-10 audit said “40 names registered twice (and `/attack` THREE times)”; verified:
**40 duplicated names** / **41 shadowed registrations** — `/attack` ×3 contributes two dead
copies. One duplicate the audit's file list missed: `/conccheck`. Registry-wide totals: 235
registrations, 194 distinct names.)

`executeCommand` resolves with a first-match linear scan —
`index.ts:171`: `allCommands.find((c) => c.name === cmdName || c.aliases.includes(cmdName))` —
so the FIRST registration in `allCommands` order wins and every later one is dead code.
`getCommands` (`index.ts:207-220`) returns the raw array, so `CommandAutocomplete.tsx:26` and
`CommandReferenceModal.tsx:15` list every duplicate twice/thrice today.

Registration order of the spread modules (`index.ts:72-135`): dice(1), player-hp(2),
player-resources(3), player-movement(4), player-currency(5), player-conditions(6),
player-companions(7), player-utility(8), player-mount(9), player-combat(10), player-spells(11),
player-checks(12), player-inventory(13), condition-shortcuts(14), dm-narrative(15), dm-combat(16),
dm-map(17), dm-economy(18), dm-time(19), dm-bastion(20), dm-ai(21), dm-monsters(22),
dm-campaign(23), social(24), utility(25), dm-sound(26), then the individually imported consts:
action-commands ×12 (27), attack-commands ×5 (28), map-environment-commands ×9 (29),
map-token-commands ×6 (30).

Full duplicate table (winner = first registration; loser(s) = dead):

| Name | Winner (live) | Loser(s) (dead) | Copies diverge? |
|---|---|---|---|
| `/conccheck` | commands-player-conditions.ts:183 (REAL — CON modifier + save proficiency from the character, aliases `concentrationcheck`, `concave`) | commands-player-spells.ts:182 (flat d20, no modifier; extra alias `concdc`) | yes — keep winner, carry alias `concdc` |
| `/wildshape` | commands-player-companions.ts:13 (REAL — adds/removes a `Wild Shape: X` condition) | commands-player-spells.ts:207 (announce-only) | yes — keep winner |
| `/save` | commands-player-utility.ts:101 (REAL — auto modifier + save proficiency + `broadcastDiceResult`) | commands-player-checks.ts:146 (manual-modifier variant, aliases `savingthrow`, `st`) | yes — keep winner, carry the loser's aliases |
| `/rest` | commands-player-utility.ts:169 (player short-rest announce, alias `shortrest`) | commands-dm-time.ts:341 (dmOnly `<short\|long>` announce) | yes — keep winner (`/longrest` already exists at commands-player-utility.ts:187) |
| `/attack` ×3 | commands-player-utility.ts:295 (**text-only stub**: “Open the character sheet…”) | commands-player-combat.ts:356 AND attack-commands.ts:118 (both FULL pipelines: `getEffectiveWeapons` → `findWeapon` → `resolveAttack` → 3D dice → `formatAttackResult`) | stub must die; the two full copies are byte-equivalent modulo comments |
| `/grapple` `/shove` `/readyaction` `/delayaction` `/multiattack` `/reaction` `/useobj` `/dash` `/disengage` `/dodge` `/hide` `/search` | commands-player-combat.ts:24,42,63,82,97,125,152,168,183,198,213,230 | action-commands.ts:6,24,45,64,79,107,134,150,165,180,195,212 | **byte-identical** (comments/whitespace aside) |
| `/offhand` `/unarmed` `/aoedamage` `/torch` | commands-player-combat.ts:248,294,318,435 | attack-commands.ts:11,56,80,192 | **byte-identical** |
| `/identify` | commands-player-spells.ts:118 (announce-only “casts Identify”) | commands-dm-economy.ts:223 (REAL — flips `identified` on a magic item via ref override, Phase 15c.5 pattern) | yes — both have value; rename the DM one (see 09B) |
| `/npcmood` | commands-dm-narrative.ts:169 (6 moods) | commands-dm-monsters.ts:176 (3 moods) | yes — keep winner |
| `/fog` `/light` `/elevate` `/darkness` `/setweather` `/sunmoon` `/grid` `/zoom` `/center` | commands-dm-map.ts:7,201,239,362,379,399,303,330,348 | map-environment-commands.ts:5,34,72,112,129,149,169,196,214 | **byte-identical** |
| `/token` `/summon` `/tokenclone` `/tokenhide` `/tokenshow` `/tokenmove` | commands-dm-map.ts:68,127,419,460,485,510 | map-token-commands.ts:28,87,151,192,217,242 | trivially-refactored equivalents (`requireActiveMapId` vs `requireActiveMap`; `getMonsterByName` helper vs inline `load5eMonsters`) — keep winner |
| `/revive` | commands-dm-monsters.ts:221 (REAL — `updateToken(... { currentHP: 1 })`) | commands-utility.ts:247 (announce-only, never touches HP) | yes — keep winner |
| `/ping` | commands-social.ts:171 (chat-line only) | commands-utility.ts:34 (chat-line only) | both fake — see F4 |

Consequences verified:
- `action-commands.ts` (12 cmds), `attack-commands.ts` (5), `map-environment-commands.ts` (9),
  `map-token-commands.ts` (6) are **100% dead modules** — every export shadowed. Their only
  importer is `index.ts` (verified: `grep -rn "attack-commands\|action-commands\|map-environment-commands\|map-token-commands" dnd-app/src --include=*.ts --include=*.tsx` hits only `index.ts` and their own colocated test files).
- The index type re-export block (`index.ts:227-235`) pulls combat types from
  `./commands-player-combat`, NOT from the dead modules — deleting them does not break the barrel.

### F2 — Two alias-shadowing bugs (names hijacked by other commands' aliases)

1. **`/stabilize` is player-unreachable.** `commands-dm-monsters.ts:221-225` defines
   `reviveCommand` `{ name: 'revive', aliases: ['stabilize'], dmOnly: true }` at registry position 22;
   the real player `/stabilize` (`commands-utility.ts:226-245`, dmOnly false, alias `stab`) sits at
   position 25. The alias matches first, then `index.ts:192-194` rejects players:
   `/revive is a DM-only command.` — exactly as the audit described.
2. **`/light` runs the player torch command, not the DM map-light command.** `torchCommand`
   (`commands-player-combat.ts:435`, position 10) carries `aliases: ['light', 'lantern', 'lamp']`;
   the DM `lightCommand` (`name: 'light'`, `commands-dm-map.ts:201`, position 17) can never match by
   name. (This one was NOT in the audit — found during verification.)

### F3 — `commands-utility.ts` placeholders claim actions they don't perform

File: `src/renderer/src/services/chat-commands/commands-utility.ts` (310 lines; export array at
293-310). Verified behavior:

- `/clear <chat|combat|effects>` (lines 65-85, dmOnly): returns “Chat cleared.” / “Combat state
  cleared (initiative, turn tracking, conditions).” / “All active effects cleared.” **without
  touching any store**.
- `/log <show|clear>` (87-104): `show` says “check the Combat Log panel in the sidebar”; `clear`
  claims “Combat log cleared.” — neither reads nor writes `useGameStore` `combatLog`.
- `/latency` (50-63): canned string “Network: WebRTC P2P connection active. Latency depends on peer
  distance.” — **real RTT data already exists and is ignored**: client side
  `stores/network-store/client-handlers.ts:402-406` sets `latencyMs` on every `pong`
  (`set({ latencyMs: rtt })`; state key `stores/network-store/types.ts:13`); host side
  `stores/network-store/host-handlers.ts:567-571` stamps `latencyMs` per peer via
  `get().updatePeer(fromPeerId, { latencyMs })` (peer field `network/state-types.ts:31`). Keep-alive
  pings flow from `network/client-manager.ts:215` and `network/host-manager.ts:328`.
- `/export <character|campaign>` (106-120) and `/import <character|campaign>` (122-136): print
  “use the main menu's export/import feature.” Real, reusable flows exist:
  `services/io/character-io.ts:45-60` `exportCharacterToFile(character)` (save dialog + write),
  `:66-76` `importCharacterFromFile()`; `services/io/campaign-io.ts:58-71` `exportCampaignToFile`
  (includes game state via `window.api.loadGameState`), `:76-90` `importCampaignFromFile`.
  UI consumers to mirror: `pages/ViewCharactersPage.tsx:75-87` (import → `saveCharacter` from
  `useCharacterStore`), `pages/MakeGamePage.tsx:16-33` (import → `saveCampaign` +
  `window.api.saveGameState`). Note `types/character.ts:3`: `export type Character = Character5e` —
  no casts needed from `CommandContext.character`.
- `/ping` (utility copy, 34-48) and `/ping` (social copy, `commands-social.ts:171-199`): both only
  broadcast a chat line. The REAL map-ping system: `services/map/map-utils.ts:96-159`
  (`createPing(x, y, senderName, color?)` world-coordinates, `getActivePings`, `getPingAnimation`),
  rendered by `MapCanvas.tsx:741-776`, locally triggered only by double-click
  (`components/game/map/map-canvas/map-canvas-hooks.ts:84-102`). **The network side is half-built
  dead code**: message type `'game:map-ping'` exists (`network/message-types.ts:18`), payload
  `MapPingPayload { gridX, gridY, color?, label? }` (`message-types.ts:403-408`), zod schema
  (`network/schemas.ts:362`, registered at 590), and a client receive handler that only posts a
  chat line (`stores/network-store/client-handlers.ts:604-607` →
  `client-handlers/chat-handlers.ts:229-239`) — but **nothing anywhere sends it**, and the host
  handler switch has no case for it (falls to the no-op default at `host-handlers.ts:594-598`,
  which does NOT relay).
- Useful pre-existing hook for `/clear chat`: permission key `chat_clear` already exists in
  `types/permissions.ts:38` (chat group) but is wired to nothing.
- Store APIs available (verified): `useLobbyStore` `clearChatHistory()`
  (`stores/use-lobby-store.ts:529-531`, `set({ chatMessages: [] })`); `useGameStore`
  `endInitiative()` (`stores/game/initiative-slice.ts:290-304`, sets `initiative: null, round: 0`,
  emits `game:initiative-end` plugin event); `clearCombatLog()`
  (`stores/game/combat-log-slice.ts:34`); conditions slice has add/remove/update but **no bulk
  clear** (`stores/game/conditions-slice.ts`, 38 lines); effects slice has per-id removers only
  (`stores/game/effects-slice.ts`: `customEffects`, `activeDiseases`, `activeCurses`,
  `activeEnvironmentalEffects`, `activeSpellEffects`, `placedTraps`).

### F4 — Undo/redo is dead end-to-end; a real undo-manager exists but is map-editor-only

- Shortcut JSON ships the bindings: `src/renderer/public/data/ui/keyboard-shortcuts.json:24-25`
  (`{"key":"z","ctrl":true,"action":"undo",...}`, `{"key":"y","ctrl":true,"action":"redo",...}`)
  — note the audit's path (`public/data/ui/...`) was missing the `src/renderer/` prefix.
- The game shortcut handler cases are empty: `hooks/use-game-shortcuts.ts:98-104`
  (`case 'undo': // Reserved for future undo system break;` and the same for `redo`). The hook
  receives `isDM` (`useGameShortcuts(isDM, callbacks)`, called from
  `components/game/GameLayout.tsx:566` with `effectiveIsDM`).
- `/undo` and `/redo` (`commands-utility.ts:5-32`) dispatch **synthetic** `KeyboardEvent`s into
  those empty cases, then report “Undo triggered.” / “Redo triggered.” — nothing is undone. (The
  synthetic-event approach is also inherently fragile: programmatically dispatched events are
  untrusted, `isTrusted === false`, and never trigger default browser actions — see Research notes.)
- A complete module-global undo manager exists: `services/undo-manager.ts` (push/undo/redo/canUndo/
  canRedo/clear/getHistoryLength, MAX_HISTORY 20, plus `createTokenMoveAction` and
  `createFogAction` factories) with a colocated test (`services/undo-manager.test.ts`). Its ONLY
  consumers are `components/game/modals/dm-tools/DMMapEditor.tsx:3,41-53` (toolbar buttons) and
  `dm-tools/map-editor-handlers.ts` (terrain/fog pushes at :27-46 and :259-263). Every undoable
  action currently pushed is a DM map action.
- The keyboard-shortcuts service guards editable targets (`services/keyboard-shortcuts.ts:25-30`,
  applied at :100) so a global Ctrl+Z while typing in chat/notes does NOT reach the game handler —
  safe to wire.

### F5 — No registry collision test exists

There is no `index.test.ts` in `services/chat-commands/` (verified by `ls`), `allCommands` is not
exported, and nothing asserts name/alias uniqueness — which is exactly how 41 dead registrations
accumulated. The audit's recommendation (registry-time duplicate-name/alias collision test) is
absorbed here as sub-phase 09C.

### Verification commands

```bash
cd dnd-app
# 1. The first-match resolver and the registration order:
sed -n '164,205p' src/renderer/src/services/chat-commands/index.ts
sed -n '72,135p'  src/renderer/src/services/chat-commands/index.ts

# 2. Re-run the duplicate scan (static, registration-order-faithful). Prints every
#    name registered more than once with file:line of each copy:
node - <<'EOF'
const fs = require('node:fs')
const dir = 'src/renderer/src/services/chat-commands/'
const mods = ['commands-dice','commands-player-hp','commands-player-resources','commands-player-movement','commands-player-currency','commands-player-conditions','commands-player-companions','commands-player-utility','commands-player-mount','commands-player-combat','commands-player-spells','commands-player-checks','commands-player-inventory','commands-condition-shortcuts','commands-dm-narrative','commands-dm-combat','commands-dm-map','commands-dm-economy','commands-dm-time','commands-dm-bastion','commands-dm-ai','commands-dm-monsters','commands-dm-campaign','commands-social','commands-utility','commands-dm-sound','action-commands','attack-commands','map-environment-commands','map-token-commands']
const seen = {}
for (const mod of mods) {
  let src; try { src = fs.readFileSync(dir+mod+'.ts','utf8') } catch { continue }
  for (const m of src.matchAll(/name:\s*'([^']+)'/g)) {
    const line = src.slice(0, m.index).split('\n').length
    ;(seen[m[1]] ??= []).push(`${mod}.ts:${line}`)
  }
}
for (const [n, v] of Object.entries(seen)) if (v.length > 1) console.log(`/${n} x${v.length}:`, v.join('  '))
EOF
# (Pre-phase output: 40 duplicated names incl. attack x3. Post-phase: empty.
#  Caveat: this name-field scan is order-approximate inside a file; the authoritative
#  check after 09C is the collision unit test, which loads the real registry.)

# 3. Alias shadowing:
grep -n "aliases: \['stabilize'\]" src/renderer/src/services/chat-commands/commands-dm-monsters.ts
grep -n "'light', 'lantern', 'lamp'" src/renderer/src/services/chat-commands/commands-player-combat.ts

# 4. Placeholders:
sed -n '34,136p' src/renderer/src/services/chat-commands/commands-utility.ts
grep -rn "game:map-ping" src/renderer/src --include=*.ts | grep -v test   # receive-only, no sender
grep -n "latencyMs" src/renderer/src/stores/network-store/client-handlers.ts src/renderer/src/stores/network-store/host-handlers.ts

# 5. Undo/redo:
sed -n '98,104p' src/renderer/src/hooks/use-game-shortcuts.ts
sed -n '24,25p'  src/renderer/public/data/ui/keyboard-shortcuts.json
grep -rln "undo-manager" src/renderer/src --include=*.ts --include=*.tsx | grep -v test
```

## Sub-phases

Run in order; each leaves lint/tsc/the touched test files green. Full 4-gate only at phase end.

### 09A — Delete the four fully-shadowed modules; port their tests to the live copies

**Objective:** remove `action-commands.ts`, `attack-commands.ts`, `map-environment-commands.ts`,
`map-token-commands.ts` (32 dead registrations) without losing test coverage.

**Files:**
- DELETE `src/renderer/src/services/chat-commands/action-commands.ts`, `attack-commands.ts`,
  `map-environment-commands.ts`, `map-token-commands.ts` and their colocated
  `*.test.ts` files (after porting, below).
- EDIT `src/renderer/src/services/chat-commands/index.ts`
- EDIT `src/renderer/src/services/chat-commands/commands-player-combat.test.ts`
- EDIT `src/renderer/src/services/chat-commands/commands-dm-map.test.ts`

**Steps:**
1. In `index.ts`: delete the four import blocks (lines 2-15, 16-22, 49-59, 60-67) and the 32
   trailing entries + their section comments in `allCommands` (lines 99-134). The array then ends
   at `...dmSoundCommands`. Keep the `getPluginCommandRegistry` import and the type re-export block
   (lines 227-237) untouched.
2. Port test coverage. The dead modules' tests exercise byte-identical implementations that live on
   in `commands-player-combat.ts` and `commands-dm-map.ts`:
   - From `action-commands.test.ts` + `attack-commands.test.ts`: move each per-command `describe`
     block into `commands-player-combat.test.ts`. Replace named-export imports with lookups on the
     existing `commands` import: `const grappleCommand = commands.find((c) => c.name === 'grapple')!`
     (same for shove/readyaction/delayaction/multiattack/reaction/useobj/dash/disengage/dodge/hide/
     search/offhand/unarmed/aoedamage/attack/torch). Merge `vi.mock` factories: the existing file
     already mocks `dice3d`, `light-sources`, `use-game-store`, `attack-resolver`, `dice-service`,
     `./helpers` — extend each factory to the union of mocked members (e.g. add `rollD20WithTag` to
     the `./helpers` mock, add `formatAttackResult` to the `attack-formatter` mock if any ported
     test needs it; note `commands-player-combat.ts` imports `formatAttackResult` from
     `../combat/attack-resolver`, NOT `attack-formatter`).
   - From `map-environment-commands.test.ts` + `map-token-commands.test.ts`: same treatment into
     `commands-dm-map.test.ts` (it already imports `commands` and mocks `data-provider` +
     `use-game-store`). Skip any ported assertion that tests the loser-only refactor details
     (`getMonsterByName`); keep behavioral assertions.
   - Drop ported tests that duplicate ones already present in the destination files.
3. Delete the four modules + their four test files.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`;
`npx vitest run src/renderer/src/services/chat-commands/commands-player-combat.test.ts src/renderer/src/services/chat-commands/commands-dm-map.test.ts`.

**Acceptance:** the four modules and their tests are gone; `index.ts` compiles; ported tests pass;
`grep -rn "action-commands\|attack-commands\|map-environment-commands\|map-token-commands" src --include=*.ts --include=*.tsx` returns nothing.

### 09B — Resolve the remaining single-command duplicates and the two alias shadows

**Objective:** one live registration per name; both shadowed names reachable.

**Files:** `commands-player-utility.ts`, `commands-player-checks.ts` (+ its test),
`commands-player-spells.ts` (+ test), `commands-player-conditions.ts` (+ test),
`commands-dm-time.ts` (+ test), `commands-dm-economy.ts` (+ test), `commands-dm-monsters.ts`
(+ test), `commands-dm-narrative.ts` (untouched — winner), `commands-player-combat.ts` (+ test),
`commands-utility.ts` (+ test), `commands-social.ts` (untouched here; `/ping` consolidation
finishes in 09G).

**Steps:**
1. `/attack` stub: delete the inline `{ name: 'attack', ... }` object from the
   `commands-player-utility.ts` export array (lines 295-309). The full pipeline at
   `commands-player-combat.ts:356` (with alias `atk`) becomes live.
2. `/save`: delete `saveCommand` from `commands-player-checks.ts` (lines 146-209) and remove it
   from that file's `commands` export (line 210). Add its aliases to the winning inline `/save` in
   `commands-player-utility.ts:102`: `aliases: ['savingthrow', 'st']`. Update
   `commands-player-checks.test.ts` (drop save tests or port the alias assertions to
   `commands-player-utility.test.ts`).
3. `/rest`: delete `restCommand` from `commands-dm-time.ts` (lines 341-359) and from its export
   array (line 367). Winner: player `/rest` (alias `shortrest`) + existing `/longrest`. Update
   `commands-dm-time.test.ts`.
4. `/wildshape`: delete `wildshapeCommand` from `commands-player-spells.ts` (lines 207-229) and
   from the export array (line 239). Winner (companions) actually mutates conditions.
5. `/conccheck`: delete `concentrationCheckCommand` from `commands-player-spells.ts` (lines
   182-205) and from the export array (line 238). Add the loser's extra alias to the winner in
   `commands-player-conditions.ts:185`: `aliases: ['concentrationcheck', 'concave', 'concdc']`.
   Update `commands-player-spells.test.ts` / `commands-player-conditions.test.ts` accordingly.
6. `/identify`: keep the player spell-flavor `/identify` (winner). RENAME the dead-but-real DM
   command in `commands-dm-economy.ts:223` to `name: 'identifyitem'`, `aliases: ['iditem']`,
   usage `/identifyitem <character> <item name>` — its magic-item `identified`-flag flip becomes
   reachable for the first time. Update `commands-dm-economy.test.ts`.
7. `/npcmood`: delete the `npcMoodCommand` copy in `commands-dm-monsters.ts` (lines 176-200) and
   its entry in the export array. Winner (narrative, 6 moods) unchanged.
8. `/revive` + `/stabilize` shadow: in `commands-dm-monsters.ts:221-225` change
   `aliases: ['stabilize']` → `aliases: []` (the REAL revive keeps winning by name). Delete the
   announce-only `reviveCommand` from `commands-utility.ts` (lines 247-264) and its export entry.
   Player `/stabilize` (`commands-utility.ts:226`) is now reachable. Update both test files.
9. `/ping` duplicate: delete the utility `pingCommand` (`commands-utility.ts:34-48`) and its export
   entry; the social copy survives and is made real in 09G. Update `commands-utility.test.ts`.
10. `/light` shadow: in `commands-player-combat.ts:435` change torch `aliases` from
   `['light', 'lantern', 'lamp']` to `['lantern', 'lamp']`. The DM `/light`
   (`commands-dm-map.ts:201`) becomes reachable. Mirror in any ported torch test from 09A.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`; run only the touched test files with
`npx vitest run src/renderer/src/services/chat-commands/<file>.test.ts ...`.

**Acceptance:** the duplicate-scan script from “Verification commands” prints nothing; `/attack`,
`/stabilize`, `/light`, `/identifyitem` resolve to the intended implementations (assert via the
09C test + targeted unit tests).

### 09C — Registry collision test (recurrence guard)

**Objective:** loading the real registry fails CI if any future module reintroduces a duplicate
name or a colliding alias.

**Files:** `src/renderer/src/services/chat-commands/index.ts` (one-line export),
NEW `src/renderer/src/services/chat-commands/index.test.ts`.

**Steps:**
1. Export the registry for tests: change `const allCommands` (`index.ts:72`) to
   `export const allCommands`.
2. New colocated `index.test.ts` importing `{ allCommands }` (mock heavy leaf deps the same way
   sibling tests do if import-time side effects bite; the barrel is already imported by component
   tests such as `ChatPanel.test.tsx`, so a plain import is expected to work). Assertions:
   - **No duplicate names:** `new Set(names).size === names.length`; on failure, build a readable
     diff listing each offender (mirror the scan output format).
   - **No alias collides with any command name:** for every command, every alias ∉ set of all names.
   - **No alias registered twice:** flatten all aliases; assert set-size equality.
   - **No alias equals its own or another command's name** (covered by the two above; keep as one
     combined helpful error message).
   - **Shape guard** (mirrors the Discord.js load-time validation guidance): every entry has
     non-empty `name`, `description`, `usage`, an `aliases` array, a boolean `dmOnly`, a known
     `category`, and an `execute` function.
3. Also assert the two regression names directly: the command resolved for `stabilize` has
   `dmOnly === false`, and the one for `attack` has usage `/attack <weapon> <target>` (i.e. the
   full pipeline, not the stub) — use the same find logic as `executeCommand` (`index.ts:171`)
   to mimic runtime resolution.

**Cheap checks:** `npx vitest run src/renderer/src/services/chat-commands/index.test.ts`.

**Acceptance:** test passes after 09A/09B; temporarily re-adding a duplicate name locally makes it
fail with an actionable message.

### 09D — Implement `/clear` and `/log` for real

**Objective:** the two state-claiming placeholders act on the stores they name.

**Files:** `stores/game/conditions-slice.ts` (+ `.test.ts`), `stores/game/effects-slice.ts`
(+ `.test.ts`), `stores/game/types.ts`, `network/message-types.ts`, `network/schemas.ts`,
`stores/network-store/client-handlers.ts`, `stores/network-store/host-handlers.ts`,
`services/chat-commands/commands-utility.ts` (+ `.test.ts`).

**Steps:**
1. New bulk actions (with slice tests, matching sibling action styles):
   - `conditions-slice.ts`: `clearAllConditions: () => set({ conditions: [] })`; add to
     `ConditionsSliceState` in `stores/game/types.ts`.
   - `effects-slice.ts`: `clearAllEffects: () => set({ customEffects: [], activeDiseases: [], activeCurses: [], activeEnvironmentalEffects: [], activeSpellEffects: [] })`
     (leave `placedTraps` alone — traps are placement, not “active effects”); add to
     `EffectsSliceState` in `types.ts`.
2. Networked chat clear:
   - `network/message-types.ts`: add `'chat:clear'` to `MESSAGE_TYPES` next to the other `chat:*`
     entries (lines 58-62). Payload is `{}` — no new payload interface needed.
   - `network/schemas.ts`: add `'chat:clear': z.object({})` to the payload-schema map (near the
     `chat:*` entries at 624-627).
   - `stores/network-store/client-handlers.ts`: new `case 'chat:clear':` →
     `useLobbyStore.getState().clearChatHistory()`.
   - `stores/network-store/host-handlers.ts`: new `case 'chat:clear':` → clear locally + relay with
     `broadcastExcluding(message, fromPeerId)` (co-DM-initiated clears). Gate it: add
     `'chat:clear': 'chat_clear'` to `MESSAGE_PERMISSION` (the `chat_clear` permission already
     exists at `types/permissions.ts:38`). Do NOT add it to `SPECTATOR_ALLOWED_TYPES`.
3. Rewrite `/clear` in `commands-utility.ts` (DM-only stays):
   - `chat` → `useLobbyStore.getState().clearChatHistory()` +
     `useNetworkStore.getState().sendMessage('chat:clear', {})` (host broadcast / client→host
     route both work — `stores/network-store/index.ts:648`), then return a system note.
   - `combat` → `useGameStore.getState().endInitiative()` + `clearAllConditions()` +
     `clearCombatLog()`; broadcast “Combat state cleared (initiative, conditions, combat log).”
   - `effects` → `clearAllEffects()`; broadcast “All active effects cleared.” (game-store changes
     propagate to clients via the existing host state-sync plane, same as every other DM command in
     this folder).
4. Rewrite `/log`:
   - `show` (or empty) → read `useGameStore.getState().combatLog`
     (`CombatLogEntry { round, type, description, ... }` — `types/game-state.ts:95-107`); print the
     last 10 entries as a local system message (`[R<round>] <description>` lines), or “Combat log is
     empty.”
   - `clear` → require `ctx.isDM` (return the standard DM-only error otherwise), then
     `clearCombatLog()` + system note.
5. Update `commands-utility.test.ts`: replace the placeholder-string assertions for `/clear` and
   `/log` with store-mocked behavioral assertions (mock `use-lobby-store`, `use-game-store`,
   `network-store` modules; assert the actions were called).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`; vitest on
`commands-utility.test.ts`, `conditions-slice.test.ts`, `effects-slice.test.ts`, and (if assertions
were added) the network handler tests.

**Acceptance:** `/clear chat|combat|effects` and `/log clear` mutate the named stores; `/log show`
prints real entries; the `chat:clear` message round-trips schema validation
(`PAYLOAD_SCHEMAS` parse in `host-handlers.ts:104-111` path).

### 09E — Implement `/latency` from the real RTT data

**Objective:** report measured numbers instead of a canned string.

**Files:** `services/chat-commands/commands-utility.ts` (+ `.test.ts`).

**Steps:**
1. Rewrite `latencyCommand.execute` to read `useNetworkStore.getState()`:
   - `role === 'none'` → “Solo session — no network connection.”
   - `role === 'client'` → `latencyMs` (`types.ts:13`; null until the first pong ⇒ “measuring…”),
     plus `connectionMode` (`'cloud'` relay vs LAN) in the message.
   - `role === 'host'` → one line per connected peer from `peers` (`network/state-types.ts:31`
     `latencyMs?`): `<displayName>: <n> ms` or “measuring…”; include peer count.
2. Output stays a LOCAL system message (`type: 'system'`) — latency is per-viewer data.
3. Tests: mock `../../stores/network-store` for the three roles; assert formatted output.

**Cheap checks:** vitest on `commands-utility.test.ts`.

**Acceptance:** `/latency` output contains real `latencyMs` values from the store in host/client
modes and an honest solo message; no canned “depends on peer distance” text remains.

### 09F — Implement `/export` and `/import` against the real io services

**Objective:** the commands do the thing or say exactly where the thing lives — no false pointers.

**Files:** `services/chat-commands/commands-utility.ts` (+ `.test.ts`).

**Steps:**
1. `/export character` → require `ctx.character`; fetch the freshest copy via
   `getLatestCharacter(ctx.character.id)` (`./helpers.ts:114`), then
   `await exportCharacterToFile(char)` (`services/io/character-io.ts:45`); report success/cancel.
   Commands may be async — `executeCommand` already normalizes promises (`index.ts:199-202`).
2. `/export campaign` → resolve the active campaign from `useCampaignStore.getState()`
   (`activeCampaignId` + `campaigns`, `stores/use-campaign-store.ts:57-58`); error if none;
   `await exportCampaignToFile(campaign)` (`services/io/campaign-io.ts:58`); report.
3. `/import character` → `await importCharacterFromFile()` (`character-io.ts:66`); on a parsed
   character, `await useCharacterStore.getState().saveCharacter(character)` (mirrors
   `ViewCharactersPage.tsx:78-81`); report “Imported <name>.” Wrap in try/catch → error message.
4. `/import campaign` → `await importCampaignFromFile()` (`campaign-io.ts:76`); on success,
   `await useCampaignStore.getState().saveCampaign(result.campaign)` and, when present,
   `await window.api.saveGameState(result.campaign.id, result.gameState)` (mirrors
   `MakeGamePage.tsx:20-26`); report “Campaign "<name>" imported — open it from the campaign
   list.” Do NOT navigate or switch the running session.
5. Keep both commands `dmOnly: false` (parity with the existing menu flows, which are unrestricted
   local-machine operations).
6. Tests: mock `../io/character-io`, `../io/campaign-io`, the two stores, and `window.api`; assert
   each sub-path calls the right io function and store save, and that user-cancel (`false`/`null`
   returns) produces a calm “cancelled” message rather than an error.

**Cheap checks:** vitest on `commands-utility.test.ts`; `npx tsc --noEmit -p tsconfig.web.json`.

**Acceptance:** all four sub-commands perform real io; no “use the main menu” strings remain in
`commands-utility.ts`.

### 09G — Make `/ping` drive the real map-ping system end-to-end

**Objective:** `/ping` (and `/ping map`) produces the animated map ping locally AND on every peer;
the dead `game:map-ping` receive path becomes a live wire.

**Files:** `services/chat-commands/commands-social.ts` (+ `.test.ts`),
`stores/network-store/client-handlers/chat-handlers.ts` (+ its test if present),
`stores/network-store/host-handlers.ts`.

**Steps:**
1. In the surviving `pingCommand` (`commands-social.ts:171`), for the map case (no arg or `map`):
   - Locate the sender's token: `useGameStore.getState()` → `maps.find(m => m.id === activeMapId)`,
     token with `entityId === ctx.character?.id`. If absent (e.g. the DM, who has no character):
     return an honest error “No token to ping from — double-click the map to ping a location.”
   - Convert grid → world: `const cs = activeMap.grid.cellSize; const x = token.gridX * cs + cs / 2`
     (same math as `MapCanvas.tsx` centering, see `MapCanvas.tsx:732-735`).
   - Local visual: `createPing(x, y, ctx.playerName)` (`services/map/map-utils.ts:118`).
   - Network: `useNetworkStore.getState().sendMessage('game:map-ping', { gridX: token.gridX, gridY: token.gridY, label: msg || undefined })`
     — payload already typed (`message-types.ts:403-408`) and schema-validated (`schemas.ts:362,590`).
   - Keep the existing chat broadcast line.
   - Keep the ping-a-player branch (named player → chat line) as is.
2. Receive side, `handleMapPing` (`chat-handlers.ts:229-239`): in addition to the chat line, render
   the visual ping: resolve the local active map, convert the payload's grid coords with that map's
   `cellSize`, and `createPing(x, y, message.senderName)`. Guard on a missing/different active map
   (chat line only).
3. Host side: add `case 'game:map-ping':` to the `handleHostMessage` switch
   (`host-handlers.ts`, alongside `'game:dice-roll'` at :276): call the same handle-locally helper,
   then `broadcastExcluding(message, fromPeerId)` (the default case does NOT relay —
   `host-handlers.ts:594-598`). No `MESSAGE_PERMISSION` entry (pings are presence-grade, parity
   with the existing double-click ping which any client can render locally).
4. Tests: `commands-social.test.ts` — mock `map-utils`/stores, assert `createPing` + `sendMessage`
   are called with grid-converted coordinates for `/ping` and `/ping map`, and NOT called for
   `/ping <player>`; assert the no-token error path. Add/extend a `handleMapPing` assertion
   (visual + chat) wherever `chat-handlers` is currently tested.

**Cheap checks:** vitest on `commands-social.test.ts` + the touched handler test;
`npx tsc --noEmit -p tsconfig.web.json`.

**Acceptance:** `/ping` calls `createPing` and emits one `game:map-ping`; a received
`game:map-ping` produces both the chat line and a `createPing` call; host relays it.

### 09H — Wire `/undo`, `/redo`, Ctrl+Z, Ctrl+Y to the undo-manager (honest feedback)

**Objective:** end the dead feature: the shipped bindings and commands either work or refuse
honestly. Decision (recorded): WIRE to the existing `services/undo-manager.ts` rather than delete —
the manager, its tests, and its push sites (DM map editor terrain/fog/token actions) already exist;
wiring is strictly less destructive than ripping out the shortcut entries + rebind UI rows.

**Files:** `hooks/use-game-shortcuts.ts` (+ `.test.ts` if present, else add one),
`services/chat-commands/commands-utility.ts` (+ `.test.ts`).

**Steps:**
1. `use-game-shortcuts.ts:98-104`: replace the empty cases with
   `case 'undo': if (isDM) UndoManager.undo(); break` / `case 'redo': if (isDM) UndoManager.redo(); break`
   (import `* as UndoManager from '../services/undo-manager'`). DM-gated because every pushed
   action is a DM map mutation (F4); a player Ctrl+Z must stay a no-op. `isDM` is already in the
   effect closure + dep array (`use-game-shortcuts.ts:117`).
2. Rewrite `/undo` and `/redo` (`commands-utility.ts:5-32`): drop the synthetic `KeyboardEvent`
   dispatch entirely (untrusted synthetic events are the wrong tool — Research notes). New
   behavior: require `ctx.isDM` (error otherwise: “Undo is DM-only — only DM map actions are
   undoable.”); if `!UndoManager.canUndo()` → “Nothing to undo.”; else `UndoManager.undo()` →
   “Undid the last map action.” (mirror for redo with `canRedo`). Set `dmOnly: true` on both so
   the autocomplete/reference UI stops advertising them to players. Keep aliases `z`/`y`.
3. Note for the future in a code comment at the undo-manager import site: scope is “DM map editor
   actions” until more `push()` call sites exist (factories: `createTokenMoveAction`,
   `createFogAction`).
4. Tests: `commands-utility.test.ts` — mock `../undo-manager`; assert canUndo-false → “Nothing to
   undo.”, canUndo-true → `undo()` called once + success copy, non-DM → error; same for redo. If
   `use-game-shortcuts` has no test, add a minimal one: registerHandler-mocked dispatch of
   `'undo'`/`'redo'` actions calls `UndoManager.undo/redo` only when `isDM`.

**Cheap checks:** vitest on the two touched test files; `npx tsc --noEmit -p tsconfig.web.json`.

**Acceptance:** Ctrl+Z/Ctrl+Y (DM) call the undo-manager; `/undo`/`/redo` report real outcomes and
never claim “Undo triggered.” when nothing happened; players get honest refusals.

## Research notes

- **Registry pattern / collision prevention.** Mainstream command frameworks key their registry by
  name in a map, which makes the LAST write win silently (this codebase's `Array.prototype.find`
  makes the FIRST win silently — same failure class, inverted). The Discord.js guide builds
  `client.commands.set(command.data.name, command)` from command files and explicitly recommends
  load-time validation that each module has its required properties before registration; Discord's
  API itself enforces name uniqueness server-side and rejects duplicates with a duplicate-name
  error — uniqueness is treated as a hard registry invariant, not a convention. 09C encodes that
  invariant as a unit test (names unique, aliases unique, aliases disjoint from names) since there
  is no server here to reject for us.
  Sources: https://discordjs.guide/legacy/app-creation/handling-commands ,
  https://github.com/discordjs/discord.js/discussions/9903
- **Why delete losers instead of namespacing.** All 17 action/attack pairs and 9 of the 15 map
  pairs are byte-identical (verified by normalized extraction diff — see F1), so deletion loses
  nothing; for the 6 divergent-but-equivalent token pairs the live copy is kept to avoid any
  behavior delta. Where copies genuinely differ in capability (`/identify`), renaming the dead-real
  one (`/identifyitem`) preserves both behaviors without a breaking change to the live name.
- **Latency reporting.** WebRTC exposes ICE-level RTT via
  `RTCIceCandidatePairStats.currentRoundTripTime` (seconds, STUN-derived, from `getStats()`), but
  it is not Baseline across browsers and reports the transport pair rather than app-level
  round-trip. This app already maintains an application-level ping/pong RTT (client
  `latencyMs`, host per-peer `latencyMs`) which is the portable, already-tested source — `/latency`
  reads it instead of adding a `getStats()` path.
  Source: https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidatePairStats/currentRoundTripTime
- **Undo/redo.** The command-pattern reference model is exactly what `services/undo-manager.ts`
  implements: a bounded history stack of actions carrying inverse operations (`undo`/`redo`
  closures, e.g. `createTokenMoveAction` stores from/to coordinates), avoiding full-state mementos
  and their memory cost. Best practice is to keep the stack authoritative and surface
  `canUndo`/`canRedo` to the UI — hence the honest “Nothing to undo.” path rather than
  fire-and-forget. Source: https://refactoring.guru/design-patterns/command
- **Why the synthetic-KeyboardEvent bridge had to go.** Programmatically dispatched events have
  `isTrusted === false` and never trigger default browser actions; relying on them to reach a
  window-level handler couples the command to listener registration order and breaks silently —
  which is precisely the shipped bug (“Undo triggered.” with no effect). Calling the manager
  directly removes the indirection. Source: https://developer.mozilla.org/en-US/docs/Web/API/Event/isTrusted
- **Alternatives considered.** (a) Converting `allCommands` to a `Map` with a throwing duplicate
  guard at module load: rejected for this phase — a load-time throw in the renderer is a worse
  failure mode than a CI test, and the array order is load-bearing for `getCommands` display
  ordering. The 09C test gives the same guarantee without runtime risk. (b) Deleting `/undo`/
  `/redo` + the JSON bindings outright: rejected — the manager and its push sites are real and
  tested; wiring is a smaller, honest diff. (c) Making `/clear chat` local-only: rejected — a
  DM-only “Chat cleared.” that only clears the DM's own panel is a new lie; the `chat_clear`
  permission key already exists for exactly this gate.

## Test plan

- **09A:** ported suites green inside `commands-player-combat.test.ts` and
  `commands-dm-map.test.ts`; four test files deleted with their modules.
- **09B:** updated module tests (`commands-player-checks`, `commands-player-spells`,
  `commands-dm-time`, `commands-dm-economy`, `commands-dm-monsters`, `commands-utility`,
  `commands-player-combat`) assert the post-dedup shapes (aliases carried, renames applied,
  deletions absent).
- **09C:** NEW `services/chat-commands/index.test.ts` — the standing collision guard.
- **09D:** slice tests for `clearAllConditions` / `clearAllEffects`; `commands-utility.test.ts`
  behavioral assertions; schema-map entry exercised via existing schema tests pattern
  (`network/schemas.test.ts` — add `'chat:clear'` to whatever exhaustiveness checks exist there).
- **09E/09F:** `commands-utility.test.ts` mock-driven branch coverage (roles; io success/cancel/
  error).
- **09G:** `commands-social.test.ts` + chat-handlers test for the visual receive path.
- **09H:** `commands-utility.test.ts` undo/redo branches; minimal `use-game-shortcuts` dispatch
  test.
- **End-of-phase 4-gate** (INSTRUCTIONS.md rule 5): `cd dnd-app && npm run lint && npx tsc --noEmit
  -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run`. No Pi code is
  touched — no pytest leg.

## Acceptance criteria

1. The duplicate-name scan (Verification commands §2) prints nothing; `index.test.ts` enforces
   name/alias uniqueness and passes.
2. `/attack <weapon> <target>` executes the full attack pipeline; the “Open the character sheet…”
   stub string no longer exists in the repo.
3. `/stabilize` executes the player Medicine-check command for non-DM users; `/light` executes the
   DM map-light command; `/identifyitem` flips a magic item's `identified` flag.
4. `action-commands.ts`, `attack-commands.ts`, `map-environment-commands.ts`,
   `map-token-commands.ts` (and their tests) are deleted; no import references remain.
5. `/clear chat|combat|effects` and `/log clear` mutate their stores (chat clear propagates via the
   new `chat:clear` message, permission-gated by `chat_clear`); `/log show` prints real combat-log
   entries.
6. `/latency` reports measured `latencyMs` (per-peer on host, single RTT on client, honest solo
   message).
7. `/export character|campaign` and `/import character|campaign` invoke the real io services and
   persist via the same store paths as the menu flows.
8. `/ping` produces an animated map ping locally and on peers via `game:map-ping` (host relays);
   the receive handler renders the visual ping.
9. Ctrl+Z/Ctrl+Y and `/undo`/`/redo` operate the undo-manager, DM-gated, with honest empty-stack
   feedback; the synthetic-KeyboardEvent dispatch is gone.
10. CommandAutocomplete and CommandReferenceModal list each command exactly once (a free
    consequence of 1; spot-check via `getCommands(true)` length = distinct-name count + plugin
    commands).
11. End-of-phase 4-gate green; one phase commit + push; plan moved to `completed/`.

## Out of scope

- i18n/`t()` migration of chat-command strings and other wording polish — **PHASE-12**.
- `_MapPing` and other underscore type aliases (`MapCanvas.tsx:14`, `SpellsTab.tsx:21-29`),
  AudioStep preview no-op, group-roll round-trip — **PHASE-13**.
- Dead duplicate AI executors and `ai-stream-handler.ts` removal (`services/game-actions/`,
  `src/main/ai/`) — **PHASE-08**.
- Drawings snapshot ids / `remove_drawing` usability (AI action surface, not chat commands) —
  **PHASE-08**.
- Approval/store hygiene in `use-ai-dm-store` — **PHASE-04**.
- Any expansion of the undo-manager's push sites beyond the existing DM map-editor scope (e.g.
  undoable HP changes) — future work; not owned by any current phase (log as a suggestion if
  desired during execution).

## Completed

- **09H (2026-06-11):** Ended the dead undo/redo feature by wiring it to the existing `services/undo-manager.ts`. `use-game-shortcuts.ts` — empty `undo`/`redo` cases now `if (isDM) UndoManager.undo()/redo()` (DM-gated: every pushed action is a DM map mutation; player Ctrl+Z stays a no-op). `/undo` + `/redo` (`commands-utility.ts`) — dropped the synthetic-`KeyboardEvent` dispatch (untrusted events never reached the handler); now `dmOnly:true`/`category:'dm'`, require `ctx.isDM` (else error), check `canUndo()`/`canRedo()` (else "Nothing to undo/redo."), then call the manager with honest confirm copy — no more "Undo triggered." lie. Tests: `commands-utility.test.ts` undo/redo branches (manager called + confirm, empty-stack honest, non-DM refusal, "Undo triggered." gone) via a mocked `../undo-manager`; new minimal `use-game-shortcuts.test.ts` (DM routes undo/redo to the manager; non-DM is a no-op). tsc web clean; 64 tests green across 2 files.
- **09G (2026-06-11):** Made `/ping` drive the real map-ping system end-to-end. `pingCommand` (`commands-social.ts`): the map case resolves the caller's token (`useGameStore` active map, `tokens.find(t => t.entityId === ctx.character?.id)`), converts grid→world with the map's `grid.cellSize` (`gridX*cs + cs/2`), `createPing(x, y, ctx.playerName)` locally, and emits `sendMessage('game:map-ping', { gridX, gridY })`; honest error "No token to ping from — double-click the map to ping a location." when there's no token; the ping-a-player branch is unchanged. Receive side `handleMapPing` (`client-handlers/chat-handlers.ts`) now also renders the animated ping (resolve local active map, convert with its cellSize, `createPing(…, message.senderName)`) — chat line only when no active map. Host `handleHostMessage` (`host-handlers.ts`) gains a `game:map-ping` case that renders locally via `handleMapPing` then `broadcastExcluding` relays (the default no-ops; presence-grade, no permission gate). The previously-dead `game:map-ping` receive wire is now live end-to-end. Tests: `commands-social.test.ts` (createPing + sendMessage with grid-converted coords for `/ping` and `/ping map`, no-token error, player-ping doesn't touch the map) + new `chat-handlers.test.ts` (visual ping + chat line, label passthrough, chat-only when no map). tsc web clean; 45 tests green across 3 files.
- **09F (2026-06-11):** Rewrote `/export` and `/import` (`commands-utility.ts`, now async — `executeCommand` already normalizes promises) against the real io services. `/export character`→`getLatestCharacter(ctx.character.id)` + `exportCharacterToFile` (cancel = calm "Export cancelled."); `/export campaign`→active campaign from `useCampaignStore` (`activeCampaignId`+`campaigns`) + `exportCampaignToFile`. `/import character`→`importCharacterFromFile()` then `useCharacterStore.saveCharacter`; `/import campaign`→`importCampaignFromFile()` then `useCampaignStore.saveCampaign` + `window.api.saveGameState` when a game state is present (mirrors `MakeGamePage`). All four wrapped in try/catch → error message; both stay `dmOnly:false`. No "use the main menu" pointers remain. Tests: io + store mocks (`vi.hoisted`), success/cancel/error/no-character branches, asserting the right io fn + store save + `saveGameState` call (`commands-utility.test.ts`). tsc web clean; 57 tests green.
- **09E (2026-06-11):** Rewrote `latencyCommand` (`commands-utility.ts`) to read `useNetworkStore.getState()`: `role==='none'`→"Solo session — no network connection."; `client`→`latencyMs` (null ⇒ "measuring…") + `connectionMode` (cloud relay vs direct/LAN); `host`→one line per `peers[]` entry (`<displayName>: <n> ms` / "measuring…") with the connected-player count, or a no-players-yet line. Output stays a local `system` message (per-viewer data). Tests: solo/client-RTT/client-measuring/host-per-peer branches + a guard that the old canned "depends on peer distance" string is gone (`commands-utility.test.ts`, network-store mock extended with role/connectionMode/latencyMs/peers). tsc web clean; 52 tests green.
- **09D (2026-06-11):** Made the two state-claiming placeholders act for real. New bulk actions: `clearAllConditions` (`conditions-slice.ts` `set({ conditions: [] })`) and `clearAllEffects` (`effects-slice.ts` — wipes `customEffects`/`activeDiseases`/`activeCurses`/`activeEnvironmentalEffects`/`activeSpellEffects`, leaves `placedTraps`), both added to `stores/game/types.ts`. New networked chat clear: `'chat:clear'` added to `MESSAGE_TYPES` (`network/message-types.ts`) + `PAYLOAD_SCHEMAS` (`network/schemas.ts`, `z.object({})`); client handler clears local history (`client-handlers.ts` → `useLobbyStore.clearChatHistory()`); host handler clears locally + `broadcastExcluding` relays, gated by a new `'chat:clear': 'chat_clear'` `MESSAGE_PERMISSION` entry (`host-handlers.ts`) — not added to spectator-allowed. Rewrote `/clear` (`commands-utility.ts`): `chat`→`clearChatHistory()` + `sendMessage('chat:clear', {})`, `combat`→`endInitiative()`+`clearAllConditions()`+`clearCombatLog()` (broadcast), `effects`→`clearAllEffects()` (broadcast). Rewrote `/log`: `show`/empty prints the last 10 `combatLog` entries as `[R<round>] <description>` (or "Combat log is empty."), `clear` requires `ctx.isDM` then `clearCombatLog()`. Tests: store-mocked behavioral assertions for `/clear`/`/log` (`commands-utility.test.ts`); `clearAllConditions`/`clearAllEffects` slice unit tests (effects keeps the trap). tsc web clean; 90 tests green across 6 files.
- **09C (2026-06-11):** `index.ts` — `const allCommands` → `export const allCommands`. NEW `index.test.ts` — the standing collision guard: no duplicate command names, no alias registered on multiple commands, no alias colliding with any command name, a well-formed-shape guard (non-empty name/description/usage, aliases array, boolean dmOnly, known category, execute fn), plus three regression guards that resolve `/stabilize`→player Medicine (dmOnly false), `/attack`→full pipeline (`usage '/attack <weapon> <target>'`), `/light`→DM map-light (dmOnly true) via the same first-match scan as `executeCommand`. The guard surfaced four latent collisions 09A/09B's enumeration missed, all fixed: deleted the inferior announce-only `whisperCommand` (`commands-social.ts`) that was fully shadowed by the real networked `/w` (`commands-player-utility.ts`, which gained the `tell` alias to keep `/tell` alive — its cross-aliases `w`/`dm`/`tell` collided with the `w` and `dm` commands); dropped the duplicate `enc` alias from `/encounter` (`commands-dm-economy.ts` — `/encumbrance` owns it); removed the pointless `npcsay` self-alias (`commands-dm-monsters.ts`). Dropped the social `/whisper` suite (covered by player-utility's `/w` tests). tsc web clean; 765 tests green across the 29 chat-commands files.
- **09B (2026-06-11):** Resolved every remaining duplicate to one live registration and un-shadowed the two hijacked names. Deleted: the `/attack` text-only stub (`commands-player-utility.ts` — full pipeline at `commands-player-combat.ts` now lives), `saveCommand` (`commands-player-checks.ts` — winner is the auto-modifier `/save` in `commands-player-utility.ts`, which gained `['savingthrow','st']`), `restCommand` (`commands-dm-time.ts` — player `/rest` + `/longrest` win), `concentrationCheckCommand` + `wildshapeCommand` (`commands-player-spells.ts` — winners in conditions/companions; carried the loser's extra `concdc` alias onto `commands-player-conditions.ts` conccheck), `npcMoodCommand` (`commands-dm-monsters.ts` — narrative 6-mood winner), the announce-only `reviveCommand` and the chat-line `pingCommand` (`commands-utility.ts`). Renamed the dead-but-real DM `/identify` → `/identifyitem` (alias `iditem`, usage + in-body usage string) in `commands-dm-economy.ts` so its magic-item `identified`-flip is reachable. Un-shadowed: `reviveCommand` aliases `['stabilize']`→`[]` (`commands-dm-monsters.ts`) so the player `/stabilize` (Medicine check) resolves; torch aliases `['light','lantern','lamp']`→`['lantern','lamp']` (`commands-player-combat.ts`) so the DM `/light` resolves. Updated 8 test files (dropped the moved/deleted command suites, ported the `/save` alias assertion to `commands-player-utility.test.ts`, retargeted `/identify`→`/identifyitem`, flipped the revive-stabilize assertion to `.not.toContain`, fixed the dm-monsters count 10→9). tsc web clean; 760 tests green across the 28 chat-commands files.
- **09A (2026-06-11):** Deleted the four fully-shadowed modules + their tests (`action-commands.ts`/`.test.ts`, `attack-commands.ts`/`.test.ts`, `map-environment-commands.ts`/`.test.ts`, `map-token-commands.ts`/`.test.ts` — 32 dead registrations). `index.ts` — dropped the four import blocks and the 32 trailing `allCommands` entries + section comments; array now ends at `...dmSoundCommands`; `getPluginCommandRegistry` import + type re-export barrel untouched. Ported behavioral coverage to the live copies (looked up via the registry array, not named exports): action + attack verbs (grapple/shove/readyaction/delayaction/multiattack/reaction/useobj/dash/disengage/dodge/hide/search/offhand/unarmed/aoedamage/attack/torch) into `commands-player-combat.test.ts` (extended `./helpers` mock with `rollD20WithTag`, added `useGameStore`/`findWeapon`/`findTokenByName` imports + `makeCtx`); torch metadata assertion targets the surviving `lantern` alias (the `light` alias drops in 09B). map-token verbs (summon/tokenclone/tokenhide/tokenshow/tokenmove) into `commands-dm-map.test.ts` (assert on `ctx` broadcasts, matching the file's existing store-mock style). map-environment behavior was already fully covered by `commands-dm-map.test.ts` (fog/light/elevate/darkness/setweather/sunmoon/grid/zoom/center) → not re-ported. `grep` confirms no `action-commands|attack-commands|map-environment-commands|map-token-commands` code refs remain. tsc web clean; 108 tests green across the two destination files.
