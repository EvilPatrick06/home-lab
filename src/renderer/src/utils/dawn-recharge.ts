import { useCharacterStore } from '../stores/use-character-store'
import type { Character5e } from '../types/character-5e'

/**
 * Process dawn recharge for all campaign characters.
 * Recharges magic item charges that have rechargeType === 'dawn'.
 */
export function processDawnRecharge(campaignId: string): void {
  const charStore = useCharacterStore.getState()
  const campaignChars = charStore.characters.filter((c) => c.campaignId === campaignId && c.gameSystem === 'dnd5e')

  for (const ch of campaignChars) {
    const items5e = (ch as Character5e).equipment ?? []
    let changed = false

    for (const item of items5e) {
      if (item.magicItemId && item.maxCharges && item.rechargeType === 'dawn') {
        const formula = item.rechargeFormula ?? `1d${item.maxCharges}`
        const match = formula.match(/^(\d+)?d(\d+)([+-]\d+)?$/)
        let rechargeAmount: number

        if (match) {
          const count = parseInt(match[1] || '1', 10)
          const sides = parseInt(match[2], 10)
          const mod = parseInt(match[3] || '0', 10)
          rechargeAmount = 0
          for (let i = 0; i < count; i++) rechargeAmount += Math.floor(Math.random() * sides) + 1
          rechargeAmount += mod
        } else {
          rechargeAmount = parseInt(formula, 10) || 1
        }

        item.currentCharges = Math.min((item.currentCharges ?? 0) + rechargeAmount, item.maxCharges)
        changed = true
      }
    }

    if (changed) {
      charStore.saveCharacter({
        ...ch,
        equipment: items5e
      } as Character5e)
    }
  }
}
