# PHASE-58 — Web-build Spanish i18n leaks: data-driven labels & locale-aware dates

> Authored from the 2026-06-29 WEB-build QA report (Dungeon Table Online, v2.6.4). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md. PLANNING ONLY — this phase authors the plan; no app code changes here.

## Goal

Close the **four newly-observed Spanish-locale leaks** the 2026-06-29 WEB pass surfaced while the prior WEB findings were re-verified as fixed (PHASE-55/56/57 all landed; see "Dependencies"). Each leak has the same shape: a user-facing label is rendered from a **hardcoded English source** (a static data array, a literal id list, or an `en-US`-pinned date formatter) rather than the i18n table, so it stays English while the surrounding chrome is Español. All four are **low severity / high visibility** (they sit on primary in-game and navigation surfaces). The fixes are mechanical — route each label through `t(...)` (adding en+es keys) or through a locale-aware `Intl` formatter.

## Dependencies & cross-phase notes

- **This run re-verified every prior WEB finding against v2.6.4 and recorded them FIXED** — `<html lang>`/`dir` tracking, storage key namespacing, About web-edition framing, slider theming, and the built-in-map base-path 404 all resolve in the 2026-06-29 build (PHASE-55/56/57 shipped). So this phase does **not** re-file any of those; it covers only the four leaks that are genuinely new this run.
- **Sibling to PHASE-56 (web i18n/branding round) and PHASE-57 (web Spanish i18n leaks).** Those covered `<html lang>`, slider accent, branding cross-reference, storage namespacing, the About edition-framing, and the character-card noun leak. The four labels here were **not** in their scope — they live in different files (a UI data JSON, a map-editor tab array, the Library group manifest, and the Calendar page). Independent of 56/57 at the code level; may be reordered.
- **The character-card data-noun leak (race/class/alignment, "Nivel 1 Dwarf fighter" / "Lawful Good") is NOT re-authored here.** It reproduces again in the 2026-06-29 build (carried, unchanged) but is **already owned** by **PHASE-56 sub-phase 56E** and pinned by **PHASE-57 WEB-I18N-5** (`components/ui/CharacterCard.tsx`, with the fix direction recorded there). Re-filing it would double-author the same fix. This phase only references it.
- **i18n key discipline (contract):** every new user-facing string is added to **both** `i18n/locales/en.json` and `i18n/locales/es.json`, then `generated-keys.ts` is regenerated (`npm run i18n:gen-keys`). The locale-parity (`npm run i18n:check-parity`) + generated-keys + key-check vitest suites gate it. en/es are at parity today (6541 keys each).
- **Two of the four leaks are data-JSON / static-array driven** (`dm-tabs.json`, `types/library.ts`) — these are also consumed by the desktop build, so routing them through `t(...)` is a strict improvement on both targets (no build-target branch needed). The Calendar fix (locale-aware dates) likewise improves both targets.

## Verified findings

All verification was against the live tree (worktree `auto/dnd-phase-maker`, v2.6.4 / commit `5d4fd98`).

### WEB-I18N-6 (low) — in-game command-category tab strip renders English under Español

**Status: confirmed in source — the tab labels are hardcoded English in a data JSON, rendered verbatim.**

The in-game DM bottom-panel tab strip renders "Combat, Magic, Dice & Rolls, Map, Party, Audio, DM Tools, AI DM, Campaign, Utility, Chat & Social, Combat Log, Journal" in English while the left sidebar (PERSONAJES, PNJ, ALIADOS, ENEMIGOS, LUGARES, BASTIONES…) is Spanish. The 13 tab labels come from a static data file with hardcoded English `label` strings:

`src/renderer/public/data/ui/dm-tabs.json` is an array of `{ id, label, icon, group }` whose `label` fields are literal English ("Combat", "Magic", "Dice & Rolls", … "Journal"). `DMTabPanel.tsx` imports it (`:1` `import dmTabsJson from '@data/ui/dm-tabs.json'`), types it as `{ id; label; icon; group? }[]` (`:35` `const TABS = dmTabsJson as …`), and renders the label **verbatim** in the tab button (`:414` `<span>{tab.label}</span>`) with no `t(...)` lookup. The same raw `tab.label` is what a screen reader gets (there is no separate `aria-label`).

