import { is5eCharacter } from '../../types/character'
import type { Character5e } from '../../types/character-5e'
import {
  addConditionOnCharacter,
  removeConditionByPrefix,
  requireLatestCharacter,
  saveAndBroadcastCharacter
} from './helpers'
import type { ChatCommand, CommandContext, CommandResult } from './types'

// /spell - Expend or restore spell slot
const spellCommand: ChatCommand = {
  name: 'spell',
  aliases: ['slot'],
  category: 'player',
  dmOnly: false,
  description: 'Expend or restore a spell slot',
  usage: '/spell <level>',
  execute: (args: string, ctx: CommandContext): CommandResult => {
    if (!ctx.character) {
      return { handled: true, error: 'No active character.' }
    }
    const char = requireLatestCharacter(ctx)
    if (!char || !is5eCharacter(char)) {
      return { handled: true, error: 'No active 5e character found.' }
    }

    const parts = args.trim().split(/\s+/)
    const level = parseInt(parts[0], 10)
    if (Number.isNaN(level) || level < 1 || level > 9) {
      return { handled: true, error: 'Usage: /spell <level> (1-9)' }
    }

    const spellSlotLevels = char.spellSlotLevels
    if (!spellSlotLevels) {
      return { handled: true, error: `${char.name} has no spell slots.` }
    }

    const slot = spellSlotLevels[level]
    if (!slot || slot.max === 0) {
      return { handled: true, error: `${char.name} has no level ${level} spell slots.` }
    }

    if (slot.current <= 0) {
      return { handled: true, error: `${char.name} has no remaining level ${level} spell slots.` }
    }

    const updated: Character5e = {
      ...char,
      spellSlotLevels: {
        ...spellSlotLevels,
        [level]: { ...slot, current: slot.current - 1 }
      }
    }

    saveAndBroadcastCharacter(updated)
    const remaining = slot.current - 1
    ctx.addSystemMessage(`${char.name} expends a level ${level} spell slot. (${remaining}/${slot.max} remaining)`)
    return { handled: true }
  }
}

// /channel - Use Channel Divinity charge (Cleric/Paladin)
const channelCommand: ChatCommand = {
  name: 'channel',
  aliases: ['cd'],
  category: 'player',
  dmOnly: false,
  description: 'Use a Channel Divinity charge',
  usage: '/channel',
  execute: (_args: string, ctx: CommandContext): CommandResult => {
    if (!ctx.character) {
      return { handled: true, error: 'No active character.' }
    }
    const char = requireLatestCharacter(ctx)
    if (!char || !is5eCharacter(char)) {
      return { handled: true, error: 'No active 5e character found.' }
    }

    const name = char.name || 'Character'
    ctx.addSystemMessage(`${name} uses Channel Divinity.`)
    return { handled: true }
  }
}

// /ki - Spend ki points (Monk)
const kiCommand: ChatCommand = {
  name: 'ki',
  aliases: [],
  category: 'player',
  dmOnly: false,
  description: 'Spend ki points',
  usage: '/ki <amount>',
  execute: (args: string, ctx: CommandContext): CommandResult => {
    if (!ctx.character) {
      return { handled: true, error: 'No active character.' }
    }
    const char = requireLatestCharacter(ctx)
    if (!char || !is5eCharacter(char)) {
      return { handled: true, error: 'No active 5e character found.' }
    }

    const parts = args.trim().split(/\s+/)
    const amount = parseInt(parts[0], 10)
    if (Number.isNaN(amount) || amount < 1) {
      return { handled: true, error: 'Usage: /ki <amount>' }
    }

    const name = char.name || 'Character'
    ctx.addSystemMessage(`${name} spends ${amount} Ki Point${amount !== 1 ? 's' : ''}.`)
    return { handled: true }
  }
}

// /rage - Toggle rage (Barbarian)
const rageCommand: ChatCommand = {
  name: 'rage',
  aliases: [],
  category: 'player',
  dmOnly: false,
  description: 'Toggle rage on or off',
  usage: '/rage',
  execute: (_args: string, ctx: CommandContext): CommandResult => {
    if (!ctx.character) {
      return { handled: true, error: 'No active character.' }
    }
    const char = requireLatestCharacter(ctx)
    if (!char || !is5eCharacter(char)) {
      return { handled: true, error: 'No active 5e character found.' }
    }

    const name = char.name || 'Character'

    const removed = removeConditionByPrefix(char.id, 'Raging')
    if (removed) {
      ctx.broadcastSystemMessage(`${name}'s rage ends.`)
    } else {
      addConditionOnCharacter(char, 'Raging')
      ctx.broadcastSystemMessage(`${name} enters a RAGE!`)
    }

    return { handled: true }
  }
}

