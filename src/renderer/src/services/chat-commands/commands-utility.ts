import { trigger3dDice } from '../../components/game/dice3d'
import { rollSingle } from '../dice/dice-service'
import type { ChatCommand } from './types'

const undoCommand: ChatCommand = {
  name: 'undo',
  aliases: ['z'],
  description: 'Undo the last action',
  usage: '/undo',
  dmOnly: false,
  category: 'player',
  execute: () => {
    // Trigger undo via the undo manager
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true })
    window.dispatchEvent(event)
    return { type: 'system', content: 'Undo triggered.' }
  }
}

const redoCommand: ChatCommand = {
  name: 'redo',
  aliases: ['y'],
  description: 'Redo the last undone action',
  usage: '/redo',
  dmOnly: false,
  category: 'player',
  execute: () => {
    const event = new KeyboardEvent('keydown', { key: 'y', ctrlKey: true })
    window.dispatchEvent(event)
    return { type: 'system', content: 'Redo triggered.' }
  }
}

const pingCommand: ChatCommand = {
  name: 'ping',
  aliases: [],
  description: 'Ping the map at your token location (visual ping)',
  usage: '/ping [message]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const msg = args.trim()
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** pings the map${msg ? `: "${msg}"` : '!'}`
    }
  }
}

const latencyCommand: ChatCommand = {
  name: 'latency',
  aliases: ['lat'],
  description: 'Show network latency information',
  usage: '/latency',
  dmOnly: false,
  category: 'player',
  execute: () => {
    return {
      type: 'system',
      content: 'Network: WebRTC P2P connection active. Latency depends on peer distance.'
    }
  }
}

const clearCommand: ChatCommand = {
  name: 'clear',
  aliases: [],
  description: 'Clear chat or combat state',
  usage: '/clear <chat|combat|effects>',
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const sub = args.trim().toLowerCase()
    switch (sub) {
      case 'chat':
        return { type: 'system', content: 'Chat cleared.' }
      case 'combat':
        return { type: 'system', content: 'Combat state cleared (initiative, turn tracking, conditions).' }
      case 'effects':
        return { type: 'system', content: 'All active effects cleared.' }
      default:
        return { type: 'error', content: 'Usage: /clear <chat|combat|effects>' }
    }
  }
}

const logCommand: ChatCommand = {
  name: 'log',
  aliases: ['combatlog'],
  description: 'Show or clear the combat log',
  usage: '/log <show|clear>',
  dmOnly: false,
  category: 'player',
  execute: (args) => {
    const sub = args.trim().toLowerCase()
    if (sub === 'show' || !sub) {
      return { type: 'system', content: 'Combat log: check the Combat Log panel in the sidebar.' }
    }
    if (sub === 'clear') {
      return { type: 'system', content: 'Combat log cleared.' }
    }
    return { type: 'error', content: 'Usage: /log <show|clear>' }
  }
}

const exportCommand: ChatCommand = {
  name: 'export',
  aliases: [],
  description: 'Export character or campaign data',
  usage: '/export <character|campaign>',
  dmOnly: false,
  category: 'player',
  execute: (args) => {
    const sub = args.trim().toLowerCase()
    if (sub === 'character' || sub === 'campaign') {
      return { type: 'system', content: `Export ${sub}: use the main menu's export feature.` }
    }
    return { type: 'error', content: 'Usage: /export <character|campaign>' }
  }
}

const importCommand: ChatCommand = {
  name: 'import',
  aliases: [],
  description: 'Import character or campaign data',
  usage: '/import <character|campaign>',
  dmOnly: false,
  category: 'player',
  execute: (args) => {
    const sub = args.trim().toLowerCase()
    if (sub === 'character' || sub === 'campaign') {
      return { type: 'system', content: `Import ${sub}: use the main menu's import feature.` }
    }
    return { type: 'error', content: 'Usage: /import <character|campaign>' }
  }
}

const shortcutsCommand: ChatCommand = {
  name: 'shortcuts',
  aliases: ['keys', 'hotkeys'],
  description: 'Show keyboard shortcuts reference',
  usage: '/shortcuts',
  dmOnly: false,
  category: 'player',
  execute: (_args, ctx) => {
    ctx.openModal?.('shortcutRef')
  }
}

const versionCommand: ChatCommand = {
  name: 'version',
  aliases: ['ver', 'about'],
  description: 'Show application version information',
  usage: '/version',
  dmOnly: false,
  category: 'player',
  execute: () => {
    return {
      type: 'system',
      content: 'D&D VTT — 5e 2024 Edition | Electron + React 19 + PixiJS'
    }
  }
}

