// Phase 28d — the Character5e type tree was moved to `src/shared/types/character-5e.ts`
// so the Electron main process (which can only reach `src/shared/**`) can type its
// character pipeline off the real shape. Every type is re-exported from here so all
// existing renderer imports (`from '.../types/character-5e'`) keep resolving unchanged.
// The runtime helpers (totalHitDiceRemaining / totalHitDiceMaximum) stay in the
// renderer — they have no consumers in main.
export type {
  BuildChoices5e,
  Character5e,
  Character5eState,
  Character5eV3,
  CharacterClass5e,
  CharacterDetails,
  CustomFeature,
  EquipmentItem,
  Feature,
  HitDiceEntry,
  HitPoints,
  InstanceRef,
  MagicItemEntry5e,
  MulticlassEntry,
  Proficiencies5e,
  SentientCommunication,
  SentientItemTraits,
  SkillProficiency5e,
  SpellcastingInfo5e
} from '../../../shared/types/character-5e'

import type { HitDiceEntry } from '../../../shared/types/character-5e'

export function totalHitDiceRemaining(hitDice: HitDiceEntry[]): number {
  return hitDice.reduce((sum, hd) => sum + hd.current, 0)
}

export function totalHitDiceMaximum(hitDice: HitDiceEntry[]): number {
  return hitDice.reduce((sum, hd) => sum + hd.maximum, 0)
}
