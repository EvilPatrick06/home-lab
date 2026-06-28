import { describe, expect, it, vi } from 'vitest'

const { loadCharacterById } = vi.hoisted(() => ({ loadCharacterById: vi.fn() }))
vi.mock('./context/character-context', () => ({ loadCharacterById }))

import { buildGameStateSnapshot, dedupeStatChanges, validateAgainstGameState } from './game-state-validation'
import type { AiChatRequest, StatChange } from './types'

const snap = { partyNames: ['Aria', 'Korgan'], creatureLabels: ['Goblin'] }

describe('game-state-validation (PHASE-23 23C)', () => {
  describe('buildGameStateSnapshot', () => {
    it('resolves names and tolerates a failing load', async () => {
      loadCharacterById.mockReset()
      loadCharacterById.mockResolvedValueOnce({ name: 'Aria' })
      loadCharacterById.mockRejectedValueOnce(new Error('disk'))
      loadCharacterById.mockResolvedValueOnce({ name: 'Korgan' })
      const req = {
        characterIds: ['a', 'b', 'c'],
        activeCreatures: [{ label: 'Goblin', currentHP: 7, maxHP: 7, ac: 15, conditions: [] }]
      } as unknown as AiChatRequest
      const s = await buildGameStateSnapshot(req)
      expect(s.partyNames).toEqual(['Aria', 'Korgan'])
      expect(s.creatureLabels).toEqual(['Goblin'])
    })
  })

  describe('validateAgainstGameState referents', () => {
    it('accepts a known party member, rejects an unknown one', () => {
      const ok: StatChange = { type: 'damage', characterName: 'Aria', value: 5, reason: 'x' }
      const bad: StatChange = { type: 'damage', characterName: 'Bob', value: 5, reason: 'x' }
      const r = validateAgainstGameState([ok, bad], snap)
      expect(r.valid).toEqual([ok])
      expect(r.rejected[0].reason).toContain('unknown character')
    })
    it('rejects an unknown creature label', () => {
      const bad: StatChange = { type: 'creature_damage', targetLabel: 'Dragon', value: 5, reason: 'x' }
      expect(validateAgainstGameState([bad], snap).rejected[0].reason).toContain('unknown creature')
    })
    it('passes an unset characterName (acting character)', () => {
      const c: StatChange = { type: 'heal', value: 3, reason: 'x' }
      expect(validateAgainstGameState([c], snap).valid).toEqual([c])
    })
  })

  describe('validateAgainstGameState bounds', () => {
    const cn = 'Aria'
    it('rejects damage out of [1,1000]', () => {
      expect(
        validateAgainstGameState([{ type: 'damage', characterName: cn, value: 0, reason: 'x' }], snap).rejected
      ).toHaveLength(1)
      expect(
        validateAgainstGameState([{ type: 'damage', characterName: cn, value: 9999, reason: 'x' }], snap).rejected
      ).toHaveLength(1)
      expect(
        validateAgainstGameState([{ type: 'damage', characterName: cn, value: 7, reason: 'x' }], snap).valid
      ).toHaveLength(1)
    })
    it('accepts temp_hp 0 but rejects > 1000', () => {
      expect(
        validateAgainstGameState([{ type: 'temp_hp', characterName: cn, value: 0, reason: 'x' }], snap).valid
      ).toHaveLength(1)
      expect(
        validateAgainstGameState([{ type: 'temp_hp', characterName: cn, value: 1001, reason: 'x' }], snap).rejected
      ).toHaveLength(1)
    })
    it('bounds gold/xp/exhaustion/spell-slot', () => {
      expect(
        validateAgainstGameState([{ type: 'gold', characterName: cn, value: 999999, reason: 'x' }], snap).rejected
      ).toHaveLength(1)
      expect(
        validateAgainstGameState([{ type: 'xp', characterName: cn, value: -1, reason: 'x' }], snap).rejected
      ).toHaveLength(1)
      expect(
        validateAgainstGameState([{ type: 'add_exhaustion', characterName: cn, levels: 7, reason: 'x' }], snap).rejected
      ).toHaveLength(1)
      expect(
        validateAgainstGameState([{ type: 'add_exhaustion', characterName: cn, levels: 1.5, reason: 'x' }], snap)
          .rejected
      ).toHaveLength(1)
      expect(
        validateAgainstGameState([{ type: 'expend_spell_slot', characterName: cn, level: 10, reason: 'x' }], snap)
          .rejected
      ).toHaveLength(1)
      expect(
        validateAgainstGameState([{ type: 'expend_spell_slot', characterName: cn, level: 3, reason: 'x' }], snap).valid
      ).toHaveLength(1)
    })
    it('passes unlisted types through untouched', () => {
      const c = { type: 'npc_attitude', name: 'Volo', attitude: 'friendly', reason: 'x' } as unknown as StatChange
      expect(validateAgainstGameState([c], snap).valid).toEqual([c])
    })
  })

  describe('dedupeStatChanges', () => {
    it('drops an extraction echo of a tag-path change (reason ignored, case-insensitive)', () => {
      const base: StatChange[] = [{ type: 'damage', characterName: 'Aria', value: 5, reason: 'tag' }]
      const incoming: StatChange[] = [
        { type: 'damage', characterName: 'aria', value: 5, reason: 'extracted, rephrased' },
        { type: 'heal', characterName: 'Korgan', value: 3, reason: 'new' }
      ]
      const out = dedupeStatChanges(base, incoming)
      expect(out).toHaveLength(1)
      expect(out[0]).toMatchObject({ type: 'heal', characterName: 'Korgan' })
    })
  })
})
