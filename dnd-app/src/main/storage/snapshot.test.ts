import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { snapshotIfFirstMigration } from './snapshot'

describe('snapshotIfFirstMigration', () => {
  let dir: string
  let save: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'snap-'))
    save = join(dir, 'character.json')
    writeFileSync(save, '{"schemaVersion":3,"name":"Aria"}')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes a .pre-phase-15.bak when stepping past v3', () => {
    const bak = snapshotIfFirstMigration(save, 3, 4)
    expect(bak).toBe(`${save}.pre-phase-15.bak`)
    expect(existsSync(bak!)).toBe(true)
    expect(readFileSync(bak!, 'utf-8')).toContain('Aria')
  })

  it('never overwrites an existing snapshot (idempotent)', () => {
    snapshotIfFirstMigration(save, 3, 4)
    // Mutate the save, then re-run — the .bak must keep the pristine original.
    writeFileSync(save, '{"schemaVersion":4,"name":"Mutated"}')
    const second = snapshotIfFirstMigration(save, 3, 4)
    expect(second).toBeNull()
    expect(readFileSync(`${save}.pre-phase-15.bak`, 'utf-8')).toContain('Aria')
  })

  it('skips when not crossing the v3→v4 boundary', () => {
    expect(snapshotIfFirstMigration(save, 4, 5)).toBeNull()
    expect(snapshotIfFirstMigration(save, 1, 2)).toBeNull()
    expect(existsSync(`${save}.pre-phase-15.bak`)).toBe(false)
  })

  it('returns null when the source file does not exist', () => {
    expect(snapshotIfFirstMigration(join(dir, 'missing.json'), 3, 4)).toBeNull()
  })
})
