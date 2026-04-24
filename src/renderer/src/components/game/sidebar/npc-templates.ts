/**
 * NPC Templates & Random Generator — D&D 5e 2024
 *
 * Static NPC stat block templates and random NPC appearance/personality generator.
 * Extracted from SidebarEntryList for modularity.
 */

import {
  NPC_BUILDS,
  NPC_CLOTHING_STYLES,
  NPC_DISTINGUISHING_FEATURES,
  NPC_HAIR_COLORS,
  NPC_HAIR_STYLES,
  NPC_HEIGHTS
} from '../../../data/npc-appearance'
import { NPC_MANNERISMS, NPC_VOICE_DESCRIPTIONS } from '../../../data/npc-mannerisms'
import { ALIGNMENT_PERSONALITY } from '../../../data/personality-tables'
import type { SidebarEntryStatBlock } from '../../../types/game-state'

// ─── NPC Templates ──────────────────────────────────────────────

export interface NpcTemplate {
  name: string
  statBlock: SidebarEntryStatBlock
}

export const NPC_TEMPLATES: NpcTemplate[] = [
  {
    name: 'Commoner',
    statBlock: {
      size: 'Medium',
      creatureType: 'Humanoid',
      cr: '0',
      ac: 10,
      hpMax: 4,
      hpCurrent: 4,
      speeds: { walk: 30 },
      abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
    }
  },
  {
    name: 'Guard',
    statBlock: {
      size: 'Medium',
      creatureType: 'Humanoid',
      cr: '1/8',
      ac: 16,
      acSource: 'chain shirt, shield',
      hpMax: 11,
      hpCurrent: 11,
      speeds: { walk: 30 },
      abilityScores: { str: 13, dex: 12, con: 12, int: 10, wis: 11, cha: 10 }
    }
  },
  {
    name: 'Bandit',
    statBlock: {
      size: 'Medium',
      creatureType: 'Humanoid',
      cr: '1/8',
      ac: 12,
      acSource: 'leather armor',
      hpMax: 11,
      hpCurrent: 11,
      speeds: { walk: 30 },
      abilityScores: { str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10 }
    }
  },
  {
    name: 'Noble',
    statBlock: {
      size: 'Medium',
      creatureType: 'Humanoid',
      cr: '1/8',
      ac: 15,
      acSource: 'breastplate',
      hpMax: 9,
      hpCurrent: 9,
      speeds: { walk: 30 },
      abilityScores: { str: 11, dex: 12, con: 11, int: 12, wis: 14, cha: 16 }
    }
  },
  {
    name: 'Merchant',
    statBlock: {
      size: 'Medium',
      creatureType: 'Humanoid',
      cr: '0',
      ac: 10,
      hpMax: 4,
      hpCurrent: 4,
      speeds: { walk: 30 },
      abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
    }
  },
  {
    name: 'Priest',
    statBlock: {
      size: 'Medium',
      creatureType: 'Humanoid',
      cr: '2',
      ac: 13,
      acSource: 'chain shirt',
      hpMax: 27,
      hpCurrent: 27,
      speeds: { walk: 30 },
      abilityScores: { str: 10, dex: 10, con: 12, int: 13, wis: 16, cha: 13 }
    }
  },
  {
    name: 'Mage',
    statBlock: {
      size: 'Medium',
      creatureType: 'Humanoid',
      cr: '6',
      ac: 12,
      acSource: '15 with mage armor',
      hpMax: 40,
      hpCurrent: 40,
      speeds: { walk: 30 },
      abilityScores: { str: 9, dex: 14, con: 11, int: 17, wis: 12, cha: 11 }
    }
  },
  {
    name: 'Veteran',
    statBlock: {
      size: 'Medium',
      creatureType: 'Humanoid',
      cr: '3',
      ac: 17,
      acSource: 'splint armor',
      hpMax: 58,
      hpCurrent: 58,
      speeds: { walk: 30 },
      abilityScores: { str: 16, dex: 13, con: 14, int: 10, wis: 11, cha: 10 }
    }
  },
  {
    name: 'Spy',
    statBlock: {
      size: 'Medium',
      creatureType: 'Humanoid',
      cr: '1',
      ac: 12,
      hpMax: 27,
      hpCurrent: 27,
      speeds: { walk: 30 },
      abilityScores: { str: 10, dex: 15, con: 10, int: 12, wis: 14, cha: 16 }
    }
  },
  {
    name: 'Assassin',
    statBlock: {
      size: 'Medium',
      creatureType: 'Humanoid',
      cr: '8',
      ac: 15,
      acSource: 'studded leather',
      hpMax: 78,
      hpCurrent: 78,
      speeds: { walk: 30 },
      abilityScores: { str: 11, dex: 16, con: 14, int: 13, wis: 11, cha: 10 }
    }
  }
]

