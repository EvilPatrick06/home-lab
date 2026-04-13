import { trigger3dDice } from '../../components/game/dice3d'
import { rollSingle } from '../dice/dice-service'
import type { ChatCommand } from './types'

const contestCommand: ChatCommand = {
  name: 'contest',
  aliases: ['opposed'],
  description: 'Roll a contested ability check between two parties',
  usage: '/contest <ability> vs <ability> [target]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const input = args.trim()
    if (!input) {
      return { type: 'error', content: 'Usage: /contest <ability> vs <ability> [target]' }
    }

    const vsParts = input.split(/\s+vs\s+/i)
    const myAbility = vsParts[0]?.trim() || 'Strength'
    const theirAbility = vsParts[1]?.trim() || 'Strength'

    const myRoll = rollSingle(20)
    const theirRoll = rollSingle(20)

    const myTag = myRoll === 20 ? ' **Nat 20!**' : myRoll === 1 ? ' *Nat 1!*' : ''
    const theirTag = theirRoll === 20 ? ' **Nat 20!**' : theirRoll === 1 ? ' *Nat 1!*' : ''

    trigger3dDice({
      formula: '2d20',
      rolls: [myRoll, theirRoll],
      total: myRoll + theirRoll,
      rollerName: ctx.playerName
    })

    return {
      type: 'broadcast',
      content: `**Contested Check** — ${ctx.playerName} (${myAbility}): **${myRoll}**${myTag} vs Opponent (${theirAbility}): **${theirRoll}**${theirTag}`
    }
  }
}

const passiveCommand: ChatCommand = {
  name: 'passive',
  aliases: [],
  description: 'Calculate a passive ability score (10 + modifier)',
  usage: '/passive <perception|investigation|insight> [modifier]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    const skill = parts[0] || 'Perception'
    const mod = parseInt(parts[1], 10)
    const modifier = Number.isNaN(mod) ? 0 : mod
    const passive = 10 + modifier

    return {
      type: 'system',
      content: `${ctx.playerName}'s Passive ${skill}: **${passive}** (10 ${modifier >= 0 ? '+' : ''}${modifier})`
    }
  }
}

const groupcheckCommand: ChatCommand = {
  name: 'groupcheck',
  aliases: ['gc'],
  description: 'Request a group ability check from all players',
  usage: '/groupcheck <ability or skill> [DC]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    const dcStr = parts[parts.length - 1]
    const dc = parseInt(dcStr, 10)
    const hasDC = !Number.isNaN(dc) && dc >= 1 && dc <= 30
    const skill = hasDC ? parts.slice(0, -1).join(' ') : parts.join(' ')

    if (!skill) {
      return { type: 'error', content: 'Usage: /groupcheck <ability or skill> [DC]' }
    }

    return {
      type: 'broadcast',
      content: `**Group Check:** ${skill}${hasDC ? ` (DC ${dc})` : ''} — requested by ${ctx.playerName}`
    }
  }
}

const abilityCommand: ChatCommand = {
  name: 'ability',
  aliases: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
  description: 'Roll a raw ability check (d20 + modifier)',
  usage: '/ability <str|dex|con|int|wis|cha> [modifier]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    const abilityMap: Record<string, string> = {
      str: 'strength',
      dex: 'dexterity',
      con: 'constitution',
      int: 'intelligence',
      wis: 'wisdom',
      cha: 'charisma',
      strength: 'strength',
      dexterity: 'dexterity',
      constitution: 'constitution',
      intelligence: 'intelligence',
      wisdom: 'wisdom',
      charisma: 'charisma'
    }

    // Try to detect ability name from first arg
    const firstArg = parts[0]?.toLowerCase() ?? ''
    const abilityName = abilityMap[firstArg]
    let modifier: number

    if (abilityName && ctx.character) {
      // Auto-detect modifier from character ability scores
      const char = ctx.character as { abilityScores?: Record<string, number> }
      const score = char.abilityScores?.[abilityName] ?? 10
      modifier = Math.floor((score - 10) / 2)
      // Allow manual override if a second arg is provided
      const manualMod = parts[1] ? parseInt(parts[1], 10) : NaN
      if (!Number.isNaN(manualMod)) modifier = manualMod
    } else {
      // Fallback: treat first arg as modifier
      const mod = parseInt(parts[0], 10)
      modifier = Number.isNaN(mod) ? 0 : mod
    }

    const roll = rollSingle(20)
    const total = roll + modifier
    const tag = roll === 20 ? ' **Natural 20!**' : roll === 1 ? ' *Natural 1!*' : ''
    const abilityLabel = abilityName ? `${abilityName.charAt(0).toUpperCase() + abilityName.slice(1)} ` : ''

    trigger3dDice({ formula: '1d20', rolls: [roll], total: roll, rollerName: ctx.playerName })

    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** ${abilityLabel}Ability Check: d20 (${roll}) ${modifier >= 0 ? '+' : ''}${modifier} = **${total}**${tag}`
    }
  }
}

const saveCommand: ChatCommand = {
  name: 'save',
  aliases: ['savingthrow', 'st'],
  description: 'Roll a saving throw',
  usage: '/save <str|dex|con|int|wis|cha> [modifier]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    const abilityMap: Record<string, string> = {
      str: 'Strength',
      dex: 'Dexterity',
      con: 'Constitution',
      int: 'Intelligence',
      wis: 'Wisdom',
      cha: 'Charisma',
      strength: 'Strength',
      dexterity: 'Dexterity',
      constitution: 'Constitution',
      intelligence: 'Intelligence',
      wisdom: 'Wisdom',
      charisma: 'Charisma'
    }
    const abilityKey = parts[0]?.toLowerCase()
    const ability = abilityMap[abilityKey]
    if (!ability) {
      return { type: 'error', content: 'Usage: /save <str|dex|con|int|wis|cha> [modifier]' }
    }

    let modifier: number
    const manualMod = parts[1] ? parseInt(parts[1], 10) : NaN

    if (!Number.isNaN(manualMod)) {
      modifier = manualMod
    } else if (ctx.character) {
      // Auto-detect modifier from character ability scores + save proficiency
      const char = ctx.character as {
        abilityScores?: Record<string, number>
        level?: number
        proficiencies?: { savingThrows?: string[] }
      }
      const abilityNameLower = ability.toLowerCase()
      const score = char.abilityScores?.[abilityNameLower] ?? 10
      modifier = Math.floor((score - 10) / 2)
      const profBonus = (char.level ?? 1) >= 21 ? 7 : Math.ceil((char.level ?? 1) / 4) + 1
      const isProficient = char.proficiencies?.savingThrows?.includes(abilityNameLower)
      if (isProficient) modifier += profBonus
    } else {
      modifier = 0
    }

    const roll = rollSingle(20)
    const total = roll + modifier
    const tag = roll === 20 ? ' **Natural 20!**' : roll === 1 ? ' *Natural 1!*' : ''
    const modStr = modifier !== 0 ? ` ${modifier >= 0 ? '+' : ''}${modifier}` : ''
    trigger3dDice({ formula: '1d20', rolls: [roll], total: roll, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** ${ability} Saving Throw: d20 (${roll})${modStr} = **${total}**${tag}`
    }
  }
}

export const commands: ChatCommand[] = [contestCommand, passiveCommand, groupcheckCommand, abilityCommand, saveCommand]
