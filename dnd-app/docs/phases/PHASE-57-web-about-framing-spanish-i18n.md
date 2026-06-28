# PHASE-57 — Web-build About edition-framing & verified Spanish i18n leaks

> Authored from the 2026-06-28 WEB-build QA report (Dungeon Table Online, v2.6.4). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Clear the small set of findings that are **genuinely new in the v2.6.4 WEB pass** (everything else in that report is a re-verification of findings already owned by PHASE-55/56 — see "Dependencies" below): the About page frames itself as a desktop/Electron app on the browser build (low portability/docs), and a fresh Spanish walk surfaced one item that needs a careful read. This phase also folds in the **verification result + drift corrections** the v2.6.4 run produced for PHASE-56's previously-unverified Spanish-walk sub-phase (56E / WEB-I18N-3): the character-card noun leak is now **confirmed and pinned**, while the "menu hero title in English" half is **retracted as intentional brand**. PLANNING ONLY — this phase authors the plan; no app code changes here.

## Dependencies & cross-phase notes

- **This report re-verified every prior WEB finding against v2.6.4 — all still reproduce, none fixed** (the v2.6.3→v2.6.4 diff did not touch the asset-base-path, `<html lang>`, slider-accent, branding, or storage-namespacing surfaces). Those carried findings are **already owned** by **PHASE-55** (built-in-map 404 + sticky error toast) and **PHASE-56** (`<html lang>`, slider accent, branding name, storage namespacing). They are **not** re-authored here — re-filing them would duplicate two pending phases. This phase covers only what PHASE-55/56 do not.
- **Sibling to the PHASE-45 web Electron-portability sweep.** PHASE-45 gated *desktop-only affordances* behind `isWebBuild()` (About "Check for Updates", the "desktop application … no browser required" copy, the Settings Updates section, Ollama install, WebRTC signaling). It did **not** enumerate the About **tech-stack array** or the **app-description / multiplayer feature copy** — WEB-ABOUT-1 is exactly that gap, on the same `AboutPage.tsx`. **Execution note:** WEB-ABOUT-1 edits the same file as PHASE-45 — sequence them (or fold WEB-ABOUT-1 into PHASE-45's About sub-phase) so the two don't churn `AboutPage.tsx` against each other. `isWebBuild()` already exists (`utils/platform.ts`) and is already used in `AboutPage.tsx:161` to gate the Updates block, so the helper is in hand.
- **Resolves PHASE-56 56E (WEB-I18N-3).** That sub-phase was authored as *verification-gated* ("NOT re-exercised this run — carried forward"). The v2.6.4 run exercised it: the character-card noun leak **reproduces** and is now pinned to `components/ui/CharacterCard.tsx`; the separately-flagged "menu hero in English" is **NOT a leak** (the wordmark "D&D Virtual Tabletop" is the intentional brand, kept English everywhere — it matches the About header). PHASE-56 has been updated to reflect this (56E flipped from gated → confirmed, menu-hero half struck); the noun-localization + casing fix stays owned by **PHASE-56 56E**, enriched with the pin below. This phase records the verification so the executer has the root cause in one place.
- **i18n key discipline:** any new user-facing string follows the i18n contract (add to `en.json` + `es.json`, regenerate `generated-keys.ts`); the locale-parity + generated-keys tests gate it.

## Verified findings

All verification was against the live tree (worktree `auto/dnd-phase-maker`, v2.6.4).

### WEB-ABOUT-1 (low) — About page frames itself as a desktop/Electron app on the web build

**Status: confirmed in source — the tech-stack array and the description/multiplayer copy are not gated by build target.**

On the web build the About page advertises desktop-only framing in three ungated spots:

1. **Tech stack first card "Electron 40 / Desktop framework".** `TECH_STACK` is a module-level `const` (`pages/AboutPage.tsx:10-22`) whose first entry is `{ name: 'Electron 40', detailKey: 'pages.aboutPage.techDesktopFramework' }` (`techDesktopFramework` = `"Desktop framework"`, `en.json:5674`). It is rendered verbatim in the Tech-Stack grid (`AboutPage.tsx:310` `TECH_STACK.map(...)`) with no build-target branch. The browser edition is a Vite/React SPA served over HTTP, not an Electron app, so "Electron 40 — Desktop framework" is inaccurate for what the user is actually running.
2. **App description is the desktop copy.** `appDescription` (rendered at `AboutPage.tsx:250`) = `"An app for playing Dungeons & Dragons 5th Edition online with friends. Create characters, build campaigns, and adventure together."` (`en.json:5702`) — generic, but paired with the Electron card it reads as the desktop app with no "web edition" qualifier.
3. **Multiplayer feature copy "P2P Multiplayer via WebRTC".** `featureMultiplayer` = `"P2P Multiplayer via WebRTC"` (`en.json:5658`), rendered ungated in the `FEATURES` list (`AboutPage.tsx:27-52`, mapped at `:300-304`). Web multiplayer goes through the Pi cloud relay path, so the desktop "P2P via WebRTC" framing is at best partial on the web build.

`isWebBuild()` is already imported and used in this file to gate the Updates section (`AboutPage.tsx:161`), so the build-target signal is available; it simply isn't consulted for the tech-stack/description/feature arrays. (PHASE-45 gated the Updates block and the "desktop application … no browser required" copy but did not touch these arrays — see Dependencies.)

**Reproduction:** Web app → About & Data → scroll to TECH STACK → first card reads "Electron 40 / Desktop framework"; the description and the Features list carry the desktop "P2P Multiplayer via WebRTC" copy with no "web edition" note.

**Expected:** On the web build, the tech-stack/feature/description copy reflects the browser edition (omit or relabel the Electron/desktop-only entries, or add a "Web edition" qualifier).

**Root cause (file:line):** ungated module const + render — `pages/AboutPage.tsx:10-22` (`TECH_STACK`, Electron entry `:11`), `:27-52` (`FEATURES`, `featureMultiplayer` `:35`), `:250` (`appDescription`), `:300-313` (render maps); strings `i18n/locales/en.json:5658` (`featureMultiplayer`), `:5674` (`techDesktopFramework`), `:5702` (`appDescription`); existing gate precedent `pages/AboutPage.tsx:161` + `utils/platform.ts` (`isWebBuild`).

Verification:

```bash
cd dnd-app/src/renderer/src
sed -n '10,22p' pages/AboutPage.tsx          # TECH_STACK (Electron 40 first entry)
grep -n 'isWebBuild\|TECH_STACK\|appDescription\|featureMultiplayer' pages/AboutPage.tsx
grep -n 'techDesktopFramework\|appDescription\|featureMultiplayer' i18n/locales/en.json
```

**Fix direction:** branch the About tech-stack/feature/description on the build target — on the web build, drop or relabel the `Electron 40 / Desktop framework` entry (e.g. surface the actual web runtime, "Vite / Web runtime") and either swap the description/multiplayer copy for web-accurate strings or add a one-line "Web edition" qualifier. Prefer building the displayed `TECH_STACK`/description from `isWebBuild()` inside the component (the const can stay the desktop default, with a web override array) so desktop is unchanged. Any new string is i18n-keyed (en+es). **Coordinate with PHASE-45** so the two About edits land together rather than churning the file.

**Affected components:** `pages/AboutPage.tsx`, `i18n/locales/{en,es}.json` (any new web-edition strings), `utils/platform.ts` (existing `isWebBuild`).

### WEB-I18N-4 (low, drift correction) — "Dungeon Master" in the Join-Game subtitle is consistent with the es locale's keep-English policy, not an isolated leak

**Status: confirmed in source — and re-scoped.** The QA report flagged the Spanish Join-Game menu subtitle "Conéctate a una partida alojada por tu **Dungeon Master**" as a leak. The string is real (`i18n/locales/es.json:6142` `"joinGameDescription": "Conéctate a una partida alojada por tu Dungeon Master"`, vs `en.json:6142` `"Connect to a game hosted by your Dungeon Master"`). **But it is not an inconsistency** — the Spanish locale **deliberately keeps "Dungeon Master" as an untranslated proper noun across the board**, e.g. `hostNamePlaceholder` (`es.json:465`), `dungeonMaster` (`:1049`, `:5306`), `aiDm`/`title`/`enable` ("Dungeon Master de IA", `:689/:787/:814`), the online-search approval copy (`:3289`), `defaultHostName` (`:6445`), `soloPrepSubtitle`/`soloPrepErrorTitle` ("El Dungeon Master …", `:6194/:6198`), and `webLocalAiNotice` (`:7581`). "Dungeon Master" is a recognized term of art in Spanish-language D&D play, and this locale keeps it English in ~12 places. The Join-Game subtitle **matches** that policy.

**Implication for the fix:** spot-translating only this one string would make it the lone outlier and *introduce* the inconsistency the report worried about. This is therefore an **owner-decision / documentation** item, not a spot-fix:

- **Default (recommended): no code change** — document the deliberate keep-"Dungeon Master" policy for the es locale (a short note in `i18n/README.md` or a locale comment), and treat the QA item as resolved-by-policy.
- **Alternative (only if the owner wants it translated):** translate **all** ~12 occurrences consistently (e.g. to "Director de juego" / "DM"), as a single coordinated change — never just the subtitle.

**Root cause (file:line):** `i18n/locales/es.json:6142` (the flagged string) — consistent with `es.json:465,1049,3289,5306,6194,6198,6445,7581` (the keep-English precedent).

Verification:

```bash
cd dnd-app/src/renderer/src
grep -n '"joinGameDescription"' i18n/locales/en.json i18n/locales/es.json
grep -n 'Dungeon Master' i18n/locales/es.json   # ~12 deliberate keep-English occurrences
```

**Fix direction:** prefer documenting the keep-English policy (no string change). Only if the owner elects to localize the term, change every occurrence together so the locale stays internally consistent.

**Affected components:** `i18n/locales/es.json` (+ `i18n/README.md` for the policy note); no app-code change in the default path.

### WEB-I18N-5 (low) — character-card data nouns (race/class/alignment) untranslated + inconsistent casing under Español — VERIFIED, pins PHASE-56 56E

**Status: confirmed in source and pinned.** This is the verification PHASE-56's 56E (WEB-I18N-3) was waiting on. With the UI in Español the Characters page chrome translates correctly, but the card descriptor line stays English — e.g. "Nivel 1 **Dwarf** **fighter**" and alignment "**Lawful Good**" — with mixed casing within the line ("Dwarf" capitalized, "fighter" lowercase). Root cause is in the card component:

`components/ui/CharacterCard.tsx` composes the line from **raw stored strings**, not i18n term lookups: `className = classes.map((c) => c.name).join(' / ')` (`:24-25`, raw class names like "fighter"), `speciesName = character.species` (`:26`, raw race like "Dwarf"), `alignment = character.alignment` (`:28`), interpolated into `t('ui.characterCard.levelLine', { level, species: speciesName, class: className })` (`:50`; template `en.json:7459` "Level {{level}} {{species}} {{class}}", `es.json` "Nivel {{level}} …") and the alignment rendered directly (`:53`). The interpolated nouns therefore never pass through a locale table — and **no 5e race/class/alignment term tables exist** in the locale files (only label strings like `"classes": "Classes:"`, `en.json:5300`), so there is nothing to look them up against today. The casing mismatch is upstream of translation: stored species is title-case while stored class names are lowercase, so even the English line reads "Level 1 Dwarf fighter".

**Retraction (drift correction):** the prior report's companion item — "main-menu hero title renders in English" — is **NOT a leak**. The wordmark "D&D Virtual Tabletop" is the intentional brand, kept English on every surface (it matches the About header); the v2.6.4 run confirmed the menu cards otherwise translate fully. Only the data-noun leak is a real finding. PHASE-56's WEB-I18N-3 text has been updated to strike the menu-hero half.

**Reproduction:** Settings → Idioma → Español → Menu → "Tus personajes" → card reads "Nivel 1 Dwarf fighter" / "Lawful Good".

**Expected:** race, class, and alignment render in Spanish (or a documented keep-English policy is applied), with consistent casing on the "Nivel N <race> <class>" line.

**Root cause (file:line):** `components/ui/CharacterCard.tsx:24-26` (raw `className`/`speciesName`), `:28` (`alignment`), `:50` (`levelLine` interpolation), `:53` (alignment render); templates `i18n/locales/en.json:7459` + es equivalent; no term tables (`grep` for race/class/alignment term tables → none).

Verification:

```bash
cd dnd-app/src/renderer/src
sed -n '22,54p' components/ui/CharacterCard.tsx
grep -n '"levelLine"' i18n/locales/en.json i18n/locales/es.json
grep -in '"races"\|"alignments"\|lawfulGood' i18n/locales/en.json   # none today
```

**Ownership:** the **fix** is owned by **PHASE-56 sub-phase 56E** (now un-gated). This finding pins its files and root cause; do not author a duplicate fix sub-phase here. Fix direction (recorded for 56E): either add 5e race/class/alignment i18n term tables (en+es) and look the stored nouns up in `CharacterCard.tsx`, or document an explicit keep-English policy for game-term nouns; **separately**, normalize the casing of the composed "Level/Nivel N <race> <class>" line (a fix that improves the English line too, independent of translation).

**Affected components:** `components/ui/CharacterCard.tsx`, `i18n/locales/{en,es}.json` (new term tables if localizing).

## Sub-phases

> Per-sub-phase cheap check: `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json` + the affected vitest file (+ the i18n parity/generated-keys tests for any new string). CI runs the full gate on push. Visual/text effects are implementer-verified on the deployed web build (`https://bmo.mybmoai.work/DungeonTableOnline/`).

### 57A — Web-edition About framing (WEB-ABOUT-1)

**Objective:** on the web build the About tech-stack/description/feature copy reflects the browser edition, not Electron/desktop; desktop unchanged.

**Files:** `pages/AboutPage.tsx`, `i18n/locales/{en,es}.json` (any new web-edition strings); reuse `utils/platform.ts` `isWebBuild`.

**Steps:**

1. Build the displayed tech-stack from `isWebBuild()` — drop or relabel the `Electron 40 / Desktop framework` entry on web (e.g. surface the web runtime instead); keep the desktop `TECH_STACK` as the default.
2. On web, swap `appDescription` + the `featureMultiplayer` ("P2P Multiplayer via WebRTC") copy for web-accurate strings, or add a one-line "Web edition" qualifier near the title/description. Any new string is i18n-keyed (en+es), with `generated-keys.ts` regenerated.
3. **Coordinate with PHASE-45** (same file) — land together or sequence to avoid churning `AboutPage.tsx`.

**Acceptance:** `tsc -p tsconfig.web.json` clean; i18n parity/generated-keys green; on the deployed web build the About page no longer shows "Electron 40 — Desktop framework" (or it is qualified as the web edition); desktop About is unchanged. Implementer-verified live.

### 57B — Join-Game subtitle "Dungeon Master" policy (WEB-I18N-4) — owner decision, default no-op

**Objective:** the es "Dungeon Master" handling is intentional and documented (or globally translated by owner choice), with no new inconsistency introduced.

**Files:** default — `i18n/README.md` (policy note), no string change. Alternative — `i18n/locales/es.json` (all ~12 occurrences) if the owner elects to translate.

**Steps:**

1. Confirm the owner's intent. Default: document that the es locale keeps "Dungeon Master" as an untranslated proper noun (the Join-Game subtitle matches this) and close the QA item as resolved-by-policy.
2. Only if translating: change **every** "Dungeon Master" occurrence in `es.json` together (consistent term, e.g. "Director de juego"), never the subtitle alone; keep parity green.

**Acceptance:** either a policy note lands (no code change) or all occurrences are translated consistently; the locale has no lone-outlier "Dungeon Master" string introduced by a spot-fix.

> The character-card noun leak (WEB-I18N-5) is **owned by PHASE-56 56E** (now un-gated by this run's verification); execute it there with the pin recorded above — no sub-phase here, to avoid double-authoring the same fix.
