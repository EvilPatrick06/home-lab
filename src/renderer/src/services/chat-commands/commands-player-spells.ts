import { trigger3dDice } from '../../components/game/dice3d'
import { rollMultiple, rollSingle } from '../dice/dice-service'
import type { ChatCommand } from './types'

const castCommand: ChatCommand = {
  name: 'cast',
  aliases: [],
  description: 'Cast a spell (with optional upcast, ritual, or concentration)',
  usage: '/cast <spell name> [at <level>] [ritual] [concentration]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const input = args.trim()
    if (!input) {
      return { type: 'error', content: 'Usage: /cast <spell name> [at <level>] [ritual] [concentration]' }
    }
    const isRitual = /\britual\b/i.test(input)
    const isConc = /\bconcentration\b/i.test(input)
    const upcastMatch = input.match(/\bat\s+(\d+)/i)
    const upcastLevel = upcastMatch ? parseInt(upcastMatch[1], 10) : null

    // Strip modifiers from spell name
    let spellName = input
      .replace(/\britual\b/gi, '')
      .replace(/\bconcentration\b/gi, '')
      .replace(/\bat\s+\d+/gi, '')
      .trim()

    if (!spellName) spellName = 'a spell'

    const parts: string[] = [`**${ctx.playerName}** casts **${spellName}**`]
    if (upcastLevel) parts.push(`(upcast to level ${upcastLevel})`)
    if (isRitual) parts.push('as a Ritual')
    if (isConc) parts.push('[Concentration]')

    return { type: 'broadcast', content: parts.join(' ') }
  }
}

const pactmagicCommand: ChatCommand = {
  name: 'pactmagic',
  aliases: ['pact'],
  description: 'Use or check Pact Magic slots (Warlock)',
  usage: '/pactmagic [use|restore|status]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const sub = args.trim().toLowerCase() || 'status'
    if (sub === 'use') {
      return { type: 'broadcast', content: `**${ctx.playerName}** expends a Pact Magic slot.` }
    }
    if (sub === 'restore') {
      return { type: 'broadcast', content: `**${ctx.playerName}** restores Pact Magic slots (short rest).` }
    }
    return { type: 'system', content: 'Pact Magic: check your spell slots on your character sheet.' }
  }
}

const counterspellCommand: ChatCommand = {
  name: 'counterspell',
  aliases: ['counter'],
  description: 'Attempt to counter a spell being cast',
  usage: '/counterspell [level] [target spell name]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    const level = parseInt(parts[0], 10)
    const hasLevel = !Number.isNaN(level)
    const targetSpell = hasLevel ? parts.slice(1).join(' ') : parts.join(' ')

    if (hasLevel && level >= 1 && level <= 9) {
      return {
        type: 'broadcast',
        content: `**${ctx.playerName}** casts **Counterspell** at level ${level}${targetSpell ? ` targeting *${targetSpell}*` : ''}!`
      }
    }

    // Counterspell at 3rd level (default), might need check
    const roll = rollSingle(20)
    trigger3dDice({ formula: '1d20', rolls: [roll], total: roll, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** casts **Counterspell**${targetSpell ? ` targeting *${targetSpell}*` : ''} — Ability check: **${roll}**`
    }
  }
}

const dispelCommand: ChatCommand = {
  name: 'dispel',
  aliases: ['dispelmagic'],
  description: 'Cast Dispel Magic on a target',
  usage: '/dispel [level] [target]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    const level = parseInt(parts[0], 10)
    const hasLevel = !Number.isNaN(level) && level >= 3 && level <= 9
    const target = hasLevel ? parts.slice(1).join(' ') : parts.join(' ')

    if (hasLevel) {
      return {
        type: 'broadcast',
        content: `**${ctx.playerName}** casts **Dispel Magic** at level ${level}${target ? ` on ${target}` : ''}.`
      }
    }
    // Default level 3, might need check for higher-level effects
    const roll = rollSingle(20)
    trigger3dDice({ formula: '1d20', rolls: [roll], total: roll, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** casts **Dispel Magic**${target ? ` on ${target}` : ''} — Ability check: **${roll}**`
    }
  }
}

