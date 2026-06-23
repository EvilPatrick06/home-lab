import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

// Phase 33e — read package.json without CJS createRequire (config runs as ESM).
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')) as {
  version: string
}

async function analyzePlugin(): Promise<Plugin | null> {
  if (process.env.ANALYZE !== '1') return null
  const { visualizer } = await import('rollup-plugin-visualizer')
  return visualizer({ open: false, filename: 'bundle-stats.html', gzipSize: true }) as Plugin
}

/** Suppress Vite 7 warnings about JSON imports from public dir (loaded via @data alias). */
function suppressPublicDirWarnings(): Plugin {
  return {
    name: 'suppress-public-dir-warnings',
    configResolved(config) {
      const originalWarn = config.logger.warn
      config.logger.warn = (msg, options) => {
        if (typeof msg === 'string' && msg.includes('Assets in public directory cannot be imported')) return
        originalWarn(msg, options)
      }
    }
  }
}

export default defineConfig(async () => {
  const analyze = await analyzePlugin()
  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      // Cloudflare Access service token, baked into the MAIN bundle at build
      // time (from CI/build secrets) so off-LAN requests to the Pi's
      // Access-protected tunnel authenticate without any per-user setup. Only
      // the main process holds it (never the renderer), and it's sent only to
      // the BMO base URL. Empty string when not supplied (dev / forks).
      define: {
        __CF_ACCESS_CLIENT_ID__: JSON.stringify(process.env.CF_ACCESS_CLIENT_ID ?? ''),
        __CF_ACCESS_CLIENT_SECRET__: JSON.stringify(process.env.CF_ACCESS_CLIENT_SECRET ?? '')
      }
    },
    preload: {
      plugins: [externalizeDepsPlugin()]
    },
    renderer: {
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src'),
          '@data': resolve('src/renderer/public/data')
        }
      },
      define: {
        __APP_VERSION__: JSON.stringify(pkg.version)
      },
      plugins: [react(), tailwindcss(), suppressPublicDirWarnings(), analyze].filter(Boolean) as Plugin[],
      build: {
        // Phase 14g (§A4) — faster prod builds + smaller package: esbuild minify (20-40× terser),
        // no sourcemaps shipped, skip gzip-size reporting (a measurable build cost).
        minify: 'esbuild' as const,
        sourcemap: false,
        reportCompressedSize: false,
        // Vite 8 runs on Rolldown — use `rolldownOptions` (not the deprecated
        // `rollupOptions` compat alias) and Rolldown's grouped `codeSplitting`
        // (it replaced both the `manualChunks(id)` function and the interim
        // `advancedChunks` name; same `CodeSplittingGroup[]` shape). Each group's
        // `test` RegExp matches the same node_modules paths the old function
        // checked; `[\\/]` (not `/`) keeps the patterns Windows-safe.
        rolldownOptions: {
          output: {
            codeSplitting: {
              groups: [
                { name: 'vendor-react', test: /node_modules[\\/](react-dom|react)[\\/]/ },
                { name: 'vendor-router', test: /node_modules[\\/]react-router/ },
                { name: 'vendor-state', test: /node_modules[\\/](zustand|zod|immer)/ },
                { name: 'vendor-three', test: /node_modules[\\/]three/ },
                { name: 'vendor-physics', test: /node_modules[\\/]cannon-es/ },
                { name: 'vendor-pixi', test: /node_modules[\\/](pixi\.js|@pixi)/ },
                { name: 'vendor-tiptap', test: /node_modules[\\/]@tiptap/ },
                // Phase 14g §6 — no vendor-anthropic group: @anthropic-ai/sdk is main-process only
                // (externalized), never in the renderer bundle, so that chunk rule never matched.
                { name: 'vendor-peerjs', test: /node_modules[\\/]peerjs/ },
                { name: 'vendor-pdfjs', test: /node_modules[\\/]pdfjs-dist/ }
              ]
            }
          }
        }
      }
    }
  }
})
