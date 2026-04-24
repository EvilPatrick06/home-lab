import { trigger3dDice } from '../../components/game/dice3d'
import { rollMultiple } from '../dice/dice-service'
import { rollD20WithTag } from './helpers'
import type { ChatCommand } from './types'

export const grappleCommand: ChatCommand = {
  name: 'grapple',
  aliases: ['grab'],
  description: 'Attempt to grapple a creature (Athletics vs Athletics/Acrobatics)',
  usage: '/grapple <target>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const target = args.trim() || 'a creature'
    const { roll, tag } = rollD20WithTag()
    trigger3dDice({ formula: '1d20', rolls: [roll], total: roll, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** attempts to grapple ${target} — Athletics check: **${roll}**${tag}`
    }
  }
}

export const shoveCommand: ChatCommand = {
  name: 'shove',
  aliases: ['push'],
  description: 'Attempt to shove a creature (Athletics vs Athletics/Acrobatics)',
  usage: '/shove <prone|away> <target>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    const direction = parts[0]?.toLowerCase() === 'away' ? 'away' : 'prone'
    const target = parts.slice(direction === parts[0]?.toLowerCase() ? 1 : 0).join(' ') || 'a creature'
    const { roll, tag } = rollD20WithTag()
    const effect = direction === 'away' ? '5 feet away' : 'Prone'
    trigger3dDice({ formula: '1d20', rolls: [roll], total: roll, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** attempts to shove ${target} (${effect}) — Athletics check: **${roll}**${tag}`
    }
  }
}

export const readyactionCommand: ChatCommand = {
  name: 'readyaction',
  aliases: ['ready'],
  description: 'Ready an action with a trigger condition',
  usage: '/readyaction <trigger description>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const trigger = args.trim()
    if (!trigger) {
      return { type: 'error', content: 'Usage: /readyaction <trigger description>' }
    }
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** readies an action: "*${trigger}*"`
    }
  }
}

export const delayactionCommand: ChatCommand = {
  name: 'delayaction',
  aliases: ['delay'],
  description: 'Delay your turn until a later point in the round',
  usage: '/delayaction',
  dmOnly: false,
  category: 'player',
  execute: (_args, ctx) => {
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** delays their turn.`
    }
  }
}

export const multiattackCommand: ChatCommand = {
  name: 'multiattack',
  aliases: ['ma'],
  description: 'Declare a multiattack sequence',
  usage: '/multiattack <number of attacks>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const count = parseInt(args.trim(), 10)
    if (!count || count < 1 || count > 10) {
      return { type: 'error', content: 'Usage: /multiattack <1-10>' }
    }
    const diceRolls = rollMultiple(count, 20)
    const lines: string[] = []
    for (let i = 0; i < count; i++) {
      const roll = diceRolls[i]
      const tag = roll === 20 ? ' **CRIT!**' : roll === 1 ? ' *miss!*' : ''
      lines.push(`Attack ${i + 1}: **${roll}**${tag}`)
    }
    const total = diceRolls.reduce((s, r) => s + r, 0)
    trigger3dDice({ formula: `${count}d20`, rolls: diceRolls, total, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** Multiattack (${count}):\n${lines.join('\n')}`
    }
  }
}

export const reactionCommand: ChatCommand = {
  name: 'reaction',
  aliases: ['rx'],
  description: 'Use or reset your reaction',
  usage: '/reaction <use|reset> [description]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    const sub = parts[0]?.toLowerCase()
    const desc = parts.slice(1).join(' ')
    if (sub === 'use') {
      return {
        type: 'broadcast',
        content: `**${ctx.playerName}** uses their Reaction${desc ? `: ${desc}` : ''}`
      }
    }
    if (sub === 'reset') {
      return {
        type: 'system',
        content: `${ctx.playerName}'s Reaction has been reset.`
      }
    }
    return { type: 'error', content: 'Usage: /reaction <use|reset> [description]' }
  }
}

export const useobjCommand: ChatCommand = {
  name: 'useobj',
  aliases: ['interact', 'object'],
  description: 'Use an Object interaction (PHB 2024)',
  usage: '/useobj <description>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const desc = args.trim() || 'an object'
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** uses their Object interaction: ${desc}`
    }
  }
}

export const dashCommand: ChatCommand = {
  name: 'dash',
  aliases: [],
  description: 'Take the Dash action (double movement)',
  usage: '/dash',
  dmOnly: false,
  category: 'player',
  execute: (_args, ctx) => {
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** takes the **Dash** action (double movement this turn).`
    }
  }
}

export const disengageCommand: ChatCommand = {
  name: 'disengage',
  aliases: [],
  description: 'Take the Disengage action (no opportunity attacks)',
  usage: '/disengage',
  dmOnly: false,
  category: 'player',
  execute: (_args, ctx) => {
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** takes the **Disengage** action (no opportunity attacks).`
    }
  }
}

export const dodgeCommand: ChatCommand = {
  name: 'dodge',
  aliases: [],
  description: 'Take the Dodge action (disadvantage on attacks against you)',
  usage: '/dodge',
  dmOnly: false,
  category: 'player',
  execute: (_args, ctx) => {
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** takes the **Dodge** action (attacks against them have disadvantage, advantage on DEX saves).`
    }
  }
}

export const hideCommand: ChatCommand = {
  name: 'hide',
  aliases: ['stealth'],
  description: 'Take the Hide action (Stealth check)',
  usage: '/hide',
  dmOnly: false,
  category: 'player',
  execute: (_args, ctx) => {
    const { roll, tag } = rollD20WithTag()
    trigger3dDice({ formula: '1d20', rolls: [roll], total: roll, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** takes the **Hide** action — Stealth check: **${roll}**${tag}`
    }
  }
}

export const searchCommand: ChatCommand = {
  name: 'search',
  aliases: [],
  description: 'Take the Search action (Perception/Investigation check)',
  usage: '/search [perception|investigation]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const skill = args.trim().toLowerCase() === 'investigation' ? 'Investigation' : 'Perception'
    const { roll, tag } = rollD20WithTag()
    trigger3dDice({ formula: '1d20', rolls: [roll], total: roll, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** takes the **Search** action — ${skill} check: **${roll}**${tag}`
    }
  }
}
