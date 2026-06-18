# PHASE-41 — Dungeon Scholar: sealed/proctored tomes, full light theme, QA coverage round

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Ship the three remaining dungeon-scholar feature/QA items from the 2026-06-10 audit: (1) **F3 — sealed tomes for proctored exam prep**: a passphrase-encrypted tome variant (WebCrypto PBKDF2 → AES-256-GCM) whose question/answer content is unreadable in the repo, in `localStorage`, in the Supabase save row, in exports, and in share codes — unlockable in-memory only, with an in-app "seal & download" tool for proctors; (2) **QA16 — full light theme**: extend the partial light theme (body gradient + warmer-but-dark panels) to a genuinely light presentation by inverting the Tailwind v4 color-variable ramps under `html[data-theme="light"]` and tokenizing the recurring dark inline-style surfaces, while leaving the default dark theme byte-identical; (3) **Phase-30 QA coverage gaps**: convert the "couldn't test" list from the 2026-05-17 QA pass into automated vitest coverage where the flows are unit/component-testable (account deletion, offline recovery, 100+ tome library, devotion claim, ascension, Stable/Bestiary, tome deletion, delve setup) plus a checked-in manual QA checklist for the genuinely visual/interactive flows (responsive layouts, full delve run, real OAuth). Everything is opt-in or test-only: dark theme stays the default, normal (unsealed) tomes behave exactly as before, and no existing user flow changes unless the user seals a tome or picks the light theme.

## Dependencies & cross-phase notes

- **Depends on PHASE-39 (ds architecture)** — per PHASE-INDEX row 41. PHASE-39 splits `dungeon-scholar/src/App.jsx` (10,875 lines as of 2026-06-10) into `src/game/`, `src/features/{home,library,study,progression,quests,player,tutorial}/`, and `src/components/ui/`. Every `App.jsx:NNNN` citation in this plan is the **pre-split** location; PHASE-39's `## Completed` section records the relocation map (PHASE-39 plan, "Dependencies & cross-phase notes": *"QA16's inline `style={{…}}` sites disperse across `src/features/**` after the split; F3 sealed tomes touches the import flow (App shell handlers + `src/features/library/`). Same relocation-map note applies."*). **Before starting any sub-phase, read PHASE-39's Completed relocation map in `dnd-app/docs/phases/completed/PHASE-39-ds-architecture.md` and re-anchor every citation.** Where this plan names a post-split path (e.g. `src/features/library/ShareTomeModal.jsx`) that is the PHASE-39 target location; if 39 landed differently, follow 39's actual map.
- **PHASE-40 (ds PWA/cloud) runs before this phase** and touches `dungeon-scholar/src/hooks/usePlayerState.test.jsx` (L18 conflict tests), the App-shell import handlers (L14 size cap on `JSON.parse`), and `vite.config.js` (vite-plugin-pwa). Sub-phase 41B edits the same import handlers (sealed-tome acceptance) — apply the sealed check **after** 40's size-cap guard, not instead of it. Sub-phase 41G appends to `usePlayerState.test.jsx` — extend, never rewrite, the file 40 leaves behind. If PHASE-40 added a service worker, run `npm run build` after the theme sweep and confirm precache manifest generation still succeeds.
- **PHASE-18 (ds security round)** shipped 18G: a README "answer keys are not secret" section that explicitly points at F3/PHASE-41 as the future fix. Sub-phase 41C updates that exact README section to document sealed tomes as the now-available option. 18 also moved the Oracle endpoint behind `VITE_ORACLE_ENDPOINT` (M9) — the sealed-tome gate sits in front of all Oracle usage, no interaction.
- **PHASE-19 (ds a11y round)** added `useDialogA11y` + `role="dialog"` to `AccountPanel.jsx`. The new `AccountPanel.test.jsx` (41G) must render the post-19 component (Escape-to-close + aria attributes present); don't assert their absence.
- **PHASE-17 (ds bug round)** already added tests to `devotion.test.js` (17E `evaluateClaim` cases) and `persistence.test.js` (17F quota matrix) — 41G appends new describe blocks to those files, it does not touch the 17-era blocks.
- **No dnd-app or bmo code is touched.** The end-of-phase dnd-app 4-gate must pass trivially (rule 5); the dungeon-scholar gates are `npx vitest run` + `npm run build` (the package has **no lint config** — verified `ls -a dungeon-scholar` → no eslint/biome file, and `package.json` has no lint script).

## Verified findings

All verification commands below were run 2026-06-10 from the repo root against the live tree (worktree `ai-p6-roadmap`, branch master), pre-PHASE-39. Re-run them at execution time and re-anchor line numbers via PHASE-39's relocation map.

### F3-1 — Tome answer keys are plaintext at rest, end-to-end (basis for sealed tomes)

**Claim (verified + corrected).** Tomes are imported by the user via file picker, paste, or share code — they are *not* fetched from the bundle (the three sample tomes at the package root, `dungeon-scholar/tome-aws-clf-c02.json`, `tome-ccst-cybersecurity.json`, `tome-security-plus-sy0-701.json`, are never imported/fetched by `src/`). Once imported, the **complete tome JSON, including every answer key**, is stored as `playerState.library[].data` and persists in plaintext to `localStorage` (key `dungeon-scholar:save:v1`, `persistence.js:3,28-35`) and to the Supabase `saves` JSONB row via cloud sync. Anyone with DevTools (the student being proctored) can read every answer. **Correction to the audit:** the audit's file pointer "Files: `dungeon-scholar/src/services/persistence.js`, tome JSON schema" is loose — `persistence.js` needs **no changes** for F3 (it serializes whatever is in `playerState`; a sealed tome's library entry is already opaque). The real touch points are the import handlers, the library feature, and a new crypto service.

Answer-bearing fields (verified against all three sample tomes with `python3 -c "import json; ..."` key-union dump):

| Section | Public (question-side) fields | Answer-key fields |
|---|---|---|
| `metadata` | all (title, description, subject, difficulty, tags, version) | — |
| `flashcards[]` | `id`, `front`, `hint`, `objective` | `back` |
| `quiz[]` (types `multiplechoice`, `truefalse`, `fillblank`) | `id`, `type`, `question`, `options`, `hint`, `objective` | `correctIndex`, `correctAnswer`, `acceptedAnswers`, `explanation` |
| `labs[].steps[]` | `type`, `prompt`, `options` | `correctIndex`, `explanation`, `modelAnswer` |
| top level | — | `knowledge_base` / `knowledgeBase` (Oracle context — full course content) |

