# PHASE-62 — Web i18n brand & terminology consistency: app title + "Dungeon Master" (es)

> Authored from the 2026-06-29 WEB-build QA report (Dungeon Table Online, v2.7.0). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md. PLANNING ONLY — this phase authors the plan; no app code changes here.

## Goal

Resolve the **low**, owner-decision i18n-consistency finding from the 2026-06-29 v2.7.0 WEB pass's same-value scan (163 keys where the Spanish value equals the English value — most intentional brand/proper nouns, two worth aligning):

1. **App title named two ways under Español.** `pages.mainMenuPage.appTitle` is the **English** "D&D Virtual Tabletop" in `es.json`, while the About page's `pages.aboutPage.appTitle` is the Spanish "Mesa virtual de D&D" — so the same product is branded differently across the main-menu hero and the About page under one locale.
2. **"Dungeon Master" left untranslated in `es.json`** across four user-facing keys (chat panel, lobby character selector, host-name placeholder, campaign default host name). Spanish D&D convention is "Director de Juego" / "Máster".

Both are low severity / high visibility (main menu + in-game chrome). This phase is a **decision + mechanical i18n edit**: either translate to one consistent per-locale brand and the chosen Spanish DM term, **or** record a deliberate keep-English policy and close. No component logic changes — only `es.json` values (+ `generated-keys.ts` regenerate, parity already balanced).

## Dependencies & cross-phase notes

- **Sibling to PHASE-58 (web Spanish i18n leaks — data-driven labels) and PHASE-57 (web About framing / Spanish i18n), but a different mechanism and not in their scope.** PHASE-58 routes hardcoded English **source labels** (data JSONs, id arrays) through `t(...)`. This phase touches **existing i18n string values** where the `es` translation simply equals the `en` source — a value edit, not a render-path change. The specific keys here (`pages.mainMenuPage.appTitle`, `game.chatPanel.dungeonMaster`, `lobby.characterSelector.dungeonMaster`, `campaign.hostNamePrompt.hostNamePlaceholder`, `pages.campaignDetailPage.defaultHostName`) are **not** in PHASE-58's four-leak list nor PHASE-57's About set — no double-authoring.
- **Decision required (rule-9 "new human decision the plan didn't cover" surfaces as a documented choice, not a STOP):** whether "Dungeon Master" stays English in `es` by policy (it is a recognizable brand term in some Spanish-speaking D&D communities) or is translated to "Director de Juego"/"Máster". The phase records both options; the executer applies the owner's standing localization policy (PHASE-57 established a "keep-English for brand/proper nouns" policy — if that policy explicitly covers "Dungeon Master," this item is *documented-and-closed* rather than translated). The app-title inconsistency is **not** policy-covered (two different Spanish surfaces already disagree), so it should be unified regardless.
- **i18n key discipline (contract):** any changed/added `es` value keeps en/es at parity (currently **6541 keys each**, verified this run); regenerate `generated-keys.ts` (`npm run i18n:gen-keys`) and keep the `locale-parity` / `generated-keys` / `key-check` vitest suites green. Editing an existing value does not change the key set, so parity is inherently preserved; the regenerate step is harmless.
- **Carried-forward (NOT re-authored here):** the character-card **data nouns** (race/class/alignment, e.g. "Dwarf fighter", "Lawful Good") that still render English under Español are **data-driven** (rendered from content keys, not i18n strings) and are **already owned by PHASE-56 56E / pinned by PHASE-57 WEB-I18N-5 / referenced by PHASE-58**. This phase only references them. v2.7.0's "character-card status-badge localization" (451a9fd1) correctly localizes the retired/deceased badge (`statusRetired`→"Retirado", `statusDeceased`→"Fallecido", gated by `status !== 'active'`) — that work is **done and correct**, not re-filed.

## Verified findings

All verification was against the live tree (worktree `auto/dnd-phase-maker`, v2.7.0 / commit `2f9caeaf`). en/es parity confirmed 6541 keys each.

### WEB-I18N-10 (low) — main-menu app title is English under Español; About page brands it "Mesa virtual de D&D" (same product, two names)

**Status: confirmed in source — two `appTitle` keys diverge under `es`.**

