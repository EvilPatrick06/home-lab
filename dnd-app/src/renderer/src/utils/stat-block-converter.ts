import type { SidebarEntryStatBlock } from '../types/game-state'
import type { MonsterStatBlock } from '../types/monster'

export interface DisplayStatBlock {
  name: string
  size: string
  type: string
  alignment: string
  ac: number
  acSource?: string
  hp: number
  hpFormula?: string
  speed: string
  abilities: { str: number; dex: number; con: number; int: number; wis: number; cha: number }
  savingThrows?: string
  skills?: string
  damageResistances?: string
  damageImmunities?: string
  conditionImmunities?: string
  senses?: string
  languages?: string
  cr?: string
  xp?: number
  proficiencyBonus?: number
  traits?: { name: string; description: string }[]
  actions?: { name: string; description: string }[]
  bonusActions?: { name: string; description: string }[]
  legendaryActions?: { name: string; description: string }[]
  reactions?: { name: string; description: string }[]
  lairActions?: { name: string; description: string }[]
  spellcasting?: {
    ability: string
    dc: number
    attackBonus: number
    description?: string
  }
}

function formatModifier(score: number): string {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

function formatMonsterSpeed(speed: MonsterStatBlock['speed']): string {
  const parts: string[] = [`${speed.walk} ft.`]
  if (speed.fly) parts.push(`fly ${speed.fly} ft.${speed.hover ? ' (hover)' : ''}`)
  if (speed.swim) parts.push(`swim ${speed.swim} ft.`)
  if (speed.climb) parts.push(`climb ${speed.climb} ft.`)
  if (speed.burrow) parts.push(`burrow ${speed.burrow} ft.`)
  return parts.join(', ')
}

function formatSidebarSpeeds(speeds?: SidebarEntryStatBlock['speeds']): string {
  if (!speeds) return '30 ft.'
  const parts: string[] = []
  if (speeds.walk) parts.push(`${speeds.walk} ft.`)
  if (speeds.fly) parts.push(`fly ${speeds.fly} ft.`)
  if (speeds.swim) parts.push(`swim ${speeds.swim} ft.`)
  if (speeds.climb) parts.push(`climb ${speeds.climb} ft.`)
  if (speeds.burrow) parts.push(`burrow ${speeds.burrow} ft.`)
  return parts.length > 0 ? parts.join(', ') : '0 ft.'
}

export function monsterToDisplay(m: MonsterStatBlock): DisplayStatBlock {
  // Format saving throws
  let savingThrows: string | undefined
  if (m.savingThrows && Object.keys(m.savingThrows).length > 0) {
    savingThrows = Object.entries(m.savingThrows)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} ${v! >= 0 ? '+' : ''}${v}`)
      .join(', ')
  }

  // Format skills
  let skills: string | undefined
  if (m.skills && Object.keys(m.skills).length > 0) {
    skills = Object.entries(m.skills)
      .map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v}`)
      .join(', ')
  }

  // Format senses
  const sensesParts: string[] = []
  if (m.senses.blindsight) sensesParts.push(`Blindsight ${m.senses.blindsight} ft.`)
  if (m.senses.darkvision) sensesParts.push(`Darkvision ${m.senses.darkvision} ft.`)
  if (m.senses.tremorsense) sensesParts.push(`Tremorsense ${m.senses.tremorsense} ft.`)
  if (m.senses.truesight) sensesParts.push(`Truesight ${m.senses.truesight} ft.`)
  sensesParts.push(`Passive Perception ${m.senses.passivePerception}`)

  // Spellcasting
  let spellcasting: DisplayStatBlock['spellcasting']
  if (m.spellcasting) {
    spellcasting = {
      ability: m.spellcasting.ability,
      dc: m.spellcasting.saveDC,
      attackBonus: m.spellcasting.attackBonus,
      description: m.spellcasting.notes
    }
  }

  return {
    name: m.name,
    size: m.size,
    type: m.subtype ? `${m.type} (${m.subtype})` : m.type,
    alignment: m.alignment,
    ac: m.ac,
    acSource: m.acType,
    hp: m.hp,
    hpFormula: m.hitDice,
    speed: formatMonsterSpeed(m.speed),
    abilities: { ...m.abilityScores },
    savingThrows,
    skills,
    damageResistances: m.resistances?.join(', '),
    damageImmunities: m.damageImmunities?.join(', '),
    conditionImmunities: m.conditionImmunities?.join(', '),
    senses: sensesParts.join(', '),
    languages: m.languages.length > 0 ? m.languages.join(', ') : undefined,
    cr: m.cr,
    xp: m.xp,
    proficiencyBonus: m.proficiencyBonus,
    traits: m.traits?.map((t) => ({ name: t.name, description: t.description })),
    actions: m.actions.map((a) => ({ name: a.name, description: a.description })),
    bonusActions: m.bonusActions?.map((a) => ({ name: a.name, description: a.description })),
    legendaryActions: m.legendaryActions?.actions.map((a) => ({ name: a.name, description: a.description })),
    reactions: m.reactions?.map((a) => ({ name: a.name, description: a.description })),
    lairActions: m.lairActions?.actions.map((a) => ({ name: a.name, description: a.description })),
    spellcasting
  }
}