// /bardic - Use Bardic Inspiration
const bardicCommand: ChatCommand = {
  name: 'bardic',
  aliases: ['bi'],
  category: 'player',
  dmOnly: false,
  description: 'Grant Bardic Inspiration to a target',
  usage: '/bardic [target]',
  execute: (args: string, ctx: CommandContext): CommandResult => {
    if (!ctx.character) {
      return { handled: true, error: 'No active character.' }
    }
    const char = requireLatestCharacter(ctx)
    if (!char || !is5eCharacter(char)) {
      return { handled: true, error: 'No active 5e character found.' }
    }

    const name = char.name || 'Character'
    const target = args.trim().length > 0 ? args.trim() : 'an ally'
    ctx.broadcastSystemMessage(`${name} grants Bardic Inspiration to ${target}!`)
    return { handled: true }
  }
}

// /inspiration - Toggle heroic inspiration
const inspirationCommand: ChatCommand = {
  name: 'inspiration',
  aliases: ['insp'],
  category: 'player',
  dmOnly: false,
  description: 'Toggle heroic inspiration',
  usage: '/inspiration',
  execute: (_args: string, ctx: CommandContext): CommandResult => {
    if (!ctx.character) {
      return { handled: true, error: 'No active character.' }
    }
    const char = requireLatestCharacter(ctx)
    if (!char || !is5eCharacter(char)) {
      return { handled: true, error: 'No active 5e character found.' }
    }

    const name = char.name || 'Character'
    const updated: Character5e = {
      ...char,
      heroicInspiration: !char.heroicInspiration
    }

    saveAndBroadcastCharacter(updated)

    if (updated.heroicInspiration) {
      ctx.addSystemMessage(`${name} gains Heroic Inspiration!`)
    } else {
      ctx.addSystemMessage(`${name} uses Heroic Inspiration.`)
    }

    return { handled: true }
  }
}

// /deathsave - Record death save result
const deathsaveCommand: ChatCommand = {
  name: 'deathsave',
  aliases: ['ds'],
  category: 'player',
  dmOnly: false,
  description: 'Record a death saving throw result',
  usage: '/deathsave <pass|fail>',
  execute: (args: string, ctx: CommandContext): CommandResult => {
    if (!ctx.character) {
      return { handled: true, error: 'No active character.' }
    }
    const char = requireLatestCharacter(ctx)
    if (!char || !is5eCharacter(char)) {
      return { handled: true, error: 'No active 5e character found.' }
    }

    const parts = args.trim().split(/\s+/)
    const result = parts[0]?.toLowerCase()
    if (result !== 'pass' && result !== 'fail') {
      return { handled: true, error: 'Usage: /deathsave <pass|fail>' }
    }

    const name = char.name || 'Character'
    const saves = char.deathSaves ?? { successes: 0, failures: 0 }
    const isPass = result === 'pass'

    const updatedSaves = {
      successes: isPass ? Math.min(saves.successes + 1, 3) : saves.successes,
      failures: !isPass ? Math.min(saves.failures + 1, 3) : saves.failures
    }

    const updated: Character5e = {
      ...char,
      deathSaves: updatedSaves
    }

    saveAndBroadcastCharacter(updated)

    const label = isPass ? 'SUCCESS' : 'FAILURE'
    ctx.broadcastSystemMessage(
      `${name} rolls a death save: ${label}! (${updatedSaves.successes}/3 successes, ${updatedSaves.failures}/3 failures)`
    )

    if (updatedSaves.successes >= 3) {
      ctx.broadcastSystemMessage(`${name} stabilizes!`)
    } else if (updatedSaves.failures >= 3) {
      ctx.broadcastSystemMessage(`${name} has died.`)
    }

    return { handled: true }
  }
}

// /sorcery - Use sorcery points (Sorcerer)
const sorceryCommand: ChatCommand = {
  name: 'sorcery',
  aliases: ['sp', 'sorcpoint'],
  category: 'player',
  dmOnly: false,
  description: 'Spend sorcery points',
  usage: '/sorcery <amount> [description]',
  execute: (args: string, ctx: CommandContext): CommandResult => {
    if (!ctx.character) {
      return { handled: true, error: 'No active character.' }
    }
    const parts = args.trim().split(/\s+/)
    const amount = parseInt(parts[0], 10)
    if (Number.isNaN(amount) || amount < 1) {
      return { handled: true, error: 'Usage: /sorcery <amount> [description]' }
    }
    const desc = parts.slice(1).join(' ')
    const name = ctx.character.name || 'Character'
    ctx.broadcastSystemMessage(
      `${name} spends ${amount} Sorcery Point${amount !== 1 ? 's' : ''}${desc ? ` (${desc})` : ''}.`
    )
    return { handled: true }
  }
}