There are two `appTitle` keys:

- `pages.mainMenuPage.appTitle` — `en.json:6156` "D&D Virtual Tabletop", `es.json:6156` **"D&D Virtual Tabletop"** (es == en; the main-menu hero title is English under Español). Section confirmed: the key sits inside `mainMenuPage` (neighboring `tagline` "Tu aventura te espera", `mainNavigation`).
- `pages.aboutPage.appTitle` — `en.json:5691` "D&D Virtual Tabletop", `es.json:5691` **"Mesa virtual de D&D"** (translated). Section confirmed: neighbors `version`, `checkForUpdates`, `techBuildTooling` (the About & Data page). The same Spanish brand also appears in `webEditionNote` (`es.json:5729` "…es la edición web de Mesa virtual de D&D.").

So under Español the product is "Mesa virtual de D&D" on About but "D&D Virtual Tabletop" on the main menu — an inconsistent brand across two primary surfaces in one locale.

**Reproduction:** Español → main menu → hero title reads "D&D Virtual Tabletop"; open About & Data → title reads "Mesa virtual de D&D".

**Expected:** one consistent product name per locale (under `es`, both surfaces read "Mesa virtual de D&D", matching About + `webEditionNote`), or a deliberate documented choice.

**Root cause (file:line):** `es.json:6156` (`pages.mainMenuPage.appTitle` left at the English value) vs `es.json:5691` (`pages.aboutPage.appTitle` = "Mesa virtual de D&D").

Verification:

```bash
cd dnd-app/src/renderer/src/i18n/locales
grep -n '"appTitle"' en.json es.json     # 5691 (aboutPage) + 6156 (mainMenuPage); es 6156 == en
sed -n '6150,6160p' es.json               # mainMenuPage block (appTitle English)
sed -n '5688,5692p' es.json               # aboutPage block (appTitle "Mesa virtual de D&D")
```

**Fix direction:** set `es.json` `pages.mainMenuPage.appTitle` to "Mesa virtual de D&D" to match the About brand + `webEditionNote` (recommended — unifies on the already-chosen Spanish name). Leave `en.json` unchanged. Regenerate `generated-keys.ts`; parity unchanged (value-only edit).

**Affected components:** `src/renderer/src/i18n/locales/es.json` (`pages.mainMenuPage.appTitle`).

### WEB-I18N-11 (low, owner-decision) — "Dungeon Master" untranslated in `es.json` (chat, lobby, host-name placeholder, default host name)

**Status: confirmed in source — four `es` keys keep the English "Dungeon Master".**

The same-value scan flagged four keys whose `es` value equals the `en` "Dungeon Master":

- `game.chatPanel.dungeonMaster` — `es.json:5307` "Dungeon Master" (the in-game chat sender label for the DM).
- `lobby.characterSelector.dungeonMaster` — `es.json:1049` "Dungeon Master" (lobby role label).
- `campaign.hostNamePrompt.hostNamePlaceholder` — `es.json:465` "Dungeon Master" (host-name input placeholder).
- `pages.campaignDetailPage.defaultHostName` — `es.json:6449` "Dungeon Master" (default host display name).

Spanish D&D convention is "Director de Juego" (or the colloquial "Máster"). These may be intentionally kept English under the PHASE-57 brand/proper-noun keep-English policy — flagging for a consistency decision, not asserting a bug.

**Reproduction:** Español → in-game chat (DM messages labeled "Dungeon Master"); lobby character selector (DM role "Dungeon Master"); create/host a campaign (host-name placeholder + default host name "Dungeon Master").

**Expected:** a single deliberate, documented choice — either translate all four to one Spanish term ("Director de Juego" or "Máster"), or record that "Dungeon Master" is intentionally kept English in `es` by brand policy.

**Root cause (file:line):** `es.json:5307`, `es.json:1049`, `es.json:465`, `es.json:6449` — each carries the English "Dungeon Master".

Verification:

```bash
cd dnd-app/src/renderer/src/i18n/locales
grep -n '"dungeonMaster"' en.json es.json        # 1049, 5307 (es == en)
grep -n 'hostNamePlaceholder\|defaultHostName' en.json es.json   # 465, 6449 (es == en)
```

