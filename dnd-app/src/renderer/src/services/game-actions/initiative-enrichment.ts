import type { InitiativeEntry, RechargeAbility } from '../../types/game-state'
import type { MapToken } from '../../types/map'
import { lookupTokenStatBlock } from '../game/token-stats'

/**
 * Enrich an initiative entry with legendary-action / legendary-resistance / recharge / lair data
 * resolved from the token's library stat block (synchronous, single-source-of-truth — no monster
 * cache). Never overwrites a field the entry already carries (a manually-entered DM value wins).
 * Returns the entry unchanged when the token has no stat block. (PHASE-08 08B)
 */
export function enrichInitiativeEntry(entry: InitiativeEntry, token: MapToken | undefined): InitiativeEntry {
  const statBlock = lookupTokenStatBlock(token?.monsterStatBlockId)
  if (!statBlock) return entry

  const enriched: InitiativeEntry = { ...entry }

  // Legendary actions: { maximum: uses, used: 0 }.
  if (statBlock.legendaryActions && enriched.legendaryActions == null) {
    enriched.legendaryActions = { maximum: statBlock.legendaryActions.uses, used: 0 }
  }

  // Legendary resistances: parse the trait count; bump to the in-lair count when the creature is
  // marked inLair and the trait uses the 2024 "(N/Day, or M/Day in Lair)" format.
  if (enriched.legendaryResistances == null) {
    const lrTrait = statBlock.traits?.find((t) => t.name.toLowerCase().includes('legendary resistance'))
    if (lrTrait) {
      const base = lrTrait.name.match(/\((\d+)/)
      let count = base ? Number.parseInt(base[1] as string, 10) : 3
      if (entry.inLair) {
        const lair = lrTrait.name.match(/or (\d+)\/Day in Lair/i)
        if (lair) count = Number.parseInt(lair[1] as string, 10)
      }
      enriched.legendaryResistances = { max: count, remaining: count }
    }
  }

  // Recharge abilities: "(Recharge 5-6)" / "(Recharge 5–6)" / "(Recharge 6)" — NOT
  // "(Recharges after a Short or Long Rest)" (no digit after "Recharge ").
  if (enriched.rechargeAbilities == null) {
    const recharge: RechargeAbility[] = []
    for (const action of [...(statBlock.actions ?? []), ...(statBlock.bonusActions ?? [])]) {
      const m = action.name.match(/\(Recharge (\d)(?:[–-]\d)?\)/)
      if (m) {
        recharge.push({
          name: action.name.replace(/\s*\(Recharge.*?\)/, ''),
          rechargeOn: Number.parseInt(m[1] as string, 10),
          available: true
        })
      }
    }
    if (recharge.length > 0) enriched.rechargeAbilities = recharge
  }

  // Lair actions only when the creature has them AND is in its lair.
  if (statBlock.lairActions && entry.inLair && enriched.lairActions == null) {
    enriched.lairActions = statBlock.lairActions.actions
  }

  return enriched
}