// /superiority - Use superiority dice (Fighter: Battle Master)
const superiorityCommand: ChatCommand = {
  name: 'superiority',
  aliases: ['sd', 'maneuver'],
  category: 'player',
  dmOnly: false,
  description: 'Use a Superiority Die for a maneuver',
  usage: '/superiority [maneuver name]',
  execute: (args: string, ctx: CommandContext): CommandResult => {
    if (!ctx.character) {
      return { handled: true, error: 'No active character.' }
    }
    const maneuver = args.trim() || 'a maneuver'
    const name = ctx.character.name || 'Character'
    const roll = Math.floor(Math.random() * 8) + 1
    ctx.broadcastSystemMessage(`${name} uses Superiority Die (${maneuver}): **d8 = ${roll}**`)
    return { handled: true }
  }
}

// /secondwind - Use Second Wind (Fighter)
const secondWindCommand: ChatCommand = {
  name: 'secondwind',
  aliases: ['sw', 'second-wind'],
  category: 'player',
  dmOnly: false,
  description: 'Use Second Wind to heal (Fighter)',
  usage: '/secondwind',
  execute: (_args: string, ctx: CommandContext): CommandResult => {
    if (!ctx.character) {
      return { handled: true, error: 'No active character.' }
    }
    const char = requireLatestCharacter(ctx)
    if (!char || !is5eCharacter(char)) {
      return { handled: true, error: 'No active 5e character found.' }
    }
    const name = char.name || 'Character'
    const level = char.level || 1
    const roll = Math.floor(Math.random() * 10) + 1
    const total = roll + level
    ctx.broadcastSystemMessage(`${name} uses **Second Wind**: 1d10 (${roll}) + ${level} = **${total} HP healed**`)
    return { handled: true }
  }
}

// /actionsurge - Use Action Surge (Fighter)
const actionSurgeCommand: ChatCommand = {
  name: 'actionsurge',
  aliases: ['as', 'action-surge', 'surge'],
  category: 'player',
  dmOnly: false,
  description: 'Use Action Surge for an extra action (Fighter)',
  usage: '/actionsurge',
  execute: (_args: string, ctx: CommandContext): CommandResult => {
    if (!ctx.character) {
      return { handled: true, error: 'No active character.' }
    }
    const name = ctx.character.name || 'Character'
    ctx.broadcastSystemMessage(`${name} uses **Action Surge!** (Extra action this turn)`)
    return { handled: true }
  }
}

// /layonhands - Use Lay on Hands (Paladin)
const layOnHandsCommand: ChatCommand = {
  name: 'layonhands',
  aliases: ['loh', 'lay-on-hands'],
  category: 'player',
  dmOnly: false,
  description: 'Use Lay on Hands to heal or cure (Paladin)',
  usage: '/layonhands <amount> [target]',
  execute: (args: string, ctx: CommandContext): CommandResult => {
    if (!ctx.character) {
      return { handled: true, error: 'No active character.' }
    }
    const parts = args.trim().split(/\s+/)
    const amount = parseInt(parts[0], 10)
    if (Number.isNaN(amount) || amount < 1) {
      return { handled: true, error: 'Usage: /layonhands <amount> [target]' }
    }
    const target = parts.slice(1).join(' ') || 'themselves'
    const name = ctx.character.name || 'Character'
    ctx.broadcastSystemMessage(`${name} uses **Lay on Hands**: heals ${target} for **${amount} HP**.`)
    return { handled: true }
  }
}

// /hitdice - Spend hit dice (short rest healing)
const hitDiceCommand: ChatCommand = {
  name: 'hitdice',
  aliases: ['hd'],
  category: 'player',
  dmOnly: false,
  description: 'Spend hit dice to heal (during short rest)',
  usage: '/hitdice <count> <die size> [CON modifier]',
  execute: (args: string, ctx: CommandContext): CommandResult => {
    if (!ctx.character) {
      return { handled: true, error: 'No active character.' }
    }
    const parts = args.trim().split(/\s+/)
    const count = parseInt(parts[0], 10) || 1
    const dieSize = parseInt(parts[1], 10) || 8
    const conMod = parseInt(parts[2], 10) || 0
    if (![6, 8, 10, 12].includes(dieSize)) {
      return { handled: true, error: 'Die size must be 6, 8, 10, or 12.' }
    }

    let total = 0
    const rolls: number[] = []
    for (let i = 0; i < count; i++) {
      const r = Math.floor(Math.random() * dieSize) + 1
      rolls.push(r + conMod)
      total += Math.max(1, r + conMod) // Minimum 1 HP per hit die
    }

    const name = ctx.character.name || 'Character'
    ctx.broadcastSystemMessage(
      `${name} spends ${count} Hit Dice (d${dieSize}${conMod >= 0 ? '+' : ''}${conMod}): [${rolls.join(', ')}] = **${total} HP healed**`
    )
    return { handled: true }
  }
}

export const commands: ChatCommand[] = [
  spellCommand,
  channelCommand,
  kiCommand,
  rageCommand,
  bardicCommand,
  inspirationCommand,
  deathsaveCommand,
  sorceryCommand,
  superiorityCommand,
  secondWindCommand,
  actionSurgeCommand,
  layOnHandsCommand,
  hitDiceCommand
]