**Reproduction:** Settings → Idioma → Español → resume/start a game → the DM bottom tab strip reads "Combat / Magic / Dice & Rolls / …" in English.

**Expected:** the 13 command-category tab labels render in Spanish under the Español locale (or a documented keep-English policy is applied if they are intentionally command-namespace names).

**Root cause (file:line):** hardcoded English labels in `src/renderer/public/data/ui/dm-tabs.json` (all 13 `"label"` fields); rendered ungated at `src/renderer/src/components/game/bottom/DMTabPanel.tsx:414` (`<span>{tab.label}</span>`), typed `:35`, imported `:1`.

Verification:

```bash
cd dnd-app/src/renderer
cat public/data/ui/dm-tabs.json                       # 13 hardcoded English "label" fields
grep -n 'tab.label\|dmTabsJson\|const TABS' src/components/game/bottom/DMTabPanel.tsx
```

**Fix direction:** give each tab a `labelKey` (e.g. `game.dmTabPanel.tabs.<id>`) — either add a `labelKey` field to `dm-tabs.json` alongside `label` (keep `label` as a desktop/English fallback) and render `t(tab.labelKey)`, or map `tab.id` → a key inside `DMTabPanel.tsx`. Add the 13 keys to en+es, regenerate `generated-keys.ts`. The `group`-separator logic (`:398-403`) is unaffected (it keys off `tab.group`, not the label). If the labels are intentionally English command-namespace names, document that instead (a locale-policy note) and close the item.

**Affected components:** `src/renderer/public/data/ui/dm-tabs.json`, `src/renderer/src/components/game/bottom/DMTabPanel.tsx`, `i18n/locales/{en,es}.json`.

### WEB-I18N-7 (low) — map-editor right-panel layer tabs render English (and mis-cased) under Español

**Status: confirmed in source — the tab strip maps over a literal id array and renders the raw id, CSS-capitalized.**

The Scene/Map-editor right-panel tab strip renders "Tokens, Fog, Terrain, Regions, Grid, Npcs, Notes, Shop" in English while the surrounding controls (terrain size labels Diminuto/Pequeño/Mediano/Grande/Enorme) are Spanish. The strip is built from a **literal id array** and prints each id directly:

`src/renderer/src/components/game/modals/dm-tools/MapEditorRightPanel.tsx:117-129` maps over `(['tokens', 'fog', 'terrain', 'regions', 'grid', 'npcs', 'notes', 'shop'] as const)` and renders `{tab}` inside the button (`:127`) with a `capitalize` CSS class (`:122`). So the displayed text is the raw English id, title-cased by CSS — which also explains the QA-observed "**Npcs**" (CSS `capitalize` of `npcs` → "Npcs", not the proper "NPCs"). No `t(...)` is consulted, even though the component already has `const { t } = useT()` (`:48`) in scope. (The `RightPanel` union type is defined `:14`.)

**Reproduction:** Español → in-game → DM Tools → Map editor → right-panel tab strip reads "Tokens / Fog / Terrain / Regions / Grid / Npcs / Notes / Shop".

**Expected:** the 8 layer-tab labels render in Spanish under Español, with correct casing (notably "NPCs" rather than the CSS-capitalized "Npcs").

**Root cause (file:line):** `src/renderer/src/components/game/modals/dm-tools/MapEditorRightPanel.tsx:117` (literal id array), `:122` (`capitalize` class), `:127` (`{tab}` rendered raw); `t` already in scope `:48`.

Verification:

```bash
cd dnd-app/src/renderer/src
sed -n '116,130p' components/game/modals/dm-tools/MapEditorRightPanel.tsx
```

