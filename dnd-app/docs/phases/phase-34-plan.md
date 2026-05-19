# Phase 34 — Internationalization (i18n) foundation + full sweep

Phase 34 wires i18n into the dnd-app renderer end-to-end. Every user-visible string moves through `t('key', { values })`. A baseline English locale ships with the app. Future locales drop in as JSON files. A lint rule prevents new untranslated strings from ever landing.

This is the **full sweep**, not a no-op `t()` placeholder. Every string in the renderer — lobby, game UI, character builder, character sheet, level-up, settings, library, campaign, AI DM prompts, toasts, error messages — moves into the locale registry.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 34 is entirely client-side. No Raspberry Pi involvement (BMO's own UI strings are already English-only; cross-domain i18n is out of scope).

**New files / structure:**

```
src/renderer/src/i18n/
├── index.ts                — initialization + provider setup
├── config.ts               — i18next configuration
├── use-translation.ts      — typed wrapper around useTranslation
├── types.ts                — TypeScript types for the key namespace
└── locales/
    └── en.json             — baseline English locale (the sweep populates this)
```

**Touched files:** every `.tsx` file under `src/renderer/src/components/` and every UI-string-producing module under `src/renderer/src/services/`, `src/renderer/src/hooks/`, `src/renderer/src/stores/` (where strings flow back to UI).

### Raspberry Pi (`patrick@bmo`) — NO WORK THIS PHASE

---

## 📋 Core Objectives

| # | Sub-phase | Theme | Scope |
|---|-----------|-------|-------|
| 34a | i18n foundation | Setup | Install i18next + react-i18next, build the i18n module, ship the empty en.json baseline, mount the provider at App root |
| 34b | Sweep — Lobby + Join + Public registry | Strings | Wrap every visible string in the lobby + join + public-game-list flow |
| 34c | Sweep — In-game core UI (HUD, chat, bottom bar, top bar, side panels) | Strings | The most user-traffic surface |
| 34d | Sweep — Map + initiative + tokens + drawing tools | Strings | DM-heavy controls + the table content |
| 34e | Sweep — Character builder | Strings | All ~12 builder steps |
| 34f | Sweep — Character sheet | Strings | All sheet sections + magic-items + attunement + death saves + spell book |
| 34g | Sweep — Level-up flow | Strings | Every step, ASI / feat picker, subclass picker, spell selection |
| 34h | Sweep — Settings + Library + Campaign management + Bastion | Strings | All page-level UIs |
| 34i | Sweep — AI DM prompts + system messages + chat commands | Strings | The AI surface (note: AI prompts that feed Claude stay in English — translations are for the player-facing wrapper text only) |
| 34j | Sweep — Toasts + tooltips + aria-labels + error messages | Strings | The remaining inflection points (toast helper, tooltip helper, error boundaries) |
| 34k | Lint rule + CI gate | Enforcement | Biome rule forbidding new untranslated JSX text + CI step that fails on violations |
| 34l | Tests + docs | Verification | Vitest suite covering t() behavior, missing-key fallback, interpolation, pluralization; CONTRIBUTING + AGENTS + CLAUDE.md docs |

12 sub-phases. Each ends with the 4-gate suite. One release at end.

**Locale strategy:** ship English-only at first. The foundation supports additional locales as drop-in JSON files. No translation work is in scope for Phase 34 — that's a future per-language phase once the foundation lands.

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Foundation (34a)

**Step 1 — Install dependencies**
- Add to `dnd-app/package.json` dependencies:
  - `i18next@^23.x` — i18n engine
  - `react-i18next@^14.x` — React bindings
  - `i18next-resources-to-backend@^1.x` — locale JSON loading (lazy load locales on demand)

**Step 2 — Create `src/renderer/src/i18n/config.ts`**
- i18next config:
  - `fallbackLng: 'en'`
  - `defaultNS: 'common'`
  - Lazy load: `import(\`./locales/${lng}.json\`)`
  - Interpolation: escapeValue: false (React already escapes)
  - Pluralization: true (i18next default plural rules)
- Initialize i18next on app start.

**Step 3 — Create `src/renderer/src/i18n/index.ts`**
- Export `initI18n()` called from `main.tsx` before React renders.
- Export `<I18nProvider>` wrapping `useTranslation` from react-i18next.

**Step 4 — Create the typed `useT()` wrapper**
- `src/renderer/src/i18n/use-translation.ts`:
  ```ts
  import { useTranslation as useReactI18nextTranslation } from 'react-i18next'
  import type { TranslationKeys } from './types'

  export function useT() {
    const { t, i18n } = useReactI18nextTranslation()
    return {
      t: (key: TranslationKeys, values?: Record<string, unknown>) => t(key as string, values),
      lng: i18n.language,
      changeLng: i18n.changeLanguage,
    }
  }
  ```
- TypeScript-typed keys come from `types.ts` (a literal union generated from `en.json` — script in 34k).

**Step 5 — Mount the provider**
- In `src/renderer/src/main.tsx`, wrap `<App />` in the i18n provider (or initialize i18next so react-i18next's automatic provider works).

**Step 6 — Seed baseline `en.json`**
- New file `src/renderer/src/i18n/locales/en.json` with the namespace skeleton:
  ```json
  {
    "common": {
      "actions": { "save": "Save", "cancel": "Cancel", "close": "Close", "delete": "Delete", "confirm": "Confirm" },
      "states": { "loading": "Loading...", "empty": "No results", "error": "Something went wrong" }
    }
  }
  ```
- Sweep sub-phases (34b–34j) populate this file incrementally.

**Step 7 — Add a sentinel use case**
- Wire one trivial string (e.g., the app's window title) through `useT()` and confirm it renders.

**Acceptance:**
- App boots; the sentinel string renders from `en.json`.
- TypeScript build succeeds.
- Vitest runs; one new spec confirms `t('common.actions.save')` returns "Save".

---

### Sub-Phase B: Lobby + Join + Public registry sweep (34b)

**Step 8 — Inventory strings**
- Open every file under `src/renderer/src/components/lobby/` + `src/renderer/src/pages/JoinGamePage.tsx` + `src/renderer/src/pages/LobbyPage.tsx`.
- Build a list of every user-visible string (JSX text nodes, `aria-label`, tooltip `title`, button labels, toast messages).

**Step 9 — Add keys to `en.json`**
- Group under a `lobby` namespace:
  ```json
  "lobby": {
    "title": "Lobby",
    "join": { "button": "Join", "characterPicker": "Select character" },
    "publicGames": { "title": "Public games", "empty": "No public games right now" },
    ...
  }
  ```

**Step 10 — Replace strings in JSX**
- Per file: `import { useT } from '@renderer/i18n/use-translation'`; replace `"Public Games"` with `t('lobby.publicGames.title')`.
- Aria-labels and tooltips: same pattern.

**Step 11 — Lobby toasts + system messages**
- Strings used in `addSystemMessage(...)` or toast helpers — same pattern.

**Acceptance:**
- Every visible string in the lobby flow is sourced from `en.json`.
- App still renders identically.
- Vitest runs without missing-key warnings.

---

### Sub-Phase C: In-game core UI sweep (34c)

**Step 12 — Top bar + bottom bar**
- `src/renderer/src/components/game/top/*` (DM controls, scene name, etc.)
- `src/renderer/src/components/game/bottom/*` (PlayerBottomBar, DMAudioPanel, ChatPanel, DiceTray)

**Step 13 — Chat panel + chat commands help text**
- `src/renderer/src/components/game/bottom/ChatPanel.tsx`
- Slash command help text in `services/chat-commands/*` (the `/help` output strings)

**Step 14 — HUD overlays**
- `src/renderer/src/components/game/overlays/*.tsx` — initiative overlay, lair action prompt, narration banner, turn notifications, settings dropdown, view mode toggle, reaction prompts, game prompts, action economy bar

**Step 15 — Side panels (sidebar / right-rail)**
- `src/renderer/src/components/game/sidebar/*`
- DM tools panels

**Acceptance:**
- Every visible string in the in-game core UI is sourced from `en.json`.
- HUD overlays, chat slash-command help, initiative overlay all render correctly.

---

### Sub-Phase D: Map + initiative + tokens + drawing sweep (34d)

**Step 16 — Map controls (DM toolbar, drawing tools, fog controls, pin creation, EmptyCellContextMenu, TokenContextMenu)**
- Strings: tool labels, tooltips, confirm dialogs, error toasts on bad input.

**Step 17 — Initiative tracker UI**
- Beyond the overlay header text — the per-entry buttons, status pills, NPC HP display labels.

**Step 18 — Pin creation flow + future pin renderer (forward-compat)**
- Step 16B carry-over strings: label prompts, icon picker labels, journal/NPC link buttons.

**Acceptance:**
- All map-area strings localized.
- DM and player views render identically to before.

---

### Sub-Phase E: Character builder sweep (34e)

**Step 19 — Builder step headings + descriptions**
- Each of the ~12 builder steps has a heading + intro paragraph. All into `builder.steps.<id>.title` / `.description`.

**Step 20 — Form labels + placeholders + help text**
- Every `<label>` text, every `placeholder=`, every helper paragraph.

**Step 21 — Validation error messages**
- "Name required", "ASI total exceeds budget", etc.

**Step 22 — Builder modal copy (library deep-link, summary review)**

**Acceptance:**
- Every builder string localized.
- Builder flow round-trips a character without crashing.

---

### Sub-Phase F: Character sheet sweep (34f)

**Step 23 — Sheet section headings (Abilities, Skills, Saves, Combat, Spells, Equipment, Magic Items, Attunement, Conditions, Death Saves, Inspiration, Notes, Backstory)**

**Step 24 — Inline labels and helper text**

**Step 25 — Tooltips on every modifier / value (already partial — extend to all)**

**Step 26 — Magic-item and spell-card UI**

**Step 27 — Attunement tracker + death-saves UI**

**Step 28 — Notes / journal entry creation**

**Acceptance:**
- Every sheet string localized.
- Sheet renders identically across all character types.

---

### Sub-Phase G: Level-up flow sweep (34g)

**Step 29 — Wizard step headings + intro copy**

**Step 30 — ASI / feat picker labels + tooltips + waste warnings**

**Step 31 — Subclass picker descriptions + selection summary**

**Step 32 — Spell selection: known/prepared/swapped counts, "you must pick N more"**

**Step 33 — HP roll section labels + "use average" toggle**

**Acceptance:**
- Every level-up string localized.
- Level-up wizard completes successfully end-to-end.

---

### Sub-Phase H: Settings + Library + Campaign management + Bastion sweep (34h)

**Step 34 — SettingsPage sections (Display, Theme, Audio, Microphone, Network, Updates, Reset)**

**Step 35 — LibraryPage (search, filters, categories, detail panel, homebrew creation modal)**

**Step 36 — CampaignDetailPage + CampaignWizard + AI provider setup**

**Step 37 — Bastion UI (facilities, services, hirelings, rooms) if surface exists**

**Acceptance:**
- Every page-level string localized.

---

### Sub-Phase I: AI DM prompts + system messages + chat commands sweep (34i)

**Step 38 — Player-facing AI wrapper text**
- "AI DM is thinking...", "AI DM is narrating...", error fallback messages
- Note: prompts SENT TO Claude stay in English (Claude is English-trained). Only the wrapper UI around them gets translated.

**Step 39 — System chat messages (kicked, joined, color confirmed, etc.)**

**Step 40 — Slash command output text**
- `/help`, `/roll`, `/whisper`, `/sound`, etc. — every line of output text routed through `t()`.

**Acceptance:**
- Every player-facing AI / system / slash-command string localized.
- AI prompts to Claude remain in English.

---

### Sub-Phase J: Toasts + tooltips + aria-labels + error messages sweep (34j)

**Step 41 — Centralize toast helper**
- `useToast()` hook — every consumer passes a key + values, not a raw string.
- This is the biggest sweep — ~50+ toast call sites.

**Step 42 — Tooltip helper / Tooltip component**
- Every `<Tooltip>` consumer uses keys.

**Step 43 — Aria-labels everywhere**
- Every icon-button's `aria-label=`.
- Drift from baseline 67 → 152 already; bring to full coverage as part of the sweep.

**Step 44 — Error boundary fallback text**
- `<ErrorBoundary fallback={...}>` consumers get translated fallback copy.

**Step 45 — Validation error messages from zod / form libraries**
- Any user-visible error text from validators.

**Acceptance:**
- Every toast, tooltip, aria-label, and error message is keyed.
- `grep -rE '"[A-Z][^"]+"' src/renderer/src/components --include='*.tsx' | wc -l` drops dramatically (most remaining hits are CSS class strings, file paths, code identifiers).

---

### Sub-Phase K: Lint rule + CI gate (34k)

**Step 46 — Author Biome rule (or grep-based pre-commit hook)**
- The rule should flag:
  - JSX text nodes containing English words not wrapped in `t()` (e.g., `>Hello<` outside a translated component).
  - String literals in `aria-label=`, `title=`, `placeholder=` props that look like sentences (have spaces + a capital letter).
- The rule should NOT flag:
  - CSS class strings, technical identifiers, numbers, dice notation, file paths.
- Allowlist: explicit `// i18n-allow` comments for places where untranslated strings are intentional (technical UI like `0/3` counters, code blocks).

**Step 47 — Generate the typed key union**
- Script `scripts/i18n/generate-types.mjs`:
  - Walks `src/renderer/src/i18n/locales/en.json`
  - Emits a TypeScript union of every key path as `src/renderer/src/i18n/types.ts`
- Wire into `npm run prepare` or as a pre-commit step so `types.ts` stays current.

**Step 48 — Missing-key audit script**
- `scripts/i18n/find-missing-keys.mjs`:
  - Scans the codebase for `t('...')` usages
  - Cross-references against `en.json`
  - Fails if any key isn't defined.
- Wire into `check:full`.

**Step 49 — Unused-key audit script**
- Inverse of the above: every key in `en.json` must be used somewhere in source. Flags dead keys.

**Step 50 — CI integration**
- `dnd-app-ci.yml` runs lint + missing-key + unused-key checks.

**Acceptance:**
- Lint rule catches new untranslated strings in a sample PR.
- `npm run check:full` fails when keys are out of sync.

---

### Sub-Phase L: Tests + docs (34l)

**Step 51 — Vitest spec for i18n core**
- `src/renderer/src/i18n/i18n.test.ts`:
  - `t()` returns the English string from `en.json`
  - Missing key falls back to the key string itself
  - Interpolation `t('greeting', { name: 'Bob' })` produces "Hello Bob"
  - Pluralization: `t('item.count', { count: 1 })` vs `count: 2`

**Step 52 — Round-trip integration test**
- A sample component using `useT()` renders correctly in a vitest render test.

**Step 53 — CONTRIBUTING + AGENTS + CLAUDE.md docs**
- New "i18n" section in CONTRIBUTING.md:
  - "All user-visible strings go through `t()`"
  - "Add new keys to `src/renderer/src/i18n/locales/en.json`"
  - "Run `npm run i18n:check` before committing"
- AGENTS.md: mirror the rule under "When adding renderer files".
- CLAUDE.md: under "When adding new dnd-app files".

**Step 54 — README mention**
- Brief note in `dnd-app/README.md` that the app is i18n-ready, that English is the only shipped locale, and how to add a new locale.

**Acceptance:**
- All i18n test specs pass.
- Docs cover the contribution path.
- A new contributor can add a string + key without prompting.

---

## ⚠️ Constraints & Edge Cases

### Foundation
- **i18next + react-i18next, not a custom abstraction.** Use the standard ecosystem; future locales drop in as JSON files without code changes.
- **Locales load lazily.** English ships with the app bundle; other locales load on demand. Don't bundle every language eagerly.
- **Initialize before React renders.** `initI18n()` must complete before `<App />` mounts, otherwise the first render flickers untranslated text.

### Sweep
- **Don't auto-extract keys.** Manual key naming matters — semantic keys (`lobby.publicGames.empty`) age better than positional ones (`lobby.string_0042`). The sweep is hand-curated, not codemod-generated.
- **Plural and gender handling.** Use i18next plural rules from day one — `t('item.count', { count: n })` is the only call shape. Don't hand-roll `n === 1 ? 'item' : 'items'`.
- **Preserve formatting context.** Inline JSX like `<b>{count}</b> items` becomes `<Trans i18nKey="..." values={{ count }} components={{ b: <b /> }} />` — use react-i18next's `<Trans>` component, not string concatenation.

### AI prompts
- **Prompts sent to Claude stay in English.** Claude is English-trained; translating the prompt template degrades responses. ONLY the player-facing wrapper UI text gets translated.
- **AI responses are passed through unchanged.** If Claude is asked to respond in French, that's a different feature (locale-aware AI prompting); not Phase 34's scope.

### Lint rule
- **Allowlist must stay narrow.** Technical strings (file paths, identifiers, numbers, dice notation, code blocks) are the only intentional exceptions.
- **Allowlist comments must reference the reason.** `// i18n-allow: dice notation` not bare `// i18n-allow`.
- **CI must fail PRs that add untranslated strings.** Without enforcement, the sweep regresses within weeks.

### Performance
- **No render-loop regression.** `useTranslation` from react-i18next is already memoized; verify per-component re-renders don't spike.
- **Lazy-load locales.** Loading additional locales must not block the main thread.

---

## 🎯 Verification — end-to-end test plan

After **34a**: app boots, sentinel string renders from `en.json`, TypeScript typed-key union compiles.

After **34b**: lobby + join + public registry all rendered through `t()`. Tests confirm no untranslated strings remain.

After **34c**: in-game core UI (top bar, bottom bar, chat, HUD overlays) all keyed.

After **34d**: map controls + initiative + drawing tools all keyed.

After **34e**: character builder end-to-end flow shows keyed strings.

After **34f**: character sheet renders keyed labels across every section.

After **34g**: level-up wizard completes with all strings keyed.

After **34h**: settings + library + campaign management + bastion all keyed.

After **34i**: player-facing AI wrapper, system messages, slash command output all keyed. Claude prompts remain English.

After **34j**: every toast, tooltip, aria-label, error message keyed.

After **34k**: lint rule + missing-key + unused-key checks pass on `check:full`. Sample PR with an untranslated string fails CI.

After **34l**: vitest specs cover core behavior; docs explain the contribution path.

End-to-end: `npm run i18n:audit` reports zero untranslated strings, zero missing keys, zero unused keys.

---

## 🧭 Execution order

1. **34a first** — foundation must exist before any sweep.
2. **34b through 34j in any order** — independent surfaces. Recommend lobby → game UI → builder → sheet → level-up → settings → AI → toasts in that order to verify each upstream surface before moving deeper.
3. **34k after a few sweep sub-phases land** — the lint rule needs real consumers to validate against. Don't ship the rule until at least 34b + 34c are done.
4. **34l last** — tests + docs reflect the final state.

---

## 📜 Commit cadence

```
34a — feat(dnd-app): i18n foundation (i18next + react-i18next, lazy locales, typed keys, en.json baseline)
34b — feat(i18n): lobby + join + public registry strings keyed
34c — feat(i18n): in-game core UI strings keyed (top/bottom bars, chat, HUD overlays)
34d — feat(i18n): map + initiative + tokens + drawing strings keyed
34e — feat(i18n): character builder strings keyed
34f — feat(i18n): character sheet strings keyed
34g — feat(i18n): level-up flow strings keyed
34h — feat(i18n): settings + library + campaign + bastion strings keyed
34i — feat(i18n): AI DM wrapper + system messages + slash commands keyed (Claude prompts stay English)
34j — feat(i18n): toasts + tooltips + aria-labels + error messages keyed
34k — feat(i18n): lint rule + CI gate (missing-key + unused-key + untranslated-string checks)
34l — test+docs(i18n): vitest specs + CONTRIBUTING / AGENTS / CLAUDE.md docs
```

Each must pass:
```
npm run lint
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
npx vitest run
```

One release at end of Phase 34.

---

## 🔗 Plans superseded or modified by Phase 34

| Plan | Item | Disposition |
|------|------|-------------|
| Phase 18 (aria-label sweep) | Adding aria-labels across components | 34j extends aria-label coverage as part of the i18n sweep — net result merges the two goals |
| Phase 18 (text-[10px], icon migration, breakpoints) | UX polish | Unchanged — those remain Phase 18 work |
| SUGGESTIONS-LOG-DNDAPP `[2026-04-24] i18n readiness` | Future-idea | Absorbed entirely as Phase 34 scope (no longer a "future idea") |

---

## ⏱️ Estimated scope

10-15 working sessions. The sweep sub-phases (34b-34j) are the bulk of the work — each is a focused per-surface pass, but the cumulative line count is substantial.

The foundation (34a) + lint rule (34k) + tests/docs (34l) are each ~1 session. The sweep is the volume.

---

## 🚀 Future locales (out of scope for Phase 34)

Phase 34 ships English-only. Adding a new locale (Spanish, French, etc.) is a future phase that:
1. Copies `en.json` to `<lang>.json`
2. Translates every value (~600+ strings)
3. Adds a language picker in Settings
4. Tests the new locale renders correctly

No code changes required for additional locales — the foundation supports them as drop-in JSON files. Each translation effort is its own future phase, sized by language.
