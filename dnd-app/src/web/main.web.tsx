/**
 * WEB build entry point. Installs the `window.api` shim, then boots the exact
 * same renderer the desktop app uses (`src/renderer/src/main.tsx`). Import order
 * matters: the shim import is fully evaluated before the app module graph, so
 * every store sees `window.api` already present.
 */
import './install-web-api'
import '../renderer/src/main'
