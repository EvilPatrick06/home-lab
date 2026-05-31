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
// component that loads 5e data would otherwise make a REAL network request to
// the resolved BMO base (the off-LAN tunnel default) during tests — slow,
// flaky, and dependent on the Pi being up. Stub base resolution to reject so
// `loadRemoteLibrary` short-circuits to `null` (→ bundled data) without ever
// hitting the network. The remote-library unit test re-injects working deps.
__setRemoteLibraryDeps({
  resolveBaseUrl: () => Promise.reject(new Error('remote library disabled in tests'))
})