**Fix direction:** render `t(\`game.mapEditorRightPanel.tabs.${tab}\`)` instead of `{tab}`, with 8 keys added to en+es (`generated-keys.ts` regenerated). Drop the `capitalize` class (or keep it only for languages where it is harmless) so the i18n string controls casing — e.g. an explicit `"npcs": "NPCs"` in en and the proper Spanish term in es. The `RightPanel` union and the `setRightPanel(tab)` click handler stay keyed on the id, so only the displayed text changes.

**Affected components:** `src/renderer/src/components/game/modals/dm-tools/MapEditorRightPanel.tsx`, `i18n/locales/{en,es}.json`.

### WEB-I18N-8 (low) — Library group + category labels render English under Español

**Status: confirmed in source — the Library taxonomy is a static manifest of hardcoded English labels, rendered verbatim.**

The Biblioteca page section headers render "MY CONTENT, BESTIARY, SPELLBOOK, CHARACTER OPTIONS, EQUIPMENT & ITEMS, RULES REFERENCE, WORLD BUILDING, TABLES & ENCOUNTERS, MEDIA…" in English while the page title (Biblioteca), filters (Todas las categorías, Favoritos, Libros básicos) are Spanish. The category cards under each header (Monsters, Creatures, NPCs, Spells, …) are likewise English. Both come from one static manifest:

`src/renderer/src/types/library.ts` defines `export const LIBRARY_GROUPS: LibraryGroupDef[]` (`:66+`) where every group has a hardcoded English `label` ("Core Books", "My Content", "Bestiary", "Spellbook", "Character Options", "Equipment & Items", "Rules Reference", "World Building", "Tables & Encounters", "Media") and every nested category has a hardcoded English `label` ("Monsters", "Creatures", "NPCs", "Spells", …). There are ~70 hardcoded `label:` strings in the file. `LibraryCategoryGrid.tsx` consumes the manifest and renders the labels verbatim: group header `:21` `<h2 …>{group.label}</h2>` (CSS/markup uppercases the group header on the page), category card `:36` `{cat.label}` — neither passes through `t(...)`, even though `t` is in scope and used for the count strings (`:40-42`). The recently-viewed strip and the category dropdown also read `def.label` directly (`LibraryPage.tsx`).

**Reproduction:** Español → Menú → Biblioteca → section headers read "MY CONTENT / BESTIARY / SPELLBOOK / …" and the category cards read "Monsters / Spells / Classes / …" in English.

**Expected:** Library group headers and category labels render in Spanish under Español.

**Root cause (file:line):** hardcoded English `label:` fields in `src/renderer/src/types/library.ts` (`LIBRARY_GROUPS`, ~70 strings, group labels `:69,74,85,95,104,124,141,…`, category labels `:76-79,87-90,97-99,106-119,126-136,…`); rendered ungated at `src/renderer/src/components/library/LibraryCategoryGrid.tsx:21` (`{group.label}`) and `:36` (`{cat.label}`); also read as `def?.label` in `src/renderer/src/pages/LibraryPage.tsx` (recently-viewed `:748`, category-search title `:620`).

Verification:

```bash
cd dnd-app/src/renderer/src
grep -n "label: '" types/library.ts | head -40        # ~70 hardcoded English labels
grep -n 'group.label\|cat.label\|def.\?label' components/library/LibraryCategoryGrid.tsx pages/LibraryPage.tsx
```

**Fix direction:** add a `labelKey` to each `LibraryGroupDef` / category in `LIBRARY_GROUPS` (keep `label` as the English fallback for tests/logs) and render `t(group.labelKey)` / `t(cat.labelKey)` in `LibraryCategoryGrid.tsx` (and the `def.label` reads in `LibraryPage.tsx`). Add the group + category keys to en+es and regenerate `generated-keys.ts`. Because the manifest is shared with desktop, this improves both targets. Mind the existing uppercase styling on group headers — let the es string read naturally and keep the casing in CSS, or bake it into the key.

**Affected components:** `src/renderer/src/types/library.ts`, `src/renderer/src/components/library/LibraryCategoryGrid.tsx`, `src/renderer/src/pages/LibraryPage.tsx`, `i18n/locales/{en,es}.json`.

