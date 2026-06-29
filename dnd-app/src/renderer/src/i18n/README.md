# i18n — adding & using translation strings

The renderer's user-facing strings are translated via `react-i18next`. English
lives in [`locales/en.json`](./locales/en.json) as a nested tree; keys are the
full dotted path (`t('lobby.readyButton.ready')`).

## Using a string

**In a component** — use the `useT()` hook (call it at the top of the component,
above any early `return`, per the Rules of Hooks):

```tsx
import { useT } from '../../i18n' // adjust relative depth

function MyPanel(): JSX.Element {
  const { t } = useT()
  return <h2>{t('mySection.myPanel.title')}</h2>
}
```

**Outside a component** (services, stores, plain functions where hooks are
illegal) — use the shared instance:

```ts
import { i18n } from '../i18n'
addToast(i18n.t('notify.soundManager.loadEventsFailed'), 'error')
```

## Interpolation & plurals

```ts
t('game.x.deal', { dmg: 12 })          // value: "Deal {{dmg}} damage"
t('game.x.tokenCount', { count: n })   // values: "..._one" / "..._other"
```

Avoid interpolation variable names in the library-shape list
(`name, description, damage, traits, level, school, range`) — they trip the
`library-boundary` lint when they cluster near other shape keys. Rename them
(e.g. `level` → `lvl`, `name` → `label`).

## Adding a key

1. Add the key + English value under the right top-level namespace in `en.json`
   (`common` for generic Save/Cancel/Close/Delete/Confirm/Loading; otherwise the
   area namespace: `lobby`, `pages`, `ui`, `campaign`, `game`, `builder`, `sheet`,
   `levelup`, `library`, `settings`, `notify`).
2. Regenerate the key union: `npm run i18n:gen-keys`
   (`scripts/i18n/gen-key-union.mjs`). This rewrites `generated-keys.ts` so the
   new key is part of the `TranslationKey` literal union and editors autocomplete
   it. The `generated-keys` vitest test fails if the union drifts from `en.json`.
3. Reference it with `t('namespace.key')`.
4. `scripts/i18n/check-keys.mjs` (run via the `key-check` vitest test in CI)
   fails if a referenced key is missing — run it locally:
   `node scripts/i18n/check-keys.mjs`.

The English value should read exactly as the on-screen text — text-based tests
(`getByText('Save')`) rely on it resolving to the literal English.

## Notes

- `TranslationKeys` (in `types.ts`) is `TranslationKey | (string & {})`, where
  `TranslationKey` is a generated literal union of every dotted key in `en.json`
  (~5,960 members in `generated-keys.ts`, rebuilt by `npm run i18n:gen-keys`).
  The union gives editor autocomplete + typo-catching on static `t('…')` calls;
  the `string & {}` widening still accepts the handful of genuinely DYNAMIC keys
  (`t(variable)`, template literals, runtime-built keys with no static leaf). The
  ~5,960-member union was measured to compile in ~60s under `tsconfig.web.json`
  — no slower than the old `string` stub — so the original Phase 34k "too heavy"
  concern did not bear out. The runtime `check-keys` gate still backs it up.
- Tests initialize i18n via `src/test-setup.ts` (a global `beforeAll`), so
  `useT()` renders resolve to English in every test file.
- Adding a locale: drop a `locales/<lng>.json` with the same key tree and
  register it in `index.ts`'s `resources`.

## Adding a new locale (end-to-end)

1. Copy `locales/en.json` to `locales/<code>.json` (e.g. `fr.json`) and translate
   the values — keep the key tree and every `{{interpolation}}` placeholder intact.
2. Add `<code>` to `SUPPORTED_LOCALES` and a label to `LOCALE_LABELS` in `config.ts`.
3. Register the JSON in `index.ts`'s `resources` map.
4. Run `npm run test -- locale-parity` — the parity test is data-driven (it loads
   every `locales/*.json` and checks each non-`en` locale in `SUPPORTED_LOCALES`),
   so the new locale is key/placeholder-checked automatically with no test edit.
5. Run `npm run i18n:check-parity` for the runtime gate.

## Locale conventions — terms kept in English

Some proper nouns / terms of art are **deliberately left untranslated** in the
non-English locales. They are not leaks — translating them in isolation would
make the locale *less* consistent, not more.

- **"Dungeon Master" (es)** — kept in English everywhere in `locales/es.json`
  (e.g. `lobby.*.hostNamePlaceholder`, `*.dungeonMaster`, the AI-DM strings, the
  Join-Game subtitle `pages.*.joinGameDescription`, `soloPrep*`, `defaultHostName`,
  `webLocalAiNotice` — ~15 occurrences). "Dungeon Master" is a recognized term of
  art in Spanish-language D&D play, so the es locale keeps it English across the
  board. If this is ever localized (e.g. to "Director de juego" / "DM"), change
  **every** occurrence together — never a single string, which would create the
  lone-outlier inconsistency this policy exists to avoid.
- **"D&D Virtual Tabletop" wordmark** — the product wordmark is the intentional
  brand and stays English on every surface (menu hero, About header), in all
  locales. It is not subject to translation.
