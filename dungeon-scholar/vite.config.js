/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves the site under /<repo-name>/. The base path here must
// match. Default is /dungeon-scholar/ — the public repo name in the README.
// The owner's actual fork is at /home-lab/ (this monorepo), so for that
// deploy we set VITE_BASE=/home-lab/ as a repo secret picked up by
// .github/workflows/deploy.yml. Forks should either rename their repo to
// dungeon-scholar (zero-config) or set VITE_BASE to their own repo path.
const BASE = process.env.VITE_BASE || '/dungeon-scholar/'

export default defineConfig({
  plugins: [react()],
  base: BASE,
  build: {
    // Polish: split vendor chunks so the initial bundle drops below the
    // 500 KB warning. React/ReactDOM and lucide-react both ship a lot of
    // code that doesn't change with app updates, so isolating them also
    // improves cache hit rate across deploys.
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-icons': ['lucide-react'],
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
