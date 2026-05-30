import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * paths.ts reads `app.isPackaged` / `app.getAppPath()` (from electron) and
 * `process.resourcesPath` at call time. We override the `electron` mock per
 * test with vi.doMock + vi.resetModules so both the dev and packaged branches
 * are exercised against deterministic roots. No real filesystem access — the
 * resolvers are pure path joins.
 */

const APP_PATH = '/proj/root'

function mockElectron(isPackaged: boolean): void {
  vi.doMock('electron', () => ({
    app: {
      isPackaged,
      getAppPath: (): string => APP_PATH
    }
  }))
}

type PathsModule = typeof import('./paths')

async function loadPaths(isPackaged: boolean): Promise<PathsModule> {
  vi.resetModules()
  mockElectron(isPackaged)
  return import('./paths')
}

const savedResourcesPath = process.resourcesPath

afterEach(() => {
  vi.doUnmock('electron')
  vi.resetModules()
  // @ts-expect-error process.resourcesPath is writable for test restoration
  process.resourcesPath = savedResourcesPath
})

describe('getRendererPublicDir', () => {
  it('resolves to src/renderer/public under the app path in dev', async () => {
    const { getRendererPublicDir } = await loadPaths(false)
    expect(getRendererPublicDir()).toBe('/proj/root/src/renderer/public')
  })

  it('resolves to out/renderer (no public segment) when packaged', async () => {
    const { getRendererPublicDir } = await loadPaths(true)
    expect(getRendererPublicDir()).toBe('/proj/root/out/renderer')
  })
})

describe('getDataDir', () => {
  it('appends data/5e to the dev public dir', async () => {
    const { getDataDir } = await loadPaths(false)
    expect(getDataDir()).toBe('/proj/root/src/renderer/public/data/5e')
  })

  it('appends data/5e to the packaged renderer dir', async () => {
    const { getDataDir } = await loadPaths(true)
    expect(getDataDir()).toBe('/proj/root/out/renderer/data/5e')
  })
})

describe('getResourcePath', () => {
  it('joins the relative path onto process.resourcesPath, ignoring the asar root', async () => {
    // @ts-expect-error process.resourcesPath is writable for this test
    process.resourcesPath = '/packaged/resources'
    const { getResourcePath } = await loadPaths(true)
    expect(getResourcePath('chunk-index.json')).toBe('/packaged/resources/chunk-index.json')
    expect(getResourcePath('rulebooks/srd.pdf')).toBe('/packaged/resources/rulebooks/srd.pdf')
  })

  it('does not prepend the app path to extraResources entries', async () => {
    // @ts-expect-error process.resourcesPath is writable for this test
    process.resourcesPath = '/packaged/resources'
    const { getResourcePath } = await loadPaths(true)
    expect(getResourcePath('ollama/bin')).not.toContain(APP_PATH)
  })
})
