import { createRequire } from 'module'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

const require = createRequire(import.meta.url)
const pkg = require('./package.json') as { version: string }

function analyzePlugin(): Plugin | null {
  if (process.env.ANALYZE !== '1') return null
  const { visualizer } = require('rollup-plugin-visualizer') as typeof import('rollup-plugin-visualizer')
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

export default defineConfig({
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
    plugins: [react(), tailwindcss(), suppressPublicDirWarnings(), analyzePlugin()].filter(Boolean) as Plugin[],
    build: {
      rollupOptions: {
        output: {
          // Code-split heavy dependencies into separate chunks
          manualChunks(id) {
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
            if (id.includes('node_modules/@langchain')) return 'vendor-langchain'
            if (id.includes('node_modules/@aws-sdk')) return 'vendor-aws'
            if (id.includes('node_modules/@anthropic-ai')) return 'vendor-anthropic'
            if (id.includes('node_modules/peerjs')) return 'vendor-peerjs'
            if (id.includes('node_modules/pdfjs-dist')) return 'vendor-pdfjs'
          }
        }
      }
    }
  }
})
