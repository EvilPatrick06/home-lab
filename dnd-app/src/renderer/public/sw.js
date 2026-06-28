/**
 * Dungeon Table Online — service worker (web/PWA build only).
 *
 * Strategies:
 *  - Navigations (SPA routes): network-first, falling back to the cached app
 *    shell so a deep link or refresh works offline and so a fresh deploy is
 *    picked up immediately when online.
 *  - Hashed build assets (…/assets/*): cache-first — they're content-hashed and
 *    immutable, so a hit never goes stale.
 *  - Static game content (data/fonts/sounds JSON + media): stale-while-revalidate
 *    so the ~3k D&D content files load instantly after first view but still
 *    refresh in the background.
 *
 * `__SW_CACHE_VERSION__` is replaced with the app version by
 * scripts/build/finalize-web.mjs at build time so each deploy gets a fresh cache
 * namespace and the activate handler can evict the previous one.
 */
const VERSION = '__SW_CACHE_VERSION__'
const SHELL_CACHE = `dto-shell-${VERSION}`
const ASSET_CACHE = `dto-assets-${VERSION}`
const DATA_CACHE = `dto-data-${VERSION}`
const SCOPE_PATH = new URL(self.registration.scope).pathname
const SHELL_URL = `${SCOPE_PATH}index.html`

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      await cache.addAll([SCOPE_PATH, SHELL_URL, `${SCOPE_PATH}manifest.webmanifest`]).catch(() => {})
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, DATA_CACHE])
      const names = await caches.keys()
      await Promise.all(names.filter((n) => n.startsWith('dto-') && !keep.has(n)).map((n) => caches.delete(n)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

function isAsset(url) {
  return url.pathname.includes('/assets/')
}

function isStaticContent(url) {
  return /\/(data|fonts|sounds)\//.test(url.pathname) || /\.(json|woff2?|mp3|ogg|png|jpe?g|webp|svg)$/.test(url.pathname)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // let cross-origin (Pi API) pass through

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request)
          const cache = await caches.open(SHELL_CACHE)
          cache.put(SHELL_URL, fresh.clone()).catch(() => {})
          return fresh
        } catch {
          const cache = await caches.open(SHELL_CACHE)
          return (await cache.match(SHELL_URL)) || (await cache.match(SCOPE_PATH)) || Response.error()
        }
      })()
    )
    return
  }

  if (isAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE)
        const hit = await cache.match(request)
        if (hit) return hit
        const fresh = await fetch(request)
        if (fresh.ok) cache.put(request, fresh.clone()).catch(() => {})
        return fresh
      })()
    )
    return
  }

  if (isStaticContent(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(DATA_CACHE)
        const hit = await cache.match(request)
        const network = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone()).catch(() => {})
            return res
          })
          .catch(() => hit)
        return hit || network
      })()
    )
  }
})
