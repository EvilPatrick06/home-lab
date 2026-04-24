import type { HomebrewEntry, LibraryCategory, LibraryItem } from '../types/library'
import {
  load5eAdventureSeeds,
  load5eBackgrounds,
  load5eBuiltInMaps,
  load5eCalendarPresets,
  load5eChaseTables,
  load5eClasses,
  load5eClassFeatures,
  load5eCompanions,
  load5eConditions,
  load5eCrafting,
  load5eCreatures,
  load5eCurses,
  load5eDeities,
  load5eDiseases,
  load5eDowntime,
  load5eEncounterPresets,
  load5eEnvironmentalEffects,
  load5eEquipment,
  load5eFeats,
  load5eFightingStyles,
  load5eHazards,
  load5eInvocations,
  load5eLanguages,
  load5eLightSources,
  load5eMagicItems,
  load5eMetamagic,
  load5eMonsters,
  load5eMounts,
  load5eNpcNames,
  load5eNpcs,
  load5ePlanes,
  load5ePoisons,
  load5eRandomTables,
  load5eSentientItems,
  load5eSettlements,
  load5eSiegeEquipment,
  load5eSkills,
  load5eSpecies,
  load5eSpells,
  load5eSubclasses,
  load5eSupernaturalGifts,
  load5eTools,
  load5eTraps,
  load5eTreasureTables,
  load5eTrinkets,
  load5eVehicles,
  load5eWeaponMastery
} from './data-provider'

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return '?'
  if (seconds >= 3600) return `${Math.round(seconds / 3600)} hour${seconds >= 7200 ? 's' : ''}`
  return `${Math.round(seconds / 60)} min`
}

import Fuse from 'fuse.js'

