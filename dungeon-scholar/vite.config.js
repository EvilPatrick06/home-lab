/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the site under /<repo-name>/. The base path here must
// match. Default is /dungeon-scholar/ — the public repo name in the README.
// The owner's actual fork is at /home-lab/ (this monorepo), so for that
// deploy we set VITE_BASE=/home-lab/ as a repo secret picked up by
// .github/workflows/dungeon-scholar-deploy.yml. Forks should either rename their repo to
// dungeon-scholar (zero-config) or set VITE_BASE to their own repo path.
const BASE = process.env.VITE_BASE || '/dungeon-scholar/'

// PHASE-18 18F / M8 — CSP injected at BUILD time only. GitHub Pages cannot set
// HTTP response headers, so a <meta http-equiv> tag is the only delivery option;
// meta-CSP ignores frame-ancestors/report-uri/sandbox (browser limitation). Dev
// is exempt (apply: 'build') so Vite HMR (ws://localhost) keeps working. If a
// fork hosts its Oracle off *.workers.dev, the exact origin is whitelisted here
// automatically from VITE_ORACLE_ENDPOINT at build.
const oracleOrigin = (() => {
  try { return new URL(process.env.VITE_ORACLE_ENDPOINT || '').origin } catch { return '' }
})()

// PHASE-18 follow-up - pin the Supabase origin the same way oracleOrigin is
// pinned, instead of a bare https://*.supabase.co apex wildcard. The app only
// ever talks to its own single project (VITE_SUPABASE_URL), so emit that exact
// origin (https + wss) in connect-src. Fall back to the apex wildcard only when
// VITE_SUPABASE_URL is unset (dev / zero-config fork), never in a configured
// production build.
const supabaseConnect = (() => {
  try {
    const { protocol, host } = new URL(process.env.VITE_SUPABASE_URL || '')
    if (!host) throw new Error('no host')
    const wsProto = protocol === 'http:' ? 'ws:' : 'wss:'
    return `${protocol}//${host} ${wsProto}//${host}`
  } catch {
    return 'https://*.supabase.co wss://*.supabase.co'
  }
})()

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // Tailwind runtime + React style={{}} attributes
  "img-src 'self' data: https://avatars.githubusercontent.com", // GH avatars + data: SVG noise bg
  "font-src 'self' data:", // KaTeX fonts are bundled same-origin
  `connect-src 'self' ${supabaseConnect}${oracleOrigin ? ` ${oracleOrigin}` : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const cspPlugin = () => ({
  name: 'dungeon-scholar:csp-meta',
  apply: 'build',
  transformIndexHtml(html) {
    return {
      html,
      tags: [{
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
        injectTo: 'head-prepend',
      }],
    }
  },
})

export default defineConfig({
  plugins: [
    react(),
    cspPlugin(),
    // Installable, offline-first PWA. The plugin derives `scope` and
    // `start_url` from Vite's `base`, so we don't hardcode them here — that's
    // what lets the manifest track VITE_BASE across the /dungeon-scholar/ and
    // /home-lab/ deploys.
    //
    // I3 (Web Share Target): the manifest declares a POST/multipart share_target
    // so the installed PWA can receive a shared `.json` tome (or shared text)
    // from the OS share sheet. GitHub Pages can't run server code, so we use
    // `injectManifest` with a custom SW (src/sw.js) that intercepts the share
    // POST, stashes the payload, and redirects into the existing import flow.
    // DELIBERATELY no runtimeCaching: Supabase and the Oracle worker are
    // cross-origin and must stay network-only (Workbox passes through any
    // request its precache table doesn't match, so leaving them unconfigured
    // keeps cloud sync + Oracle live-only — the correct behavior).
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Dungeon Scholar',
        short_name: 'Dungeon Scholar',
        description:
          'D&D-themed exam-prep: flashcards, riddles, timed practice exams — playable offline.',
        theme_color: '#1a0e08',
        background_color: '#0a0604',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // I3: receive a shared tome JSON (or text) from the OS share sheet.
        // `action` is resolved relative to the manifest scope (Vite `base`).
        share_target: {
          action: 'share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [
              { name: 'tome', accept: ['application/json', '.json'] },
            ],
          },
        },
      },
      injectManifest: {
        // woff2: KaTeX's Vite-emitted font files. The precached KaTeX CSS references
        // them same-origin, so without precache entries math falls back to serif
        // fonts offline. woff2 only (~350 KB): browsers pick the first woff2 source
        // in KaTeX's @font-face stacks, so the woff/ttf fallbacks never load.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  base: BASE,
  build: {
    // Polish: split vendor chunks so the initial bundle drops below the
    // 500 KB warning. React/ReactDOM and lucide-react both ship a lot of
    // code that doesn't change with app updates, so isolating them also
    // improves cache hit rate across deploys.
    rollupOptions: {
      output: {
        // Vite 8 (Rolldown) requires the FUNCTION form of manualChunks (the
        // object form was removed). Same intent: isolate react + lucide vendors.
        manualChunks(id) {
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons'
          if (id.includes('node_modules/react')) return 'vendor-react'
        },
      },
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.js'],
    globals: true,
  },
})
