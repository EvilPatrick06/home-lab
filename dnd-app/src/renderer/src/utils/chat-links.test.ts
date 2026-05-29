import { describe, expect, it } from 'vitest'
import { isSafeHref } from './chat-links'

describe('isSafeHref (Phase 20b)', () => {
  it('accepts http and https URLs', () => {
    expect(isSafeHref('http://example.com')).toBe(true)
    expect(isSafeHref('https://example.com/path?q=1')).toBe(true)
  })

  it('rejects javascript:, data:, and file: URLs', () => {
    expect(isSafeHref('javascript:alert(1)')).toBe(false)
    expect(isSafeHref('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeHref('file:///etc/passwd')).toBe(false)
  })

  it('rejects other dangerous schemes', () => {
    expect(isSafeHref('vbscript:msgbox(1)')).toBe(false)
    expect(isSafeHref('blob:https://example.com/uuid')).toBe(false)
  })

  it('treats relative paths as safe (resolve under https base)', () => {
    expect(isSafeHref('/compendium/goblin')).toBe(true)
  })
})