const identifyCommand: ChatCommand = {
  name: 'identify',
  aliases: [],
  description: 'Cast Identify on an item or creature',
  usage: '/identify [target]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const target = args.trim() || 'an item'
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** casts **Identify** (ritual) on ${target}.`
    }
  }
}

const smiteCommand: ChatCommand = {
  name: 'smite',
  aliases: ['divinesmite'],
  description: 'Apply Divine Smite damage (Paladin)',
  usage: '/smite <level> [undead|fiend]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    const level = parseInt(parts[0], 10)
    if (!level || level < 1 || level > 5) {
      return { type: 'error', content: 'Usage: /smite <1-5> [undead|fiend]' }
    }
    const isUndead = parts[1]?.toLowerCase() === 'undead' || parts[1]?.toLowerCase() === 'fiend'
    const baseDice = level + 1
    const totalDice = isUndead ? Math.min(baseDice + 1, 6) : baseDice
    const rolls = rollMultiple(totalDice, 8)
    const total = rolls.reduce((s, r) => s + r, 0)
    trigger3dDice({ formula: `${totalDice}d8`, rolls, total, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** Divine Smite (level ${level}${isUndead ? ', +1d8 vs undead/fiend' : ''}): ${totalDice}d8 = [${rolls.join(', ')}] = **${total} radiant damage**`
    }
  }
}

const sneakattackCommand: ChatCommand = {
  name: 'sneakattack',
  aliases: ['sneak', 'sa'],
  description: 'Roll Sneak Attack damage (Rogue)',
  usage: '/sneakattack <dice count>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const dice = parseInt(args.trim(), 10)
    if (!dice || dice < 1 || dice > 20) {
      return { type: 'error', content: 'Usage: /sneakattack <number of d6>' }
    }
    const rolls = rollMultiple(dice, 6)
    const total = rolls.reduce((s, r) => s + r, 0)
    trigger3dDice({ formula: `${dice}d6`, rolls, total, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** Sneak Attack: ${dice}d6 = [${rolls.join(', ')}] = **${total}**`
    }
  }
}

const concentrationCheckCommand: ChatCommand = {
  name: 'conccheck',
  aliases: ['concentrationcheck', 'concdc'],
  description: 'Roll a Constitution save to maintain concentration (DC = max(10, damage/2))',
  usage: '/conccheck <damage taken>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const damage = parseInt(args.trim(), 10)
    if (Number.isNaN(damage) || damage < 0) {
      return { type: 'error', content: 'Usage: /conccheck <damage taken>' }
    }
    const dc = Math.max(10, Math.floor(damage / 2))
    const roll = rollSingle(20)
    const tag = roll === 20 ? ' **Natural 20!**' : roll === 1 ? ' *Natural 1!*' : ''
    const result = roll >= dc ? 'MAINTAINED' : 'BROKEN'
    const color = roll >= dc ? '**' : '*'
    trigger3dDice({ formula: '1d20', rolls: [roll], total: roll, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** Concentration Check (DC ${dc}, ${damage} damage): d20 = **${roll}**${tag} — ${color}${result}${color}`
    }
  }
}

const wildshapeCommand: ChatCommand = {
  name: 'wildshape',
  aliases: ['ws'],
  description: 'Announce Wild Shape transformation (Druid)',
  usage: '/wildshape <creature name> [HP]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    if (!parts[0]) {
      return { type: 'error', content: 'Usage: /wildshape <creature name> [HP]' }
    }
    const lastPart = parts[parts.length - 1]
    const hp = parseInt(lastPart, 10)
    const hasHp = !Number.isNaN(hp) && parts.length > 1
    const creature = hasHp ? parts.slice(0, -1).join(' ') : parts.join(' ')
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** transforms into a **${creature}** (Wild Shape)${hasHp ? ` — ${hp} HP` : ''}!`
    }
  }
}

export const commands: ChatCommand[] = [
  castCommand,
  pactmagicCommand,
  counterspellCommand,
  dispelCommand,
  identifyCommand,
  smiteCommand,
  sneakattackCommand,
  concentrationCheckCommand,
  wildshapeCommand
]
