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
  return visualizer({ open: true, filename: 'bundle-stats.html', gzipSize: true }) as Plugin
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
      plugins: [externalizeDepsPlugin()]
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
        rollupOptions: {
          output: {
            // Code-split heavy dependencies into separate chunks
            manualChunks(id: string) {
              if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'vendor-react'
              if (id.includes('node_modules/react-router')) return 'vendor-router'
              if (
                id.includes('node_modules/zustand') ||
                id.includes('node_modules/zod') ||
                id.includes('node_modules/immer')
              )
                return 'vendor-state'
              if (id.includes('node_modules/three')) return 'vendor-three'
              if (id.includes('node_modules/cannon-es')) return 'vendor-physics'
              if (id.includes('node_modules/pixi.js') || id.includes('node_modules/@pixi')) return 'vendor-pixi'
              if (id.includes('node_modules/@tiptap')) return 'vendor-tiptap'
              // Phase 14g §6 — no vendor-anthropic rule: @anthropic-ai/sdk is main-process only
              // (externalized), never in the renderer bundle, so that chunk rule never matched.
              if (id.includes('node_modules/peerjs')) return 'vendor-peerjs'
              if (id.includes('node_modules/pdfjs-dist')) return 'vendor-pdfjs'
            }
          }
        }
      }
    }
  }
})
