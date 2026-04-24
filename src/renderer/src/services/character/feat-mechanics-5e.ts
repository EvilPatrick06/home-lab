import type { Character5e } from '../../types/character-5e'

// ─── Feat Mechanic Descriptors ──────────────────────────────

export interface FeatMechanic {
  featId: string
  name: string
  trigger: 'on_hit' | 'on_crit' | 'on_miss' | 'on_damage' | 'on_attack' | 'passive' | 'reaction' | 'resource'
  description: string
  perTurn?: boolean
}

/**
 * Get active feat mechanics for a character, based on their equipped feats.
 */
export function getActiveFeatMechanics(character: Character5e): FeatMechanic[] {
  const feats = character.feats ?? []
  const mechanics: FeatMechanic[] = []
  const profBonus = Math.ceil(character.level / 4) + 1

  for (const feat of feats) {
    switch (feat.id) {
      case 'lucky':
        mechanics.push({
          featId: 'lucky',
          name: 'Lucky',
          trigger: 'resource',
          description: `${profBonus} Luck Points per Long Rest. Spend 1 to gain Advantage on an attack/ability/save, or impose Disadvantage on an attacker.`
        })
        break

      case 'savage-attacker':
        mechanics.push({
          featId: 'savage-attacker',
          name: 'Savage Attacker',
          trigger: 'on_damage',
          description: 'Once per turn, reroll melee weapon damage dice and use either total.',
          perTurn: true
        })
        break

      case 'crusher':
        mechanics.push({
          featId: 'crusher',
          name: 'Crusher',
          trigger: 'on_hit',
          description:
            'On hit with bludgeoning: push target 5 ft. On crit: all attacks vs target have Advantage until start of your next turn.'
        })
        break

      case 'piercer':
        mechanics.push({
          featId: 'piercer',
          name: 'Piercer',
          trigger: 'on_crit',
          description:
            'On crit with piercing: roll one additional damage die. Once per turn, reroll one piercing damage die.',
          perTurn: true
        })
        break

      case 'slasher':
        mechanics.push({
          featId: 'slasher',
          name: 'Slasher',
          trigger: 'on_hit',
          description:
            'On hit with slashing: reduce target speed by 10 ft until start of your next turn. On crit: target has Disadvantage on attacks until start of your next turn.'
        })
        break

      case 'charger':
        mechanics.push({
          featId: 'charger',
          name: 'Charger',
          trigger: 'on_hit',
          description: 'After Dash, if you moved 10+ ft toward target: deal +1d8 damage or push target 10 ft.'
        })
        break

      case 'sentinel':
        mechanics.push({
          featId: 'sentinel',
          name: 'Sentinel',
          trigger: 'reaction',
          description:
            'When a creature within reach hits an ally: reaction opportunity attack. On hit: reduce target speed to 0 for the turn.'
        })
        break

      case 'defensive-duelist':
        mechanics.push({
          featId: 'defensive-duelist',
          name: 'Defensive Duelist',
          trigger: 'reaction',
          description: `Reaction: +${profBonus} AC against one melee attack (while wielding a finesse weapon you're proficient with).`
        })
        break

      case 'dual-wielder':
        mechanics.push({
          featId: 'dual-wielder',
          name: 'Dual Wielder',
          trigger: 'passive',
          description: '+1 AC when wielding two weapons. Can Two-Weapon Fight with non-Light weapons.'
        })
        break

      case 'elemental-adept':
        mechanics.push({
          featId: 'elemental-adept',
          name: 'Elemental Adept',
          trigger: 'on_damage',
          description: 'Spells ignore resistance to chosen damage type. Treat 1s on damage dice as 2s for that element.'
        })
        break

      case 'crossbow-expert':
        mechanics.push({
          featId: 'crossbow-expert',
          name: 'Crossbow Expert',
          trigger: 'passive',
          description:
            'Ignore Loading. No Disadvantage on ranged attacks within 5 ft of hostile. Extra attack with hand crossbow as Bonus Action.'
        })
        break

      case 'durable':
        mechanics.push({
          featId: 'durable',
          name: 'Durable',
          trigger: 'passive',
          description: 'Advantage on Death Saving Throws.'
        })
        break
    }
  }

  return mechanics
}

/**
 * Check if Crusher/Piercer/Slasher feat effects apply to a weapon's damage type.
 */
export function getDamageTypeFeatEffects(
  character: Character5e,
  damageType: string,
  isCrit: boolean
): Array<{ feat: string; effect: string }> {
  const feats = character.feats ?? []
  const effects: Array<{ feat: string; effect: string }> = []

  if (damageType === 'bludgeoning' && feats.some((f) => f.id === 'crusher')) {
    effects.push({ feat: 'Crusher', effect: 'Push target 5 ft' })
    if (isCrit)
      effects.push({ feat: 'Crusher (Crit)', effect: 'All attacks vs target have Advantage until your next turn' })
  }
  if (damageType === 'piercing' && feats.some((f) => f.id === 'piercer')) {
    if (isCrit) effects.push({ feat: 'Piercer (Crit)', effect: 'Roll one additional damage die' })
  }
  if (damageType === 'slashing' && feats.some((f) => f.id === 'slasher')) {
    effects.push({ feat: 'Slasher', effect: 'Reduce target speed by 10 ft' })
    if (isCrit)
      effects.push({ feat: 'Slasher (Crit)', effect: 'Target has Disadvantage on attacks until your next turn' })
  }

  return effects
}
