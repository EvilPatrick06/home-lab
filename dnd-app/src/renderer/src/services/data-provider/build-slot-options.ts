import type { SelectableOption } from '../../types/character-common'

// Static, hard-coded build-slot option literals served by `getOptionsForSlot`
// in `data-provider.ts`. These are SRD/PHB rule choices with no backing data
// file, so they live here as constants. The inline `// boundary-allow:` comment
// suppresses the library-boundary literal-shape guard (data-provider is the
// imperative façade per services/library/README.md).

// boundary-allow: loader return-type — data-provider is the imperative façade per services/library/README.md
export const DRUIDIC_WARRIOR_OPTION: SelectableOption = {
  id: 'druidic-warrior',
  name: 'Druidic Warrior',
  rarity: 'common' as const,
  description:
    'You learn two Druid cantrips of your choice (Guidance and Starry Wisp are recommended). The chosen cantrips count as Ranger spells for you, and Wisdom is your spellcasting ability for them. Whenever you gain a Ranger level, you can replace one of these cantrips with another Druid cantrip.',
  traits: [],
  source: 'PHB 2024',
  detailFields: []
}

// boundary-allow: loader return-type — data-provider is the imperative façade per services/library/README.md
export const PRIMAL_ORDER_OPTIONS: SelectableOption[] = [
  {
    id: 'magician',
    name: 'Magician',
    rarity: 'common',
    description:
      'You know one extra cantrip from the Primal spell list. In addition, your mystical connection to nature gives you a bonus to your Intelligence (Arcana or Nature) checks equal to your Wisdom modifier (minimum bonus of +1).',
    traits: [],
    source: 'SRD',
    detailFields: [
      { label: 'Bonus Cantrip', value: '+1 Primal cantrip' },
      { label: 'Skill Bonus', value: 'Arcana/Nature checks + WIS modifier (min +1)' }
    ]
  },
  {
    id: 'warden',
    name: 'Warden',
    rarity: 'common',
    description: 'Trained for battle, you gain proficiency with Martial weapons and training with Medium armor.',
    traits: [],
    source: 'SRD',
    detailFields: [
      { label: 'Armor', value: 'Medium armor proficiency' },
      { label: 'Weapons', value: 'Martial weapons proficiency' }
    ]
  }
]

// boundary-allow: loader return-type — data-provider is the imperative façade per services/library/README.md
export const DIVINE_ORDER_OPTIONS: SelectableOption[] = [
  {
    id: 'protector',
    name: 'Protector',
    rarity: 'common',
    description: 'Trained for battle, you gain proficiency with Martial weapons and training with Heavy armor.',
    traits: [],
    source: 'SRD',
    detailFields: [
      { label: 'Armor', value: 'Heavy armor proficiency' },
      { label: 'Weapons', value: 'Martial weapons proficiency' }
    ]
  },
  {
    id: 'thaumaturge',
    name: 'Thaumaturge',
    rarity: 'common',
    description:
      'You know one extra cantrip from the Divine spell list. In addition, your mystical connection to the divine gives you a bonus to Intelligence (Religion) checks equal to your Wisdom modifier (minimum bonus of +1).',
    traits: [],
    source: 'SRD',
    detailFields: [
      { label: 'Bonus Cantrip', value: '+1 Divine cantrip' },
      { label: 'Skill Bonus', value: 'Religion checks + WIS modifier (min +1)' }
    ]
  }
]
