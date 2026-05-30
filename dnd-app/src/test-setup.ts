import { beforeAll } from 'vitest'
import { initI18n } from './renderer/src/i18n'

// Phase 34 — initialize i18n once per test file so components that call
// `useT()` / `t('ns.key')` resolve to their English values during render.
// Without this, react-i18next echoes the raw key (e.g. "lobby.readyButton.ready")
// and `getByText('Ready')`-style assertions fail. `initI18n` is idempotent.
beforeAll(async () => {
  await initI18n()
})
