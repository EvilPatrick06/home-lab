// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { hashBytes } from './hash'
import { decide, makeKey, parseKey, type RemoteMeta } from './reconcile-plan'
import { clearSyncState, loadSyncState, saveSyncState } from './sync-state'

const rem = (over: Partial<RemoteMeta> = {}): RemoteMeta => ({
  domain: 'characters',
  id: 'c1',
  hash: 'h',
  version: 1,
  mtime: 0,
  size: 0,
  deleted: false,
  ...over
})

describe('hashBytes', () => {
  it('is deterministic and content-sensitive', () => {
    const a = new TextEncoder().encode('hello').buffer
    const b = new TextEncoder().encode('hello').buffer
    const c = new TextEncoder().encode('world').buffer
    expect(hashBytes(a)).toBe(hashBytes(b))
    expect(hashBytes(a)).not.toBe(hashBytes(c))
    expect(hashBytes(a)).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('parseKey / makeKey', () => {
  it('round-trips composite (slash-bearing) ids', () => {
    expect(parseKey(makeKey('homebrew', 'spells/fireball'))).toEqual({ domain: 'homebrew', id: 'spells/fireball' })
  })
})

describe('decide (reconcile policy)', () => {
  it('new local → push v1', () => {
    expect(decide({ hash: 'h' }, undefined, undefined)).toEqual({ type: 'push', version: 1 })
  })

  it('remote-only, new to this device → pull', () => {
    expect(decide(undefined, rem({ version: 3, hash: 'r' }), undefined)).toEqual({
      type: 'pull',
      version: 3,
      hash: 'r'
    })
  })

  it('in-sync and unchanged → none', () => {
    expect(decide({ hash: 'h' }, rem({ version: 2, hash: 'h' }), { version: 2, syncedHash: 'h' })).toEqual({
      type: 'none'
    })
  })

  it('local changed, remote not advanced → push (bumped version)', () => {
    expect(decide({ hash: 'h2' }, rem({ version: 2, hash: 'h' }), { version: 2, syncedHash: 'h' })).toEqual({
      type: 'push',
      version: 3
    })
  })

  it('remote advanced but identical content → just record version', () => {
    expect(decide({ hash: 'h' }, rem({ version: 5, hash: 'h' }), { version: 2, syncedHash: 'h' })).toEqual({
      type: 'recordVersion',
      version: 5,
      hash: 'h'
    })
  })

  it('true conflict (both changed) → pull, cloud wins', () => {
    expect(decide({ hash: 'local' }, rem({ version: 5, hash: 'remote' }), { version: 2, syncedHash: 'old' })).toEqual({
      type: 'pull',
      version: 5,
      hash: 'remote'
    })
  })

  it('remote tombstone, local still present → applyDelete', () => {
    expect(
      decide({ hash: 'h' }, rem({ version: 4, deleted: true, hash: null }), { version: 2, syncedHash: 'h' })
    ).toEqual({ type: 'applyDelete', version: 4 })
  })

  it('locally deleted, remote unchanged → deleteRemote', () => {
    expect(decide(undefined, rem({ version: 2, hash: 'h' }), { version: 2, syncedHash: 'h' })).toEqual({
      type: 'deleteRemote',
      version: 3
    })
  })

  it('locally deleted but remote re-created/advanced → pull (remote wins)', () => {
    expect(decide(undefined, rem({ version: 5, hash: 'h' }), { version: 2, syncedHash: 'h' })).toEqual({
      type: 'pull',
      version: 5,
      hash: 'h'
    })
  })

  it('remote tombstone already applied → none', () => {
    expect(decide(undefined, rem({ version: 2, deleted: true, hash: null }), { version: 2, syncedHash: '' })).toEqual({
      type: 'none'
    })
  })
})

describe('sync-state persistence', () => {
  beforeEach(() => clearSyncState())

  it('round-trips through localStorage', () => {
    saveSyncState({ 'characters/c1': { version: 3, syncedHash: 'abc' } })
    expect(loadSyncState()).toEqual({ 'characters/c1': { version: 3, syncedHash: 'abc' } })
  })

  it('returns an empty map when nothing is stored', () => {
    expect(loadSyncState()).toEqual({})
  })
})
