/**
 * Register the PWA service worker (web build only). The SW lives in the public
 * dir so it's emitted to the build root and served at the same scope as the app
 * (the Vite `base`, e.g. /DungeonTableOnline/). Registration is best-effort:
 * any failure (unsupported browser, insecure context, blocked) is non-fatal and
 * leaves the app running exactly as before.
 */
const swUrl = `${import.meta.env.BASE_URL}sw.js`

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL }).catch(() => {
      /* SW registration failed — app still works, just without offline caching. */
    })
  })
}
