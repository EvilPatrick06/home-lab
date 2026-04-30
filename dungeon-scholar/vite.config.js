/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/home-lab/',
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.js'],
    globals: true,
  },
})
