export type LibraryCategory =
  | 'characters'
  | 'campaigns'
  | 'bastions'
  | 'monsters'
  | 'creatures'
  | 'npcs'
  | 'companions'
  | 'spells'
  | 'invocations'
  | 'metamagic'
  | 'classes'
  | 'subclasses'
  | 'class-features'
  | 'species'
  | 'backgrounds'
  | 'feats'
  | 'supernatural-gifts'
  | 'magic-items'
  | 'weapons'
  | 'armor'
  | 'gear'
  | 'tools'
  | 'vehicles'
  | 'mounts'
  | 'siege-equipment'
  | 'trinkets'
  | 'light-sources'
  | 'sentient-items'
  | 'settlements'
  | 'crafting'
  | 'downtime'
  | 'environmental-effects'
  | 'traps'
  | 'hazards'
  | 'poisons'
  | 'diseases'
  | 'curses'
  | 'adventure-seeds'
  | 'calendars'
  | 'deities'
  | 'planes'
  | 'npc-names'
  | 'encounter-presets'
  | 'treasure-tables'
  | 'random-tables'
  | 'chase-tables'
  | 'conditions'
  | 'weapon-mastery'
  | 'languages'
  | 'skills'
  | 'fighting-styles'
  | 'actions'
  | 'cover'
  | 'dcs'
  | 'damage-types'
  | 'sounds'
  | 'portraits'
  | 'maps'
  | 'shop-templates'

export type LibraryGroup =
  | 'core-books'
  | 'my-content'
  | 'bestiary'
  | 'spellbook'
  | 'character-options'
  | 'equipment-items'
  | 'rules-reference'
  | 'world-building'
  | 'tables-encounters'
  | 'media'

interface LibraryGroupDef {
  id: LibraryGroup
  label: string
  categories: LibraryCategoryDef[]
}

interface LibraryCategoryDef {
  id: LibraryCategory
  label: string
  group: LibraryGroup
  source: 'user' | 'static' | 'mixed'
  icon: string
}

export interface HomebrewEntry {
  id: string
  type: LibraryCategory
  name: string
  data: Record<string, unknown>
  basedOn?: string
  createdAt: string
  updatedAt: string
}

export interface LibraryItem {
  id: string
  name: string
  category: LibraryCategory
  source: 'official' | 'homebrew'
  summary: string
  data: Record<string, unknown>
}