export const SOUND_INVENTORY: { id: string; name: string; subcategory: string; path: string }[] = [
  // Ambient (14)
  { id: 'ambient-battle', name: 'Battle', subcategory: 'ambient', path: '/sounds/ambient/battle.mp3' },
  { id: 'ambient-battle-1', name: 'Battle (Alt)', subcategory: 'ambient', path: '/sounds/ambient/battle-1.mp3' },
  { id: 'ambient-cave', name: 'Cave', subcategory: 'ambient', path: '/sounds/ambient/cave.mp3' },
  { id: 'ambient-city', name: 'City', subcategory: 'ambient', path: '/sounds/ambient/city.mp3' },
  { id: 'ambient-city-1', name: 'City (Alt)', subcategory: 'ambient', path: '/sounds/ambient/city-1.mp3' },
  { id: 'ambient-defeat', name: 'Defeat', subcategory: 'ambient', path: '/sounds/ambient/defeat.mp3' },
  { id: 'ambient-defeat-1', name: 'Defeat (Alt)', subcategory: 'ambient', path: '/sounds/ambient/defeat-1.mp3' },
  { id: 'ambient-dungeon', name: 'Dungeon', subcategory: 'ambient', path: '/sounds/ambient/dungeon.mp3' },
  { id: 'ambient-forest', name: 'Forest', subcategory: 'ambient', path: '/sounds/ambient/forest.mp3' },
  { id: 'ambient-tavern', name: 'Tavern', subcategory: 'ambient', path: '/sounds/ambient/tavern.mp3' },
  { id: 'ambient-tavern-1', name: 'Tavern (Alt)', subcategory: 'ambient', path: '/sounds/ambient/tavern-1.mp3' },
  { id: 'ambient-tension', name: 'Tension', subcategory: 'ambient', path: '/sounds/ambient/tension.mp3' },
  { id: 'ambient-victory', name: 'Victory', subcategory: 'ambient', path: '/sounds/ambient/victory.mp3' },
  { id: 'ambient-victory-1', name: 'Victory (Alt)', subcategory: 'ambient', path: '/sounds/ambient/victory-1.mp3' },
  // Combat (10)
  { id: 'combat-attack-hit', name: 'Attack Hit', subcategory: 'combat', path: '/sounds/combat/attack-hit.mp3' },
  { id: 'combat-attack-miss', name: 'Attack Miss', subcategory: 'combat', path: '/sounds/combat/attack-miss.mp3' },
  { id: 'combat-crit-hit', name: 'Critical Hit', subcategory: 'combat', path: '/sounds/combat/crit-hit.mp3' },
  { id: 'combat-crit-miss', name: 'Critical Miss', subcategory: 'combat', path: '/sounds/combat/crit-miss.mp3' },
  { id: 'combat-damage', name: 'Damage', subcategory: 'combat', path: '/sounds/combat/damage.mp3' },
  { id: 'combat-death', name: 'Death', subcategory: 'combat', path: '/sounds/combat/death.mp3' },
  { id: 'combat-instant-kill', name: 'Instant Kill', subcategory: 'combat', path: '/sounds/combat/instant-kill.mp3' },
  { id: 'combat-melee-attack', name: 'Melee Attack', subcategory: 'combat', path: '/sounds/combat/melee-attack.mp3' },
  {
    id: 'combat-ranged-attack',
    name: 'Ranged Attack',
    subcategory: 'combat',
    path: '/sounds/combat/ranged-attack.mp3'
  },
  { id: 'combat-stabilize', name: 'Stabilize', subcategory: 'combat', path: '/sounds/combat/stabilize.mp3' },
  // Conditions (11)
  { id: 'conditions-apply', name: 'Apply Condition', subcategory: 'conditions', path: '/sounds/conditions/apply.mp3' },
  { id: 'conditions-blinded', name: 'Blinded', subcategory: 'conditions', path: '/sounds/conditions/blinded.mp3' },
  { id: 'conditions-charmed', name: 'Charmed', subcategory: 'conditions', path: '/sounds/conditions/charmed.mp3' },
  {
    id: 'conditions-exhaustion',
    name: 'Exhaustion',
    subcategory: 'conditions',
    path: '/sounds/conditions/exhaustion.mp3'
  },
  {
    id: 'conditions-frightened',
    name: 'Frightened',
    subcategory: 'conditions',
    path: '/sounds/conditions/frightened.mp3'
  },
  {
    id: 'conditions-paralyzed',
    name: 'Paralyzed',
    subcategory: 'conditions',
    path: '/sounds/conditions/paralyzed.mp3'
  },
  { id: 'conditions-poisoned', name: 'Poisoned', subcategory: 'conditions', path: '/sounds/conditions/poisoned.mp3' },
  { id: 'conditions-prone', name: 'Prone', subcategory: 'conditions', path: '/sounds/conditions/prone.mp3' },
  {
    id: 'conditions-restrained',
    name: 'Restrained',
    subcategory: 'conditions',
    path: '/sounds/conditions/restrained.mp3'
  },
  { id: 'conditions-stunned', name: 'Stunned', subcategory: 'conditions', path: '/sounds/conditions/stunned.mp3' },
  {
    id: 'conditions-unconscious',
    name: 'Unconscious',
    subcategory: 'conditions',
    path: '/sounds/conditions/unconscious.mp3'
  },
  // Creatures - Beasts (9)
  {
    id: 'creatures-beasts-bat',
    name: 'Bat',
    subcategory: 'creatures/beasts',
    path: '/sounds/creatures/beasts/bat.mp3'
  },
  {
    id: 'creatures-beasts-bear',
    name: 'Bear',
    subcategory: 'creatures/beasts',
    path: '/sounds/creatures/beasts/bear.mp3'
  },
  {
    id: 'creatures-beasts-crow',
    name: 'Crow',
    subcategory: 'creatures/beasts',
    path: '/sounds/creatures/beasts/crow.mp3'
  },
  {
    id: 'creatures-beasts-horse',
    name: 'Horse',
    subcategory: 'creatures/beasts',
    path: '/sounds/creatures/beasts/horse.mp3'
  },
  {
    id: 'creatures-beasts-owl',
    name: 'Owl',
    subcategory: 'creatures/beasts',
    path: '/sounds/creatures/beasts/owl.mp3'
  },
  {
    id: 'creatures-beasts-rat',
    name: 'Rat',
    subcategory: 'creatures/beasts',
    path: '/sounds/creatures/beasts/rat.mp3'
  },
  {
    id: 'creatures-beasts-snake',
    name: 'Snake',
    subcategory: 'creatures/beasts',
    path: '/sounds/creatures/beasts/snake.mp3'
  },
  {
    id: 'creatures-beasts-spider',
    name: 'Spider',
    subcategory: 'creatures/beasts',
    path: '/sounds/creatures/beasts/spider.mp3'
  },
  {
    id: 'creatures-beasts-wolf',
    name: 'Wolf',
    subcategory: 'creatures/beasts',
    path: '/sounds/creatures/beasts/wolf.mp3'
  },
  // Creatures - Monsters (9)
  {
    id: 'creatures-monsters-demon',
    name: 'Demon',
    subcategory: 'creatures/monsters',
    path: '/sounds/creatures/monsters/demon.mp3'
  },
  {
    id: 'creatures-monsters-dragon',
    name: 'Dragon',
    subcategory: 'creatures/monsters',
    path: '/sounds/creatures/monsters/dragon.mp3'
  },
  {
    id: 'creatures-monsters-elemental',
    name: 'Elemental',
    subcategory: 'creatures/monsters',
    path: '/sounds/creatures/monsters/elemental.mp3'
  },
  {
    id: 'creatures-monsters-ghost',
    name: 'Ghost',
    subcategory: 'creatures/monsters',
    path: '/sounds/creatures/monsters/ghost.mp3'
  },
  {
    id: 'creatures-monsters-giant',
    name: 'Giant',
    subcategory: 'creatures/monsters',
    path: '/sounds/creatures/monsters/giant.mp3'
  },
  {
    id: 'creatures-monsters-goblin',
    name: 'Goblin',
    subcategory: 'creatures/monsters',
    path: '/sounds/creatures/monsters/goblin.mp3'
  },
  {
    id: 'creatures-monsters-ogre',
    name: 'Ogre',
    subcategory: 'creatures/monsters',
    path: '/sounds/creatures/monsters/ogre.mp3'
  },
  {
    id: 'creatures-monsters-troll',
    name: 'Troll',
    subcategory: 'creatures/monsters',
    path: '/sounds/creatures/monsters/troll.mp3'
  },
  {
    id: 'creatures-monsters-undead',
    name: 'Undead',
    subcategory: 'creatures/monsters',
    path: '/sounds/creatures/monsters/undead.mp3'
  },
  // Dice (36)
  { id: 'dice-advantage-1', name: 'Advantage (1)', subcategory: 'dice', path: '/sounds/dice/advantage-1.mp3' },
  { id: 'dice-advantage-2', name: 'Advantage (2)', subcategory: 'dice', path: '/sounds/dice/advantage-2.mp3' },
  { id: 'dice-advantage-3', name: 'Advantage (3)', subcategory: 'dice', path: '/sounds/dice/advantage-3.mp3' },
  { id: 'dice-d4-1', name: 'd4 (1)', subcategory: 'dice', path: '/sounds/dice/d4-1.mp3' },
  { id: 'dice-d4-2', name: 'd4 (2)', subcategory: 'dice', path: '/sounds/dice/d4-2.mp3' },
  { id: 'dice-d4-3', name: 'd4 (3)', subcategory: 'dice', path: '/sounds/dice/d4-3.mp3' },
  { id: 'dice-d6-1', name: 'd6 (1)', subcategory: 'dice', path: '/sounds/dice/d6-1.mp3' },
  { id: 'dice-d6-2', name: 'd6 (2)', subcategory: 'dice', path: '/sounds/dice/d6-2.mp3' },
  { id: 'dice-d6-3', name: 'd6 (3)', subcategory: 'dice', path: '/sounds/dice/d6-3.mp3' },
  { id: 'dice-d8-1', name: 'd8 (1)', subcategory: 'dice', path: '/sounds/dice/d8-1.mp3' },
  { id: 'dice-d8-2', name: 'd8 (2)', subcategory: 'dice', path: '/sounds/dice/d8-2.mp3' },
  { id: 'dice-d8-3', name: 'd8 (3)', subcategory: 'dice', path: '/sounds/dice/d8-3.mp3' },
  { id: 'dice-d10-1', name: 'd10 (1)', subcategory: 'dice', path: '/sounds/dice/d10-1.mp3' },
  { id: 'dice-d10-2', name: 'd10 (2)', subcategory: 'dice', path: '/sounds/dice/d10-2.mp3' },
  { id: 'dice-d10-3', name: 'd10 (3)', subcategory: 'dice', path: '/sounds/dice/d10-3.mp3' },
  { id: 'dice-d12-1', name: 'd12 (1)', subcategory: 'dice', path: '/sounds/dice/d12-1.mp3' },
  { id: 'dice-d12-2', name: 'd12 (2)', subcategory: 'dice', path: '/sounds/dice/d12-2.mp3' },
  { id: 'dice-d12-3', name: 'd12 (3)', subcategory: 'dice', path: '/sounds/dice/d12-3.mp3' },
  { id: 'dice-d20-1', name: 'd20 (1)', subcategory: 'dice', path: '/sounds/dice/d20-1.mp3' },
  { id: 'dice-d20-2', name: 'd20 (2)', subcategory: 'dice', path: '/sounds/dice/d20-2.mp3' },
  { id: 'dice-d20-3', name: 'd20 (3)', subcategory: 'dice', path: '/sounds/dice/d20-3.mp3' },
  { id: 'dice-d100-1', name: 'd100 (1)', subcategory: 'dice', path: '/sounds/dice/d100-1.mp3' },
  { id: 'dice-d100-2', name: 'd100 (2)', subcategory: 'dice', path: '/sounds/dice/d100-2.mp3' },
  { id: 'dice-d100-3', name: 'd100 (3)', subcategory: 'dice', path: '/sounds/dice/d100-3.mp3' },
  { id: 'dice-disadvantage-1', name: 'Disadvantage (1)', subcategory: 'dice', path: '/sounds/dice/disadvantage-1.mp3' },
  { id: 'dice-disadvantage-2', name: 'Disadvantage (2)', subcategory: 'dice', path: '/sounds/dice/disadvantage-2.mp3' },
  { id: 'dice-disadvantage-3', name: 'Disadvantage (3)', subcategory: 'dice', path: '/sounds/dice/disadvantage-3.mp3' },
  { id: 'dice-nat-1-1', name: 'Nat 1 (1)', subcategory: 'dice', path: '/sounds/dice/nat-1-1.mp3' },
  { id: 'dice-nat-1-2', name: 'Nat 1 (2)', subcategory: 'dice', path: '/sounds/dice/nat-1-2.mp3' },
  { id: 'dice-nat-1-3', name: 'Nat 1 (3)', subcategory: 'dice', path: '/sounds/dice/nat-1-3.mp3' },
  { id: 'dice-nat-20-1', name: 'Nat 20 (1)', subcategory: 'dice', path: '/sounds/dice/nat-20-1.mp3' },
  { id: 'dice-nat-20-2', name: 'Nat 20 (2)', subcategory: 'dice', path: '/sounds/dice/nat-20-2.mp3' },
  { id: 'dice-nat-20-3', name: 'Nat 20 (3)', subcategory: 'dice', path: '/sounds/dice/nat-20-3.mp3' },
  { id: 'dice-roll-1', name: 'Roll (1)', subcategory: 'dice', path: '/sounds/dice/roll-1.mp3' },
  { id: 'dice-roll-2', name: 'Roll (2)', subcategory: 'dice', path: '/sounds/dice/roll-2.mp3' },
  { id: 'dice-roll-3', name: 'Roll (3)', subcategory: 'dice', path: '/sounds/dice/roll-3.mp3' },
  // Spells (10)
  { id: 'spells-abjuration', name: 'Abjuration', subcategory: 'spells', path: '/sounds/spells/abjuration.mp3' },
  { id: 'spells-conjuration', name: 'Conjuration', subcategory: 'spells', path: '/sounds/spells/conjuration.mp3' },
  { id: 'spells-counterspell', name: 'Counterspell', subcategory: 'spells', path: '/sounds/spells/counterspell.mp3' },
  { id: 'spells-divination', name: 'Divination', subcategory: 'spells', path: '/sounds/spells/divination.mp3' },
  { id: 'spells-enchantment', name: 'Enchantment', subcategory: 'spells', path: '/sounds/spells/enchantment.mp3' },
  { id: 'spells-evocation', name: 'Evocation', subcategory: 'spells', path: '/sounds/spells/evocation.mp3' },
  { id: 'spells-fizzle', name: 'Fizzle', subcategory: 'spells', path: '/sounds/spells/fizzle.mp3' },
  { id: 'spells-illusion', name: 'Illusion', subcategory: 'spells', path: '/sounds/spells/illusion.mp3' },
  { id: 'spells-necromancy', name: 'Necromancy', subcategory: 'spells', path: '/sounds/spells/necromancy.mp3' },
  {
    id: 'spells-transmutation',
    name: 'Transmutation',
    subcategory: 'spells',
    path: '/sounds/spells/transmutation.mp3'
  },
  // UI (16)
  { id: 'ui-announcement', name: 'Announcement', subcategory: 'ui', path: '/sounds/ui/announcement.mp3' },
  { id: 'ui-bastion-event', name: 'Bastion Event', subcategory: 'ui', path: '/sounds/ui/bastion-event.mp3' },
  { id: 'ui-death-save', name: 'Death Save', subcategory: 'ui', path: '/sounds/ui/death-save.mp3' },
  { id: 'ui-door-open', name: 'Door Open', subcategory: 'ui', path: '/sounds/ui/door-open.mp3' },
  { id: 'ui-heal', name: 'Heal', subcategory: 'ui', path: '/sounds/ui/heal.mp3' },
  { id: 'ui-initiative-start', name: 'Initiative Start', subcategory: 'ui', path: '/sounds/ui/initiative-start.mp3' },
  { id: 'ui-level-up', name: 'Level Up', subcategory: 'ui', path: '/sounds/ui/level-up.mp3' },
  { id: 'ui-long-rest', name: 'Long Rest', subcategory: 'ui', path: '/sounds/ui/long-rest.mp3' },
  { id: 'ui-loot-found', name: 'Loot Found', subcategory: 'ui', path: '/sounds/ui/loot-found.mp3' },
  { id: 'ui-ping', name: 'Ping', subcategory: 'ui', path: '/sounds/ui/ping.mp3' },
  { id: 'ui-round-end', name: 'Round End', subcategory: 'ui', path: '/sounds/ui/round-end.mp3' },
  { id: 'ui-shop-open', name: 'Shop Open', subcategory: 'ui', path: '/sounds/ui/shop-open.mp3' },
  { id: 'ui-short-rest', name: 'Short Rest', subcategory: 'ui', path: '/sounds/ui/short-rest.mp3' },
  { id: 'ui-trap-triggered', name: 'Trap Triggered', subcategory: 'ui', path: '/sounds/ui/trap-triggered.mp3' },
  { id: 'ui-turn-notify', name: 'Turn Notify', subcategory: 'ui', path: '/sounds/ui/turn-notify.mp3' },
  { id: 'ui-xp-gain', name: 'XP Gain', subcategory: 'ui', path: '/sounds/ui/xp-gain.mp3' },
  // Weapons - Magic (4)
  {
    id: 'weapons-magic-flaming',
    name: 'Flaming',
    subcategory: 'weapons/magic',
    path: '/sounds/weapons/magic/flaming.mp3'
  },
  { id: 'weapons-magic-frost', name: 'Frost', subcategory: 'weapons/magic', path: '/sounds/weapons/magic/frost.mp3' },
  { id: 'weapons-magic-holy', name: 'Holy', subcategory: 'weapons/magic', path: '/sounds/weapons/magic/holy.mp3' },
  {
    id: 'weapons-magic-lightning',
    name: 'Lightning',
    subcategory: 'weapons/magic',
    path: '/sounds/weapons/magic/lightning.mp3'
  },
  // Weapons - Melee (9)
  { id: 'weapons-melee-axe', name: 'Axe', subcategory: 'weapons/melee', path: '/sounds/weapons/melee/axe.mp3' },
  {
    id: 'weapons-melee-dagger',
    name: 'Dagger',
    subcategory: 'weapons/melee',
    path: '/sounds/weapons/melee/dagger.mp3'
  },
  {
    id: 'weapons-melee-hammer',
    name: 'Hammer',
    subcategory: 'weapons/melee',
    path: '/sounds/weapons/melee/hammer.mp3'
  },
  { id: 'weapons-melee-mace', name: 'Mace', subcategory: 'weapons/melee', path: '/sounds/weapons/melee/mace.mp3' },
  {
    id: 'weapons-melee-shield-bash',
    name: 'Shield Bash',
    subcategory: 'weapons/melee',
    path: '/sounds/weapons/melee/shield-bash.mp3'
  },
  { id: 'weapons-melee-spear', name: 'Spear', subcategory: 'weapons/melee', path: '/sounds/weapons/melee/spear.mp3' },
  { id: 'weapons-melee-staff', name: 'Staff', subcategory: 'weapons/melee', path: '/sounds/weapons/melee/staff.mp3' },
  { id: 'weapons-melee-sword', name: 'Sword', subcategory: 'weapons/melee', path: '/sounds/weapons/melee/sword.mp3' },
  { id: 'weapons-melee-whip', name: 'Whip', subcategory: 'weapons/melee', path: '/sounds/weapons/melee/whip.mp3' },
  // Weapons - Ranged (2)
  { id: 'weapons-ranged-bow', name: 'Bow', subcategory: 'weapons/ranged', path: '/sounds/weapons/ranged/bow.mp3' },
  {
    id: 'weapons-ranged-crossbow',
    name: 'Crossbow',
    subcategory: 'weapons/ranged',
    path: '/sounds/weapons/ranged/crossbow.mp3'
  }
]

