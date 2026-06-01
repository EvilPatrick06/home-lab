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