Key code anchors (pre-split `App.jsx` lines):
- `normalizeTomeData` — `App.jsx:1129-1136` (maps legacy `lab.stages` → `lab.steps`; sealed envelopes must bypass it).
- `addTomeToLibrary` — `App.jsx:2736-2785`; rejects tomes with empty `flashcards`/`quiz`/`labs` arrays (lines 2741-2747) — a sealed envelope has **no** plaintext arrays, so this check must branch.
- Import handlers — `handleImportFile` `App.jsx:2851-2872`, `handlePasteImport` `App.jsx:2874-2893`, `handleShareCodeImport` `App.jsx:2896-2908`; **all three** validate `if (!data.metadata || !data.flashcards)` and must accept sealed envelopes. Per PHASE-39's plan these handlers stay in the App shell.
- Share code — `encodeTomeShareCode`/`decodeTomeShareCode` `App.jsx:998-1021` (base64 JSON, `TOME-V1:` prefix); ShareTomeModal calls `encodeTomeShareCode(tome.data)` at `App.jsx:10073`. Because `tome.data` for a sealed entry *is* the envelope, share/export emit the sealed form with zero changes.
- Single consumption chokepoint — `const activeTome = useMemo(...)` `App.jsx:1636` and `const courseSet = activeTome?.data || null` `App.jsx:1642`. **Every study surface** (Flashcards, Quiz, Lab, Chat/Oracle at `App.jsx:6056,6194` reading `courseSet.knowledgeBase || courseSet.knowledge_base`, ExamMode, DungeonExplore, MistakeVault, DomainStudy) receives content from `courseSet`. Gating `courseSet` derivation gates everything.
- Grading consumers that need answers post-unlock (no changes needed once unlock yields the original object): `App.jsx:5293,5296-5297,5550,5634,5702,5947,6086`; `ExamMode.jsx:660-662`; `oracleGrader.js:11-37,66-67,83-122` (`expectedAnswer`/`acceptedAnswers` args).
- `deleteTome`/`renameTome`/`duplicateTome`/`updateTomeMetadata` — `App.jsx:2797-2851` — operate on the entry/`data.metadata` only; they work on sealed entries as-is (rename/metadata-edit touch the envelope's public metadata copy).

Verification commands:

```bash
cd dungeon-scholar
grep -rn "tome-aws\|tome-security\|tome-ccst" src/            # → no matches (samples not bundled)
grep -n "addTomeToLibrary\|normalizeTomeData" src/App.jsx | head
grep -n "data.metadata || !data.flashcards" src/App.jsx        # 3 import-handler guards
grep -n "const courseSet" src/App.jsx                          # single derivation site
python3 - <<'EOF'
import json
d = json.load(open('tome-security-plus-sy0-701.json'))
print(sorted({k for q in d['quiz'] for k in q}))               # correctIndex/correctAnswer/acceptedAnswers/explanation present
EOF
node -e "console.log(!!globalThis.crypto?.subtle)"             # → true (WebCrypto available in Node for vitest)
```

`globalThis.crypto.subtle` is available both in browsers (all modern) and in the Node runtime vitest uses (verified `true` on this machine, Node ≥20), so the crypto service is testable without polyfills. Vitest env is `happy-dom` (`vite.config.js:33`).

### F3-2 — Partial light theme exists; Tailwind v4 makes a full theme tractable (basis for QA16)

**Claim (verified + corrected).** The partial light theme shipped by phases 34b/35f/38g lives at `dungeon-scholar/src/index.css:57-106`: a `:root` block defining nine panel/mode-card custom properties (`--panel-bg-amber|red|emerald|purple|sapphire|rose`, `--panel-end`, `--modecard-bg-start|end`), light-mode body/`.dungeon-bg-root` overrides, overlay dimming (`.dungeon-bg-noise/vignette/corners` → `opacity: 0`), and warmer-but-still-dark panel values under `html[data-theme="light"]`. Theme preference is `playerState.theme` (`'dark' | 'light' | 'system'`, `App.jsx:1217-1218`), applied by an effect setting `data-theme` on `document.documentElement` (`App.jsx:1390-1410`, with `prefers-color-scheme` listener for `'system'`). The picker is `ThemePanel` (`App.jsx:4681-4719`; post-39: `src/features/home/ThemePanel.jsx`), whose copy explicitly describes the light variant as intentionally partial (comment `App.jsx:4676-4680`, footnote `4713-4717`, and a home-screen explainer at `App.jsx:3359`). `ModeCard` already consumes the vars via inline `var(--modecard-bg-start, …)` fallbacks (`App.jsx:4797-4800`) — the established pattern this phase generalizes.

**Corrections to the audit:**
1. The audit said `App.jsx` is 9,278 lines and the sweep is "~200–400 inline `style={{…}}` sites". Current measurements: `App.jsx` = **10,875 lines**; `style={{` occurs **409×** in `App.jsx` + **135×** in `src/components/*.jsx` (544 total); **833 lines** across `src/**/*.jsx` contain `rgba(`. The sweep is larger than the audit estimated — but see correction 2, which makes most of it unnecessary.
2. The audit's prescription ("extract ~200–400 inline style sites into CSS custom properties") predates a key enabler: **the project is on Tailwind CSS v4** (`tailwindcss: ^4.3.0`, `@import 'tailwindcss'` at `index.css:1`), and v4 emits every color utility as a reference to a generated CSS variable. Verified in the built bundle: `.text-amber-50{color:var(--color-amber-50)}` and `--color-amber-50:oklch(98.7% .022 95.277)` both present in `dist/assets/index-*.css`. Re-declaring `--color-amber-*` under `html[data-theme="light"]` re-themes **every** Tailwind color utility at once — no JSX edits — which is the officially documented v4 pattern (override the *generated* variables in plain CSS; `@theme` itself must stay top-level). Opacity-modifier utilities (e.g. `text-amber-100/70`) emit a static hex fallback **plus** a `color-mix(in oklab, var(--color-amber-100) 70%, transparent)` rule; every modern browser takes the `color-mix` rule, so the overrides propagate (verified both rules in dist CSS). Only the **inline** `rgba(...)` styles bypass the variables — and those decompose into a small set of recurring RGB triplets (see 41E inventory).
3. Palette families actually used (verified by grep, count of utility occurrences): amber 860, purple 148, emerald 116, red 106, sky 35, indigo 21, rose 14, stone 12, orange 9, yellow 4, zinc 2, cyan 2, blue 2, slate 1 — **14 families** need light-mode ramp overrides.

Verification commands:

```bash
cd dungeon-scholar
sed -n '57,106p' src/index.css                                  # partial theme block
grep -n "data-theme" src/App.jsx src/index.css
grep -c "style={{" src/App.jsx                                  # 409
grep -rnE "rgba\(" src --include="*.jsx" | wc -l                # 833
npm run build && grep -oE "\.text-amber-50\{[^}]*\}" dist/assets/index-*.css
#   → .text-amber-50{color:var(--color-amber-50)}
grep -roE '(text|bg|border|ring|from|to|via|outline|divide|shadow)-(amber|red|emerald|purple|blue|rose|stone|yellow|green|orange|pink|cyan|indigo|violet|sky|teal|lime|fuchsia|slate|gray|zinc|neutral)-[0-9]+' src/ \
  | cut -d: -f2- | sed -E 's/^[a-z]+-//' | cut -d- -f1 | sort | uniq -c | sort -rn   # family usage table
```

Also relevant: the focus indicator is hardcoded `#fde047` yellow with `!important` (`index.css:30-38`) and the skip-link is hardcoded `#fde047`/`#451a03` (`index.css:43-55`) — both fine on dark, low-contrast on a light page; they get tokens in 41D.

### F3-3 — Phase-30 QA "couldn't test" list: current per-flow automated-coverage status

The audit migrated this list verbatim from SUGGESTIONS-LOG-DUNGEON-SCHOLAR (info, 2026-05-17): *Delete Account flow; sign-in from signed-out state; offline-during-sync (RETRY_DELAYS_MS backoff + 'offline' flip); responsive 375/768px layouts; 100+ tomes load; Dungeon Delve full run (combat/curse/final-boss); Daily Devotion claim + Path of Ascension tokens; The Stable/Bestiary interactions; local-filesystem tome deletion.* Verified current state of each (2026-06-10):

| Flow | Code anchor | Existing automated coverage | Gap |
|---|---|---|---|
| Delete Account | `cloudSync.js:81-87` (`deleteAccount` deletes `saves` + `profiles` rows); `AccountPanel.jsx` `doDeleteAccount` (calls `deleteAccount` → `signOut` → `onAfterDeleteAccount` → `onClose`, `busy` guard) | `cloudSync.test.js` has 4 tests incl. `deleteCloudSave` (line 61) — **`deleteAccount` is untested**; `AccountPanel` has **no test file** | service test + component test |
| Sign-in from signed-out | `usePlayerState.js` sign-in branches | **Partially covered already (correction):** `usePlayerState.test.jsx:83` "sign-in branches (silent)" + `:210` "smart sign-in merge" describe blocks cover the hook-level transitions | only the real-OAuth UI flow remains → manual checklist |
| Offline-during-sync | `usePlayerState.js:26` `RETRY_DELAYS_MS = [1000, 4000, 16000]`; backoff loop `:124-145` (retry while `next < RETRY_DELAYS_MS.length`, then `setStatus('offline')` + reset counter); sign-in pull failures also flip `'offline'` at `:349` and `:393` | **Partially covered already (correction):** `usePlayerState.test.jsx:177` "retries on push failure with backoff and ends in 'offline'" | untested: **recovery** offline→saving→idle on next successful push; the `:349`/`:393` pull-failure flips |
| Responsive 375/768 px | CSS/Tailwind breakpoints | none (not unit-testable) | manual checklist |
| 100+ tomes load | `persistence.js` save/load, `semanticHashState` (`persistence.js:99-135`), library screen render | none at that scale | persistence + render tests at 120 tomes |
| Dungeon Delve full run | `DungeonExplore.jsx` (battle modal `:2278+`, run-end summary `:3510-3545`) | `DungeonExplore.test.js` (27 tests): map gen, biome, boss pools, `buildQuestionLogEntry` — no mounted-component coverage | setup-screen smoke test; full run → manual checklist |
| — curses | **Correction: the curse mechanic is vestigial.** The current delve always writes `modifiers: []` into the run-history entry (`DungeonExplore.jsx:3526`); nothing ever populates modifiers; the only other references are the run-history display (`App.jsx:6836-6837`) and the `cursed_run`/`double_curse` achievements (`App.jsx:922-923`), which are therefore **unreachable**. "Test curses" cannot be satisfied; log the dead achievements per rule 12 (see 41H) | n/a | n/a |
| Daily Devotion claim | `claimDailyReward` `App.jsx:1963-2016` — returns `{ok:false, reason}` on same-day re-claim; grants `gold/xp/devotion/items` from `DAILY_REWARDS[cycleDay-1]`; streak: `gap===1` continues, else resets to 1 | `devotion.test.js` (16 tests) covers the pure helpers (`todayDateStr`, `dayDiff`, `computeNextClaim`, 17E `evaluateClaim`) — the **claim handler itself** is untested | handler test via the post-39F `usePlayerActions` hook |
| Path of Ascension tokens | `ascend` `App.jsx:2024-2062` — gated `level ≥ 50` (`ASCENSION_LEVEL_REQ`), grants `+1 ascensionTokens`, resets level/xp/gold, keeps `ingredient`-category inventory, preserves `asc*`-prefixed + `petXpBonus/devoGoldPct/fullLoreOnFirst` permUpgrades, preserves achievements/titles/bestiary/pets/spellbook; token **spend** path: `purchaseItem` `App.jsx:1817-1893` (`usesTokens` branch for `category==='celestial'` + `ascensionPrice`, cap via `sanctumAtCap`) | none | ascend + celestial-purchase tests |
| The Stable / Bestiary | stable eggs in shop catalog `App.jsx:519-524` (`category:'stable'`, `petId`, auto-hatch in `purchaseItem` `:1863-1872`); `equipPet` `:1914`, `unequipPet` `:1929`; `recordBestiary` `:2111` (`{defeats, firstDefeatedAt}` per kind); `pets.js` helpers | `pets.test.js` (13 tests) covers catalog/level helpers only | purchase-hatch/equip/record tests |
| Local tome deletion | `deleteTome` `App.jsx:2797-2806` — filters library; if the active tome is deleted, re-points `activeTomeId` to `newLib[0].id` or `null` | none | deletion + active-reassignment tests |

Baseline (from PHASE-39's verified baseline, 2026-06-10): `cd dungeon-scholar && npx vitest run` → 24 files / 346 tests green (~28 s); `npm run build` ~1.1 s with one >500 kB chunk warning (PHASE-39H addresses the chunking). Re-baseline at execution start — phases 17/18/19/39/40 all add tests.

### F3-4 — Inline-style surface inventory (drives the 41E sweep)

The 833 `rgba(` lines decompose into a small recurring set (verified: `grep -rohE "rgba\([0-9]+, ?[0-9]+, ?[0-9]+, ?[0-9.]+\)" src --include="*.jsx" | sort | uniq -c | sort -rn`). Top values and their meaning:

| Count | Value | Role | RGB triplet token (41D) |
|---|---|---|---|
| 49 + 37 + 15 + 9 (+ more alphas) | `rgba(0,0,0,α)` | shadows/scrims/insets | `--ink-black` (keep dark in light mode — shadows/scrims work on light) |
| 46 + 13 + 9 + 9 | `rgba(10, 6, 4, α)` | near-black brown surface (deep panel/page end) | `--surface-deep` |
| 37 + 9 | `rgba(41, 24, 12, α)` | dark amber-brown surface (default panel/button bg) | `--surface-amber` |
| 41 + 35 + 30 + 22 + 9 + 8 | `rgba(245, 158, 11, α)` | amber-500 borders/glows | `--accent-amber` (unchanged in light) |
| 19 + 15 + 14 + 10 + 8 | `rgba(120, 53, 15, α)` (also unspaced `rgba(120,53,15,…)`) | amber-900 surface/active-button bg | `--surface-amber-strong` |
| 12 | `rgba(180, 83, 9, α)` | amber-700 border | `--accent-amber-deep` (unchanged) |
| 17 + 9 | `rgba(31, 12, 41, α)` | dark purple surface | `--surface-purple` |
| 15 / 12 + 11 | `rgba(126, 34, 206, α)` / `rgba(168, 85, 247, α)` | purple borders/glows | `--accent-purple*` (unchanged) |
| 10 + 9 | `rgba(6, 78, 59, α)` | dark emerald surface | `--surface-emerald` |
| 13 | `rgba(16, 185, 129, α)` | emerald-500 accent | unchanged |

So the inline-style problem reduces to flipping **five surface triplets** (`--surface-deep`, `--surface-amber`, `--surface-amber-strong`, `--surface-purple`, `--surface-emerald`) plus a handful of one-off dark surfaces (e.g. `rgba(20, 12, 6, 0.97)` modal panel in `AccountPanel.jsx`, the red/rose/sapphire panel variants already tokenized by 38g) — accent and shadow values read fine on both themes.

## Sub-phases

All paths below are under `dungeon-scholar/` unless prefixed. Convention reminders: no lint config — cheap gates are targeted `npx vitest run <file>` + `npm run build`; screen components are default exports (PHASE-39); carry existing `// Phase NN` comments forward when editing.

### 41A — `sealedTome.js` crypto service

**Objective:** a self-contained, tested service that seals (encrypts) and unseals (decrypts) a tome with a passphrase.

**Files (new):** `src/services/sealedTome.js`, `src/services/sealedTome.test.js`.

**Steps:**

1. Check whether PHASE-40 landed a reusable WebCrypto helper (its F5 work creates `src/services/notesCrypto.js` with PBKDF2 + AES-GCM). If a generic `deriveKey(passphrase, salt, iterations)` / base64 helper exists there, import and reuse it; otherwise implement locally (do **not** refactor notesCrypto mid-phase — local duplication of ~30 lines is acceptable and keeps the phases decoupled).
2. Implement `src/services/sealedTome.js`:

```js
// Sealed tomes (Phase 41 / audit F3). A sealed tome's entire study content
// (flashcards, quiz, labs, knowledge base) is AES-256-GCM-encrypted under a
// key derived from a proctor passphrase via PBKDF2-HMAC-SHA256. Only
// metadata (display info) and content counts stay public. Threat model:
// protects content at rest (repo, localStorage, Supabase row, exports,
// share codes) and from view-source; it does NOT protect against a user
// inspecting memory/React state while a tome is unlocked. Document this
// honestly (README, 41C).
export const SEAL_VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000; // OWASP PBKDF2-HMAC-SHA256 recommendation
const SALT_BYTES = 16;
const IV_BYTES = 12;

export function isSealedTome(data) {
  return !!(data && data.sealVersion === SEAL_VERSION
    && data.cipher && typeof data.cipher.ciphertext === 'string'
    && data.kdf && typeof data.kdf.salt === 'string');
}

export async function sealTome(tomeData, passphrase) { /* → envelope */ }
export async function unsealTome(envelope, passphrase) { /* → original tome object */ }
```

   - `sealTome`: validate `tomeData?.metadata` and a non-empty `flashcards`/`quiz`/`labs` union and `typeof passphrase === 'string' && passphrase.length >= 8` (throw `Error('weak-passphrase')` otherwise); refuse to double-seal (`if (isSealedTome(tomeData)) throw new Error('already-sealed')`). Generate `salt` (16 random bytes) and `iv` (12 random bytes) via `crypto.getRandomValues`. Derive the key: `crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])` → `crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])`. Encrypt `new TextEncoder().encode(JSON.stringify(tomeData))` with `crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)`. Return the envelope:

```js
{
  sealVersion: 1,
  metadata: { ...tomeData.metadata, sealed: true },          // public display copy
  sealCounts: {
    flashcards: (tomeData.flashcards || []).length,
    quiz: (tomeData.quiz || []).length,
    labs: (tomeData.labs || []).length,
  },
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: b64(salt) },
  cipher: { name: 'AES-GCM', iv: b64(iv), ciphertext: b64(new Uint8Array(ct)) },
}
```

   - `unsealTome`: validate with `isSealedTome`; rebuild the key from `envelope.kdf` (honor the **stored** `iterations` — forward-compat for future cost bumps); `crypto.subtle.decrypt`; `JSON.parse(new TextDecoder().decode(pt))`. AES-GCM authenticates — a wrong passphrase or tampered ciphertext rejects with `OperationError`; catch it and throw `new Error('wrong-passphrase')` so the UI shows one friendly message for both.
   - Base64 helpers must be chunk-safe for multi-MB tomes (`String.fromCharCode.apply` overflows the arg limit): encode in ≤0x8000-byte slices into a string, then `btoa`; decode via `atob` + byte loop.
3. Write `src/services/sealedTome.test.js` (vitest, async tests; reduce iterations is **not** allowed for the roundtrip test — at 600k it costs ~100-300 ms per derivation, acceptable; if total suite time grows >5 s, derive once in a `beforeAll` shared envelope):
   - roundtrip: `sealTome(sample) → unsealTome(envelope, pass)` deep-equals the input (use a realistic mini-tome with all three sections + `knowledge_base` + unicode in strings).
   - wrong passphrase → rejects with `wrong-passphrase`.
   - tamper: flip one base64 char of `ciphertext` → rejects (GCM auth).
   - secrecy: `JSON.stringify(envelope)` contains **none** of: a known `back` string, a known `explanation` string, a known `acceptedAnswers` entry, the `knowledge_base` text (the load-bearing F3 assertion).
   - `isSealedTome`: true for envelope; false for plain tome / null / `{sealVersion: 2}`.
   - `sealTome` rejects: short passphrase, already-sealed input, content-empty tome.

**Cheap checks:** `npx vitest run src/services/sealedTome.test.js`.

**Acceptance:** all new tests green; service has no imports from React/App code (pure, reusable from any layer).

### 41B — Import acceptance, library surfacing, and the unlock gate

**Objective:** sealed envelopes can be imported, appear in the library with a lock badge, and every study surface is gated behind an in-memory unlock.

**Files:** App shell (`src/App.jsx` — import handlers, `addTomeToLibrary`, `courseSet` derivation, screen switch); `src/features/library/LibraryScreen.jsx` (badge); **new** `src/features/library/SealedTomeGate.jsx` + `src/features/library/SealedTomeGate.test.jsx`. (All feature paths per PHASE-39's relocation map.)

**Steps:**

1. **Import acceptance.** In each of the three handlers (`handleImportFile`, `handlePasteImport`, `handleShareCodeImport`), change the validity guard from `if (!data.metadata || !data.flashcards)` to `if (!isSealedTome(data) && (!data.metadata || !data.flashcards))`. Keep PHASE-40's L14 size cap (if present) **before** the parse, untouched.
2. **`addTomeToLibrary`.** Branch at the top: if `isSealedTome(data)` — validate `data.metadata?.title` and `sealCounts` total > 0 (reject with the existing empty-tome notification otherwise), and store `data` **as-is** (skip `normalizeTomeData`, which would no-op anyway but keep intent explicit). The unsealed path is unchanged. The auto-activate / achievements logic applies to both.
3. **Unlock state.** In the App shell add `const [unsealedTomes, setUnsealedTomes] = useState({})` (`tomeId → decrypted tome object`). This state is **never** written into `playerState` (so it never reaches `localStorage`/Supabase — that is the security property; add a comment saying exactly that). Derivations, replacing `App.jsx:1642`:

```js
const activeSealed = !!(activeTome && isSealedTome(activeTome.data));
const courseSet = activeTome
  ? (activeSealed ? (unsealedTomes[activeTome.id] || null) : activeTome.data)
  : null;
const sealedLocked = activeSealed && !unsealedTomes[activeTome.id];
```

   Handlers: `unlockSealedTome = async (tomeId, passphrase)` → find entry, `await unsealTome(entry.data, passphrase)`, on success `setUnsealedTomes(prev => ({ ...prev, [tomeId]: tome }))` and return `{ok:true}`; on failure return `{ok:false, reason}` (no throw across the UI boundary). `lockSealedTome = (tomeId)` → delete the key (functional update). Also clear the entry inside `deleteTome` for the deleted id (hygiene).
4. **Gate chokepoint.** In the screen switch (`App.jsx:3342-3633` pre-split), before rendering any content-consuming screen (flashcards, quiz, lab, chat, exam, dungeon, mistakes, domain-study — i.e. any branch that reads `courseSet`), render `<SealedTomeGate …/>` when `sealedLocked`. Implement as a single wrapper around the switch result for those screens (one `if` before the switch, not per-branch edits). Home, library, shop, settings, calendar, etc. stay reachable while locked.
5. **`SealedTomeGate.jsx`.** Props: `{ title, onUnlock, onBack }`. Renders an `OrnatePanel` (import from `src/components/ui/` post-39B) with: lock icon + "This tome is sealed" heading, the tome title, a `type="password"` input (label "Proctor passphrase", `autoComplete="off"`), an Unlock button (busy state while awaiting), an error line on `{ok:false}` (`role="alert"`), and a "Return to library" button calling `onBack`. Follow PHASE-19's dialog conventions for focus (autofocus the input). Theme: use the existing panel var pattern (`var(--panel-bg-amber, …)`) so 41D/E require no rework here.
6. **Library badge + lock affordance.** In `LibraryScreen.jsx`, for entries where `isSealedTome(t.data)`: render a `🔒 Sealed` badge next to the title, and — when the tome is currently unlocked (pass `unsealedTomes` keys down or a `isUnlocked(tomeId)` prop) — a "Lock" button calling `lockSealedTome`. Sealed entries hide content-count stats that don't exist (`flashcards.length` reads must fall back to `data.sealCounts.flashcards` — sweep LibraryScreen for `t.data.flashcards|quiz|labs` reads; same for the home-screen mode-card subtitle counts if they read `courseSet` lengths, which are gated anyway).
7. **Tests** (`SealedTomeGate.test.jsx` + extend the App-level behavior via unit tests on the pieces): gate renders title + input; wrong passphrase shows error (mock `onUnlock` → `{ok:false, reason}`); success calls `onUnlock` with input value. Add to `sealedTome.test.js` an integration-style test: build an envelope, run the *import guard predicate* (`isSealedTome(data) || (data.metadata && data.flashcards)`) → true; and `decodeTomeShareCode(encodeTomeShareCode(envelope))` deep-equals the envelope — **if** those helpers moved to an importable module in PHASE-39 (they are module-scope in `App.jsx` pre-split; if still un-importable, replicate the 4-line base64 logic in the test with a comment citing the source lines).

**Cheap checks:** `npx vitest run src/services/sealedTome.test.js src/features/library` + `npm run build`.

**Acceptance:** importing a sealed envelope (file/paste/share-code) succeeds; opening any study mode on it shows the gate; correct passphrase unlocks (modes work, Oracle gets KB); refresh re-locks (state is memory-only); `localStorage` dump after import+unlock contains zero plaintext content strings (assert in test where feasible: `JSON.stringify(playerStateAfterImport)` lacks a known answer string); dark/normal tomes wholly unaffected.

### 41C — Proctor seal tool + documentation

**Objective:** a proctor can produce a sealed tome from inside the app, and the README documents the feature and its threat model.

**Files:** `src/features/library/ShareTomeModal.jsx` (post-39C location; contains `downloadTomeJson`), `README.md`, `src/features/library/ShareTomeModal.test.jsx` (new or extend).

**Steps:**

1. In `ShareTomeModal`, add a "Seal for proctored use" section (visible only when `!isSealedTome(tome.data)`): two password inputs (passphrase + confirm, min 8 chars, mismatch error), a one-line warning ("Keep this passphrase safe — sealed content cannot be recovered without it."), and a "Seal & download" button → `await sealTome(tome.data, passphrase)` → `downloadTomeJson(envelope, `${slug}-sealed.json`)`. Busy state during the ~0.1-0.3 s derivation. For already-sealed tomes render a static "This tome is sealed" note instead. **The library entry itself is not modified** — sealing is an export operation (proctor workflow: seal → distribute the file/share code → students import the sealed copy).
2. The share-code path needs no change (verified F3-1: `encodeTomeShareCode(tome.data)` emits whatever `data` is — for a sealed entry that's the envelope). Add a test asserting `encodeTomeShareCode`-equivalent encoding of an envelope round-trips (or reuse the 41B test).
3. `README.md`: locate the PHASE-18G section ("answer keys are not secret" / pointer to F3) — `grep -in "answer key\|proctor\|sealed" README.md` — and replace the "future work" sentence with a **Sealed tomes** subsection: what sealing does (PBKDF2-HMAC-SHA256 600k iterations → AES-256-GCM; content unreadable in the repo/localStorage/cloud/exports), the proctor workflow (Library → Share → Seal for proctored use), the unlock flow, and the honest limits paragraph (unlocked content is in page memory; a determined student with DevTools can read it during an unlocked session — sealing protects at rest and from casual inspection, it is not DRM; the passphrase is unrecoverable by design).

**Cheap checks:** `npx vitest run src/features/library` + `npm run build`.

**Acceptance:** seal→download→re-import→unlock loop works end-to-end (covered by tests at the service/guard level + the manual checklist entry in 41H); README section accurate; no change to unsealed-tome share/export.

### 41D — Light-theme foundation: ramp inversion + surface triplet tokens

**Objective:** all Tailwind color utilities and the recurring inline surfaces become light-mode-aware via CSS only; dark theme output stays byte-identical.

**Files:** `src/index.css`; **new** `src/theme.test.js`.

**Steps:**

1. **Generate the inverted ramps.** Build first (`npm run build`), then generate the override block from the *actual* emitted palette so values never drift from the Tailwind version in use:

```bash
cd dungeon-scholar && npm run build && node -e '
const fs = require("fs");
const file = fs.readdirSync("dist/assets").find(f => f.startsWith("index-") && f.endsWith(".css"));
const css = fs.readFileSync("dist/assets/" + file, "utf8");
const fams = ["amber","purple","emerald","red","sky","indigo","rose","stone","orange","yellow","zinc","cyan","blue","slate"];
const steps = [50,100,200,300,400,500,600,700,800,900,950];
const get = (f,s) => { const m = css.match(new RegExp(`--color-${f}-${s}:([^;}]+)`)); return m && m[1].trim(); };
let out = "html[data-theme=\"light\"] {\n";
for (const f of fams) for (let i = 0; i < steps.length; i++) {
  const v = get(f, steps[steps.length - 1 - i]);
  if (v && get(f, steps[i])) out += `  --color-${f}-${steps[i]}: ${v};\n`;
}
out += "}\n";
fs.writeFileSync("/tmp/light-ramps.css", out);
console.log("wrote /tmp/light-ramps.css");'
```

   This maps 50↔950, 100↔900, 200↔800, 300↔700, 400↔600, 500↔500 for the 14 used families (F3-2 correction 3). Note: only variables present in the built CSS are emitted (Tailwind v4 tree-shakes unused steps — if a step is missing for a family it isn't used, skip it). Paste the generated block into `index.css` under a clearly-commented `/* Phase 41 (QA16): full light theme — inverted color ramps. Generated from the built Tailwind palette; regenerate with the script in PHASE-41 plan if the Tailwind version changes. */` header, **below** the existing 38g block.
2. **Surface triplet tokens.** Add to the existing `:root` block (`index.css:71-81`):

```css
:root {
  /* Phase 41: RGB triplets for the recurring inline rgba() surfaces.
     Consumed as rgba(var(--surface-deep, 10, 6, 4), <alpha>). */
  --surface-deep: 10, 6, 4;
  --surface-amber: 41, 24, 12;
  --surface-amber-strong: 120, 53, 15;
  --surface-purple: 31, 12, 41;
  --surface-emerald: 6, 78, 59;
  --surface-modal: 20, 12, 6;
  --focus-ring: #fde047;
}
html[data-theme="light"] {
  --surface-deep: 250, 247, 240;        /* warm paper */
  --surface-amber: 254, 243, 198;       /* parchment (amber-100-ish) */
  --surface-amber-strong: 253, 230, 138;/* amber-200-ish */
  --surface-purple: 243, 232, 255;
  --surface-emerald: 209, 250, 229;
  --surface-modal: 255, 251, 235;
  --focus-ring: #b45309;                /* amber-700 — visible on light */
}
```

   Black (`rgba(0,0,0,α)`) and the accent triplets (245/158/11, 180/83/9, 126/34/206, 168/85/247, 16/185/129) deliberately get **no** token/flip — shadows, scrims, and mid-saturation accents read correctly on both themes.
3. **Update the 38g light panel values** (`index.css:96-106`): with text now flipping dark via ramp inversion, the "dark-ish panels" compromise inverts to light surfaces. Replace the light-mode `--panel-bg-*` values with light tints of each hue (e.g. `--panel-bg-amber: rgba(254, 243, 198, 0.85)`, `--panel-bg-red: rgba(254, 226, 226, 0.85)`, `--panel-bg-emerald: rgba(209, 250, 229, 0.85)`, `--panel-bg-purple: rgba(243, 232, 255, 0.85)`, `--panel-bg-sapphire: rgba(219, 234, 254, 0.85)`, `--panel-bg-rose: rgba(252, 231, 243, 0.85)`, `--panel-end: rgba(250, 247, 240, 0.9)`, `--modecard-bg-start: rgba(254, 243, 198, 0.85)`, `--modecard-bg-end: rgba(250, 247, 240, 0.95)`); update the surrounding 38g comment to note the Phase-41 full-theme change. Dark `:root` values untouched.
4. **Focus + skip-link tokens:** change `outline-color: #fde047 !important` (`index.css:35`) to `outline-color: var(--focus-ring, #fde047) !important`; tokenize the skip-link background/box-shadow similarly (`--focus-ring` + a `--skip-link-fg` if needed — keep the dark values as fallbacks).
5. **`src/theme.test.js`** (node-side, no DOM): read `src/index.css` with `fs`; scan `src/**/*.jsx` for the family-step utility regex (same as the F3-2 grep, via `fs.readdirSync` recursion); assert (a) every used `family-step` pair has a `--color-<family>-<step>:` declaration inside the `html[data-theme="light"]` block, (b) the light block declares all six `--surface-*` triplets and `--focus-ring`, (c) the `:root` block declares matching dark defaults. This pins the theme against future utility additions (a new `text-lime-300` usage fails the test until the ramp is added).

**Cheap checks:** `npx vitest run src/theme.test.js` + `npm run build` + `git diff --stat src/index.css` (only index.css + the new test change in this sub-phase).

**Acceptance:** theme test green; build green; **zero JSX changes** in this sub-phase; with `data-theme="dark"` (default) the computed values of every `--color-*` variable are unchanged (ramps only re-declared under the light selector).

### 41E — Inline-style sweep: surface triplets

**Objective:** the recurring dark inline `rgba()` surfaces consume the 41D triplets so they flip in light mode.

**Files:** every `.jsx` under `src/` containing the five surface triplets (post-39: App shell, `src/features/**`, `src/components/**` including `DungeonExplore.jsx`, `ExamMode.jsx`, `AccountPanel.jsx`, `MergeChooser.jsx`, `PromptModal.jsx`, `ProfileChip.jsx`, `SyncStatusDot.jsx`, `SignInButton.jsx`, and `src/components/ui/*` from 39B).

**Steps:**

1. Mechanical replacement per triplet, both spacing variants (verified both exist — e.g. `rgba(120, 53, 15, 0.4)` ×19 and `rgba(120,53,15,0.4)` ×10):

```bash
cd dungeon-scholar
for f in $(grep -rlE "rgba\((10, ?6, ?4|41, ?24, ?12|120, ?53, ?15|31, ?12, ?41|6, ?78, ?59|20, ?12, ?6)," src --include="*.jsx"); do
  sed -i -E \
    -e 's/rgba\(10, ?6, ?4,/rgba(var(--surface-deep, 10, 6, 4),/g' \
    -e 's/rgba\(41, ?24, ?12,/rgba(var(--surface-amber, 41, 24, 12),/g' \
    -e 's/rgba\(120, ?53, ?15,/rgba(var(--surface-amber-strong, 120, 53, 15),/g' \
    -e 's/rgba\(31, ?12, ?41,/rgba(var(--surface-purple, 31, 12, 41),/g' \
    -e 's/rgba\(6, ?78, ?59,/rgba(var(--surface-emerald, 6, 78, 59),/g' \
    -e 's/rgba\(20, ?12, ?6,/rgba(var(--surface-modal, 20, 12, 6),/g' \
    "$f"
done
```

   (`rgba(var(--x, 10, 6, 4), 0.95)` is valid CSS — a custom property's fallback may itself contain commas, and the substituted `10, 6, 4` joins the legacy comma syntax. The inline fallback keeps rendering identical if the var block ever regresses.)
2. Audit the diff (`git diff --stat`, then spot-read each file's hunks): revert any replacement inside a **non-CSS string context** (the sed targets `.jsx` inline styles and template strings used as styles — verify no replacements landed in e.g. canvas-drawing code in `DungeonExplore.jsx`; canvas `fillStyle` strings **cannot** resolve `var()` — check with `grep -n "fillStyle\|strokeStyle" src/components/DungeonExplore.jsx` and revert those lines to literals if hit).
3. Re-run the inventory (`grep -rohE "rgba\([0-9]+, ?[0-9]+, ?[0-9]+, ?[0-9.]+\)" src --include="*.jsx" | sort | uniq -c | sort -rn | head -30`) and confirm the five surface triplets no longer appear as raw literals (black + accent triplets remain, by design). Sweep the residual one-off **dark surface** values that sit behind text (anything with all RGB components < 60 used as `background` — e.g. `rgba(26,10,10,…)` variants if present): map each to the nearest existing token by hue.
4. `npm run build` + run the full ds vitest suite once here (cheap at ~30 s, and this is the highest-blast-radius sub-phase): `npx vitest run`.

**Cheap checks:** as in step 4; plus `grep -c "var(--surface-" src -r --include="*.jsx"` (expect ≈190+ replacements given the F3-4 counts).

**Acceptance:** dark-theme rendering is pixel-identical (every replacement keeps the original value as the var fallback AND the `:root` token equals the original literal); build + suite green; no canvas/string-context corruption.

### 41F — Theme polish: copy, comments, and contrast pass

**Objective:** the light theme is presented as full, with consistent UI copy and verified contrast on the highest-traffic surfaces.

**Files:** `src/features/home/ThemePanel.jsx` (post-39E; pre-split `App.jsx:4676-4719`), the home-screen partial-theme explainer (pre-split `App.jsx:3359` area), `src/index.css` (final adjustments only).

**Steps:**

1. Update `ThemePanel` copy: the `light` option desc → "Parchment-light pages, panels, and text. Full light theme."; delete/replace the "intentionally partial" comment block and the `ⓘ Light mode pairs an off-white page with warmer panel tints…` footnote with a one-liner ("Both themes restyle every screen; pick whichever reads best."). Update the `App.jsx:3359`-area round-5 explainer comment likewise.
2. Contrast pass (code-level, since there is no browser in the gate): for each of the ten most-used text utilities on light surfaces — `text-amber-50→(inverted)amber-950 on --surface-amber parchment`, `text-amber-100/70`, `text-amber-200`, `text-amber-300` (headings), `text-emerald-300`, `text-red-300`, `text-purple-300` — compute the inverted pair's contrast against the new light surface values (any WCAG contrast calculator; the inverted 300-step lands on `*-700` oklch values, all ≥4.5:1 on the parchment tints — verify, and where a pair computes <4.5:1, nudge the **light-block ramp value only** (e.g. point `--color-amber-300` at the 800-step value instead of 700) and note the exception in the index.css comment).
3. Re-run `src/theme.test.js` (it reads index.css afresh) + `npm run build`.

**Cheap checks:** `npx vitest run src/theme.test.js` + `npm run build`.

**Acceptance:** no user-facing copy claims the light theme is partial; documented contrast exceptions ≤ a handful; default theme remains `'dark'` (verify `DEFAULT_STATE` still initializes `theme: 'dark'` or absent-→dark via `playerState.theme || 'dark'` at the apply effect — do not change the default).

### 41G — Automated QA-gap coverage

**Objective:** every unit/component-testable flow from the Phase-30 QA gap list (F3-3 table) gains tests.

**Files:** `src/services/cloudSync.test.js` (extend), **new** `src/components/AccountPanel.test.jsx`, `src/hooks/usePlayerState.test.jsx` (extend), `src/services/persistence.test.js` (extend), `src/features/library/LibraryScreen.test.jsx` (new or extend per 39C), `src/features/player/usePlayerActions.test.jsx` (extend — created by 39F), `src/components/DungeonExplore.test.js` (extend).

**Steps (one bullet per gap; follow the existing mock patterns in each file):**

1. **`deleteAccount`** (cloudSync.test.js): using the file's existing supabase mock-builder pattern (see lines 1-60), assert `deleteAccount(userId)` issues `from('saves').delete().eq('user_id', id)` **and** `from('profiles').delete().eq('id', id)`; assert it throws when the saves-delete errors and when the profiles-delete errors (both `e1`/`e2` paths, `cloudSync.js:81-87`).
2. **AccountPanel component** (new test file): mock `../services/cloudSync.js`; render with a fake `user`, `syncStatus:'idle'`, and spies for `signOut`/`onAfterDeleteAccount`/`onAfterDeleteCloud`/`onClose`. Drive: delete-cloud confirm → `deleteCloudSave` called + `onAfterDeleteCloud`; delete-account confirm → `deleteAccount` + `signOut` + `onAfterDeleteAccount` + `onClose` in order; a rejected `deleteAccount` leaves the panel open (error path is `console.error` + busy reset — assert no `onClose`). Render against the post-PHASE-19 component (dialog role present).
3. **Offline recovery** (usePlayerState.test.jsx): extend the `:139` "steady-state cloud writes" block. (a) after the existing backoff-to-`'offline'` scenario, make `pushSave` resolve and trigger another state change → status walks `'saving'` → `'idle'` and sync-meta `dirty` clears; (b) sign-in pull failure: mock `pullSave` rejecting during the sign-in branch → status `'offline'` (covers `usePlayerState.js:349`/`:393`).
4. **100+ tomes** (persistence.test.js + LibraryScreen.test.jsx): build a 120-entry library (loop `makeTome(i)` with realistic per-tome progress); (a) `saveToLocalStorage`/`loadFromLocalStorage` round-trip preserves all 120 + `__schemaVer`; (b) `semanticHashState` is stable under key reordering and differs when one tome's `cardsReviewed` bumps; (c) render `LibraryScreen` with the 120-entry library → 120 rows render, clicking entry N fires the switch callback with its id.
5. **Devotion claim** (usePlayerActions.test.jsx): beyond 39F's double-claim-reject — a fresh claim grants `DAILY_REWARDS[cycleDay-1]` gold/xp/devotion and items into inventory, sets `lastClaimedDate` to today + `loginStreak`; a claim after `gap > 1` days resets `loginStreak` to 1 (drive dates via the same clock-mocking 17E used in devotion.test.js).
6. **Ascension** (usePlayerActions.test.jsx): `ascend()` below level 50 → `{ok:false}` + state unchanged; at level ≥50 → `ascensions`+1, `ascensionTokens`+1, level 1 / xp 0 / gold 0, inventory keeps only `ingredient`-category stacks, `permUpgrades` keeps only `asc*` + `petXpBonus`/`devoGoldPct`/`fullLoreOnFirst` keys, and `achievements`/`unlockedTitles`/`bestiary`/`pets`/`spellbook` survive (`App.jsx:2024-2062` semantics). Celestial spend: `purchaseItem('celestial_xp_font')` with 0 tokens → `{ok:false, reason:'Insufficient ascension tokens.'}`; with 1 token → token decremented, gold untouched, `permUpgrades.ascXpPct` += 25; at cap (`cap:4` → permUpgrades.ascXpPct = 100) → cap rejection (`App.jsx:1817-1893`, catalog `:563-568`).
7. **Stable/Bestiary** (usePlayerActions.test.jsx): `purchaseItem('wise_owl_egg')` with ≥300 gold → gold −300, inventory +1, `pets.wise_owl` created with `xp: 0` (auto-hatch, `App.jsx:1863-1872`); second purchase rejected (`oneTime`); `equipPet('wise_owl')` sets `equipped.pet`, `unequipPet()` clears it; `recordBestiary('skeleton')` → `{defeats:1, firstDefeatedAt}` then `recordBestiary('skeleton')` again → `defeats:2`, `firstDefeatedAt` unchanged.
8. **Tome deletion** (usePlayerActions.test.jsx or LibraryScreen.test.jsx, wherever `deleteTome` landed post-39): deleting a non-active tome leaves `activeTomeId`; deleting the active one re-points to the first remaining id; deleting the last sets `activeTomeId: null` (`App.jsx:2797-2806`).
9. **Delve setup smoke** (DungeonExplore.test.js): mount `<DungeonExplore onExit={vi.fn()} playerState={minimal} …optional props omitted (verified the component tolerates absent optional handlers, `DungeonExplore.jsx:2608-2628`)/>`; assert the setup screen renders the four difficulties with `apprentice` unlocked and `adept/master/mythic` locked for a level-1 state (`isUnlocked`, `DungeonExplore.jsx:2630-2641`). The full run (movement/combat/boss) stays manual — see 41H.

**Cheap checks:** `npx vitest run src/services/cloudSync.test.js src/components/AccountPanel.test.jsx src/hooks/usePlayerState.test.jsx src/services/persistence.test.js src/features/player src/components/DungeonExplore.test.js`.

**Acceptance:** all new tests green; no existing test modified (append-only); each F3-3 "gap" row marked automatable now has at least one test.

### 41H — Manual QA checklist + finding logs

**Objective:** the non-automatable flows from the QA gap list (plus the new sealed/light surfaces) live in a checked-in checklist; vestigial findings are logged.

**Files:** **new** `docs/QA-CHECKLIST.md` (under `dungeon-scholar/docs/`); repo-root `docs/ISSUES-LOG-DUNGEON-SCHOLAR.md` (rule-12 append).

**Steps:**

1. Write `dungeon-scholar/docs/QA-CHECKLIST.md` — dated 2026-06-10-set, organized per area, each item a checkbox with concrete steps + expected result. Must include, at minimum: responsive layout at 375 px and 768 px (header wrap, mode-card grid, exam timer visibility); sign-in via real GitHub OAuth from a signed-out browser; offline-during-sync with real network loss (DevTools offline → edit → watch `saving`→retries→`offline` → reconnect → recovery); Dungeon Delve full run on apprentice (movement, mob battle, elite, boss kill, run summary, Chronicle entry — note: **curses/modifiers are vestigial, nothing to test**); Daily Devotion claim across a real midnight boundary; Stable equip effects inside a delve (owl XP bonus, dragon shield); 100+-tome library scroll/switch responsiveness; local tome deletion incl. the active tome; **sealed-tome end-to-end** (seal → download → fresh profile import → gate → wrong passphrase → correct passphrase → study → refresh re-locks → localStorage inspection shows no plaintext); **light theme visual pass** over every screen (home, library, shop, all study modes, delve, exam, calendar, ascension, modals) checking for dark-on-dark/light-on-light artifacts.
2. Rule-12 log append to `docs/ISSUES-LOG-DUNGEON-SCHOLAR.md` (ISO-dated): the vestigial curse mechanic — `DungeonExplore.jsx` always records `modifiers: []` (line ~3526 pre-split), making the `cursed_run`/`double_curse` achievements (`App.jsx:922-923` pre-split) unreachable dead content; decision needed (reimplement run modifiers or remove the achievements). Do **not** fix inline — out of this phase's scope.

**Cheap checks:** none (docs only); `npx vitest run` once here as the pre-gate warm-up.

**Acceptance:** checklist file exists and covers every non-automated F3-3 row + the two new feature surfaces; issue logged.

## Research notes

- **PBKDF2 parameters.** OWASP's Password Storage Cheat Sheet recommends **600,000 iterations for PBKDF2-HMAC-SHA256** (https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html; adoption history in https://github.com/OWASP/ASVS/issues/1567). At 600k a derivation costs ~100 ms on modern consumer hardware — fine for a once-per-session unlock (background: https://dev.to/securebitchat/why-you-should-use-310000-iterations-with-pbkdf2-in-2025-3o1e). Argon2id is OWASP's first choice but has no WebCrypto implementation (would require a WASM dependency in a zero-backend static app) — PBKDF2 via native `crypto.subtle` is the right fit here. Store `iterations` in the envelope so future cost bumps don't break old files.
- **AES-GCM via SubtleCrypto.** Standard browser pattern (MDN: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt; worked example: https://github.com/bradyjoslin/webcrypto-example and https://bradyjoslin.com/posts/webcrypto-encryption/): 16-byte random salt, 12-byte random IV (GCM's standard nonce size), 256-bit key, `deriveKey` with `extractable:false`. GCM is authenticated — tampering or a wrong passphrase fails decryption with `OperationError`, giving tamper-evidence for free (the 41A tamper test relies on this).
- **Why whole-content encryption rather than answer-fields-only.** A fields-only split (public questions, encrypted answers) was considered and rejected: (a) for *proctored exam prep* the question bank itself is usually the controlled asset; (b) per-field surgery across three sections × three quiz types is far more error-prone than one ciphertext; (c) hashing answers instead of encrypting (grade-by-hash) is useless for multiple choice — 4 options brute-force instantly. One envelope + an unlock gate at the single `courseSet` chokepoint is both stronger and simpler.
- **Honest threat model.** Client-side sealing protects data **at rest** (repo, localStorage, Supabase JSONB, exports, share codes) and against view-source. It cannot stop a user from reading decrypted state out of memory/DevTools during an unlocked session — no client-only scheme can (the audit's "authenticated tome endpoint" alternative was rejected: dungeon-scholar is a static GitHub Pages app with no owned backend; a Supabase-stored tome behind RLS would still deliver plaintext to the same client). The README wording in 41C states this plainly.
- **Tailwind v4 theming.** v4 emits all design tokens as CSS custom properties and utilities reference them (`.text-amber-50{color:var(--color-amber-50)}` — verified in this project's dist). The documented pattern for per-selector theming is to override the *generated* variables in plain CSS under the scoping selector (`html[data-theme="light"] { --color-amber-50: …; }`) — `@theme` blocks themselves must remain top-level (https://tailwindcss.com/docs/theme; community pattern + gotchas: https://github.com/tailwindlabs/tailwindcss/discussions/15083; dark-mode variant docs: https://tailwindcss.com/docs/dark-mode; palette-as-variables: https://tailwindcss.com/docs/colors). Opacity modifiers compile to `color-mix(in oklab, var(--color-X) N%, transparent)` with a static fallback for pre-color-mix browsers — overrides therefore propagate in all modern browsers (verified in dist CSS).
- **Ramp inversion (50↔950 … 500↔500)** is the established "inverted scale" dark/light technique (cf. Radix Colors' paired scales). Generating the block from the built CSS (41D step 1 script) guarantees the values match the exact Tailwind version and survives upgrades by regeneration. The residual risk — a spot designed around a mid-ramp value looking odd inverted — is bounded by the 41F contrast pass and the 41H visual checklist.
- **RGB-triplet custom properties** (`rgba(var(--surface-amber), 0.85)`) keep the existing per-site alpha while flipping hue per theme — one token covers dozens of call sites with different alphas, and an inline fallback (`var(--x, 41, 24, 12)`) preserves dark rendering even if the CSS block regresses. Custom-property fallbacks may contain commas per spec, so the construct is valid CSS.
- **`var()` does not work in canvas `fillStyle`** — flagged explicitly in 41E step 2 because `DungeonExplore.jsx` draws to canvas; any sed hit inside drawing code must be reverted to a literal.

## Test plan

- **41A:** new `src/services/sealedTome.test.js` — roundtrip, wrong-passphrase, tamper (GCM), envelope-secrecy (no plaintext answers in serialized envelope), `isSealedTome` matrix, input validation (short passphrase / double-seal / empty tome).
- **41B:** new `src/features/library/SealedTomeGate.test.jsx` — render, error path, unlock callback; sealedTome.test.js gains the import-guard + share-code-roundtrip assertions.
- **41C:** `src/features/library/ShareTomeModal.test.jsx` (new or extended) — seal section visibility (unsealed only), passphrase mismatch error, seal→download invocation with envelope.
- **41D:** new `src/theme.test.js` — every used Tailwind family-step pair has a light override; surface triplets + focus-ring declared in both blocks.
- **41E:** no new test files; gates are the full ds suite + `npm run build` (run inside the sub-phase — highest blast radius).
- **41F:** theme.test.js re-run (reads index.css).
- **41G:** extensions/new files per its steps 1-9 (cloudSync, AccountPanel, usePlayerState, persistence, LibraryScreen, usePlayerActions, DungeonExplore).
- **41H:** docs only.
- **End of phase (INSTRUCTIONS.md rule 5):** the dnd-app 4-gate (`cd dnd-app && npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run`) — no dnd-app files are touched, so it must pass trivially — **plus** the dungeon-scholar gates: `cd dungeon-scholar && npx vitest run` (all green; baseline 346 + additions from phases 17/18/19/39/40 + this phase's ~35-45 new tests) and `npm run build` (succeeds). No Pi code touched → no pytest.

## Acceptance criteria

1. A tome sealed in-app downloads as a `*-sealed.json` envelope whose serialized form contains no flashcard backs, no quiz answers/explanations, and no knowledge-base text (test-asserted), with PBKDF2-HMAC-SHA256 ≥600k iterations + AES-256-GCM parameters recorded in the envelope.
2. Sealed envelopes import via all three paths (file, paste, share code), show a `Sealed` badge in the library, gate every content-consuming screen behind a passphrase, unlock in-memory only (a page refresh re-locks; `playerState`/localStorage/cloud never hold plaintext), and re-lock on demand.
3. Unsealed tomes, exports, and share codes behave byte-identically to pre-phase behavior.
4. README documents sealed tomes (workflow + honest threat model), replacing the PHASE-18G "wait for F3" pointer.
5. With `data-theme="light"`: Tailwind color utilities render from inverted ramps, recurring inline dark surfaces render from flipped triplet tokens, panels/mode-cards use light tints, and the focus ring is visible — while `data-theme="dark"` output is unchanged (fallbacks + untouched `:root` values) and `'dark'` remains the default preference.
6. `src/theme.test.js` enforces light-override completeness for every color utility used in `src/`.
7. No user-facing copy describes the light theme as partial.
8. Every automatable row of the Phase-30 QA gap list has green tests (deleteAccount service+component, offline recovery + pull-failure flips, 120-tome persistence/render, devotion claim, ascend + celestial token spend, stable purchase/equip + bestiary record, tome deletion incl. active-reassignment, delve setup smoke); `dungeon-scholar/docs/QA-CHECKLIST.md` covers the rest plus the two new feature surfaces.
9. The vestigial curse/modifier finding is logged in `docs/ISSUES-LOG-DUNGEON-SCHOLAR.md`.
10. End-of-phase gates green: dnd-app 4-gate (trivially) + ds `npx vitest run` + ds `npm run build`.

## Out of scope

- App.jsx feature-module split, hash router, code splitting — **PHASE-39** (prerequisite, already landed).
- PWA/offline-first, encrypted per-tome **notes** (F5 `notesCrypto.js`), cloudSync conflict tests (L18), defensive copies (L15), import size cap (L14), AudioContext close (L8) — **PHASE-40**.
- README answer-key disclosure as a standalone item (L10) — landed in **PHASE-18** (18G); this phase only updates that section's forward pointer.
- Modal a11y wrapper, color-only feedback, reduced motion, aria-live, tap targets — **PHASE-19**.
- Oracle endpoint env-var, CSP, logger, RLS check — **PHASE-18**.
- Reimplementing (or removing) the dead curse/modifier mechanic and its two achievements — logged for triage in 41H, owned by a future round.
- Any dnd-app or bmo work.

## Completed

Executed 2026-06-17/18 on PHASE-39's module split + PHASE-40's crypto. Gate: `npm run build` exit 0 (PWA assets emitted), `npx vitest run` **570 passing** (was 526 pre-phase). No lint gate for ds; `deploy.yml` (test + build) is authoritative. No dnd-app/bmo files touched (the plan move is docs-only).

- **41A — `sealedTome.js`.** NEW self-contained `src/services/sealedTome.js`: `SEAL_VERSION`/`PBKDF2_ITERATIONS=600_000`, chunk-safe base64, `isSealedTome`, `sealTome` (→ envelope `{sealVersion,metadata,sealCounts,kdf,cipher}`; guards `already-sealed`/`empty-tome`/`weak-passphrase`), `unsealTome` (`wrong-passphrase`/`not-sealed`). 13 tests incl. the F3 secrecy assertion (envelope JSON holds no answer/explanation/KB text). Guard order corrected so `already-sealed` is reachable.
- **41B — import + unlock gate.** Import guards in all three handlers accept `isSealedTome(data)`; `addTomeToLibrary` (in the `usePlayerActions` hook) branches on sealed (validates `sealCounts` total, stores as-is). App.jsx: memory-only `unsealedTomes` state (never written to playerState → never to localStorage/cloud), `activeSealed`/`courseSet`/`sealedLocked` derivation, `unlockSealedTome`/`lockSealedTome`, a prune effect, and the gate chokepoint (8 content screens: flashcards/quiz/lab/chat/practiceExam/dungeon/vault/domainStudy). NEW `SealedTomeGate.jsx` (OrnatePanel + passphrase + error). LibraryScreen 🔒 badge + `sealCounts` fallback for count reads. 20 tests (gate + sealedTome secrecy).
- **41C — proctor seal tool + docs.** `ShareTomeModal.jsx` "Seal for proctored use" section (passphrase+confirm ≥8, busy state, `sealTome` → `downloadTomeJson(envelope, {suffix:'-sealed'})`; already-sealed → static note; library entry unchanged). README "Sealed tomes" subsection (PBKDF2/AES-GCM, proctor + student workflow, honest at-rest-not-DRM threat model). 5 tests (real AES-GCM, asserts envelope has no plaintext + correct filename).
- **41D — light-theme foundation.** `index.css` only (+ NEW `theme.test.js`): 73 `--color-*` light overrides generated from the BUILT Tailwind palette (50↔950 inversion, 14 families), six `--surface-*` triplets + `--focus-ring` (dark `:root` + `html[data-theme="light"]`), 38g panel values flipped to light tints, focus/skip-link tokenized. Zero JSX changes; dark `:root` byte-identical. `theme.test.js` (8 cases) pins light-override completeness for every color utility used in `src/`.
- **41E — inline-style sweep.** 45 `.jsx` swept: the six surface triplets → `rgba(var(--surface-X, <orig>), α)` (393 occurrences). Each keeps the original literal as the var fallback → dark renders pixel-identical. No canvas `fillStyle`/`strokeStyle` touched (audited DungeonExplore). Build + full suite green inside the sub-phase.
- **41F — theme polish.** `ThemePanel.jsx` copy → "Full light theme"/"Both themes restyle every screen"; App.jsx home-screen Light-switch intro updated; default stays `theme:'dark'`. theme.test re-green.
- **41G — QA-gap coverage.** +36 tests across `cloudSync.test.js`/new `cloudSync.deleteAccount.test.js`, new `AccountPanel.test.jsx`, `usePlayerState.test.jsx` (offline recovery + pull-failure), `persistence.test.js` + new `LibraryScreen.test.jsx` (120-tome round-trip/hash/render), `usePlayerActions.test.jsx` (devotion claim, ascension + celestial spend, stable/bestiary, tome deletion), `DungeonExplore.test.js` (delve-setup via the `isDifficultyUnlocked` predicate — full canvas mount impractical). Found + logged (rule 12, Low) that celestial/devotion item caps aren't enforced (`sanctumCount` short-circuits non-sanctum to 0) — real-behavior-locked in the test, not fixed inline.
- **41H — manual checklist + log.** NEW `dungeon-scholar/docs/QA-CHECKLIST.md` (responsive/OAuth/offline/full-delve/devotion-midnight/100+-library/sealed-e2e/light-theme visual pass). Logged the vestigial curse/modifier mechanic (`cursed_run`/`double_curse` unreachable) in `docs/ISSUES-LOG-DUNGEON-SCHOLAR.md` (Low; decision: reimplement modifiers or remove the achievements).
