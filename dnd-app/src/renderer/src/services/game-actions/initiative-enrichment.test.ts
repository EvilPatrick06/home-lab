import { describe, expect, it, vi } from 'vitest'

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }))
vi.mock('../game/token-stats', () => ({ lookupTokenStatBlock: lookup }))

import type { InitiativeEntry } from '../../types/game-state'
import type { MapToken } from '../../types/map'
import { enrichInitiativeEntry } from './initiative-enrichment'

const baseEntry = (over: Partial<InitiativeEntry> = {}): InitiativeEntry => ({
  id: 'e1',
  entityId: 'ent-1',
  entityName: 'Dragon',
  entityType: 'enemy',
  roll: 10,
  modifier: 0,
  total: 10,
  isActive: false,
  ...over
})
const token = { monsterStatBlockId: 'mon-1' } as MapToken

describe('enrichInitiativeEntry (08B)', () => {
  it('returns the entry unchanged when the token has no stat block', () => {
    lookup.mockReturnValueOnce(undefined)
    const e = baseEntry()
    expect(enrichInitiativeEntry(e, undefined)).toBe(e)
  })

  it('maps legendaryActions.uses → { maximum, used: 0 }', () => {
    lookup.mockReturnValueOnce({ legendaryActions: { uses: 3, actions: [] }, traits: [], actions: [] })
    const out = enrichInitiativeEntry(baseEntry(), token)
    expect(out.legendaryActions).toEqual({ maximum: 3, used: 0 })
  })

  it('parses the legendary-resistance count and bumps it in-lair (2024 format)', () => {
    lookup.mockReturnValue({
      traits: [{ name: 'Legendary Resistance (3/Day, or 4/Day in Lair)' }],
      actions: []
    })
    expect(enrichInitiativeEntry(baseEntry(), token).legendaryResistances).toEqual({ max: 3, remaining: 3 })
    expect(enrichInitiativeEntry(baseEntry({ inLair: true }), token).legendaryResistances).toEqual({
      max: 4,
      remaining: 4
    })
    lookup.mockReset()
  })

  it('parses recharge abilities but NOT "(Recharges after a Short or Long Rest)"', () => {
    lookup.mockReturnValueOnce({
      traits: [],
      actions: [{ name: 'Fire Breath (Recharge 5-6)' }, { name: 'Frost Breath (Recharge 6)' }],
      bonusActions: [{ name: 'Teleport (Recharges after a Short or Long Rest)' }]
    })
    const out = enrichInitiativeEntry(baseEntry(), token)
    expect(out.rechargeAbilities).toEqual([
      { name: 'Fire Breath', rechargeOn: 5, available: true },
      { name: 'Frost Breath', rechargeOn: 6, available: true }
    ])
  })

  it('never overwrites a manually-entered legendary-resistance value', () => {
    lookup.mockReturnValueOnce({ traits: [{ name: 'Legendary Resistance (3/Day)' }], actions: [] })
    const out = enrichInitiativeEntry(baseEntry({ legendaryResistances: { max: 5, remaining: 5 } }), token)
    expect(out.legendaryResistances).toEqual({ max: 5, remaining: 5 })
  })

  it('attaches lairActions only when the creature is in its lair', () => {
    const lairActions = { actions: [{ name: 'Grasping Roots', description: 'Roots erupt.' }] }
    lookup.mockReturnValue({ traits: [], actions: [], lairActions })
    expect(enrichInitiativeEntry(baseEntry(), token).lairActions).toBeUndefined()
    expect(enrichInitiativeEntry(baseEntry({ inLair: true }), token).lairActions).toEqual(lairActions.actions)
    lookup.mockReset()
  })
})
