import { describe, expect, it } from 'vitest'
import { isGoldOnlyOption, parseGoldItem, resolveBackgroundGear } from './starting-gear'

describe('parseGoldItem', () => {
  it('parses "<N> GP" pseudo-items and returns 0 for real gear', () => {
    expect(parseGoldItem('50 GP')).toBe(50)
    expect(parseGoldItem('15gp')).toBe(15)
    expect(parseGoldItem('  8 GP ')).toBe(8)
    expect(parseGoldItem('Backpack')).toBe(0)
    expect(parseGoldItem('2 GP pouch')).toBe(0) // not pure gold
  })
})

describe('isGoldOnlyOption', () => {
  it('is true only when every item is a gold pseudo-item', () => {
    expect(isGoldOnlyOption({ items: ['50 GP'] })).toBe(true)
    expect(isGoldOnlyOption({ items: ['15 GP', 'Crowbar'] })).toBe(false)
    expect(isGoldOnlyOption({ items: [] })).toBe(false)
  })
})

describe('resolveBackgroundGear (INV-1)', () => {
  const options = [
    { items: ['Crowbar', 'Hammer', '15 GP'] }, // equipment option (gear + bundled gold)
    { items: ['50 GP'] } // pure-gold option
  ]

  it('equipment choice → real gear only, bundled gold split out to currency', () => {
    const r = resolveBackgroundGear(options, 'equipment')
    expect(r.items.map((i) => i.name)).toEqual(['Crowbar', 'Hammer'])
    expect(r.gold).toBe(15)
  })

  it('gold choice → no inventory items, the full gold value', () => {
    const r = resolveBackgroundGear(options, 'gold')
    expect(r.items).toEqual([])
    expect(r.gold).toBe(50)
  })

  it('gold choice with no gold-only option falls back to 50 gp', () => {
    expect(resolveBackgroundGear([{ items: ['Sword'] }], 'gold').gold).toBe(50)
  })
})