export function summarizeItem(item: Record<string, unknown>, category: LibraryCategory): string {
  switch (category) {
    case 'monsters':
    case 'creatures':
    case 'npcs':
      return `CR ${item.cr ?? '?'} ${item.type ?? ''} - ${item.hp ?? '?'} HP`
    case 'spells':
      return `Level ${item.level ?? '?'} ${item.school ?? ''} - ${(item.spellList as string[])?.join(', ') ?? ''}`
    case 'classes':
      return `${(item.coreTraits as Record<string, unknown>)?.hitPointDie ?? '?'} | ${((item.coreTraits as Record<string, unknown>)?.primaryAbility as string[])?.join(', ') ?? ''}`
    case 'subclasses':
      return `${((item.className as string) ?? '').charAt(0).toUpperCase() + ((item.className as string) ?? '').slice(1)} - Level ${item.level ?? '?'}`
    case 'species': {
      const sizeObj = item.size as { type?: string; value?: string; options?: string[] } | undefined
      const sizeStr = sizeObj?.type === 'choice' ? (sizeObj.options?.join('/') ?? '?') : (sizeObj?.value ?? '?')
      return `Speed: ${item.speed ?? '?'} ft. | Size: ${sizeStr}`
    }
    case 'backgrounds':
      return (item.skillProficiencies as string[])?.join(', ') ?? (item.description as string)?.slice(0, 80) ?? ''
    case 'feats': {
      const prereqs = item.prerequisites as { level?: number | null } | undefined
      return `${item.category ?? ''} - Level ${prereqs?.level ?? '?'}`
    }
    case 'weapons':
      return `${item.category ?? ''} - ${item.damage ?? '?'} ${item.damageType ?? ''}`
    case 'armor':
      return `${item.category ?? ''} - AC ${item.baseAC ?? item.ac ?? '?'}`
    case 'magic-items':
      return `${item.rarity ?? ''} ${item.type ?? ''} ${item.attunement ? '(attunement)' : ''}`
    case 'gear':
      return `${item.cost ?? ''} - ${item.weight ?? '?'} lb.`
    case 'traps':
      return `${item.level ?? ''} - ${item.trigger ?? ''}`
    case 'hazards':
      return `${item.level ?? ''} ${item.type ?? ''}`
    case 'poisons':
      return `${item.type ?? ''} - DC ${item.saveDC ?? '?'}`
    case 'diseases':
      return `DC ${item.saveDC ?? '?'} - ${item.vector ?? ''}`
    case 'curses':
      return `${item.type ?? ''} curse`
    case 'environmental-effects':
      return `${item.category ?? ''}`
    case 'settlements':
      return `Pop: ${item.populationMin ?? '?'}-${item.populationMax ?? '?'}`
    case 'invocations':
      return `Level ${item.level ?? 'Any'}${item.pactRequired ? ' - Pact required' : ''}`
    case 'metamagic':
      return `${item.cost ?? '?'} sorcery points`
    case 'vehicles':
      return `${item.size ?? ''} - Speed: ${item.speed ?? '?'}`
    case 'mounts':
      return `${item.size ?? ''} - Speed: ${item.speed ?? '?'} ft.`
    case 'siege-equipment':
      return `AC ${item.ac ?? '?'} | HP ${item.hp ?? '?'}`
    case 'supernatural-gifts':
      return `${item.type ?? ''}`
    case 'encounter-presets':
      return `${item.difficulty ?? ''} - Levels ${item.partyLevelRange ?? '?'}`
    case 'crafting':
      return `${item.toolType ?? ''}`
    case 'conditions':
      return `${item.type ?? ''} - ${((item.description as string) ?? '').slice(0, 60)}`
    case 'weapon-mastery':
      return ((item.description as string) ?? '').slice(0, 80)
    case 'languages':
      return `${item.type ?? ''} - Script: ${item.script ?? 'None'}`
    case 'skills':
      return `${item.ability ?? ''} - ${((item.description as string) ?? '').slice(0, 60)}`
    case 'fighting-styles':
      return ((item.description as string) ?? '').slice(0, 80)
    case 'maps':
      return `Map${item.gridWidth ? ` - ${item.gridWidth}x${item.gridHeight}` : ''}`
    case 'shop-templates':
      return `${((item.inventory as unknown[]) ?? []).length} items`
    case 'portraits':
      return 'Portrait / Icon'
    case 'class-features':
      return `Level ${item.level ?? '?'} - ${((item.description as string) ?? '').slice(0, 60)}`
    case 'companions': {
      const cType = (item.type as string) ?? ''
      if (cType === 'mount') return `Mount - Speed: ${item.speed ?? '?'}`
      if (cType === 'pet') return `Pet - ${item.name ?? '?'}`
      if (cType === 'hireling') return `Hireling - ${item.dailyCost ?? '?'}/day`
      return cType || 'Companion'
    }
    case 'adventure-seeds':
      return `Levels ${item.levelRange ?? '?'}`
    case 'calendars': {
      const months = item.months as unknown[] | undefined
      return `${item.daysPerYear ?? '?'} days, ${months?.length ?? '?'} months`
    }
    case 'deities':
      return `${item.title ?? ''} - ${item.alignment ?? '?'}`
    case 'planes':
      return `${((item.category as string) ?? '').replace(/^./, (c: string) => c.toUpperCase())} Plane`
    case 'npc-names': {
      const nameData = item as Record<string, unknown>
      const male = (nameData.male as string[] | undefined)?.length ?? 0
      const female = (nameData.female as string[] | undefined)?.length ?? 0
      const neutral = (nameData.neutral as string[] | undefined)?.length ?? 0
      return `${male} male, ${female} female, ${neutral} neutral names`
    }
    case 'light-sources':
      return `Bright: ${item.brightRadius ?? '?'} ft., Dim: ${item.dimRadius ?? '?'} ft. - ${formatDuration(item.durationSeconds as number | undefined)}`
    case 'sentient-items': {
      const entries = item.entries as unknown[] | undefined
      return `${entries?.length ?? '?'} entries`
    }
    default:
      return (item.description as string)?.slice(0, 80) ?? ''
  }
}