export function sidebarToDisplay(s: SidebarEntryStatBlock, name?: string): DisplayStatBlock {
  const abilities = s.abilityScores ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }

  // Format saving throws from string array
  let savingThrows: string | undefined
  if (s.savingThrows && s.savingThrows.length > 0) {
    savingThrows = s.savingThrows
      .map((save) => {
        const abbr = save.slice(0, 3).toLowerCase() as keyof typeof abilities
        const mod = Math.floor((abilities[abbr] - 10) / 2)
        return `${save.slice(0, 3)} ${formatModifier(mod + 2)}`
      })
      .join(', ')
  }

  // Format skills
  let skills: string | undefined
  if (s.skills && s.skills.length > 0) {
    skills = s.skills.map((sk) => `${sk.name} ${sk.modifier >= 0 ? '+' : ''}${sk.modifier}`).join(', ')
  }

  // Format senses
  const sensesParts: string[] = []
  if (s.senses) {
    sensesParts.push(...s.senses)
  }
  if (s.passivePerception) {
    sensesParts.push(`Passive Perception ${s.passivePerception}`)
  }

  // Spellcasting
  let spellcasting: DisplayStatBlock['spellcasting']
  if (s.spellcasting) {
    spellcasting = {
      ability: s.spellcasting.ability,
      dc: s.spellcasting.dc,
      attackBonus: s.spellcasting.attackBonus
    }
  }

  return {
    name: name ?? 'Creature',
    size: s.size ?? 'Medium',
    type: s.creatureType ?? 'Unknown',
    alignment: s.alignment ?? 'Unaligned',
    ac: s.ac ?? 10,
    acSource: s.acSource,
    hp: s.hpMax ?? 1,
    speed: formatSidebarSpeeds(s.speeds),
    abilities,
    savingThrows,
    skills,
    damageResistances: s.resistances?.join(', '),
    damageImmunities: s.immunities?.join(', '),
    conditionImmunities: s.conditionImmunities?.join(', '),
    senses: sensesParts.length > 0 ? sensesParts.join(', ') : undefined,
    cr: s.cr,
    xp: s.xp,
    traits: s.traits,
    actions: s.actions,
    bonusActions: s.bonusActions,
    legendaryActions: s.legendaryActions?.map((la) => ({ name: la.name, description: la.description })),
    reactions: s.reactions,
    lairActions: s.lairActions,
    spellcasting
  }
}

export function monsterToSidebar(m: MonsterStatBlock): SidebarEntryStatBlock {
  // Convert saving throws from Record to string[]
  const savingThrows: string[] = []
  if (m.savingThrows) {
    const abMap: Record<string, string> = {
      str: 'Strength',
      dex: 'Dexterity',
      con: 'Constitution',
      int: 'Intelligence',
      wis: 'Wisdom',
      cha: 'Charisma'
    }
    for (const [key, val] of Object.entries(m.savingThrows)) {
      if (val !== undefined) {
        savingThrows.push(abMap[key] ?? key)
      }
    }
  }

  // Convert skills from Record<string, number> to Array
  const skills: SidebarEntryStatBlock['skills'] = []
  if (m.skills) {
    for (const [name, modifier] of Object.entries(m.skills)) {
      skills.push({ name, modifier, proficiency: 'proficient' })
    }
  }

  // Convert senses
  const senses: string[] = []
  if (m.senses.blindsight) senses.push(`blindsight ${m.senses.blindsight} ft.`)
  if (m.senses.darkvision) senses.push(`darkvision ${m.senses.darkvision} ft.`)
  if (m.senses.tremorsense) senses.push(`tremorsense ${m.senses.tremorsense} ft.`)
  if (m.senses.truesight) senses.push(`truesight ${m.senses.truesight} ft.`)

  // Convert spellcasting
  let spellcasting: SidebarEntryStatBlock['spellcasting']
  if (m.spellcasting) {
    const allSpells: string[] = []
    if (m.spellcasting.atWill) allSpells.push(...m.spellcasting.atWill)
    if (m.spellcasting.perDay) {
      for (const spells of Object.values(m.spellcasting.perDay)) {
        allSpells.push(...spells)
      }
    }
    if (m.spellcasting.slots) {
      for (const slotLevel of Object.values(m.spellcasting.slots)) {
        allSpells.push(...slotLevel.spells)
      }
    }
    spellcasting = {
      ability: m.spellcasting.ability,
      dc: m.spellcasting.saveDC,
      attackBonus: m.spellcasting.attackBonus,
      spells: allSpells.length > 0 ? allSpells : undefined
    }
  }

  return {
    size: m.size,
    creatureType: m.subtype ? `${m.type} (${m.subtype})` : m.type,
    alignment: m.alignment,
    cr: m.cr,
    xp: m.xp,
    abilityScores: { ...m.abilityScores },
    ac: m.ac,
    acSource: m.acType,
    hpMax: m.hp,
    hpCurrent: m.hp,
    speeds: {
      walk: m.speed.walk,
      fly: m.speed.fly,
      swim: m.speed.swim,
      climb: m.speed.climb,
      burrow: m.speed.burrow
    },
    savingThrows: savingThrows.length > 0 ? savingThrows : undefined,
    skills: skills.length > 0 ? skills : undefined,
    resistances: m.resistances,
    immunities: m.damageImmunities,
    vulnerabilities: m.vulnerabilities,
    conditionImmunities: m.conditionImmunities,
    senses: senses.length > 0 ? senses : undefined,
    passivePerception: m.senses.passivePerception,
    traits: m.traits,
    actions: m.actions.map((a) => ({ name: a.name, description: a.description })),
    bonusActions: m.bonusActions?.map((a) => ({ name: a.name, description: a.description })),
    reactions: m.reactions?.map((a) => ({ name: a.name, description: a.description })),
    legendaryActions: m.legendaryActions?.actions.map((a) => ({ name: a.name, description: a.description })),
    lairActions: m.lairActions?.actions.map((a) => ({ name: a.name, description: a.description })),
    spellcasting,
    linkedMonsterId: m.id
  }
}
