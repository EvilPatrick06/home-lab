// PHASE-01 (F1c) — controlled service-worker update → reload handshake.
//
// vite-plugin-pwa runs with registerType: 'autoUpdate' + injectRegister: 'auto'
// and the custom SW (src/sw.js) calls skipWaiting() + clientsClaim() +
// cleanupOutdatedCaches(). That is correct offline-first intent — a returning
// offline user must get a controlling SW immediately — but it also means a new
// deploy's SW activates and CLAIMS the open tab while the in-memory shell still
// references the previous build's hashed chunks, which cleanupOutdatedCaches has
// just purged. The next lazy navigation then 404s (the F1 crash).
//
// The fix: when a NEW SW takes control (controllerchange), reload the page so
// the shell and its chunk graph are swapped together — never leaving an old
// chunk reference live against a cleaned cache. The reload is the same
// guardedReloadOnce() one-shot as the lazy/preloadError paths (01A), so whichever
// fires first wins and there is no double reload or loop.
//
// We deliberately keep skipWaiting()/clientsClaim() in sw.js (offline-first); the
// bug was never that they exist, only that nothing reloaded the page when they
// swapped the controller. This adds exactly that.
import { guardedReloadOnce } from '../utils/lazyWithReload.js';

export function registerControlledReload() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    // Non-SW context: dev without SW, tests, unsupported browsers — no-op.
    return;
  }
  // On a brand-new visit the FIRST SW to control the page also fires
  // controllerchange, even though nothing was swapped. Only treat it as an
  // update when a controller already existed at registration time, so we don't
  // spuriously reload on the initial claim of a first visit.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // initial claim, not an update — leave it
    guardedReloadOnce();
  });
}
