# PHASE-12 — i18n & wording sweep (AI DM strings, grammar, es.json naming consistency)

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Eliminate every user-facing wording, grammar, and i18n defect allocated to this phase: hardcoded English strings in the AI DM store that bypass the i18n layer, the un-i18n'd full-view Send button in ChatPanel, a player-visible internal roadmap tag ("(Phase 16a)") shipped in both locales, a doubled word ("bounds boundaries") in the Resize Map note, an ambiguous spell-end broadcast message, a verb/noun grammar error ("to backup"), mixed "AI DM" vs bare "AI" terminology in adjacent status strings, and a five-variant Spanish translation of the "AI Dungeon Master" entity name normalized to one canonical form. The phase is value-level polish: no behavior changes, no new UI, no schema changes — every edit is a string value, an i18n key addition, or a one-line literal-to-`t()` swap, all covered by the existing i18n gate tests (key-check, locale-parity, generated-keys drift).

## Dependencies & cross-phase notes

PHASE-INDEX row 12 lists **no formal dependencies** (phases 01–19 are independent), but phases execute in numeric order, so 01–11 land first. That matters because four of them touch this phase's files — **re-run every verification command in this plan before editing; line numbers cited here are from the 2026-06-10 tree and WILL have drifted**:

- **PHASE-04** (`ai-store-approval-hygiene`) edits `src/renderer/src/stores/use-ai-dm-store.ts` (reset/initFromCampaign queue clearing, `approvePendingActions`, `rejectPendingActions` surroundings) — the exact function this phase i18n-izes (`rejectPendingActions`). PHASE-04 also adds en/es keys for MutationApprovalPanel's 12 unlabeled mutation types; any **new Spanish keys it adds must already use the canonical "DM de IA" / "Dungeon Master de IA" forms** this phase establishes (sub-phase 12B's normalization grep will catch stragglers).
- **PHASE-05/06/07** also edit `use-ai-dm-store.ts` (listener lifecycle, scene-prep cancel, conversation persistence). Content-based greps below locate the targets regardless of drift.
- **PHASE-08** (`executor-batch-correctness`) edits `src/renderer/src/services/game-actions/spell-effect-actions.ts` (the `cast_spell` caster-exclusion case bug lives in `executeCastSpell`, same file as this phase's `executeEndSpell` message). Different functions — no logical conflict, but expect line drift.
- **PHASE-10** (`ai-dm-ui-truth`) edits `ChatPanel.tsx` (status bar semantics: unknown-as-ready/no-recheck/no-paused; stream preview; auto-scroll) and the `game.chatPanel.tokens` key (`{{max}}` interpolation). **The `game.chatPanel.tokens` key is PHASE-10's — do not touch it here.** If PHASE-10 added new status keys (e.g. an "AI paused" or "status unknown" string), apply this phase's canonical wording ("AI DM …" in en, "DM de IA" in es) to those too when doing 12A.
- **PHASE-11** owns the travel-pace UI strings (`en.json:3020-3025`) and prompt wording — not touched here.

## Verified findings

All claims re-verified against the live tree on 2026-06-10. Repo-relative paths are under `dnd-app/` unless noted; run commands from `dnd-app/`.

### F1 — Hardcoded English in the AI DM store bypasses i18n (4 sites, one more than the audit recorded)

`src/renderer/src/stores/use-ai-dm-store.ts` (603 lines) imports the i18n singleton at line 4 (`import { i18n } from '../i18n'`) and uses `i18n.t(...)` for its other user-facing strings (lines 204, 235, 373, 380, 497-498, 572 — keys under `notify.aiDmStore.*`), but four sites hardcode English:

1. **Line 153** — the stream-safety inactivity timeout sets `lastError: 'AI response timed out'`. This value is rendered to the user via `t('game.chatPanel.aiError', { error: aiLastError })` at `ChatPanel.tsx:413`, so a Spanish UI shows a mixed-language error line.
2. **Lines 217-218** — `rejectPendingActions` posts a chat message with `senderName: 'DM'` and `` content: `[DM Override] AI ruling rejected${dmNote ? `: ${dmNote}` : ''}` ``.
3. **Line 420** — `checkSceneStatus` falls back to `sceneError: 'Scene preparation failed.'` when the main process reports `status === 'error'` with no error text. Rendered raw at `ScenePrepPage.tsx:130`.
4. **Line 502** *(correction — the audit's "the rest of the same file uses i18n.t" was not fully true)* — the model-switch notice chat message hardcodes `senderName: 'System'` even though its `content` (lines 497-498) is properly i18n'd. The codebase already has an i18n'd sender-name precedent: `ChatPanel.tsx:210` uses `t('game.chatPanel.systemSender')`, and `game.chatPanel.systemSender` = "System"/"Sistema" exists in both locales (en.json:892, es.json:892).

Verification (run from `dnd-app/`):

```bash
grep -n "AI response timed out\|Scene preparation failed\|DM Override\|senderName: '" src/renderer/src/stores/use-ai-dm-store.ts
# 2026-06-10 output: lines 153, 217 ('DM'), 218, 420, 502 ('System')
grep -n "import { i18n }" src/renderer/src/stores/use-ai-dm-store.ts   # line 4 — already imported
grep -n -A 7 '"aiDmStore"' src/renderer/src/i18n/locales/en.json        # namespace exists at en.json:5075
```

Existing test coupling: `src/renderer/src/stores/use-ai-dm-store.test.ts:236` asserts `expect(s.lastError).toBe('AI response timed out')`. The global test setup (`src/test-setup.ts:9-11`) awaits `initI18n()` (English) before every test file, so the assertion stays green as long as the new key's English value is exactly `AI response timed out` — but update the assertion to reference the key anyway (12D step 5) so the string has a single source of truth.

### F2 — ChatPanel full-view Send button is a literal, collapsed variant is i18n'd

`src/renderer/src/components/game/bottom/ChatPanel.tsx`: the collapsed-view send button renders `{t('game.chatPanel.send')}` (line 348); the full-view send button renders the literal `Send` (line 465, inside the button at lines 459-466). The key exists in both locales: `game.chatPanel.send` = "Send" (en.json:898) / "Enviar" (es.json:898). The component already has `const { t } = useT()` in scope (line 129). `ChatPanel.test.tsx` does not assert the Send label, so no test update is needed.

```bash
grep -n "chatPanel.send" src/renderer/src/components/game/bottom/ChatPanel.tsx   # 348 (collapsed, i18n'd)
grep -n "^            Send$" src/renderer/src/components/game/bottom/ChatPanel.tsx # 465 (full view, literal)
grep -n '"send"' src/renderer/src/i18n/locales/en.json src/renderer/src/i18n/locales/es.json | head -2
```

### F3 — Player-facing tooltip ships the internal roadmap tag "(Phase 16a)"

`game.playerBottomBar.centerOnMeTitle` = `"Center the map on your character (Phase 16a)"` (en.json:1067) and `"Centrar el mapa en tu personaje (Fase 16a)"` (es.json:1067 — the internal tag was even translated). Consumed as a button `title` tooltip at `src/renderer/src/components/game/bottom/PlayerBottomBar.tsx:243`.

```bash
grep -n "Phase 16a\|Fase 16a" src/renderer/src/i18n/locales/en.json src/renderer/src/i18n/locales/es.json
grep -rn "centerOnMeTitle" src/renderer/src/components   # PlayerBottomBar.tsx:243
```

### F4 — "new bounds boundaries" doubled word in the Resize Map note

`game.resizeMapModal.note` (en.json:2005) = `"Note: Content outside the new bounds boundaries will be hidden but preserved. Background maps will not resize."` The Spanish translation (es.json:2005) is already correct: "…fuera de los nuevos límites…". Consumed at `src/renderer/src/components/game/modals/dm-tools/ResizeMapModal.tsx:86`. English-only fix.

```bash
grep -n "bounds boundaries" src/renderer/src/i18n/locales/en.json   # en.json:2005
sed -n '2005p' src/renderer/src/i18n/locales/es.json                # already "los nuevos límites"
```

### F5 — Spell-end broadcast message is ambiguous

`src/renderer/src/services/game-actions/spell-effect-actions.ts:216` (in `executeEndSpell`):

```ts
postDmMessage(stores, 'end-spell', `🛑 ${target.name} (${target.caster}) ends.`)
```

Renders e.g. `🛑 Spirit Guardians (Aria) ends.` — the parenthetical reads as part of the spell name, and nothing states the parenthetical is the caster. The sibling cast message (line 185) is `` `✨ ${caster} casts ${spellName}${durText}${outcomeText}` ``. These executor chat messages are deliberately hardcoded English (every `postDmMessage` call across `services/game-actions/` is — they are the AI-DM action log, and the AI pipeline operates in English), so this is a **phrasing fix, not an i18n conversion**. `postDmMessage` (defined `services/game-actions/broadcast-helpers.ts:41-56`) posts the string as a system chat message from "Dungeon Master" and broadcasts it.

Test coupling: `spell-effect-actions.test.ts` mocks `postDmMessage` (lines 3-7) and has an `executeEndSpell` describe block (lines 233-270) that does **not** currently assert the message text — 12E adds an assertion.

```bash
grep -n 'ends\.' src/renderer/src/services/game-actions/spell-effect-actions.ts          # line 216
grep -n "executeEndSpell" src/renderer/src/services/game-actions/spell-effect-actions.test.ts  # 233-270 block
```

### F6 — "No campaigns to backup" verb/noun grammar error

`pages.settingsPage.noCampaignsToBackup` (en.json:6058) = `"No campaigns to backup"`. "Backup" is a noun/adjective; the verb is the two-word "back up" (the sibling key `autoBackupDesc`, en.json:6077, already gets it right: "…back up automatically on launch…"). Spanish (es.json:6058, "No hay campañas para respaldar") is correct. Consumed at `src/renderer/src/pages/SettingsPage.tsx:768`. English-only fix. The JSON key name `noCampaignsToBackup` stays as-is (renaming a key is churn across en.json, es.json, generated-keys.ts, and the consumer for zero user value).

```bash
grep -n "to backup" src/renderer/src/i18n/locales/en.json    # only en.json:6058
grep -n "autoBackupDesc" src/renderer/src/i18n/locales/en.json  # 6077 — correct sibling
```

### F7 — Mixed "AI DM" vs bare "AI" terminology in the same panel

In `game.chatPanel.*` (en.json:900-905), strings naming the same entity disagree:

| Key | en.json line | Current en value | Current es value |
|---|---|---|---|
| `aiTyping` | 900 | "AI DM is typing..." | "El DM de IA está escribiendo..." |
| `aiError` | 902 | "AI DM error: {{error}}" | "Error del DM de IA: {{error}}" |
| `aiResponding` | 903 | "AI responding" | "La IA está respondiendo" |
| `aiReady` | 904 | "AI ready" | "IA lista" |
| `aiNoModel` | 905 | "No model installed — pull one in AI settings" | "Ningún modelo instalado: instala uno en ajustes de IA" |

`aiTyping` (typing indicator, ChatPanel.tsx:401) and `aiResponding`/`aiReady` (DM-only status bar, ChatPanel.tsx:427/430) are adjacent in the same panel yet name the entity differently ("AI DM" vs "AI" / "DM de IA" vs "IA"). Canonical form (see Research notes): **"AI DM"** in English, **"DM de IA"** in Spanish. `aiNoModel` refers to the model, not the entity — unchanged. `game.settingsDropdown.aiResponding` ("Responding..." / "Respondiendo...") names no entity — unchanged.

```bash
sed -n '895,910p' src/renderer/src/i18n/locales/en.json
sed -n '895,910p' src/renderer/src/i18n/locales/es.json
grep -rn "aiResponding\|aiReady" src/renderer/src/components/game/bottom/ChatPanel.tsx  # consumers: 427, 430
```

### F8 — es.json names the AI-DM entity FIVE different ways (audit said two)

*(Corrected/expanded claim.)* The audit cited 6 lines and two variants; the live tree has **five** variants of the entity name across ~35 occurrences:

- `Dungeon Master de IA` ×4 (es.json:689, 755, 765, 2907) — canonical full form
- `Dungeon Master con IA` ×3 (756, 5068, 5121)
- `DM de IA` ×9 (545, 797, 804, 900, 902, 967, 972, 990, 2906) — canonical short form
- `DM con IA` ×15 (2703, 2742, 3418, 3422, 3423, 5019, 5021, 5081, 5471, 5474, 5475, 5476, 5617, 6876, 6890)
- `DM IA` ×4 (2931, 2933, 3132, 3133)

Phrases where "con IA" means "with/using AI" for a *feature* rather than naming the DM entity are correct Spanish and stay: `Análisis de mapa con IA` (1022, 1791 — AI map analysis), `Genera un resumen con IA` / `Resumen con IA` (2750, 2751, 2754 — AI recap). Only the entity name is normalized.

Full enumeration of the 22 keys to change (key → en source → current es → new es) is in sub-phase 12B. Re-runnable enumeration command (run from `dnd-app/`; should print **nothing** after 12B):

```bash
python3 - <<'EOF'
import json, re
en = json.load(open('src/renderer/src/i18n/locales/en.json'))
es = json.load(open('src/renderer/src/i18n/locales/es.json'))
def walk(d, p=''):
    for k, v in d.items():
        q = f'{p}.{k}' if p else k
        if isinstance(v, dict): yield from walk(v, q)
        else: yield q, v
enf, esf = dict(walk(en)), dict(walk(es))
for k, v in esf.items():
    if isinstance(v, str) and ('DM con IA' in v or 'Dungeon Master con IA' in v or re.search(r'DM IA\b', v)):
        print(f'{k}: en={enf.get(k)!r} -> es={v!r}')
EOF
```

### Infrastructure facts (the i18n machinery this phase rides on)

- **en.json is the key source of truth.** `scripts/i18n/gen-key-union.mjs` (run via `npm run i18n:gen-keys`, package.json:34) regenerates `src/renderer/src/i18n/generated-keys.ts` (the `TranslationKey` literal union, ~6,000 members). **Never hand-edit generated-keys.ts.** Adding a key to en.json without regenerating fails `src/renderer/src/i18n/generated-keys.test.ts` (drift gate).
- **`src/renderer/src/i18n/key-check.test.ts`** runs `scripts/i18n/check-keys.mjs` under vitest: it scans all renderer source for static `t('…')` / `i18n.t('…')` literals and fails if any key is missing from en.json — so new `i18n.t` call sites and their en.json keys must land together (they do: both inside this phase's working tree before the end-of-phase gate).
- **`src/renderer/src/i18n/locale-parity.test.ts`** asserts es.json has the IDENTICAL flattened key set as en.json and that every `{{placeholder}}` in an en value is preserved in the es value. Every key added to en.json must be added to es.json in the same sub-phase, and `{{note}}`/`{{error}}` placeholders must survive translation.
- **`src/test-setup.ts:9-11`** awaits `initI18n()` (lng `'en'`, `fallbackLng: 'en'`, `escapeValue: false`, single `translation` namespace addressed by full dotted path — `src/renderer/src/i18n/index.ts:17-26`) in a global `beforeAll`, so store/component tests resolve English values, never raw keys.
- The store-side translation pattern is `i18n.t('dotted.key')` on the exported singleton (`src/renderer/src/i18n/config.ts:18`), called lazily at event time (not at module scope), which is the correct pattern for non-React code (see Research notes).

## Sub-phases

Execute in order; each leaves the tree green. All paths relative to `dnd-app/` and all commands run from `dnd-app/`.

### 12A — en/es value fixes: roadmap tag, doubled word, grammar, status-term consistency (F3, F4, F6, F7)

**Objective:** fix the four pure-value defects in the locale files. No keys added or removed — `generated-keys.ts` regeneration is NOT needed.

**Files:** `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`.

**Steps:**
1. `game.playerBottomBar.centerOnMeTitle` (en.json:1067): `"Center the map on your character (Phase 16a)"` → `"Center the map on your character"`.
2. `game.playerBottomBar.centerOnMeTitle` (es.json:1067): `"Centrar el mapa en tu personaje (Fase 16a)"` → `"Centrar el mapa en tu personaje"`.
3. `game.resizeMapModal.note` (en.json:2005): `"Note: Content outside the new bounds boundaries will be hidden but preserved. Background maps will not resize."` → `"Note: Content outside the new bounds will be hidden but preserved. Background maps will not resize."` (es already correct — untouched).
4. `pages.settingsPage.noCampaignsToBackup` (en.json:6058): `"No campaigns to backup"` → `"No campaigns to back up"` (es already correct — untouched; key name unchanged, see F6).
5. `game.chatPanel.aiResponding` (en.json:903): `"AI responding"` → `"AI DM responding"`; (es.json:903): `"La IA está respondiendo"` → `"El DM de IA está respondiendo"`.
6. `game.chatPanel.aiReady` (en.json:904): `"AI ready"` → `"AI DM ready"`; (es.json:904): `"IA lista"` → `"DM de IA listo"` (gender agreement moves to masculine *DM*).
7. If PHASE-10 introduced additional `game.chatPanel` status keys (paused/unknown states), apply the same canonical entity wording to them ("AI DM …" / "DM de IA …"). Check: `sed -n '/"chatPanel"/,/}/p' src/renderer/src/i18n/locales/en.json | grep '"ai'`.

**Cheap checks:**
```bash
node -e "JSON.parse(require('fs').readFileSync('src/renderer/src/i18n/locales/en.json','utf8')); JSON.parse(require('fs').readFileSync('src/renderer/src/i18n/locales/es.json','utf8')); console.log('json ok')"
npx vitest run src/renderer/src/i18n/locale-parity.test.ts
```

**Acceptance:** `grep -rn "Phase 16a\|Fase 16a\|bounds boundaries\|to backup" src/renderer/src/i18n/locales/` → no matches; the two status strings carry "AI DM"/"DM de IA"; both JSON files parse; locale-parity green.

### 12B — es.json AI-DM entity-name normalization to "DM de IA" / "Dungeon Master de IA" (F8)

**Objective:** one entity, one name (per locale). Replace every `Dungeon Master con IA`, `DM con IA`, and `DM IA` naming the AI-DM entity with the canonical forms. The full form mirrors the en full form ("AI Dungeon Master"); the short form mirrors "AI DM". Values only — no keys change.

**Files:** `src/renderer/src/i18n/locales/es.json`.

**Steps — exact new values (line numbers are 2026-06-10; locate by key, not line):**

| # | Key (es.json line) | New es value |
|---|---|---|
| 1 | `campaign.aiProviderSetup.subtitle` (756) | `Activa opcionalmente un Dungeon Master de IA para tu campaña.` |
| 2 | `game.commandReferenceModal.aiDmCommands` (2703) | `Comandos del DM de IA` |
| 3 | `game.endOfSessionModal.aiNotConfigured` (2742) | `El DM de IA no está configurado o habilitado para esta campaña.` |
| 4 | `game.rulingApprovalModal.title` (2931) | `Dictamen del DM de IA` |
| 5 | `game.rulingApprovalModal.intro` (2933) | `El DM de IA quiere ejecutar las siguientes acciones. Revisa y aprueba o anula:` |
| 6 | `game.floatingDMPanel.resumeAI` (3132) | `Reanudar DM de IA` |
| 7 | `game.floatingDMPanel.pauseAI` (3133) | `Pausar DM de IA` |
| 8 | `game.settingsDropdown.aiDm` (3418) | `DM de IA` |
| 9 | `game.settingsDropdown.resumeAiDm` (3422) | `Reanudar DM de IA` |
| 10 | `game.settingsDropdown.pauseAiDm` (3423) | `Pausar DM de IA` |
| 11 | `lobby.readyButton.waitingForAiDm` (5019) | `Esperando al DM de IA...` |
| 12 | `lobby.readyButton.preparingScene` (5021) | `Esperando a que el DM de IA prepare la escena...` |
| 13 | `lobby.playerList.aiDungeonMaster` (5068) | `Dungeon Master de IA` |
| 14 | `notify.aiDmStore.aiDmError` (5081) | `DM de IA: {{error}}` |
| 15 | `pages.aboutPage.featureAiDm` (5121) | `Dungeon Master de IA (Claude, OpenAI, Gemini, Ollama)` |
| 16 | `pages.aiDmCard.title` (5471) | `Dungeon Master de IA` (en is the full form "AI Dungeon Master") |
| 17 | `pages.aiDmCard.notEnabled` (5474) | `El DM de IA no está activado para esta campaña.` |
| 18 | `pages.aiDmCard.enableAiDm` (5475) | `Activar DM de IA` |
| 19 | `pages.aiDmCard.configureTitle` (5476) | `Configurar Dungeon Master de IA` (en is "Configure AI Dungeon Master") |
| 20 | `pages.lobbyPage.scenePreparing` (5617) | `El DM de IA está preparando la escena...` |
| 21 | `ui.discordIntegration.pushToDiscordDesc` (6876) | `Reenviar la narración del DM de IA a Discord` |
| 22 | `ui.discordIntegration.infoBox` (6890) | `La narración del DM de IA se enviará a Discord después de cada respuesta. Los metadatos técnicos como [DM_ACTIONS] y [STAT_CHANGES] se filtran automáticamente.` |

**Do NOT change** feature-usage phrases (legitimate "with AI" semantics): `aiMapAnalysis`/map-analysis title (es.json:1022, 1791), recap strings (2750, 2751, 2754). If PHASE-02/04/10/11 added new es strings naming the entity with a non-canonical variant, normalize those too — the F8 enumeration script is the authority.

**Cheap checks:**
```bash
node -e "JSON.parse(require('fs').readFileSync('src/renderer/src/i18n/locales/es.json','utf8')); console.log('json ok')"
# The F8 enumeration script (Verified findings) must print NOTHING.
npx vitest run src/renderer/src/i18n/locale-parity.test.ts
```

**Acceptance:** F8 enumeration script outputs nothing; `grep -c "DM de IA\|Dungeon Master de IA" src/renderer/src/i18n/locales/es.json` ≥ 35; `{{error}}` preserved in key 14; locale-parity green.

### 12C — ChatPanel full-view Send button → `t('game.chatPanel.send')` (F2)

**Objective:** make the full-view Send button use the existing i18n key, matching the collapsed variant.

**Files:** `src/renderer/src/components/game/bottom/ChatPanel.tsx`.

**Steps:**
1. Locate the full-view send button (2026-06-10: lines 459-466; find with `grep -n "Send$" src/renderer/src/components/game/bottom/ChatPanel.tsx`). Replace the literal children `Send` with `{t('game.chatPanel.send')}`. `t` is already in scope (`const { t } = useT()` — the full-view component body, line 129 as of 2026-06-10).
2. Confirm no other bare user-facing literals were introduced near it by PHASE-10's edits to this file; if the collapsed variant moved, the key (`game.chatPanel.send`) is still the single source.

**Cheap checks:**
```bash
npx tsc --noEmit -p tsconfig.web.json
npx vitest run src/renderer/src/components/game/bottom/ChatPanel.test.tsx
```

**Acceptance:** `grep -n ">Send<\|^\s*Send$" src/renderer/src/components/game/bottom/ChatPanel.tsx` → no matches; `grep -c "chatPanel.send" …/ChatPanel.tsx` = 2 (collapsed + full view); tsc + component test green.

### 12D — i18n-ize the four hardcoded AI DM store strings (F1)

**Objective:** route the store's user-facing literals through `i18n.t` with new keys in the existing `notify.aiDmStore` namespace; reuse `game.chatPanel.systemSender` for the system sender name.

**Files:** `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`, `src/renderer/src/i18n/generated-keys.ts` (regenerated, not hand-edited), `src/renderer/src/stores/use-ai-dm-store.ts`, `src/renderer/src/stores/use-ai-dm-store.test.ts`.

**Steps:**
1. Add to the `notify.aiDmStore` object in en.json (2026-06-10: starts at line 5075):
   ```json
   "responseTimedOut": "AI response timed out",
   "scenePrepFailed": "Scene preparation failed.",
   "dmOverrideRejected": "[DM Override] AI ruling rejected",
   "dmOverrideRejectedWithNote": "[DM Override] AI ruling rejected: {{note}}",
   "dmSender": "DM"
   ```
   The `responseTimedOut` English value must stay byte-identical to the old literal (`AI response timed out`) — the existing test asserts it and PHASE-14's truncation/connection work may surface it elsewhere.
2. Add the same five keys to es.json's `notify.aiDmStore` object:
   ```json
   "responseTimedOut": "La respuesta de la IA agotó el tiempo de espera",
   "scenePrepFailed": "Falló la preparación de la escena.",
   "dmOverrideRejected": "[Anulación del DM] Dictamen de la IA rechazado",
   "dmOverrideRejectedWithNote": "[Anulación del DM] Dictamen de la IA rechazado: {{note}}",
   "dmSender": "DM"
   ```
   (`{{note}}` must be preserved — locale-parity enforces it. "DM" is the conventional Spanish loan term, consistent with the rest of es.json.)
3. `npm run i18n:gen-keys` — regenerates `generated-keys.ts` with the five new union members.
4. In `src/renderer/src/stores/use-ai-dm-store.ts` (locate each by the content greps in F1; `i18n` already imported at line 4):
   - Safety-timeout site (was :153): `lastError: 'AI response timed out'` → `lastError: i18n.t('notify.aiDmStore.responseTimedOut')`.
   - `rejectPendingActions` (was :217-218):
     ```ts
     senderName: i18n.t('notify.aiDmStore.dmSender'),
     content: dmNote
       ? i18n.t('notify.aiDmStore.dmOverrideRejectedWithNote', { note: dmNote })
       : i18n.t('notify.aiDmStore.dmOverrideRejected'),
     ```
   - `checkSceneStatus` (was :420): `(result.error ?? 'Scene preparation failed.')` → `(result.error ?? i18n.t('notify.aiDmStore.scenePrepFailed'))`.
   - Model-switch chat message (was :502): `senderName: 'System'` → `senderName: i18n.t('game.chatPanel.systemSender')`.
   All four sites compute the string at event time (timer fire / user click / IPC event), so they pick up the active locale — no module-scope caching pitfall (see Research notes).
5. Update `use-ai-dm-store.test.ts` (was :236): `expect(s.lastError).toBe('AI response timed out')` → import the singleton (`import { i18n } from '../i18n'`) and assert `expect(s.lastError).toBe(i18n.t('notify.aiDmStore.responseTimedOut'))` (resolves to the English value under the global `initI18n()` setup; stays correct if the wording is ever revised).

**Cheap checks:**
```bash
npm run i18n:gen-keys   # idempotent — confirms no further drift
npx tsc --noEmit -p tsconfig.web.json
npx vitest run src/renderer/src/i18n/generated-keys.test.ts src/renderer/src/i18n/key-check.test.ts src/renderer/src/i18n/locale-parity.test.ts src/renderer/src/stores/use-ai-dm-store.test.ts
```

**Acceptance:** `grep -n "AI response timed out\|Scene preparation failed\|DM Override\] AI" src/renderer/src/stores/use-ai-dm-store.ts` → no string literals (only `i18n.t` keys); `grep -c "senderName: '" src/renderer/src/stores/use-ai-dm-store.ts` = 0; all four listed test files green.

### 12E — Spell-end broadcast phrasing (F5)

**Objective:** make the end-spell chat line state what happened and who the parenthetical is.

**Files:** `src/renderer/src/services/game-actions/spell-effect-actions.ts`, `src/renderer/src/services/game-actions/spell-effect-actions.test.ts`.

**Steps:**
1. In `executeEndSpell` (2026-06-10: line 216), change:
   ```ts
   postDmMessage(stores, 'end-spell', `🛑 ${target.name} (${target.caster}) ends.`)
   ```
   to:
   ```ts
   postDmMessage(stores, 'end-spell', `🛑 Spell ends: ${target.name} (cast by ${target.caster}).`)
   ```
   Renders `🛑 Spell ends: Spirit Guardians (cast by Aria).` — explicit event, explicit caster attribution. Stays hardcoded English by executor convention (F5).
2. In the `executeEndSpell` describe block of the colocated test (2026-06-10: lines 233-270), extend the existing happy-path case (ends by `spellName` + `caster`) to assert the message: after the call, `const [, idPrefix, content] = vi.mocked(postDmMessage).mock.calls.at(-1)!` then `expect(idPrefix).toBe('end-spell')` and `expect(content).toBe('🛑 Spell ends: Entangle (cast by Druid).')` (match the fixture names used in that block — verify with `sed -n '233,270p' src/renderer/src/services/game-actions/spell-effect-actions.test.ts`; `postDmMessage` is already mocked at the top of the file).

**Cheap checks:**
```bash
npx tsc --noEmit -p tsconfig.web.json
npx vitest run src/renderer/src/services/game-actions/spell-effect-actions.test.ts
```

**Acceptance:** `grep -n "Spell ends:" src/renderer/src/services/game-actions/spell-effect-actions.ts` → one match; old pattern `` `(${target.caster}) ends.` `` gone; test asserts the new message; targeted test green.

## Research notes

- **Canonical Spanish form — "DM de IA" / "Dungeon Master de IA", not "con IA" / "DM IA".** The entity *is* an AI acting as the DM, so the genitive "de IA" ("AI DM") is semantically right; "con IA" ("with AI") implies a human DM assisted by AI and is kept only for genuine feature-usage phrases (map analysis, recap generation). "DM IA" (no preposition) is non-idiomatic Spanish. FundéuRAE guidance: the sigla "IA" is written in uppercase while the expansion "inteligencia artificial" is lowercase — both satisfied by the chosen forms. Sources: [FundéuRAE coverage summarized in The Conversation's Spanish AI writing guide](https://theconversation.com/guia-rapida-para-escribir-y-hablar-correctamente-de-inteligencia-artificial-con-todas-las-letras-206370). Tie-breaker within the repo: "de IA" already dominates the prominent surfaces (provider-setup title/enable, chat panel typing/error strings) and the short form is the file's most internally consistent variant.
- **"One term, one concept."** The Microsoft Writing Style Guide's core terminology rule — pick one word for a concept, use it consistently, never use synonyms for the same feature — is the basis for both F7 (en "AI DM" vs "AI") and F8 (es five-variant collapse). Sources: [Use technical terms carefully](https://learn.microsoft.com/en-us/style-guide/word-choice/use-technical-terms-carefully), [Writing tips](https://learn.microsoft.com/en-us/style-guide/global-communications/writing-tips).
- **"back up" (verb) vs "backup" (noun/adjective).** Merriam-Webster lists the solid form only as noun/adjective; the verb sense is the two-word phrase. "No campaigns to backup" uses the infinitive verb slot → "to back up". Sources: [Merriam-Webster: backup](https://www.merriam-webster.com/dictionary/backup), [Grammarist: back up vs. backup](https://grammarist.com/usage/back-up-backup/).
- **Calling `i18next.t()` outside React components (the store pattern).** Importing the configured i18next instance and calling `i18n.t()` in non-React code is the documented pattern, with two pitfalls: (1) calls before init resolve to the raw key — covered here because `src/test-setup.ts` awaits `initI18n()` for tests and `main.tsx` awaits it before render; (2) values computed once at module scope go stale on language change — avoided because all four store sites build strings inside event handlers at fire time. `getFixedT`/event-subscription patterns are unnecessary for this usage. Source: [Locize: How to use i18next.t() outside React components](https://www.locize.com/blog/how-to-use-i18next-t-outside-react-components/).
- **Interpolation.** i18next's `{{var}}` syntax with `t(key, { var })`; this repo initializes with `escapeValue: false` (React escapes at render), so interpolated `{{note}}`/`{{error}}` values are not double-escaped. The locale-parity test enforces placeholder preservation across locales. Source: [i18next interpolation docs](https://www.i18next.com/translation-function/interpolation).
- **Alternatives considered.** (a) i18n-izing the `postDmMessage` executor strings (F5): rejected — all ~30 executor chat messages in `services/game-actions/` are intentionally English (AI action log; the AI pipeline reads chat history back), and converting one creates a new inconsistency; a full executor-log i18n decision is out of scope. (b) Renaming `noCampaignsToBackup` to match the corrected wording: rejected — key renames ripple through generated-keys.ts and consumers for zero user-visible value. (c) Choosing "con IA" as the Spanish canon by raw occurrence count (15 vs 9 short-form): rejected on semantics + prominent-surface consistency (above).

## Test plan

- **12A/12B:** no new test files — covered by existing `src/renderer/src/i18n/locale-parity.test.ts` (key parity + placeholder preservation) and JSON-parse checks; the F8 enumeration script is the manual regression check (must output nothing).
- **12C:** existing `src/renderer/src/components/game/bottom/ChatPanel.test.tsx` (renders; no Send-label assertion exists or is needed — the key-check gate proves `game.chatPanel.send` resolves).
- **12D:** updated `src/renderer/src/stores/use-ai-dm-store.test.ts` (timeout assertion now references the key); existing gates prove the rest: `generated-keys.test.ts` (union regenerated), `key-check.test.ts` (new `i18n.t` literals resolve in en.json), `locale-parity.test.ts` (es parity + `{{note}}`).
- **12E:** updated `src/renderer/src/services/game-actions/spell-effect-actions.test.ts` (new assertion on the end-spell message content + id prefix).
- **End-of-phase 4-gate** (INSTRUCTIONS.md rule 5, run once from `dnd-app/`): `npm run lint`, `npx tsc --noEmit -p tsconfig.web.json`, `npx tsc --noEmit -p tsconfig.node.json`, `npx vitest run` (full suite — includes all four i18n gate tests). No Pi code is touched → no pytest leg.

## Acceptance criteria

1. `grep -rn "Phase 16a\|Fase 16a" dnd-app/src/renderer/src/i18n/locales/` → no matches (F3).
2. `grep -n "bounds boundaries" dnd-app/src/renderer/src/i18n/locales/en.json` → no matches (F4).
3. `grep -n "to backup" dnd-app/src/renderer/src/i18n/locales/en.json` → no matches; value is "No campaigns to back up" (F6).
4. en.json `game.chatPanel.aiResponding` / `aiReady` say "AI DM responding" / "AI DM ready"; es counterparts use "DM de IA" (F7).
5. The F8 enumeration script prints nothing — es.json contains zero `DM con IA`, `Dungeon Master con IA`, or `DM IA` entity references (feature-usage "con IA" phrases for map analysis/recap remain) (F8).
6. ChatPanel renders both Send buttons via `t('game.chatPanel.send')`; no `Send` literal remains in the component (F2).
7. `use-ai-dm-store.ts` contains no hardcoded user-facing English: the timeout error, scene-prep fallback, DM-override message, and both sender names route through `i18n.t`; the five new keys exist in BOTH locales and in the regenerated `generated-keys.ts` (F1).
8. The end-spell broadcast reads `🛑 Spell ends: <name> (cast by <caster>).` and a test asserts it (F5).
9. End-of-phase 4-gate fully green; one phase commit + push per INSTRUCTIONS.md rule 5; plan moved to `completed/` per rule 8.

## Out of scope

- `game.chatPanel.tokens` "~{{used}} / 23,000 tokens" hardcoded cap → **PHASE-10** (token meter `{{max}}` interpolation).
- Hardcoded "Ollama" provider labels, status-bar unknown/paused semantics, provider-default model IDs → **PHASE-10**.
- MutationApprovalPanel's 12 unlabeled mutation types + their new en/es keys → **PHASE-04** (12B's enumeration only normalizes entity naming in whatever es strings exist at execution time).
- Travel-pace 2024-PHB wording alignment (`en.json:3020-3025`, prompt sections) and system-prompt bold contradiction → **PHASE-11**.
- i18n-izing the `postDmMessage` executor chat-log strings as a class (all of `services/game-actions/`) → deliberate executor convention, no phase owns a conversion; revisit only if the AI pipeline stops reading chat history in English.
- Hardcoded `senderName: 'System'` / `'You'` literals in `use-lobby-store.ts` (:270, :289, :350, :371, :407, :460) — same pattern as F1 but in an unallocated file; not flagged by the audit. If touched during execution, log to `docs/ISSUES-LOG-DNDAPP.md` per INSTRUCTIONS.md rule 12 instead of inline-fixing.

## Completed

*(Filled during execution per INSTRUCTIONS.md rule 17 — one line per sub-phase with file:line citations.)*
