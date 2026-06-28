/**
 * EMBED build entry point (hosted in the React Native WebView). Installs the
 * bridge-backed `window.api`, then boots the exact same renderer the desktop and
 * web builds use. Import order matters: the install module is fully evaluated
 * before the app module graph.
 */
import './install-embed-api'
import '../renderer/src/main'
