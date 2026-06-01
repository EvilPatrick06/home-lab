import { beforeAll } from 'vitest'
import { initI18n } from './renderer/src/i18n'
import { __setRemoteLibraryDeps } from './renderer/src/services/library/remote-library'

// Phase 34 — initialize i18n once per test file so components that call
// `useT()` / `t('ns.key')` resolve to their English values during render.
// Without this, react-i18next echoes the raw key (e.g. "lobby.readyButton.ready")
// and `getByText('Ready')`-style assertions fail. `initI18n` is idempotent.
beforeAll(async () => {
  await initI18n()
})

// The Pi library loader (data-provider → remote-library) is Pi-first: any
// component that loads 5e data would otherwise reach the main-process library
// bridge during tests — but `window.api.library` doesn't exist in jsdom/node, so
// the manifest fetch would be `null` anyway. Stub the manifest fetch to resolve
// `null` so `loadRemoteLibrary` short-circuits to `null` (→ bundled data)
// deterministically. The remote-library unit test re-injects working deps.
__setRemoteLibraryDeps({
  fetchManifest: () => Promise.resolve(null)
})
