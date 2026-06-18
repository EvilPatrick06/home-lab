/**
 * PHASE-38 38A — the single source of truth for 5e skill definitions. Five duplicated skill lists
 * (GroupRollModal, HelpModal, StatBlockEditor, MacroBar, auto-populate-5e) and the inline list in
 * `index.ts` all derive from this. D&D-flow consumers may import from `systems/dnd5e/` directly
 * (the anti-pattern rule only bars such imports OUTSIDE D&D flows).
 */

import type { AbilityName } from '../../types/character-common'

export const SKILL_DEFINITIONS_5E: ReadonlyArray<{ name: string; ability: AbilityName }> = [
  { name: 'Acrobatics', ability: 'dexterity' },
  { name: 'Animal Handling', ability: 'wisdom' },
  { name: 'Arcana', ability: 'intelligence' },
  { name: 'Athletics', ability: 'strength' },
  { name: 'Deception', ability: 'charisma' },
  { name: 'History', ability: 'intelligence' },
  { name: 'Insight', ability: 'wisdom' },
  { name: 'Intimidation', ability: 'charisma' },
  { name: 'Investigation', ability: 'intelligence' },
  { name: 'Medicine', ability: 'wisdom' },
  { name: 'Nature', ability: 'intelligence' },
  { name: 'Perception', ability: 'wisdom' },
  { name: 'Performance', ability: 'charisma' },
  { name: 'Persuasion', ability: 'charisma' },
  { name: 'Religion', ability: 'intelligence' },
  { name: 'Sleight of Hand', ability: 'dexterity' },
  { name: 'Stealth', ability: 'dexterity' },
  { name: 'Survival', ability: 'wisdom' }
]

export const SKILL_NAMES_5E: readonly string[] = SKILL_DEFINITIONS_5E.map((s) => s.name)

export const SKILL_ABILITY_MAP_5E: Readonly<Record<string, AbilityName>> = Object.fromEntries(
  SKILL_DEFINITIONS_5E.map((s) => [s.name, s.ability])
)
