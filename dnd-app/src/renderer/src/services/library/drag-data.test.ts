import { describe, expect, it } from 'vitest'
import type { LibraryDragPayload } from './drag-data'
import { getDragPayload, hasLibraryDrag, setDragPayload } from './drag-data'

const MIME = 'application/x-dndvtt-drag'

function makeDragEvent(data: Record<string, string> = {}, types: string[] = []): React.DragEvent {
  return {
    dataTransfer: {
      setData: (_key: string, _val: string) => {
        data[_key] = _val
      },
      getData: (key: string) => data[key] ?? '',
      effectAllowed: 'none',
      types: types.length > 0 ? types : Object.keys(data)
    }
  } as unknown as React.DragEvent
}

describe('drag-data', () => {
  describe('setDragPayload / getDragPayload roundtrip', () => {
    it('round-trips a monster payload', () => {
      const data: Record<string, string> = {}
      const e = makeDragEvent(data)
      const payload: LibraryDragPayload = { type: 'library-monster', itemId: 'goblin', itemName: 'Goblin' }
      setDragPayload(e, payload)

      const result = getDragPayload(makeDragEvent(data))
      expect(result).toEqual(payload)
    })

    it('round-trips a spell payload', () => {
      const data: Record<string, string> = {}
      const e = makeDragEvent(data)
      const payload: LibraryDragPayload = { type: 'library-spell', itemId: 'fireball', itemName: 'Fireball' }
      setDragPayload(e, payload)

      const result = getDragPayload(makeDragEvent(data))
      expect(result).toEqual(payload)
    })

    it('round-trips an item payload with category', () => {
      const data: Record<string, string> = {}
      const e = makeDragEvent(data)
      const payload: LibraryDragPayload = {
        type: 'library-item',
        itemId: 'longsword',
        itemName: 'Longsword',
        category: 'weapons'
      }
      setDragPayload(e, payload)

      const result = getDragPayload(makeDragEvent(data))
      expect(result).toEqual(payload)
    })
  })

  describe('getDragPayload', () => {
    it('returns null for empty data', () => {
      const result = getDragPayload(makeDragEvent())
      expect(result).toBeNull()
    })

    it('returns null for invalid JSON', () => {
      const data = { [MIME]: 'not-valid-json{' }
      const result = getDragPayload(makeDragEvent(data))
      expect(result).toBeNull()
    })

    it('returns null when no dataTransfer', () => {
      const e = { dataTransfer: null } as unknown as DragEvent
      const result = getDragPayload(e)
      expect(result).toBeNull()
    })
  })

  describe('hasLibraryDrag', () => {
    it('returns true when MIME type is present', () => {
      const data = { [MIME]: '{}' }
      const e = makeDragEvent(data, [MIME])
      expect(hasLibraryDrag(e)).toBe(true)
    })

    it('returns false when MIME type is absent', () => {
      const e = makeDragEvent({}, ['text/plain'])
      expect(hasLibraryDrag(e)).toBe(false)
    })

    it('returns false when no dataTransfer', () => {
      const e = { dataTransfer: null } as unknown as DragEvent
      expect(hasLibraryDrag(e)).toBe(false)
    })
  })
})