### WEB-I18N-9 (low) — Calendar month label + weekday headers + selected-day detail are English-only (`en-US`-pinned)

**Status: confirmed in source — the Calendar page hardcodes an English weekday array and pins its date formatters to `'en-US'`.**

The Calendario de sesiones renders "June 2026" and weekday headers "Sun Mon Tue Wed Thu Fri Sat" in English while the rest of the page (Calendario de sesiones, Sesión propuesta, Hoy) is Spanish. The selected-day detail line is similarly English. Three hardcoded spots in `src/renderer/src/pages/CalendarPage.tsx`:

1. **Weekday headers** — `const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']` (`:19`), rendered in the header row (`:173` `DAYS_OF_WEEK.map(...)`).
2. **Month + year label** — `formatMonthYear` (`:29-32`) calls `new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })` — the locale is hardcoded `'en-US'`, so it is always English (rendered `:162`).
3. **Selected-day detail** — `:240-242` calls `…toLocaleDateString('en-US', { weekday: 'long', month: 'long', … })`, again pinned to `'en-US'`.

The app already exposes the active locale via i18next, so the formatters can be driven by it.

**Reproduction:** Español → navigate to `/calendar` (direct URL — note the route has no main-menu entry, see "Orphaned route" below) → month label "June 2026", weekday row "Sun Mon Tue … Sat", and the selected-day detail render in English.

**Expected:** the month label, weekday headers, and selected-day detail render in the active locale (e.g. "junio de 2026", "dom lun mar …").

**Root cause (file:line):** `src/renderer/src/pages/CalendarPage.tsx:19` (`DAYS_OF_WEEK` English array, rendered `:173`); `:29-32` (`formatMonthYear` pinned `'en-US'`, rendered `:162`); `:240-242` (selected-day detail pinned `'en-US'`).

Verification:

```bash
cd dnd-app/src/renderer/src
grep -n "DAYS_OF_WEEK\|toLocaleDateString\|'en-US'\|formatMonthYear" pages/CalendarPage.tsx
```

**Fix direction:** derive a BCP-47 locale tag from the active i18next language (`i18n.language`, e.g. `es` → `'es'`/`'es-ES'`, default `'en-US'`) and pass it to `Intl.DateTimeFormat` / `toLocaleDateString` for both the month label and the selected-day detail. Replace the static `DAYS_OF_WEEK` array with locale-aware short weekday names from `Intl.DateTimeFormat(locale, { weekday: 'short' })` (computed over a reference week), so the header row follows the locale. Keep `getDaysInMonth` / `getFirstDayOfMonth` / `toDateKey` as-is (they are calendar math, not display). No new i18n keys required (the formatter does the localization), so the parity test is unaffected — but the `generated-keys.ts` step is harmless to re-run.

> **Orphaned route (carried context, not a new finding):** the `/calendar` route is reachable by direct URL but has no main-menu entry (the desktop QA instructions already note this). Out of scope for this phase; recorded so the executer is not surprised that the page is only reachable by URL.

**Affected components:** `src/renderer/src/pages/CalendarPage.tsx` (no locale-table additions required; uses `Intl` + the active i18next language).

## Sub-phases

> Per-sub-phase cheap check: `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json` + the affected vitest file (+ the i18n parity/generated-keys tests for any new string: `npm run i18n:check-parity`, and the `generated-keys`/`locale-parity`/`key-check` vitest specs). CI runs the authoritative full gate on push. Text effects are implementer-verified on the deployed web build (`https://bmo.mybmoai.work/DungeonTableOnline/`) with the UI set to Español.

### 58A — DM command-tab strip i18n (WEB-I18N-6)

**Objective:** the 13 in-game command-category tabs render in the active locale.

**Files:** `src/renderer/public/data/ui/dm-tabs.json`, `src/renderer/src/components/game/bottom/DMTabPanel.tsx`, `i18n/locales/{en,es}.json`.

**Steps:**

