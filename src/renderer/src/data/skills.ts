import { load5eSkills, type SkillEntry } from '../services/data-provider'
import { logger } from '../utils/logger'

export interface SkillDescription {
  name: string
  ability: string
  description: string
  uses: string
}

// Map ability names: JSON uses lowercase full ("dexterity"), TS uses uppercase abbrev ("DEX")
const ABILITY_ABBREV: Record<string, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA'
}

function mapEntry(e: SkillEntry): SkillDescription {
  return {
    name: e.name,
    ability: ABILITY_ABBREV[e.ability] ?? e.ability.toUpperCase().slice(0, 3),
    description: e.description,
    uses: e.uses ?? ''
  }
}

export const SKILLS_5E: SkillDescription[] = []

// Auto-populate on first load
load5eSkills()
  .then((entries) => {
    SKILLS_5E.length = 0
    SKILLS_5E.push(...entries.map(mapEntry))
  })
  .catch((e) => logger.warn('Failed to load 5e skills data', e))

export function getSkillDescription(skillName: string): SkillDescription | undefined {
  return SKILLS_5E.find((s) => s.name === skillName)
}
