import { describe, expect, it } from 'vitest'
import { migrateLegacyStorageKeys } from './storage-migrations'

function makeStore(seed: Record<string, string> = {}): Storage {
  const m = new Map<string, string>(Object.entries(seed))
  return {
    get length() {
      return m.size
    },
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear()
  } as Storage
}

describe('migrateLegacyStorageKeys (Phase 56D / WEB-STORE-1)', () => {
  it('renames library-recent to the namespaced key and removes the old one', () => {
    const s = makeStore({ 'library-recent': '["a","b"]' })
    migrateLegacyStorageKeys(s)
    expect(s.getItem('dnd-vtt-library-recent')).toBe('["a","b"]')
    expect(s.getItem('library-recent')).toBeNull()
  })

  it('renames every lobby-chat-<id> key, preserving the campaign suffix', () => {
    const s = makeStore({ 'lobby-chat-camp1': '[1]', 'lobby-chat-camp2': '[2]' })
    migrateLegacyStorageKeys(s)
    expect(s.getItem('dnd-vtt-lobby-chat-camp1')).toBe('[1]')
    expect(s.getItem('dnd-vtt-lobby-chat-camp2')).toBe('[2]')
    expect(s.getItem('lobby-chat-camp1')).toBeNull()
    expect(s.getItem('lobby-chat-camp2')).toBeNull()
  })

  it('renames lobby-dice-colors', () => {
    const s = makeStore({ 'lobby-dice-colors': '{}' })
    migrateLegacyStorageKeys(s)
    expect(s.getItem('dnd-vtt-lobby-dice-colors')).toBe('{}')
    expect(s.getItem('lobby-dice-colors')).toBeNull()
  })

  it('does not clobber an already-migrated new key', () => {
    const s = makeStore({ 'library-recent': 'OLD', 'dnd-vtt-library-recent': 'NEW' })
    migrateLegacyStorageKeys(s)
    expect(s.getItem('dnd-vtt-library-recent')).toBe('NEW')
    expect(s.getItem('library-recent')).toBeNull()
  })

  it('is a no-op when there is nothing to migrate', () => {
    const s = makeStore({ 'dnd-vtt-library-recent': 'X' })
    expect(() => migrateLegacyStorageKeys(s)).not.toThrow()
    expect(s.getItem('dnd-vtt-library-recent')).toBe('X')
  })

  it('does not touch already-namespaced lobby-chat keys', () => {
    const s = makeStore({ 'dnd-vtt-lobby-chat-x': 'KEEP' })
    migrateLegacyStorageKeys(s)
    expect(s.getItem('dnd-vtt-lobby-chat-x')).toBe('KEEP')
  })
})
