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
2. Reference it with `t('namespace.key')`.
3. `scripts/i18n/check-keys.mjs` (run via the `key-check` vitest test in CI)
   fails if a referenced key is missing — run it locally:
   `node scripts/i18n/check-keys.mjs`.

The English value should read exactly as the on-screen text — text-based tests
(`getByText('Save')`) rely on it resolving to the literal English.

## Notes

- `TranslationKeys` (in `types.ts`) is intentionally `string`. A generated
  literal union of all ~5,900 keys was considered (Phase 34k) but rejected: it
  bloats compile time and forces a regen on every string added. The runtime
  `check-keys` gate catches missing/typo'd keys instead, at no compile cost.
- Tests initialize i18n via `src/test-setup.ts` (a global `beforeAll`), so
  `useT()` renders resolve to English in every test file.
- Adding a locale: drop a `locales/<lng>.json` with the same key tree and
  register it in `index.ts`'s `resources`.
