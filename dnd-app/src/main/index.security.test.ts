import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Phase 28h — BrowserWindow security-invariant regression spec.
 *
 * Importing `main/index.ts` has heavy side effects (it builds a BrowserWindow,
 * registers IPC, etc.), so this guards the Electron hardening at the SOURCE
 * level: it asserts the main window keeps its sandbox / context-isolation /
 * no-node-integration posture and its navigation guards. The point is to fail
 * loudly if a future edit silently weakens any of these (e.g. flips
 * `nodeIntegration: true` or drops the `setWindowOpenHandler` deny) — the kind
 * of change a behavioral test wouldn't catch until it shipped.
 */
const SRC = readFileSync(join(__dirname, 'index.ts'), 'utf-8')

describe('main BrowserWindow security invariants', () => {
  it('runs the renderer sandboxed', () => {
    expect(SRC).toMatch(/sandbox:\s*true/)
    expect(SRC).not.toMatch(/sandbox:\s*false/)
  })

  it('keeps context isolation on', () => {
    expect(SRC).toMatch(/contextIsolation:\s*true/)
    expect(SRC).not.toMatch(/contextIsolation:\s*false/)
  })

  it('keeps node integration off', () => {
    expect(SRC).toMatch(/nodeIntegration:\s*false/)
    expect(SRC).not.toMatch(/nodeIntegration:\s*true/)
  })

  it('never disables webSecurity', () => {
    expect(SRC).not.toMatch(/webSecurity:\s*false/)
  })

  it('denies window.open / new-window via setWindowOpenHandler', () => {
    expect(SRC).toContain('setWindowOpenHandler')
    expect(SRC).toMatch(/action:\s*'deny'/)
  })

  it('blocks main-document navigation with a will-navigate guard', () => {
    expect(SRC).toContain("'will-navigate'")
    // The guard must be able to cancel the navigation.
    expect(SRC).toMatch(/event\.preventDefault\(\)/)
  })

  it('loads the renderer through the contextIsolated preload bridge', () => {
    expect(SRC).toMatch(/preload:\s*join\(/)
  })
})
