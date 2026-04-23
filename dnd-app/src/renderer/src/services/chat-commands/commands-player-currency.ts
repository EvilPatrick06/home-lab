import { abilityModifier } from '../../types/character-common'
import { getLatestCharacter, saveAndBroadcastCharacter } from './helpers'
import type { ChatCommand } from './types'

export const commands: ChatCommand[] = [
  {
    name: 'gold',
    aliases: ['gp'],
    category: 'player',
    dmOnly: false,
    description: 'Show or adjust gold',
    usage: '/gold or /gold +50 or /gold -10',
    execute: (_args, context) => {
      if (!context.character) return { type: 'error', content: 'No active character.' }
      const char = getLatestCharacter(context.character.id)
      if (!char) return { type: 'error', content: 'No active character.' }

      const currency = char.treasure ?? { gp: 0, sp: 0, cp: 0, pp: 0, ep: 0 }
      const rawArgs = _args.trim()

      if (!rawArgs) {
        const lines = [
          '**Gold Pouch**',
          `Platinum: ${currency.pp ?? 0} pp`,
          `Gold: ${currency.gp ?? 0} gp`,
          `Silver: ${currency.sp ?? 0} sp`,
          `Copper: ${currency.cp ?? 0} cp`
        ]
        return { type: 'system', content: lines.join('\n') }
      }

      const match = rawArgs.match(/^([+-])(\d+)$/)
      if (!match) return { type: 'error', content: 'Usage: /gold or /gold +50 or /gold -10' }

      const sign = match[1] === '+' ? 1 : -1
      const amount = parseInt(match[2], 10) * sign
      const newGold = (currency.gp ?? 0) + amount

      if (newGold < 0) return { type: 'error', content: `Not enough gold. Current: ${currency.gp ?? 0} gp.` }

      const updated = { ...char, treasure: { ...currency, gp: newGold } }
      saveAndBroadcastCharacter(updated)

      const verb = amount > 0 ? 'Gained' : 'Spent'
      return { type: 'system', content: `${verb} ${Math.abs(amount)} gp. New total: ${newGold} gp.` }
    }
  },
  {
    name: 'money',
    aliases: ['currency'],
    category: 'player',
    dmOnly: false,
    description: 'Show full currency breakdown',
    usage: '/money',
    execute: (_args, context) => {
      if (!context.character) return { type: 'error', content: 'No active character.' }
      const char = getLatestCharacter(context.character.id)
      if (!char) return { type: 'error', content: 'No active character.' }

      const currency = char.treasure ?? { gp: 0, sp: 0, cp: 0, pp: 0, ep: 0 }
      const pp = currency.pp ?? 0
      const gp = currency.gp ?? 0
      const sp = currency.sp ?? 0
      const cp = currency.cp ?? 0
      const totalGP = pp * 10 + gp + sp / 10 + cp / 100

      const lines = [
        '**Currency Breakdown**',
        `Platinum: ${pp} pp`,
        `Gold: ${gp} gp`,
        `Silver: ${sp} sp`,
        `Copper: ${cp} cp`,
        '',
        `**Total Value:** ${totalGP.toFixed(2)} gp`
      ]
      return { type: 'system', content: lines.join('\n') }
    }
  },
  {
    name: 'encumbrance',
    aliases: ['weight', 'enc'],
    category: 'player',
    dmOnly: false,
    description: 'Show carry weight status',
    usage: '/encumbrance',
    execute: (_args, context) => {
      if (!context.character) return { type: 'error', content: 'No active character.' }
      const char = getLatestCharacter(context.character.id)
      if (!char) return { type: 'error', content: 'No active character.' }

      const str = char.abilityScores?.strength ?? 10
      const maxCarry = str * 15
      const encumbered = str * 5
      const heavilyEncumbered = str * 10

      const equipment = char.equipment ?? []
      const currentWeight = equipment.reduce((sum, item) => {
        const w = item.weight ?? 0
        const qty = item.quantity ?? 1
        return sum + w * qty
      }, 0)

      let status = 'Unencumbered'
      if (currentWeight >= maxCarry) status = 'Over capacity!'
      else if (currentWeight >= heavilyEncumbered)
        status = 'Heavily Encumbered (Speed -20 ft, Disadvantage on ability checks, attacks, STR/CON/DEX saves)'
      else if (currentWeight >= encumbered) status = 'Encumbered (Speed -10 ft)'

      const lines = [
        '**Carry Weight**',
        `Current: ${currentWeight.toFixed(1)} lb`,
        `Encumbered: ${encumbered} lb`,
        `Heavily Encumbered: ${heavilyEncumbered} lb`,
        `Max Carry: ${maxCarry} lb`,
        '',
        `**Status:** ${status}`
      ]
      return { type: 'system', content: lines.join('\n') }
    }
  },
  {
    name: 'ac',
    aliases: ['armor'],
    category: 'player',
    dmOnly: false,
    description: 'Show AC breakdown',
    usage: '/ac',
    execute: (_args, context) => {
      if (!context.character) return { type: 'error', content: 'No active character.' }
      const char = getLatestCharacter(context.character.id)
      if (!char) return { type: 'error', content: 'No active character.' }

      const dexMod = abilityModifier(char.abilityScores?.dexterity ?? 10)

      const equipment = char.equipment ?? []
      const armor = equipment.find((e) => e.equipped && e.type === 'armor')
      const shield = equipment.find(
        (e) => e.equipped && (e.type === 'shield' || e.name?.toLowerCase().includes('shield'))
      )

      let baseAC = 10
      let dexBonus = dexMod
      let shieldBonus = 0
      let armorName = 'None (10 + DEX)'

      if (armor) {
        const ac = armor.ac ?? armor.armorClass ?? 0
        armorName = armor.name ?? 'Armor'
        if (armor.armorType === 'heavy' || armor.category === 'Heavy') {
          baseAC = ac
          dexBonus = 0
          armorName += ' (Heavy — no DEX)'
        } else if (armor.armorType === 'medium' || armor.category === 'Medium') {
          baseAC = ac
          dexBonus = Math.min(dexMod, 2)
          armorName += ' (Medium — DEX max +2)'
        } else {
          baseAC = ac
          armorName += ' (Light)'
        }
      }

      if (shield) {
        shieldBonus = shield.ac ?? shield.armorClass ?? 2
      }

      const totalAC = baseAC + dexBonus + shieldBonus

      const lines = [
        '**AC Breakdown**',
        `Armor: ${armorName}`,
        `Base AC: ${baseAC}`,
        `DEX Modifier: ${dexMod >= 0 ? '+' : ''}${dexBonus}${dexBonus !== dexMod ? ` (capped from ${dexMod >= 0 ? '+' : ''}${dexMod})` : ''}`,
        shield ? `Shield: +${shieldBonus}` : 'Shield: None',
        '',
        `**Total AC: ${totalAC}**`
      ]
      return { type: 'system', content: lines.join('\n') }
    }
  }
]