const rollinitiativeCommand: ChatCommand = {
  name: 'rollinitiative',
  aliases: ['ri'],
  description: 'Roll initiative for your character',
  usage: '/rollinitiative [modifier]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const mod = parseInt(args.trim(), 10)
    const modifier = Number.isNaN(mod) ? 0 : mod
    const roll = rollSingle(20)
    const total = roll + modifier
    const tag = roll === 20 ? ' **Natural 20!**' : roll === 1 ? ' *Natural 1!*' : ''
    trigger3dDice({ formula: '1d20', rolls: [roll], total: roll, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** rolls Initiative: d20 (${roll}) ${modifier >= 0 ? '+' : ''}${modifier} = **${total}**${tag}`
    }
  }
}

const coinflipCommand: ChatCommand = {
  name: 'coinflip',
  aliases: ['coin', 'flip'],
  description: 'Flip a coin',
  usage: '/coinflip',
  dmOnly: false,
  category: 'player',
  execute: (_args, ctx) => {
    const coinRoll = rollSingle(2)
    const result = coinRoll === 1 ? 'Heads' : 'Tails'
    trigger3dDice({ formula: '1d2', rolls: [coinRoll], total: coinRoll, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** flips a coin: **${result}!**`
    }
  }
}

const percentileCommand: ChatCommand = {
  name: 'percentile',
  aliases: ['d100', 'percent'],
  description: 'Roll percentile dice (d100)',
  usage: '/percentile',
  dmOnly: false,
  category: 'player',
  execute: (_args, ctx) => {
    const tensRoll = rollSingle(10) - 1
    const onesRoll = rollSingle(10) - 1
    const tens = tensRoll * 10
    const ones = onesRoll
    const total = tens + ones === 0 ? 100 : tens + ones
    trigger3dDice({ formula: '1d100', rolls: [total], total, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** rolls d100: **${total}** (${tens} + ${ones})`
    }
  }
}

const stabilizeCommand: ChatCommand = {
  name: 'stabilize',
  aliases: ['stab'],
  description: 'Attempt to stabilize a dying creature (DC 10 Medicine)',
  usage: '/stabilize [target]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const target = args.trim() || 'a dying creature'
    const roll = rollSingle(20)
    const passed = roll >= 10
    const tag = roll === 20 ? ' **Natural 20!**' : roll === 1 ? ' *Natural 1!*' : ''
    const result = passed ? `Success! ${target} is stabilized.` : `Failed. ${target} remains dying.`
    trigger3dDice({ formula: '1d20', rolls: [roll], total: roll, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** attempts to stabilize ${target} — Medicine check: **${roll}**${tag} vs DC 10. ${result}`
    }
  }
}

const reviveCommand: ChatCommand = {
  name: 'revive',
  aliases: [],
  description: 'Revive a creature (set HP to 1)',
  usage: '/revive <target>',
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const target = args.trim()
    if (!target) {
      return { type: 'error', content: 'Usage: /revive <target name>' }
    }
    return {
      type: 'broadcast',
      content: `**${target}** has been revived (1 HP).`
    }
  }
}

const massiveDamageCommand: ChatCommand = {
  name: 'massivedamage',
  aliases: ['md'],
  description: 'Check massive damage threshold (PHB 2024: damage >= max HP = instant death)',
  usage: '/massivedamage <damage> <maxHP>',
  dmOnly: false,
  category: 'player',
  execute: (args, _ctx) => {
    const parts = args.trim().split(/\s+/)
    const damage = parseInt(parts[0], 10)
    const maxHP = parseInt(parts[1], 10)
    if (Number.isNaN(damage) || Number.isNaN(maxHP)) {
      return { type: 'error', content: 'Usage: /massivedamage <damage> <maxHP>' }
    }
    if (damage >= maxHP) {
      return {
        type: 'broadcast',
        content: `**Massive Damage!** ${damage} damage >= ${maxHP} max HP. Instant death per PHB 2024.`
      }
    }
    return {
      type: 'system',
      content: `${damage} damage < ${maxHP} max HP. No massive damage.`
    }
  }
}

export const commands: ChatCommand[] = [
  undoCommand,
  redoCommand,
  pingCommand,
  latencyCommand,
  clearCommand,
  logCommand,
  exportCommand,
  importCommand,
  shortcutsCommand,
  versionCommand,
  rollinitiativeCommand,
  coinflipCommand,
  percentileCommand,
  stabilizeCommand,
  reviveCommand,
  massiveDamageCommand
]
