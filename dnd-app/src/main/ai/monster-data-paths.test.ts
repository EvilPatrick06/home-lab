/**
 * Contract: bestiary JSON paths must match `context-builder` + `srd-provider`
 * (post-reorg location under `dm/npcs/`).
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const _mainDir = dirname(fileURLToPath(import.meta.url))
const dataDir = join(_mainDir, '..', '..', 'renderer', 'public', 'data', '5e')
const expectedFiles = ['dm/npcs/monsters.json', 'dm/npcs/creatures.json', 'dm/npcs/npcs.json'] as const

describe('5e monster JSON paths', () => {
  for (const rel of expectedFiles) {
    it(`exists and is a non-empty id array: ${rel}`, () => {
      const full = join(dataDir, rel)
      expect(existsSync(full), `missing: ${full}`).toBe(true)
      const data = JSON.parse(readFileSync(full, 'utf8')) as { id?: string }[]
      expect(Array.isArray(data), rel).toBe(true)
      expect(data.length).toBeGreaterThan(0)
      expect(data.some((e) => typeof e.id === 'string')).toBe(true)
    })
  }
})
