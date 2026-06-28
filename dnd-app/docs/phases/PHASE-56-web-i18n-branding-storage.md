# PHASE-56 — Web-build i18n lang attribute, slider theming, branding & storage namespacing

> Authored from the 2026-06-28 WEB-build QA report (Dungeon Table Online, v2.6.3). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Clear the cluster of medium/low web-build findings that **all re-reproduced in v2.6.3** (the v2.6.2→v2.6.3 diff didn't touch any of them): the `<html lang>` attribute never updates when the UI language changes (medium a11y/SEO bug), the Audio range sliders use the browser-default blue accent while the rest use the themed amber (low inconsistency), the public name "Dungeon Table Online" never references the in-app brand "D&D Virtual Tabletop" (low), and two VTT localStorage keys (`library-recent`, `lobby-chat-*`) aren't namespaced on the shared `bmo.mybmoai.work` origin (low debt). Also carry forward the unverified Spanish-walk i18n leaks. PLANNING ONLY — this phase authors the plan; no app code changes here.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Independent low-risk web-build correctness/polish; sub-phases may be reordered.
- **Sibling to the PHASE-45/48 web sweeps.** Same browser-build surface; reuse `isWebBuild()` (`utils/platform.ts`) where a fix should be web-only (none here strictly must be — the lang/slider/storage fixes are correct on desktop too).
- **i18n key discipline:** any new user-facing string follows the i18n contract (add to `en.json` + `es.json`, regenerate `generated-keys.ts`) — the existing locale-parity + generated-keys tests gate it.
- **Carried, not new.** Every finding below was logged in the prior WEB report and is unchanged in v2.6.3; none had a phase doc (phases 44-48 came from the 2026-06-22 report and don't cover these). This phase creates them. The branding + storage items carry a `bmo` cross-domain tag (shared origin).

## Verified findings

All verification was against the live tree (worktree `auto/dnd-phase-maker`, v2.6.3).

### WEB-I18N-1 (medium) — `<html lang>` does not update on language change (stuck at "en")

**Status: confirmed in source — no runtime `languageChanged` handler updates the document.**

`<html lang="en">` is set statically in every entry HTML (`dnd-app/index.web.html:2`, `index.embed.html:2`, `src/renderer/index.html:2`). i18n init (`src/renderer/src/i18n/index.ts` `initI18n`) calls `i18n.init({ lng: 'en', … })` and never touches `document.documentElement.lang`; `setLocale(lng)` (`i18n/index.ts:33-43`) calls `i18n.changeLanguage(lng)` and persists the choice but **also never updates `document.documentElement.lang` (or `dir`)**, and there is no `i18n.on('languageChanged', …)` subscriber anywhere (`grep -rn "documentElement.lang\|languageChanged" src/renderer/src` → none). So switching to Español translates the UI (Settings → "AJUSTES / PERFIL / IDIOMA / TEMA", themes "Oscuro/Pergamino/…") while `document.documentElement.lang` stays `"en"` and `dir` is empty — exactly as the QA console probe found (before=`en`, after `es`=`en`). Screen readers and translation tooling then treat Spanish content as English (wrong voice/pronunciation/hyphenation, broken auto-translate).

**Reproduction:** Settings → Idioma → Español → console `document.documentElement.lang` → `"en"` while UI is Spanish.

**Expected:** `<html lang>` (and `dir`) update to `es`/`en` in lockstep with the active locale.

**Root cause (file:line):** static `lang` in `dnd-app/index.web.html:2` (+ `index.embed.html:2`, `src/renderer/index.html:2`); no runtime updater in `src/renderer/src/i18n/index.ts` (`initI18n`, `setLocale:33-43`).

Verification:

```bash
cd dnd-app
grep -n 'lang=' index.web.html index.embed.html src/renderer/index.html
sed -n '1,45p' src/renderer/src/i18n/index.ts
grep -rn 'documentElement.lang\|languageChanged' src/renderer/src
```

**Fix direction:** register `i18n.on('languageChanged', l => { document.documentElement.lang = l; document.documentElement.dir = dirFor(l) })` once in `initI18n` (covers every change path, including the App's post-settings-load switch), and set the initial `lang`/`dir` from `i18n.language` at init so first paint is correct. `dir` is `ltr` for both `en` and `es`, but wire `dirFor` so adding an RTL locale later is a one-line change.

**Affected components:** `src/renderer/src/i18n/index.ts` (+ optionally `i18n/config.ts`); the entry HTML files stay as a sensible default.

### WEB-I18N-2 (low) — Audio range sliders use browser-default accent; others use themed amber

**Status: confirmed in source — the Audio sliders lack the `accent-amber-500` class the others carry.**

The themed sliders set Tailwind `accent-amber-500` (computed `accent-color: oklch(0.769 0.188 70.08)`, i.e. amber-500): `ui-scale` (`components/settings/AccessibilitySection.tsx:79-86`, `className="… accent-amber-500 …"`) and `grid-opacity` (`components/settings/GridSection.tsx:40-46`, same). The Audio sliders omit any `accent-*` class, so they fall back to the browser default (blue): `master-volume` (`components/settings/AudioSection.tsx:86-93`, `className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50"`) and `ambient-volume` (`AudioSection.tsx:101-108`, same). This exactly matches the QA's measured `accent-color`: master/ambient `auto` (blue) vs ui-scale/grid-opacity amber.

**Root cause (file:line):** missing `accent-amber-500` on `components/settings/AudioSection.tsx:86-93,101-108`; themed reference `components/settings/AccessibilitySection.tsx:79-86`, `components/settings/GridSection.tsx:40-46`.

Verification:

```bash
cd dnd-app/src/renderer/src
sed -n '82,110p' components/settings/AudioSection.tsx
grep -n 'accent-amber-500' components/settings/AccessibilitySection.tsx components/settings/GridSection.tsx
```

**Fix direction:** add `accent-amber-500` to the two Audio range inputs (and any other range input found without it — also check `GridControlPanel.tsx:112`, `MapManager.tsx:324`, `DMAudioPanel.tsx:443,457` for consistency, applying the themed accent everywhere).

**Affected components:** `components/settings/AudioSection.tsx`; audit `components/game/bottom/DMAudioPanel.tsx`, `components/game/dm/GridControlPanel.tsx`, `pages/campaign-detail/MapManager.tsx`.

### WEB-BRAND-1 (low) — public name "Dungeon Table Online" vs in-app brand "D&D Virtual Tabletop"

**Status: confirmed in source.**

The web build's `document.title` / public name is "Dungeon Table Online" (`dnd-app/index.web.html:15` `<title>`, `index.embed.html:10`), while every in-app surface brands the app "D&D Virtual Tabletop" / "Mesa virtual de D&D" (the desktop entry title `src/renderer/index.html:6`, plus the main-menu wordmark + About header via i18n). Likely a deliberate public-name choice, but the two never reference each other, so a user may be unsure they're in the right app.

**Root cause (file:line):** `dnd-app/index.web.html:15` vs `src/renderer/index.html:6` + in-app brand strings.

**Fix direction (owner decision):** pick one public name, OR add a one-line "Dungeon Table Online is the web edition of D&D Virtual Tabletop" note in About (i18n-keyed en+es). Low effort once the naming decision is made.

**Affected components:** `index.web.html`, the About component, `i18n/locales/{en,es}.json`.

### WEB-STORE-1 (low) — un-namespaced VTT localStorage keys on a shared origin

**Status: confirmed in source.**

The web build runs on shared origin `bmo.mybmoai.work`, so its localStorage coexists with unrelated BMO-app keys (the QA inventory found `bmo_*` keys from other apps alongside the VTT keys). Most VTT keys ARE namespaced (`dnd-vtt-*` in `constants/settings-keys.ts`), but several are **not**, including the two the QA flagged: `library-recent` (`constants/settings-keys.ts:15` `LIBRARY_RECENT: 'library-recent'`) and `lobby-chat-*` (`constants/settings-keys.ts:26` `lobbyChat: (id) => `lobby-chat-${id}``, also hardcoded `CHAT_HISTORY_KEY_PREFIX = 'lobby-chat-'` at `stores/use-lobby-store.ts:37`). A wider audit of the same file shows other un-prefixed keys (`library-favorites`, `dice-tray-position`, `narration-tts-enabled`, `encounter-presets`, `notification-config`, dynamic `lobby-dice-colors`, `macro-storage-*`, `builder-draft-*`, `autosave:*`). On a shared origin these risk collisions and make per-app data hard to clear.

**Root cause (file:line):** `constants/settings-keys.ts:15,26` (+ the other un-prefixed entries); duplicate hardcoded prefix `stores/use-lobby-store.ts:37`.

Verification:

```bash
cd dnd-app/src/renderer/src
cat constants/settings-keys.ts
grep -n "CHAT_HISTORY_KEY_PREFIX\|DICE_COLORS_KEY" stores/use-lobby-store.ts
```

**Fix direction:** give every VTT key a consistent `dnd-vtt:` (or `dndapp:`) prefix — at minimum `library-recent` and `lobby-chat-*`, ideally the whole un-prefixed set. **Migrate existing values** on read (one-time: read old key → write new → delete old) so users don't lose recents/chat history. Replace the hardcoded `CHAT_HISTORY_KEY_PREFIX` in `use-lobby-store.ts` with the centralized `dynamicKeys.lobbyChat`. (Owner note from the QA: consider giving the web build its own origin/subdomain rather than sharing with the BMO dashboard apps — out of scope here.)

**Affected components:** `constants/settings-keys.ts`, `stores/use-lobby-store.ts`, plus a small migration helper + test.

### WEB-I18N-3 (low, unverified) — Spanish-walk i18n leaks carried from the prior report

**Status: NOT re-exercised this run — carried forward.**

The prior WEB report logged two low i18n leaks under Español: (a) character-card data nouns untranslated ("Nivel 1 Dwarf fighter", alignment "Lawful Good"), and (b) the main-menu hero title rendering "D&D VIRTUAL TABLETOP" in English while the About header translates to "Mesa virtual de D&D". This run's Spanish pass only covered the Settings page (which translated cleanly), so these were **not re-walked**. Recorded as unverified; do not assume fixed or broken.

**Fix direction:** a dedicated Spanish walk of the menu + character cards; if still present, decide a localization policy for race/class/alignment nouns and translate the menu hero title via the same key as the About header. Treat the verification as the first step of any sub-phase that touches it.

**Affected components:** `i18n/locales/{en,es}.json`, the main-menu hero + character-card components (to be pinned during verification).

## Sub-phases

> Per-sub-phase cheap check: `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json` + the affected vitest file (+ the i18n parity/generated-keys tests for any new string). CI runs the full gate on push. Visual effects (lang attribute, slider color) are implementer-verified on the deployed web build.

### 56A — Update `<html lang>`/`dir` on language change (WEB-I18N-1)

**Objective:** the document language attribute tracks the active locale.

**Files:** `src/renderer/src/i18n/index.ts` (+ optionally `i18n/config.ts`), a unit test.

**Steps:**

1. In `initI18n`, after `i18n.init`, set `document.documentElement.lang = i18n.language` + `dir` from a `dirFor(locale)` map, and register `i18n.on('languageChanged', l => { document.documentElement.lang = l; document.documentElement.dir = dirFor(l) })`.
2. Confirm the App's post-settings-load locale switch flows through the same handler (it calls `changeLanguage`, so the listener fires).
3. Test: changing the locale updates `document.documentElement.lang` (mock the i18n instance / jsdom `document`).

**Acceptance:** vitest green; `tsc` clean; on the web build, switching to Español sets `<html lang="es">`; switching back sets `en`.

### 56B — Themed accent on all range sliders (WEB-I18N-2)

**Objective:** every range input uses the themed amber accent.

**Files:** `components/settings/AudioSection.tsx` (+ audit `DMAudioPanel.tsx`, `GridControlPanel.tsx`, `MapManager.tsx`).

**Steps:** add `accent-amber-500` to the `master-volume` + `ambient-volume` inputs; sweep the other range inputs and apply the themed accent where missing.

**Acceptance:** `tsc` clean; computed `accent-color` on the Audio sliders matches `ui-scale`/`grid-opacity` (amber) on the deployed build.

### 56C — Branding cross-reference (WEB-BRAND-1) — owner decision

**Objective:** the public name and in-app brand reference each other (or are unified).

**Files:** per the decision — `index.web.html` and/or the About component + `i18n/locales/{en,es}.json`.

**Steps:** confirm the owner's chosen public name; either unify the titles or add the one-line "web edition of …" note in About (i18n-keyed en+es).

**Acceptance:** the chosen approach lands with i18n parity green; no orphan brand string.

### 56D — Namespace + migrate VTT storage keys (WEB-STORE-1)

**Objective:** VTT localStorage keys are prefixed and existing values migrate without data loss.

**Files:** `constants/settings-keys.ts`, `stores/use-lobby-store.ts`, a migration helper + test.

**Steps:**

1. Prefix `library-recent` → `dnd-vtt-library-recent` and `lobby-chat-*` → `dnd-vtt-lobby-chat-*` (and, by decision, the rest of the un-prefixed set); centralize the lobby-chat prefix on `dynamicKeys.lobbyChat` (drop the hardcoded `CHAT_HISTORY_KEY_PREFIX`).
2. Add a one-time read-side migration (old key → new key → delete old) run at startup so recents/chat history survive.
3. Test: a value under the old key is readable under the new key after migration and the old key is removed.

**Acceptance:** vitest green; `tsc` clean; renaming a key doesn't lose existing data; no remaining un-prefixed VTT keys in the changed set.

### 56E — (verification-gated) Spanish menu + character-card walk (WEB-I18N-3)

**Objective:** confirm and, if present, fix the carried i18n leaks.

**Files:** TBD at verification — `i18n/locales/{en,es}.json`, main-menu hero, character-card components.

**Steps:** re-walk the menu + character cards in Español; if leaks reproduce, translate the menu hero via the About key and decide a race/class/alignment noun policy. If they don't reproduce, close with a note.

**Acceptance:** the leaks are either fixed (i18n parity green) or documented as not-reproducing; no guesswork.
