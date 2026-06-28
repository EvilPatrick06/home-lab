import { describe, expect, it } from 'vitest'
import { resolveAssetUrl } from './asset-url'

// import.meta.env.BASE_URL is '/' in the vitest env; assert against it so the
// test holds whatever the configured base is (desktop '/', web sub-path).
const BASE = import.meta.env.BASE_URL

describe('resolveAssetUrl (Phase 55A / WEB-AP-1)', () => {
  it('prefixes the Vite base for a ./data path', () => {
    expect(resolveAssetUrl('./data/5e/maps/wizards-tower.png')).toBe(
      `${BASE}data/5e/maps/wizards-tower.png`
    )
  })
  it('prefixes the Vite base for a leading-slash /data path', () => {
    expect(resolveAssetUrl('/data/5e/maps/x.png')).toBe(`${BASE}data/5e/maps/x.png`)
  })
  it('prefixes the Vite base for a ./sounds path', () => {
    expect(resolveAssetUrl('./sounds/dice/d20.mp3')).toBe(`${BASE}sounds/dice/d20.mp3`)
  })
  it('passes a data: URL through unchanged', () => {
    expect(resolveAssetUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
  })
  it('passes blob:, file: and http(s) URLs through unchanged', () => {
    expect(resolveAssetUrl('blob:abc-123')).toBe('blob:abc-123')
    expect(resolveAssetUrl('file:///x/y.mp3')).toBe('file:///x/y.mp3')
    expect(resolveAssetUrl('https://cdn.example/x.png')).toBe('https://cdn.example/x.png')
  })
  it('does not mistake a bare "data/..." path (no colon) for a data: URL', () => {
    expect(resolveAssetUrl('data/5e/x.json')).toBe(`${BASE}data/5e/x.json`)
  })
  it('returns empty input unchanged', () => {
    expect(resolveAssetUrl('')).toBe('')
  })
  it('is a base-root no-op on the desktop "/" base', () => {
    if (BASE === '/') expect(resolveAssetUrl('./data/x.png')).toBe('/data/x.png')
  })
})
