# dnd-app Suggestions Log

> **Future ideas, design gotchas (warnings for future contributors), and notable observations — dnd-app domain only.**
>
> Sibling logs:
> - BMO suggestions → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - dnd-app active bugs / debt → [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
> - Resolved dnd-app entries → [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md)
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Triage rule:** `Domain: dnd-app` design-gotchas / future-ideas / info → here. `Domain: both` entries that meaningfully apply to dnd-app behavior → mirrored here AND in `BMO-SUGGESTIONS-LOG.md`. Cross-tooling rules that touch dnd-app contributors → here (and mirror in BMO file if it touches them too).

New entries go at the TOP of their section (newest first).

---

# Future ideas

---

### [2026-06-22] `SettingsPage.tsx` is a ~1,950-LOC god component — split into per-section panels

- **Category:** debt, future-idea
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-suggestor
- **During:** dnd-app tree review (largest hand-written source files)

**Description:**
`src/renderer/src/pages/SettingsPage.tsx` is 1,946 LOC — the single largest hand-authored source file in the app (excluding the generated `i18n/generated-keys.ts`). It bundles every settings domain into one component: accessibility, theme, keybindings, grid, dice, audio, auto-update prefs, and the export/import logic (see the separate export-prefs entry below). A file this size is hard to review, easy to merge-conflict on (every settings tweak touches the same file), and obscures which state each section owns. The app already presents a per-section UI; extracting each section into its own `settings/<Section>Panel.tsx` (driven by a small tab registry) would shrink the parent to a router shell and make each panel independently testable.

**Proposed fix / improvement:**
- [ ] Extract each settings section into `pages/settings/<Section>Panel.tsx`, leaving `SettingsPage.tsx` as a tab host.
- [ ] Co-locate each panel's local state/handlers with its panel; share only cross-cutting state via the existing stores.
- [ ] Add focused unit tests per panel (a 1,946-LOC component is effectively untestable in isolation today).

**Related files:** `src/renderer/src/pages/SettingsPage.tsx`

### Slim the narration prompt's tag instructions once structured extraction is the default (PHASE-23 follow-up)

**Type:** future-idea · **Domain:** dnd-app · **Added:** 2026-06-16

PHASE-23 added opt-in two-call structured extraction (`aiDm.structuredExtraction`), but
the narration prompt keeps its `[STAT_CHANGES]`/`[DM_ACTIONS]` instructions in ALL modes
(forking the system prompt by config + regressing DM board actions, which extraction
doesn't cover, was not worth it now). Once `structuredExtraction: 'always'` is the
default AND `getRepairJsonStats().modified` stays at zero across releases, removing the
tag-emission instructions from `prompt-sections/*` + retiring `repairJson` becomes
worthwhile (retirement criteria live in `src/main/ai/AI_ACTION_CONTRACT.md`). Depends on
PHASE-27 extending the extraction verb set to cover board actions first.

*(none active)*

---

# Design gotchas (warnings for future agents)

*(Design gotchas + standing observations are now documented in [`dnd-app/docs/DESIGN-CONSTRAINTS.md`](../dnd-app/docs/DESIGN-CONSTRAINTS.md) — per the routing rule in [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md). This section is kept only as a pointer.)*

---

# Info / Observations

---

---

---

---

---

> BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md). dnd-app bugs: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). Security: [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md).