**Fix direction:** apply the owner's localization policy. **If translating:** set all four `es` values to one chosen term (recommend "Director de Juego" for the descriptive labels — chat sender, lobby role, default host name; the host-name *placeholder* may stay "Director de Juego" too for consistency), and add a one-line note to the locale policy doc recording the chosen Spanish DM term so future strings match. **If keeping English:** record "Dungeon Master kept English in es (brand/proper-noun policy, per PHASE-57)" in the locale policy and close — do not edit the values. Either way, document the decision so it is not re-flagged each QA pass. `en.json` unchanged; regenerate `generated-keys.ts`; parity unchanged (value-only edits).

**Affected components:** `src/renderer/src/i18n/locales/es.json` (`game.chatPanel.dungeonMaster`, `lobby.characterSelector.dungeonMaster`, `campaign.hostNamePrompt.hostNamePlaceholder`, `pages.campaignDetailPage.defaultHostName`); the locale-policy note (wherever the keep-English policy from PHASE-57 is recorded).

## Sub-phases

> Per-sub-phase cheap check: value-only `es.json` edits — run `npm run i18n:check-parity` + the `generated-keys`/`locale-parity`/`key-check` vitest specs, and `npm run i18n:gen-keys` (harmless for value-only edits). No `tsc` surface beyond the generated-keys regenerate. CI runs the authoritative full gate on push. Text effects are implementer-verified on the deployed web build (`https://bmo.mybmoai.work/DungeonTableOnline/`) with the UI set to Español.

### 62A — Unify the Spanish app title (WEB-I18N-10)

**Objective:** the product is named consistently under Español across the main menu and About.

**Files:** `src/renderer/src/i18n/locales/es.json` (`pages.mainMenuPage.appTitle`).

**Steps:**

1. Set `es.json` `pages.mainMenuPage.appTitle` to "Mesa virtual de D&D" (match About + `webEditionNote`).
2. `npm run i18n:gen-keys`.

**Acceptance:** parity/generated-keys green; on the deployed web build with Español the main-menu hero and About both read "Mesa virtual de D&D"; English build unchanged. Implementer-verified live.

### 62B — Decide + apply the Spanish "Dungeon Master" term (WEB-I18N-11)

**Objective:** one documented choice for "Dungeon Master" under Español across the four keys.

**Files:** `src/renderer/src/i18n/locales/es.json` (the four keys above); locale-policy note.

**Steps:**

1. Apply the owner's localization policy — translate all four `es` values to the chosen term (e.g. "Director de Juego"), **or** record the keep-English brand policy and leave them unchanged.
2. Add/confirm the one-line locale-policy note recording the decision so future DM-role strings match and QA does not re-flag.
3. If values changed, `npm run i18n:gen-keys`.

**Acceptance:** parity/generated-keys green; on the deployed web build with Español the four DM surfaces show the chosen term (or the documented English brand), consistently; English build unchanged; the decision is written down. Implementer-verified live.

> The character-card race/class/alignment **data-noun** leak (still reproducing under Español in v2.7.0) is **owned by PHASE-56 56E / PHASE-57 WEB-I18N-5** (data-driven, not an i18n string) — execute it there, not here, to avoid double-authoring the same fix.

> **Carry-forward (recorded 2026-07-02, from WEB-QA-report-2026-07-02-v2.7.1):** the es same-English-value key count crept **163 -> 168** since v2.7.0 (5 new same-value strings; keyed parity still perfect at 6,541/6,541). During the 62B pass, diff the same-value key set against the v2.7.0 baseline and confirm the 5 additions are deliberate keep-English strings (most same-value keys are intentional proper nouns / dice syntax). No new sub-phase -- fold into 62B's policy application.

## Completed

> _Not yet implemented — authored 2026-06-29 by phase-maker from the 2026-06-29 v2.7.0 WEB QA report. Value-only `es.json` consistency edits (+ a documented localization decision for "Dungeon Master"); desktop benefits identically (shared locale table). To be implemented by the phase-executer per INSTRUCTIONS.md. 62A is a straight unify; 62B carries an owner localization decision (translate vs documented keep-English) per the PHASE-57 brand policy._
