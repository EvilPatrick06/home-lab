import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    // Phase 34 — init i18n before each test file so `useT()` renders resolve to
    // English instead of echoing the raw key.
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/renderer/src/services/**', 'src/renderer/src/data/**'],
      reporter: ['text', 'text-summary'],
      // Phase 28h — baseline FLOOR (a few points below the current services/data
      // coverage: stmts 64 / branch 54 / funcs 63 / lines 65). Fails CI on a real
      // regression — a deleted suite or a big untested addition — without flaking
      // on minor churn. Raise as coverage climbs; never set above the actual.
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 58,
        lines: 60
      }
    }
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@data': resolve(__dirname, 'src/renderer/public/data'),
      'pdfjs-dist': resolve(__dirname, 'src/__mocks__/pdfjs-dist.ts'),
      electron: resolve(__dirname, 'src/__mocks__/electron.ts')
    }
  }
})
