// Custom service worker (I3 — Web Share Target).
//
// vite-plugin-pwa is configured with strategies: 'injectManifest', so this file
// is the SW source: it must do its own precaching (self.__WB_MANIFEST) and own
// the lifecycle. Behavior matches the previous generateSW config —
// cleanupOutdatedCaches + clientsClaim + skipWaiting, no runtimeCaching (cloud
// sync + Oracle stay network-only) — and ADDS a Web Share Target POST handler.

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

// Precache everything the build emits (injected at build time).
precacheAndRoute(self.__WB_MANIFEST);

const SHARE_CACHE = 'ds-share-target';
const SHARE_KEY = 'shared-tome';

// The manifest's share_target.action is "share-target" resolved against scope.
// GitHub Pages serves only static files, so the POST never reaches a server —
// we intercept it here, stash the shared file/text in a cache, and redirect the
// opened window to the app with ?share-target=1 so the page can ingest it.
self.addEventListener('fetch', (event) => {
  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(handleShare(event));
  }
});

async function handleShare(event) {
  try {
    const form = await event.request.formData();
    const file = form.get('tome');
    let text = '';
    if (file && typeof file.text === 'function') {
      text = await file.text();
    }
    if (!text) text = String(form.get('text') || '');
    const cache = await caches.open(SHARE_CACHE);
    await cache.put(SHARE_KEY, new Response(text, { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    // Land the user in the app regardless; the page handles an empty payload.
  }
  return Response.redirect(self.registration.scope + '?share-target=1', 303);
}
