# `src/__guards__/` — codebase-wide convention-guard tests

Most tests in this repo co-locate next to the module they cover
(`srs.js` + `srs.test.js`). The tests here are different: they have **no single
module under test**. Each is a static, cross-cutting **guard** that scans the
whole codebase (reads `index.css` / greps JSX source) to assert a global
convention holds — light-theme contrast tokens, icon a11y, semantic headings.
They live together, with `*.guard.test.js(x)` names describing **what they
enforce** (not the phase number that introduced them), so the guarantees are
discoverable in one place instead of masquerading as orphan unit tests scattered
across `src/`.

## Active guards

| Guard | Enforces |
|---|---|
| `lightThemeColorRamp.guard.test.js` | Every Tailwind `family-step` color utility used in JSX has a matching `--color-*` override in the `html[data-theme="light"]` inverted-ramp block, and all six `--surface-*` triplets + `--focus-ring` exist in both the dark `:root` and the light override (originally `theme.test.js`; PHASE-41). |
| `lightThemeAccentDangerContrast.guard.test.js` | The light-theme muted-accent (`--text-accent-muted`) and danger-button (`--surface-red`) fixes are present on their named surfaces and no failing class/literal remains (originally `phase10-contrast.test.js`; PHASE-10 + 2026-06-30 follow-up). |
| `activeTomePanelInk.guard.test.js` | The home Active-Tome panel accent text routes through the light-theme ink vars (`--accent-gold-ink` / `--accent-purple-ink` / `.active-tome-accent`) rather than fixed hex (originally `phase12Guards.test.js`; PHASE-12). |
| `studyModeHeadingsQuestVerb.guard.test.js` | The three study modes render a semantic `<h2>`, and the Quest Board header verb agrees in number (originally `phase11Guards.test.js`; PHASE-11). |
| `lucideIconA11y.guard.test.jsx` | lucide-react icon usage follows the a11y convention (originally `components/lucide-a11y.test.jsx`). |

## Convention

A test that statically scans the codebase to enforce a **global** rule (rather
than exercising one module) belongs here and is named `<whatItEnforces>.guard.test.js`
(`.jsx` if it renders React). Keep the originating `PHASE-NN` reference in a code
comment, not the filename. Guards that read source files use paths relative to
`src/` (`srcRoot = join(dirname(fileURLToPath(import.meta.url)), ".."`) or the
project-root cwd (`"src/features/..."`), so they keep working from this folder.