// ─── Random NPC Generator ──────────────────────────────────────

const NPC_FIRST_NAMES = [
  'Alaric',
  'Brynn',
  'Cedric',
  'Dara',
  'Elara',
  'Finn',
  'Gwyn',
  'Hector',
  'Isolde',
  'Jasper',
  'Kira',
  'Lucian',
  'Mira',
  'Nolan',
  'Orla',
  'Pavel',
  'Quinn',
  'Rhea',
  'Silas',
  'Thea',
  'Ulric',
  'Vera',
  'Wren',
  'Xander',
  'Yara',
  'Zara'
]

const NPC_LAST_NAMES = [
  'Ashford',
  'Blackwood',
  'Copperfield',
  'Dunmore',
  'Evergreen',
  'Fairwind',
  'Greystone',
  'Hawthorne',
  'Ironforge',
  'Jadewater',
  'Kingsley',
  'Lightfoot',
  'Moorland',
  'Nightingale',
  'Oakheart',
  'Proudfoot',
  'Quicksilver',
  'Ravencroft',
  'Stormwind',
  'Thornwood'
]

const NPC_SPECIES = ['Human', 'Elf', 'Dwarf', 'Halfling', 'Gnome', 'Half-Orc', 'Tiefling', 'Dragonborn']

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickRandomPersonalityTrait(): string {
  const allTraits: string[] = []
  for (const traitList of Object.values(ALIGNMENT_PERSONALITY)) {
    allTraits.push(...traitList)
  }
  return pickRandom(allTraits)
}

export interface GeneratedNpc {
  name: string
  species: string
  height: string
  build: string
  hairColor: string
  hairStyle: string
  distinguishingFeature: string
  clothingStyle: string
  voice: string
  mannerism: string
  personalityTrait: string
}

export interface GeneratedNpcLocks {
  name: boolean
  species: boolean
  height: boolean
  build: boolean
  hairColor: boolean
  hairStyle: boolean
  distinguishingFeature: boolean
  clothingStyle: boolean
  voice: boolean
  mannerism: boolean
  personalityTrait: boolean
}

export const DEFAULT_LOCKS: GeneratedNpcLocks = {
  name: false,
  species: false,
  height: false,
  build: false,
  hairColor: false,
  hairStyle: false,
  distinguishingFeature: false,
  clothingStyle: false,
  voice: false,
  mannerism: false,
  personalityTrait: false
}

export function generateRandomNpc(locks?: GeneratedNpcLocks, current?: GeneratedNpc): GeneratedNpc {
  return {
    name: locks?.name && current ? current.name : `${pickRandom(NPC_FIRST_NAMES)} ${pickRandom(NPC_LAST_NAMES)}`,
    species: locks?.species && current ? current.species : pickRandom(NPC_SPECIES),
    height: locks?.height && current ? current.height : pickRandom(NPC_HEIGHTS),
    build: locks?.build && current ? current.build : pickRandom(NPC_BUILDS),
    hairColor: locks?.hairColor && current ? current.hairColor : pickRandom(NPC_HAIR_COLORS),
    hairStyle: locks?.hairStyle && current ? current.hairStyle : pickRandom(NPC_HAIR_STYLES),
    distinguishingFeature:
      locks?.distinguishingFeature && current ? current.distinguishingFeature : pickRandom(NPC_DISTINGUISHING_FEATURES),
    clothingStyle: locks?.clothingStyle && current ? current.clothingStyle : pickRandom(NPC_CLOTHING_STYLES),
    voice: locks?.voice && current ? current.voice : pickRandom(NPC_VOICE_DESCRIPTIONS),
    mannerism: locks?.mannerism && current ? current.mannerism : pickRandom(NPC_MANNERISMS),
    personalityTrait: locks?.personalityTrait && current ? current.personalityTrait : pickRandomPersonalityTrait()
  }
}
