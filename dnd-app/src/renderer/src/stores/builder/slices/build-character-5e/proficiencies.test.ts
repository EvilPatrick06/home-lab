import { describe, expect, it } from 'vitest'
import { computeBuilderProficiencies5e } from './proficiencies'

const BASE = {
  classData: null,
  bgData: null,
  storeBgEquipment: [] as { option: string; items: string[]; source: string }[],
  isWarden: false,
  isProtector: false
}

describe('computeBuilderProficiencies5e — languages', () => {
  it('always grants Common in addition to the chosen languages (2024 PHB)', () => {
    const { langProfs } = computeBuilderProficiencies5e({
      ...BASE,
      classId: 'wizard',
      chosenLangs: ['Draconic', 'Giant']
    })
    expect(langProfs).toContain('Common')
    expect(langProfs).toContain('Draconic')
    expect(langProfs).toContain('Giant')
    // Common is granted, not chosen — it leads the list and does not duplicate.
    expect(langProfs[0]).toBe('Common')
    expect(langProfs.filter((l) => l === 'Common')).toHaveLength(1)
  })

  it('grants Common even when no languages are chosen', () => {
    const { langProfs } = computeBuilderProficiencies5e({
      ...BASE,
      classId: 'fighter',
      chosenLangs: []
    })
    expect(langProfs).toEqual(['Common'])
  })

  it('does not duplicate Common if it was somehow chosen', () => {
    const { langProfs } = computeBuilderProficiencies5e({
      ...BASE,
      classId: 'fighter',
      chosenLangs: ['Common', 'Elvish']
    })
    expect(langProfs.filter((l) => l === 'Common')).toHaveLength(1)
    expect(langProfs).toContain('Elvish')
  })

  it('still appends class freebies (Druidic / Thieves Cant) alongside Common', () => {
    const druid = computeBuilderProficiencies5e({ ...BASE, classId: 'druid', chosenLangs: ['Elvish'] })
    expect(druid.langProfs).toEqual(expect.arrayContaining(['Common', 'Elvish', 'Druidic']))
    const rogue = computeBuilderProficiencies5e({ ...BASE, classId: 'rogue', chosenLangs: ['Elvish'] })
    expect(rogue.langProfs).toEqual(expect.arrayContaining(['Common', 'Elvish', "Thieves' Cant"]))
  })
})