export const LIBRARY_GROUPS: LibraryGroupDef[] = [
  {
    id: 'core-books',
    label: 'Core Books',
    categories: []
  },
  {
    id: 'my-content',
    label: 'My Content',
    categories: [
      { id: 'characters', label: 'Characters', group: 'my-content', source: 'user', icon: '🧙' },
      { id: 'campaigns', label: 'Campaigns', group: 'my-content', source: 'user', icon: '📜' },
      { id: 'bastions', label: 'Bastions', group: 'my-content', source: 'user', icon: '🏰' },
      { id: 'portraits', label: 'Portraits & Icons', group: 'my-content', source: 'user', icon: '🖼️' },
      { id: 'shop-templates', label: 'Shop Templates', group: 'my-content', source: 'user', icon: '🏪' }
    ]
  },
  {
    id: 'bestiary',
    label: 'Bestiary',
    categories: [
      { id: 'monsters', label: 'Monsters', group: 'bestiary', source: 'mixed', icon: '👹' },
      { id: 'creatures', label: 'Creatures', group: 'bestiary', source: 'mixed', icon: '🐉' },
      { id: 'npcs', label: 'NPCs', group: 'bestiary', source: 'mixed', icon: '👤' },
      { id: 'companions', label: 'Companions', group: 'bestiary', source: 'mixed', icon: '🐾' }
    ]
  },
  {
    id: 'spellbook',
    label: 'Spellbook',
    categories: [
      { id: 'spells', label: 'Spells', group: 'spellbook', source: 'mixed', icon: '✨' },
      { id: 'invocations', label: 'Invocations', group: 'spellbook', source: 'mixed', icon: '🔮' },
      { id: 'metamagic', label: 'Metamagic', group: 'spellbook', source: 'mixed', icon: '⚡' }
    ]
  },
  {
    id: 'character-options',
    label: 'Character Options',
    categories: [
      { id: 'classes', label: 'Classes', group: 'character-options', source: 'mixed', icon: '⚔️' },
      { id: 'subclasses', label: 'Subclasses', group: 'character-options', source: 'mixed', icon: '🛡️' },
      { id: 'species', label: 'Species', group: 'character-options', source: 'mixed', icon: '🧝' },
      { id: 'backgrounds', label: 'Backgrounds', group: 'character-options', source: 'mixed', icon: '📖' },
      { id: 'feats', label: 'Feats', group: 'character-options', source: 'mixed', icon: '💪' },
      {
        id: 'supernatural-gifts',
        label: 'Supernatural Gifts',
        group: 'character-options',
        source: 'mixed',
        icon: '🌟'
      },
      { id: 'class-features', label: 'Class Features', group: 'character-options', source: 'static', icon: '📋' },
      { id: 'fighting-styles', label: 'Fighting Styles', group: 'character-options', source: 'static', icon: '🤺' }
    ]
  },
  {
    id: 'equipment-items',
    label: 'Equipment & Items',
    categories: [
      { id: 'weapons', label: 'Weapons', group: 'equipment-items', source: 'mixed', icon: '🗡️' },
      { id: 'armor', label: 'Armor', group: 'equipment-items', source: 'mixed', icon: '🛡️' },
      { id: 'gear', label: 'Adventuring Gear', group: 'equipment-items', source: 'mixed', icon: '🎒' },
      { id: 'tools', label: 'Tools', group: 'equipment-items', source: 'mixed', icon: '🔧' },
      { id: 'magic-items', label: 'Magic Items', group: 'equipment-items', source: 'mixed', icon: '💎' },
      { id: 'vehicles', label: 'Vehicles', group: 'equipment-items', source: 'mixed', icon: '🚢' },
      { id: 'mounts', label: 'Mounts', group: 'equipment-items', source: 'mixed', icon: '🐴' },
      { id: 'siege-equipment', label: 'Siege Equipment', group: 'equipment-items', source: 'mixed', icon: '💣' },
      { id: 'trinkets', label: 'Trinkets', group: 'equipment-items', source: 'mixed', icon: '📿' },
      { id: 'light-sources', label: 'Light Sources', group: 'equipment-items', source: 'static', icon: '🔦' },
      { id: 'sentient-items', label: 'Sentient Items', group: 'equipment-items', source: 'static', icon: '🗡️' }
    ]
  },
  {
    id: 'rules-reference',
    label: 'Rules Reference',
    categories: [
      { id: 'actions', label: 'Actions', group: 'rules-reference', source: 'static', icon: '🏃' },
      { id: 'conditions', label: 'Conditions', group: 'rules-reference', source: 'static', icon: '🩹' },
      { id: 'cover', label: 'Cover', group: 'rules-reference', source: 'static', icon: '🛡️' },
      { id: 'damage-types', label: 'Damage Types', group: 'rules-reference', source: 'static', icon: '💥' },
      { id: 'dcs', label: 'DCs', group: 'rules-reference', source: 'static', icon: '🎯' },
      { id: 'weapon-mastery', label: 'Weapon Mastery', group: 'rules-reference', source: 'static', icon: '⚔️' },
      { id: 'languages', label: 'Languages', group: 'rules-reference', source: 'static', icon: '🗣️' },
      { id: 'skills', label: 'Skills', group: 'rules-reference', source: 'static', icon: '🎯' }
    ]
  },
  {
    id: 'world-building',
    label: 'World Building',
    categories: [
      { id: 'settlements', label: 'Settlements', group: 'world-building', source: 'mixed', icon: '🏘️' },
      { id: 'traps', label: 'Traps', group: 'world-building', source: 'mixed', icon: '⚠️' },
      { id: 'hazards', label: 'Hazards', group: 'world-building', source: 'mixed', icon: '☢️' },
      { id: 'poisons', label: 'Poisons', group: 'world-building', source: 'mixed', icon: '☠️' },
      { id: 'diseases', label: 'Diseases', group: 'world-building', source: 'mixed', icon: '🦠' },
      { id: 'curses', label: 'Curses', group: 'world-building', source: 'mixed', icon: '🌑' },
      {
        id: 'environmental-effects',
        label: 'Environmental Effects',
        group: 'world-building',
        source: 'mixed',
        icon: '🌪️'
      },
      { id: 'crafting', label: 'Crafting', group: 'world-building', source: 'mixed', icon: '🔨' },
      { id: 'downtime', label: 'Downtime', group: 'world-building', source: 'mixed', icon: '🏖️' },
      { id: 'maps', label: 'Maps', group: 'world-building', source: 'mixed', icon: '🗺️' },
      { id: 'adventure-seeds', label: 'Adventure Seeds', group: 'world-building', source: 'static', icon: '🌱' },
      { id: 'calendars', label: 'Calendar Systems', group: 'world-building', source: 'static', icon: '📅' },
      { id: 'deities', label: 'Deities & Pantheons', group: 'world-building', source: 'static', icon: '⛪' },
      { id: 'planes', label: 'Planes of Existence', group: 'world-building', source: 'static', icon: '🌌' },
      { id: 'npc-names', label: 'NPC Names', group: 'world-building', source: 'static', icon: '📛' }
    ]
  },
  {
    id: 'tables-encounters',
    label: 'Tables & Encounters',
    categories: [
      { id: 'encounter-presets', label: 'Encounter Presets', group: 'tables-encounters', source: 'mixed', icon: '⚔️' },
      { id: 'treasure-tables', label: 'Treasure Tables', group: 'tables-encounters', source: 'static', icon: '💰' },
      { id: 'random-tables', label: 'Random Tables', group: 'tables-encounters', source: 'static', icon: '🎲' },
      { id: 'chase-tables', label: 'Chase Tables', group: 'tables-encounters', source: 'static', icon: '🏃' }
    ]
  },
  {
    id: 'media',
    label: 'Media',
    categories: [{ id: 'sounds', label: 'Sounds & Audio', group: 'media', source: 'static', icon: '🔊' }]
  }
]

export function getCategoryDef(categoryId: LibraryCategory): LibraryCategoryDef | undefined {
  for (const group of LIBRARY_GROUPS) {
    const cat = group.categories.find((c) => c.id === categoryId)
    if (cat) return cat
  }
  return undefined
}

export function getAllCategories(): LibraryCategoryDef[] {
  return LIBRARY_GROUPS.flatMap((g) => g.categories)
}
