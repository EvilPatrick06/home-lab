import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { registerControlledReload } from './services/pwaUpdate.js';
import { guardedReloadOnce } from './utils/lazyWithReload.js';

// SEC: clickjacking guard. GitHub Pages can't send X-Frame-Options and a
// meta-CSP can't express frame-ancestors, so bust out of any cross-origin
// frame. Bundled, so script-src 'self' permits it.
if (window.top !== window.self) {
  try {
    window.top.location = window.self.location;
  } catch {
    /* cross-origin frame: best effort */
  }
}

// PHASE-01 (F1a): Vite fires `vite:preloadError` when a dynamic-import preload
// (modulepreload of a build chunk) fails — the stale-chunk case after a deploy.
// Recover with the same guarded one-shot reload as the lazyWithReload wrapper so
// a failed preload reloads to the latest build instead of dead-ending. Only
// preventDefault (suppress the throw) when we actually reload.
window.addEventListener('vite:preloadError', (e) => {
  if (guardedReloadOnce()) e.preventDefault();
});

// PHASE-01 (F1c): reload the page when a new service worker takes control, so
// the shell + its chunk graph swap together (no old chunk reference left live
// against a cleaned cache). No-op in non-SW contexts.
registerControlledReload();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
