/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/home-lab/',
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
