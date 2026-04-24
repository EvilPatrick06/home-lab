import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/renderer/src/services/**', 'src/renderer/src/data/**'],
      reporter: ['text', 'text-summary']
    }
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@data': resolve(__dirname, 'src/renderer/public/data'),
      'pdfjs-dist': resolve(__dirname, 'src/__mocks__/pdfjs-dist.ts')
    }
  }
})
