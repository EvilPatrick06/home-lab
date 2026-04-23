import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }
}))

// Mock window.api
vi.stubGlobal('window', {
  api: {
    showSaveDialog: vi.fn(() => Promise.resolve('/fake/path/export.dndmonster')),
    showOpenDialog: vi.fn(() => Promise.resolve('/fake/path/import.dndmonster')),
    writeFile: vi.fn(() => Promise.resolve()),
    readFile: vi.fn(() => Promise.resolve('{}'))
  }
})

// Provide crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'entity-uuid-1234' })

describe('entity-io', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Helper exports ──

  describe('getEntityExtension', () => {
    it('returns correct extension for known entity types', async () => {
      const { getEntityExtension } = await import('./entity-io')
      expect(getEntityExtension('monster')).toBe('dndmonster')
      expect(getEntityExtension('npc')).toBe('dndnpc')
      expect(getEntityExtension('encounter')).toBe('dndencounter')
      expect(getEntityExtension('map')).toBe('dndmap')
      expect(getEntityExtension('lore')).toBe('dndlore')
      expect(getEntityExtension('bastion')).toBe('dndbastion')
      expect(getEntityExtension('companion')).toBe('dndcompanion')
      expect(getEntityExtension('mount')).toBe('dndmount')
      expect(getEntityExtension('journal')).toBe('dndjournal')
      expect(getEntityExtension('ai')).toBe('dndai')
      expect(getEntityExtension('settings')).toBe('dndsettings')
      expect(getEntityExtension('adventure')).toBe('dndadv')
    })

    it('returns json for unknown entity type', async () => {
      const { getEntityExtension } = await import('./entity-io')
      expect(getEntityExtension('unknown' as never)).toBe('json')
    })
  })

  describe('getEntityLabel', () => {
    it('returns correct label for known entity types', async () => {
      const { getEntityLabel } = await import('./entity-io')
      expect(getEntityLabel('monster')).toBe('Monster / Creature')
      expect(getEntityLabel('npc')).toBe('NPC')
      expect(getEntityLabel('adventure')).toBe('Adventure Module')
    })

    it('returns type string for unknown entity type', async () => {
      const { getEntityLabel } = await import('./entity-io')
      expect(getEntityLabel('unknown' as never)).toBe('unknown')
    })
  })

  describe('reIdItems', () => {
    it('assigns new UUIDs to each item', async () => {
      const { reIdItems } = await import('./entity-io')
      const items = [
        { id: 'old-1', name: 'Goblin' },
        { id: 'old-2', name: 'Orc' }
      ]
      const result = reIdItems(items)
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('entity-uuid-1234')
      expect(result[0].name).toBe('Goblin')
      expect(result[1].name).toBe('Orc')
    })

    it('preserves all other properties', async () => {
      const { reIdItems } = await import('./entity-io')
      const items = [{ id: 'x', name: 'Dragon', hp: 200, cr: '15' }]
      const result = reIdItems(items)
      expect(result[0].name).toBe('Dragon')
      expect((result[0] as Record<string, unknown>).hp).toBe(200)
      expect((result[0] as Record<string, unknown>).cr).toBe('15')
    })
  })

  // ── Export ──

  describe('exportEntities', () => {
    it('exports a single entity to a file', async () => {
      const { exportEntities } = await import('./entity-io')
      const items = [{ id: 'm1', name: 'Goblin' }]
      const result = await exportEntities('monster', items)
      expect(result).toBe(true)
      expect(window.api.showSaveDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Export Monster / Creature',
          filters: [{ name: 'Monster / Creature', extensions: ['dndmonster'] }]
        })
      )
      expect(window.api.writeFile).toHaveBeenCalledWith(
        '/fake/path/export.dndmonster',
        expect.stringContaining('"version": 1')
      )
    })

    it('exports multiple entities as an array in the envelope', async () => {
      const { exportEntities } = await import('./entity-io')
      const items = [
        { id: 'm1', name: 'Goblin' },
        { id: 'm2', name: 'Orc' }
      ]
      const result = await exportEntities('monster', items)
      expect(result).toBe(true)
      const writeCall = vi.mocked(window.api.writeFile).mock.calls[0]
      const written = JSON.parse(writeCall[1] as string)
      expect(written.count).toBe(2)
      expect(Array.isArray(written.data)).toBe(true)
    })

    it('returns false if user cancels the save dialog', async () => {
      vi.mocked(window.api.showSaveDialog).mockResolvedValueOnce(null)
      const { exportEntities } = await import('./entity-io')
      const result = await exportEntities('monster', [{ id: 'm1', name: 'X' }])
      expect(result).toBe(false)
    })

    it('returns false on write error', async () => {
      vi.mocked(window.api.writeFile).mockRejectedValueOnce(new Error('write failed'))
      const { exportEntities } = await import('./entity-io')
      const result = await exportEntities('monster', [{ id: 'm1', name: 'X' }])
      expect(result).toBe(false)
    })
  })

  describe('exportSingleEntity', () => {
    it('delegates to exportEntities with a single-item array', async () => {
      const { exportSingleEntity } = await import('./entity-io')
      const result = await exportSingleEntity('npc', { id: 'n1', name: 'Volo' })
      expect(result).toBe(true)
      expect(window.api.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'Export NPC' }))
    })
  })

  // ── Import ──

  describe('importEntities', () => {
    it('imports entities from a valid envelope file', async () => {
      const envelope = {
        version: 1,
        type: 'monster',
        exportedAt: '2024-01-01',
        count: 1,
        data: { id: 'm1', name: 'Dragon' }
      }
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(envelope))

      const { importEntities } = await import('./entity-io')
      const result = await importEntities('monster')
      expect(result).not.toBeNull()
      expect(result!.items).toHaveLength(1)
      expect(result!.items[0]).toEqual({ id: 'm1', name: 'Dragon' })
    })

    it('imports an array of entities from envelope', async () => {
      const envelope = {
        version: 1,
        type: 'monster',
        exportedAt: '2024-01-01',
        count: 2,
        data: [
          { id: 'm1', name: 'Goblin' },
          { id: 'm2', name: 'Orc' }
        ]
      }
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(envelope))

      const { importEntities } = await import('./entity-io')
      const result = await importEntities('monster')
      expect(result).not.toBeNull()
      expect(result!.items).toHaveLength(2)
      expect(result!.count).toBe(2)
    })

    it('returns null if user cancels the open dialog', async () => {
      vi.mocked(window.api.showOpenDialog).mockResolvedValueOnce(null)
      const { importEntities } = await import('./entity-io')
      const result = await importEntities('monster')
      expect(result).toBeNull()
    })

    it('falls back to bare-object import when no envelope', async () => {
      const bareObj = { id: 'm1', name: 'Bare Monster' }
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(bareObj))

      const { importEntities } = await import('./entity-io')
      const result = await importEntities('monster')
      expect(result).not.toBeNull()
      expect(result!.items[0]).toEqual(bareObj)
    })

    it('falls back to bare-array import when no envelope', async () => {
      const bareArr = [
        { id: 'm1', name: 'A' },
        { id: 'm2', name: 'B' }
      ]
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(bareArr))

      const { importEntities } = await import('./entity-io')
      const result = await importEntities('monster')
      expect(result).not.toBeNull()
      expect(result!.items).toHaveLength(2)
    })

    it('throws on malformed JSON', async () => {
      vi.mocked(window.api.readFile).mockResolvedValueOnce('not json at all')

      const { importEntities } = await import('./entity-io')
      await expect(importEntities('monster')).rejects.toThrow('malformed JSON')
    })

    it('throws when envelope version is wrong', async () => {
      const badEnvelope = { version: 2, type: 'monster', data: { id: '1', name: 'X' } }
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(badEnvelope))

      const { importEntities } = await import('./entity-io')
      // version !== 1 → validateEnvelope returns null
      // Bare object { version, type, data } has no 'id'/'name' at root → validateItem fails
      // Falls through to throw
      await expect(importEntities('monster')).rejects.toThrow('missing envelope or required fields')
    })

    it('throws when envelope type does not match expected type', async () => {
      const wrongType = { version: 1, type: 'npc', data: { id: '1', name: 'X' } }
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(wrongType))

      const { importEntities } = await import('./entity-io')
      // Falls through to bare-object check - this object does not have required 'id' and 'name' at root level
      // Actually it does since the parsed object has version/type/data but the bare object check looks for id/name
      // The parsed object IS { version: 1, type: 'npc', data: {...} } which does NOT have id/name
      await expect(importEntities('monster')).rejects.toThrow('missing envelope or required fields')
    })

    it('throws when items are missing required fields', async () => {
      const envelope = {
        version: 1,
        type: 'monster',
        exportedAt: '2024-01-01',
        count: 1,
        data: { badField: true } // Missing id and name
      }
      vi.mocked(window.api.readFile).mockResolvedValueOnce(JSON.stringify(envelope))

      const { importEntities } = await import('./entity-io')
      await expect(importEntities('monster')).rejects.toThrow('missing required fields')
    })
  })
})