function toLibraryItems(
  items: Record<string, unknown>[],
  category: LibraryCategory,
  source: 'official' | 'homebrew' = 'official'
): LibraryItem[] {
  return items.map((item) => ({
    id: (item.id as string) || (item.name as string) || category,
    name: (item.name as string) ?? 'Unknown',
    category,
    source,
    summary: summarizeItem(item, category),
    data: item
  }))
}

function homebrewToLibraryItems(entries: HomebrewEntry[], category: LibraryCategory): LibraryItem[] {
  return entries
    .filter((e) => e.type === category)
    .map((e) => ({
      id: e.id,
      name: e.name,
      category,
      source: 'homebrew' as const,
      summary: summarizeItem(e.data, category),
      data: { ...e.data, _homebrewId: e.id, _basedOn: e.basedOn, _createdAt: e.createdAt }
    }))
}

export async function loadCategoryItems(category: LibraryCategory, homebrew: HomebrewEntry[]): Promise<LibraryItem[]> {
  const hbItems = homebrewToLibraryItems(homebrew, category)

  switch (category) {
    case 'characters': {
      const raw = await window.api.loadCharacters()
      if (!Array.isArray(raw)) return hbItems
      return [
        ...raw.map((c) => ({
          id: (c.id as string) ?? '',
          name: (c.name as string) ?? 'Unknown',
          category: 'characters' as const,
          source: 'official' as const,
          summary: `Level ${c.level ?? '?'} ${c.className ?? c.class ?? '?'}`,
          data: c
        })),
        ...hbItems
      ]
    }
    case 'campaigns': {
      const raw = await window.api.loadCampaigns()
      if (!Array.isArray(raw)) return hbItems
      return raw.map((c) => ({
        id: (c.id as string) ?? '',
        name: (c.name as string) ?? 'Unknown',
        category: 'campaigns' as const,
        source: 'official' as const,
        summary: `${c.system ?? '5e'} - ${c.description ?? 'No description'}`.slice(0, 80),
        data: c
      }))
    }
    case 'bastions': {
      const raw = await window.api.loadBastions()
      if (!Array.isArray(raw)) return hbItems
      return raw.map((b) => ({
        id: (b.id as string) ?? '',
        name: (b.name as string) ?? 'Unknown',
        category: 'bastions' as const,
        source: 'official' as const,
        summary: `Level ${b.level ?? '?'}`,
        data: b
      }))
    }
    case 'monsters': {
      const data = await load5eMonsters()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'creatures': {
      const data = await load5eCreatures()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'npcs': {
      const data = await load5eNpcs()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'spells': {
      const data = await load5eSpells()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'invocations': {
      const data = await load5eInvocations()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'metamagic': {
      const data = await load5eMetamagic()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'classes': {
      const data = await load5eClasses()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'subclasses': {
      const data = await load5eSubclasses()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'species': {
      const data = await load5eSpecies()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'backgrounds': {
      const data = await load5eBackgrounds()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'feats': {
      const data = await load5eFeats()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'supernatural-gifts': {
      const data = await load5eSupernaturalGifts()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'weapons': {
      const eq = await load5eEquipment()
      return [...toLibraryItems(eq.weapons as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'armor': {
      const eq = await load5eEquipment()
      return [...toLibraryItems(eq.armor as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'gear': {
      const eq = await load5eEquipment()
      return [...toLibraryItems(eq.gear as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'tools': {
      const data = await load5eTools()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'magic-items': {
      const data = await load5eMagicItems()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'vehicles': {
      const data = await load5eVehicles()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'mounts': {
      const data = await load5eMounts()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'siege-equipment': {
      const data = await load5eSiegeEquipment()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'trinkets': {
      const data = await load5eTrinkets()
      // Trinkets are string arrays — convert to named objects
      const trinketItems = (data as unknown as string[]).map((t, i) => ({
        id: `trinket-${i}`,
        name: typeof t === 'string' ? t : ((t as Record<string, unknown>).name ?? 'Unknown')
      }))
      return [...toLibraryItems(trinketItems as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'settlements': {
      const data = await load5eSettlements()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'traps': {
      const data = await load5eTraps()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'hazards': {
      const data = await load5eHazards()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'poisons': {
      const data = await load5ePoisons()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'diseases': {
      const data = await load5eDiseases()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'curses': {
      const data = await load5eCurses()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'environmental-effects': {
      const data = await load5eEnvironmentalEffects()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'crafting': {
      const data = await load5eCrafting()
      // CraftingToolEntry is {tool, items[]} — flatten items
      const craftingItems: Record<string, unknown>[] = []
      for (const group of data) {
        for (const recipe of (group as unknown as { tool: string; items: Record<string, unknown>[] }).items) {
          craftingItems.push({ ...recipe, toolType: (group as unknown as { tool: string }).tool })
        }
      }
      return [...toLibraryItems(craftingItems, category), ...hbItems]
    }
    case 'downtime': {
      const data = await load5eDowntime()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'encounter-presets': {
      const data = await load5eEncounterPresets()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'treasure-tables': {
      const data = await load5eTreasureTables()
      const tables = data as unknown as Record<string, unknown>
      return toLibraryItems(
        Object.entries(tables).map(([key, val]) => ({ id: key, name: key, ...(val as Record<string, unknown>) })),
        category
      )
    }
    case 'random-tables': {
      const data = await load5eRandomTables()
      const tables = data as unknown as Record<string, unknown>
      return toLibraryItems(
        Object.entries(tables).map(([key, val]) => ({ id: key, name: key, ...(val as Record<string, unknown>) })),
        category
      )
    }
    case 'chase-tables': {
      const data = await load5eChaseTables()
      const tables = data as unknown as Record<string, unknown>
      return toLibraryItems(
        Object.entries(tables).map(([key, val]) => ({ id: key, name: key, ...(val as Record<string, unknown>) })),
        category
      )
    }
    case 'sounds': {
      // Full sound inventory — all MP3 files grouped by subcategory
      return SOUND_INVENTORY.map((s) => ({
        id: s.id,
        name: s.name,
        category: 'sounds' as const,
        source: 'official' as const,
        summary: s.subcategory.replace(/\//g, ' › ').replace(/^./, (c) => c.toUpperCase()),
        data: { id: s.id, name: s.name, subcategory: s.subcategory, path: s.path }
      }))
    }
    case 'actions': {
      const ACTIONS_DATA = [
        { name: 'Attack', description: 'Attack with a weapon or Unarmed Strike.' },
        { name: 'Dash', description: 'Extra movement equal to your Speed for the rest of the turn.' },
        {
          name: 'Disengage',
          description: "Your movement doesn't provoke Opportunity Attacks for the rest of the turn."
        },
        {
          name: 'Dodge',
          description:
            'Attack rolls against you have Disadvantage; you have Advantage on DEX saves. Lost if Incapacitated or Speed is 0.'
        },
        {
          name: 'Help',
          description:
            'Give an ally Advantage on their next ability check (within 10 ft) or attack roll (within 5 ft) before your next turn.'
        },
        { name: 'Hide', description: 'Make a Stealth check to become Hidden. DC = passive Perception of observers.' },
        {
          name: 'Influence',
          description:
            "Make a CHA check to alter a creature's attitude: Persuasion (Indifferent/Friendly), Deception, or Intimidation (Hostile)."
        },
        { name: 'Magic', description: 'Cast a spell, use a magic item, or use a magical feature.' },
        {
          name: 'Ready',
          description: 'Choose a trigger and an action to take as a Reaction when that trigger occurs.'
        },
        { name: 'Search', description: 'Make a Perception or Investigation check to notice or find something.' },
        {
          name: 'Study',
          description:
            'Make an Arcana, History, Investigation, Nature, or Religion check to recall or analyze information.'
        },
        {
          name: 'Utilize',
          description: 'Use a non-magical object or tool, or interact with an object that requires an action.'
        }
      ]
      return toLibraryItems(ACTIONS_DATA, category)
    }
    case 'cover': {
      const COVER_DATA = [
        {
          name: 'Half Cover',
          description: 'Target has +2 to AC and DEX saves. Blocked by obstacle covering at least half the target.'
        },
        {
          name: 'Three-Quarters Cover',
          description:
            'Target has +5 to AC and DEX saves. Blocked by obstacle covering about three-quarters of the target.'
        },
        {
          name: 'Total Cover',
          description: "Target can't be targeted directly by attacks or spells. Completely concealed by an obstacle."
        }
      ]
      return toLibraryItems(COVER_DATA, category)
    }
    case 'dcs': {
      const DC_DATA = [
        { name: 'Very Easy (DC 5)', description: 'A trivial task that almost anyone can accomplish.' },
        { name: 'Easy (DC 10)', description: 'A task that most people can manage with little effort.' },
        {
          name: 'Medium (DC 15)',
          description: 'A task requiring focused effort; adventurers succeed about half the time.'
        },
        { name: 'Hard (DC 20)', description: 'A task demanding significant skill or luck.' },
        { name: 'Very Hard (DC 25)', description: 'A task achievable only by highly skilled or lucky individuals.' },
        { name: 'Nearly Impossible (DC 30)', description: 'An extraordinary task at the limit of mortal ability.' }
      ]
      return toLibraryItems(DC_DATA, category)
    }
    case 'damage-types': {
      const DAMAGE_TYPES = [
        'acid',
        'bludgeoning',
        'cold',
        'fire',
        'force',
        'lightning',
        'necrotic',
        'piercing',
        'poison',
        'psychic',
        'radiant',
        'slashing',
        'thunder'
      ]
      const items = DAMAGE_TYPES.map((d) => ({
        name: d.charAt(0).toUpperCase() + d.slice(1),
        description: `${d.charAt(0).toUpperCase() + d.slice(1)} damage`
      }))
      return toLibraryItems(items, category)
    }
    case 'conditions': {
      const data = await load5eConditions()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'weapon-mastery': {
      const data = await load5eWeaponMastery()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'languages': {
      const data = await load5eLanguages()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'skills': {
      const data = await load5eSkills()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'fighting-styles': {
      const data = await load5eFightingStyles()
      return [...toLibraryItems(data as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'class-features': {
      const cfData = await load5eClassFeatures()
      const items: Record<string, unknown>[] = []
      for (const [className, classData] of Object.entries(cfData)) {
        for (const feat of (classData as unknown as Record<string, unknown>).features as {
          level: number
          name: string
          description: string
        }[]) {
          items.push({
            id: `${className}-${feat.name}-${feat.level}`,
            name: feat.name,
            level: feat.level,
            description: feat.description,
            class: className
          })
        }
      }
      return [...toLibraryItems(items, category), ...hbItems]
    }
    case 'companions': {
      const data = await load5eCompanions()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'adventure-seeds': {
      const data = await load5eAdventureSeeds()
      const items: Record<string, unknown>[] = []
      for (const [range, seeds] of Object.entries(data as Record<string, unknown>)) {
        if (!Array.isArray(seeds)) continue
        for (const [i, seed] of seeds.entries()) {
          items.push({
            id: `adventure-seed-${range}-${i}`,
            name:
              typeof seed === 'string'
                ? seed.slice(0, 80)
                : ((seed as Record<string, unknown>).name ?? `Seed ${i + 1}`),
            levelRange: range,
            description: typeof seed === 'string' ? seed : ((seed as Record<string, unknown>).description ?? '')
          })
        }
      }
      return [...toLibraryItems(items, category), ...hbItems]
    }
    case 'calendars': {
      const data = await load5eCalendarPresets()
      const presets = (data as Record<string, unknown>).presets as Record<string, unknown> | undefined
      if (!presets) return hbItems
      const items = Object.entries(presets).map(([key, val]) => ({
        id: key,
        name:
          (val as Record<string, unknown>).name ??
          key.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        ...(val as Record<string, unknown>)
      }))
      return [...toLibraryItems(items as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'deities': {
      const data = await load5eDeities()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'planes': {
      const data = await load5ePlanes()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'npc-names': {
      const data = await load5eNpcNames()
      const nameData = data as Record<string, unknown>
      const items = Object.entries(nameData).map(([species, names]) => {
        const nameObj = names as Record<string, string[]>
        return {
          id: `npc-names-${species}`,
          name: species.replace(/^./, (c: string) => c.toUpperCase()),
          male: nameObj.male,
          female: nameObj.female,
          neutral: nameObj.neutral,
          family: nameObj.family
        }
      })
      return toLibraryItems(items as unknown as Record<string, unknown>[], category)
    }
    case 'light-sources': {
      const data = await load5eLightSources()
      const items = Object.entries(data).map(([key, val]) => ({
        id: key,
        name:
          (val as Record<string, unknown>).label ??
          key.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        ...(val as Record<string, unknown>)
      }))
      return [...toLibraryItems(items as unknown as Record<string, unknown>[], category), ...hbItems]
    }
    case 'sentient-items': {
      const data = await load5eSentientItems()
      const items = Object.entries(data).map(([key, val]) => ({
        id: key,
        name: key
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, (c: string) => c.toUpperCase())
          .trim(),
        entries: Array.isArray(val) ? val : [],
        ...(typeof val === 'object' && !Array.isArray(val) ? (val as Record<string, unknown>) : {})
      }))
      return toLibraryItems(items as unknown as Record<string, unknown>[], category)
    }
    case 'maps': {
      const items: LibraryItem[] = []
      // Load preset built-in maps
      try {
        const presetMaps = await load5eBuiltInMaps()
        for (const m of presetMaps) {
          items.push({
            id: ((m as Record<string, unknown>).id as string) ?? '',
            name: ((m as Record<string, unknown>).name as string) ?? 'Unknown Map',
            category: 'maps',
            source: 'official',
            summary: ((m as Record<string, unknown>).preview as string) ?? 'Preset Map',
            data: m as unknown as Record<string, unknown>
          })
        }
      } catch {
        // Built-in maps unavailable
      }
      // Load user library maps
      try {
        const result = await window.api.mapLibrary.list()
        if (result?.success && Array.isArray(result.data)) {
          for (const m of result.data as Record<string, unknown>[]) {
            items.push({
              id: (m.id as string) ?? '',
              name: (m.name as string) ?? 'Unknown Map',
              category: 'maps',
              source: 'official',
              summary: `Map${m.gridWidth ? ` - ${m.gridWidth}x${m.gridHeight}` : ''}`,
              data: m
            })
          }
        }
      } catch {
        // Map library unavailable
      }
      return [...items, ...hbItems]
    }
    case 'shop-templates': {
      try {
        const result = await window.api.shopTemplates.list()
        if (!result?.success || !Array.isArray(result.data)) return hbItems
        return result.data.map((s: Record<string, unknown>) => ({
          id: (s.id as string) ?? '',
          name: (s.name as string) ?? 'Unknown Shop',
          category: 'shop-templates' as const,
          source: 'official' as const,
          summary: `${((s.inventory as unknown[]) ?? []).length} items${s.markup && s.markup !== 1 ? ` - ${(s.markup as number) * 100}% markup` : ''}`,
          data: s
        }))
      } catch {
        return hbItems
      }
    }
    case 'portraits': {
      try {
        const result = await window.api.imageLibrary.list()
        if (!result?.success || !Array.isArray(result.data)) return hbItems
        return result.data.map((img: Record<string, unknown>) => ({
          id: (img.id as string) ?? '',
          name: (img.name as string) ?? 'Unknown Image',
          category: 'portraits' as const,
          source: 'official' as const,
          summary: 'Portrait / Icon',
          data: img
        }))
      } catch {
        return hbItems
      }
    }
    default:
      return hbItems
  }
}

export async function searchAllCategories(query: string, homebrew: HomebrewEntry[]): Promise<LibraryItem[]> {
  if (!query.trim()) return []

  const allCategories: LibraryCategory[] = [
    'characters',
    'campaigns',
    'bastions',
    'monsters',
    'creatures',
    'npcs',
    'companions',
    'spells',
    'invocations',
    'metamagic',
    'classes',
    'subclasses',
    'species',
    'backgrounds',
    'feats',
    'supernatural-gifts',
    'class-features',
    'fighting-styles',
    'weapons',
    'armor',
    'gear',
    'tools',
    'magic-items',
    'vehicles',
    'mounts',
    'siege-equipment',
    'trinkets',
    'light-sources',
    'sentient-items',
    'traps',
    'hazards',
    'poisons',
    'diseases',
    'curses',
    'environmental-effects',
    'settlements',
    'crafting',
    'downtime',
    'encounter-presets',
    'treasure-tables',
    'random-tables',
    'chase-tables',
    'conditions',
    'actions',
    'cover',
    'dcs',
    'damage-types',
    'weapon-mastery',
    'languages',
    'skills',
    'adventure-seeds',
    'calendars',
    'deities',
    'planes',
    'npc-names',
    'sounds',
    'maps',
    'shop-templates',
    'portraits'
  ]

  const results = await Promise.allSettled(allCategories.map((cat) => loadCategoryItems(cat, homebrew)))

  const allItems: LibraryItem[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') {
      allItems.push(...r.value)
    }
  }

  const fuse = new Fuse(allItems, {
    keys: ['name', 'summary'],
    threshold: 0.3,
    distance: 100,
    ignoreLocation: true
  })

  return fuse
    .search(query)
    .map((result) => result.item)
    .slice(0, 100)
}
