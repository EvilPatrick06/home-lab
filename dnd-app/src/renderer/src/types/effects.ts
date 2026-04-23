// ─── Mechanical Effect Types ──────────────────────────────────

export type EffectType =
  | 'ac_bonus'
  | 'attack_bonus'
  | 'damage_bonus'
  | 'spell_dc_bonus'
  | 'spell_attack_bonus'
  | 'ability_set'
  | 'ability_bonus'
  | 'hp_per_level'
  | 'speed_bonus'
  | 'initiative_bonus'
  | 'save_bonus'
  | 'resistance'
  | 'immunity'
  | 'vulnerability'
  | 'damage_reduction'
  | 'crit_prevention'
  | 'extra_damage_dice'
  | 'reroll_damage_1s'
  | 'advantage_on'
  | 'ignore_loading'
  | 'no_ranged_melee_disadvantage'
  | 'extra_resource'
  | 'luck_points'
  | 'heal'
  | 'temp_hp'
  | 'on_crit_effect'
  | 'on_hit_effect'
  | 'reaction_effect'

export type EffectCondition =
  | 'always'
  | 'equipped'
  | 'attuned'
  | 'wielding'
  | 'wearing_armor'
  | 'wearing_heavy_armor'
  | 'on_use'
  | 'in_combat'

export type EffectScope =
  | 'all'
  | 'melee'
  | 'ranged'
  | 'spell'
  | 'weapon'
  | 'melee_weapon'
  | 'ranged_weapon'
  | 'heavy_weapon'
  | 'thrown'
  | 'crossbow'

export interface MechanicalEffect {
  type: EffectType
  value?: number
  stringValue?: string
  dice?: string
  condition?: EffectCondition
  scope?: EffectScope
  frequency?: 'at_will' | 'per_turn' | 'per_short_rest' | 'per_long_rest'
  targetType?: 'self' | 'target'
}

export interface EffectSource {
  sourceId: string
  sourceName: string
  sourceType: 'magic-item' | 'feat' | 'class-feature' | 'fighting-style' | 'species' | 'consumable' | 'custom'
  effects: MechanicalEffect[]
}

// ─── Custom DM Effects ───────────────────────────────────────

export interface CustomEffect {
  id: string
  name: string
  targetEntityId: string
  targetEntityName: string
  effects: MechanicalEffect[]
  appliedBy: string
  duration?: {
    type: 'rounds' | 'minutes' | 'hours'
    value: number
    startRound?: number
    startSeconds?: number
  }
}