1. Add a `labelKey` per tab (`game.dmTabPanel.tabs.<id>`) to `dm-tabs.json` (keep `label` as the English/desktop fallback) — or map `tab.id` → key in `DMTabPanel.tsx`.
2. Render `t(tab.labelKey)` (fallback `tab.label`) at `DMTabPanel.tsx:414`; leave the `group`-separator logic untouched.
3. Add the 13 keys to en+es; `npm run i18n:gen-keys`.

**Acceptance:** `tsc -p tsconfig.web.json` clean; i18n parity/generated-keys green; on the deployed web build with Español the tab strip reads Spanish labels; desktop unchanged (labels still resolve). Implementer-verified live.

### 58B — Map-editor right-panel tab i18n + casing (WEB-I18N-7)

**Objective:** the 8 map-editor layer tabs render in the active locale with correct casing ("NPCs", not "Npcs").

**Files:** `src/renderer/src/components/game/modals/dm-tools/MapEditorRightPanel.tsx`, `i18n/locales/{en,es}.json`.

**Steps:**

1. Replace `{tab}` (`:127`) with `t(\`game.mapEditorRightPanel.tabs.${tab}\`)`; remove/neutralize the `capitalize` class (`:122`) so the i18n string controls casing.
2. Add the 8 keys to en+es (en `"npcs": "NPCs"`); `npm run i18n:gen-keys`. The id-keyed click handler / `RightPanel` type are unchanged.

**Acceptance:** `tsc -p tsconfig.web.json` clean; parity/generated-keys green; live web build (Español) shows Spanish tab labels and English build shows "NPCs"; the active-panel switching still works. Implementer-verified live.

### 58C — Library group + category label i18n (WEB-I18N-8)

**Objective:** Library group headers + category labels render in the active locale.

**Files:** `src/renderer/src/types/library.ts`, `src/renderer/src/components/library/LibraryCategoryGrid.tsx`, `src/renderer/src/pages/LibraryPage.tsx`, `i18n/locales/{en,es}.json`.

**Steps:**

1. Add a `labelKey` to each group + category in `LIBRARY_GROUPS` (keep `label` as the English fallback for tests/logs).
2. Render `t(group.labelKey)` / `t(cat.labelKey)` in `LibraryCategoryGrid.tsx:21,36`; update the `def.label` reads in `LibraryPage.tsx` (recently-viewed, category-search title) to use the key.
3. Add the group + category keys to en+es; `npm run i18n:gen-keys`. Preserve the uppercase styling on group headers (CSS or in-key).

**Acceptance:** `tsc -p tsconfig.web.json` clean; parity/generated-keys green; live web build (Español) shows Spanish Library headers + category cards; desktop unchanged. Implementer-verified live.

### 58D — Calendar locale-aware dates (WEB-I18N-9)

**Objective:** Calendar month label, weekday headers, and selected-day detail follow the active locale.

**Files:** `src/renderer/src/pages/CalendarPage.tsx` (no new locale keys required).

**Steps:**

1. Derive a BCP-47 tag from `i18n.language` (default `'en-US'`).
2. Pass it to the month-label and selected-day `toLocaleDateString`/`Intl.DateTimeFormat` calls (`:29-32`, `:240-242`).
3. Replace the static `DAYS_OF_WEEK` array (`:19`) with locale-aware short weekday names from `Intl.DateTimeFormat(locale, { weekday: 'short' })`.

**Acceptance:** `tsc -p tsconfig.web.json` clean; existing `CalendarPage` vitest green (update the spec if it asserts the English weekday array); live web build (Español) shows a Spanish month label, weekday headers, and selected-day detail; English build unchanged. Implementer-verified live.

> The character-card race/class/alignment noun leak (still reproducing in v2.6.4) is **owned by PHASE-56 56E** / pinned by **PHASE-57 WEB-I18N-5** — execute it there, not here, to avoid double-authoring the same fix.

## Completed

> _Not yet implemented — authored 2026-06-29 by phase-maker from the 2026-06-29 WEB QA report. To be implemented by the phase-executer per INSTRUCTIONS.md (web-affecting i18n; desktop benefits from 58A/58C/58D, unaffected by 58B casing)._
