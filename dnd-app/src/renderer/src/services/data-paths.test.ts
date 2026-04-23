import { describe, expect, it } from 'vitest'
import { DATA_PATHS } from './data-paths'

describe('DATA_PATHS', () => {
  it('is a frozen (readonly) object', () => {
    // The `as const` assertion makes it deeply readonly at the type level
    expect(DATA_PATHS).toBeDefined()
    expect(typeof DATA_PATHS).toBe('object')
  })

  it('contains expected character data paths', () => {
    expect(DATA_PATHS.classIndex).toBe('./data/5e/classes/index.json')
    expect(DATA_PATHS.speciesIndex).toBe('./data/5e/origins/species/index.json')
    expect(DATA_PATHS.backgroundIndex).toBe('./data/5e/origins/backgrounds/index.json')
    expect(DATA_PATHS.featIndex).toBe('./data/5e/feats/index.json')
    expect(DATA_PATHS.subclasses).toBe('./data/5e/character/subclasses.json')
  })

  it('contains expected spell data path', () => {
    expect(DATA_PATHS.spells).toBe('./data/5e/spells/spells.json')
  })

  it('contains expected equipment data paths', () => {
    expect(DATA_PATHS.equipment).toBe('./data/5e/equipment/equipment.json')
    expect(DATA_PATHS.magicItems).toBe('./data/5e/equipment/magic-items.json')
    expect(DATA_PATHS.mounts).toBe('./data/5e/equipment/mounts.json')
    expect(DATA_PATHS.trinkets).toBe('./data/5e/equipment/trinkets.json')
  })

  it('contains expected DM/NPC data paths', () => {
    expect(DATA_PATHS.monsters).toBe('./data/5e/dm/npcs/monsters.json')
    expect(DATA_PATHS.creatures).toBe('./data/5e/dm/npcs/creatures.json')
    expect(DATA_PATHS.npcs).toBe('./data/5e/dm/npcs/npcs.json')
  })

  it('contains expected world data paths', () => {
    expect(DATA_PATHS.crafting).toBe('./data/5e/world/crafting.json')
    expect(DATA_PATHS.downtime).toBe('./data/5e/world/downtime.json')
    expect(DATA_PATHS.settlements).toBe('./data/5e/world/settlements.json')
  })

  it('contains expected game mechanics paths', () => {
    expect(DATA_PATHS.skills).toBe('./data/5e/game/mechanics/skills.json')
    expect(DATA_PATHS.spellSlots).toBe('./data/5e/game/mechanics/spell-slots.json')
    expect(DATA_PATHS.weaponMastery).toBe('./data/5e/game/mechanics/weapon-mastery.json')
  })

  it('contains expected audio data paths', () => {
    expect(DATA_PATHS.soundEvents).toBe('./data/audio/sound-events.json')
    expect(DATA_PATHS.ambientTracks).toBe('./data/audio/ambient-tracks.json')
  })

  it('contains expected UI data paths', () => {
    expect(DATA_PATHS.keyboardShortcuts).toBe('./data/ui/keyboard-shortcuts.json')
    expect(DATA_PATHS.themes).toBe('./data/ui/themes.json')
    expect(DATA_PATHS.diceColors).toBe('./data/ui/dice-colors.json')
  })

  it('all paths are strings ending with .json', () => {
    for (const [key, path] of Object.entries(DATA_PATHS)) {
      expect(typeof key).toBe('string')
      expect(key.length).toBeGreaterThan(0)
      expect(typeof path).toBe('string')
      expect(path.endsWith('.json')).toBe(true)
    }
  })

  it('all paths start with ./', () => {
    for (const [key, path] of Object.entries(DATA_PATHS)) {
      expect(typeof key).toBe('string')
      expect(key.length).toBeGreaterThan(0)
      expect(path.startsWith('./')).toBe(true)
    }
  })

  it('has the expected number of data paths', () => {
    const count = Object.keys(DATA_PATHS).length
    expect(count).toBeGreaterThanOrEqual(70)
  })
})
