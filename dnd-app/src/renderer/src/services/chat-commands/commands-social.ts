import { useLobbyStore } from '../../stores/use-lobby-store'
import type { ChatCommand } from './types'

const meCommand: ChatCommand = {
  name: 'me',
  aliases: ['emote'],
  description: 'Perform an action in third person (emote)',
  usage: '/me <action>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const action = args.trim()
    if (!action) {
      return { type: 'error', content: 'Usage: /me <action description>' }
    }
    return {
      type: 'broadcast',
      content: `*${ctx.playerName} ${action}*`
    }
  }
}

const oocCommand: ChatCommand = {
  name: 'ooc',
  aliases: ['oog'],
  description: 'Send an out-of-character message',
  usage: '/ooc <message>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const msg = args.trim()
    if (!msg) {
      return { type: 'error', content: 'Usage: /ooc <message>' }
    }
    return {
      type: 'broadcast',
      content: `[OOC] ${ctx.playerName}: ${msg}`
    }
  }
}

const shoutCommand: ChatCommand = {
  name: 'shout',
  aliases: ['yell'],
  description: 'Shout a message (displayed prominently)',
  usage: '/shout <message>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const msg = args.trim()
    if (!msg) {
      return { type: 'error', content: 'Usage: /shout <message>' }
    }
    return {
      type: 'broadcast',
      content: `**${ctx.playerName} shouts: "${msg.toUpperCase()}"**`
    }
  }
}

const languageCommand: ChatCommand = {
  name: 'language',
  aliases: ['lang', 'speak'],
  description: 'Speak in a specific language (displayed as such)',
  usage: '/language <language> <message>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    if (parts.length < 2) {
      return { type: 'error', content: 'Usage: /language <language> <message>' }
    }
    const lang = parts[0]
    const msg = parts.slice(1).join(' ')
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** *(speaking ${lang})*: "${msg}"`
    }
  }
}

const playersCommand: ChatCommand = {
  name: 'players',
  aliases: ['who', 'online'],
  description: 'List connected players',
  usage: '/players',
  dmOnly: false,
  category: 'player',
  execute: () => {
    const players = useLobbyStore.getState().players
    if (players.length === 0) {
      return { type: 'system', content: 'No players connected.' }
    }
    const lines = players.map((p) => {
      const role = p.isHost ? ' (DM)' : ''
      const char = p.characterName ? ` — ${p.characterName}` : ''
      return `- ${p.displayName}${role}${char}`
    })
    return {
      type: 'system',
      content: `**Connected Players (${players.length}):**\n${lines.join('\n')}`
    }
  }
}

const kickCommand: ChatCommand = {
  name: 'kick',
  aliases: [],
  description: 'Kick a player from the game (DM only)',
  usage: '/kick <player name>',
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const name = args.trim()
    if (!name) {
      return { type: 'error', content: 'Usage: /kick <player name>' }
    }
    const players = useLobbyStore.getState().players
    const target = players.find((p) => p.displayName.toLowerCase() === name.toLowerCase())
    if (!target) {
      return { type: 'error', content: `Player "${name}" not found.` }
    }
    if (target.isHost) {
      return { type: 'error', content: 'Cannot kick the host.' }
    }
    return {
      type: 'broadcast',
      content: `**${target.displayName}** has been kicked from the game.`
    }
  }
}

const muteCommand: ChatCommand = {
  name: 'mute',
  aliases: [],
  description: 'Mute a player in chat (DM only)',
  usage: '/mute <player name>',
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const name = args.trim()
    if (!name) {
      return { type: 'error', content: 'Usage: /mute <player name>' }
    }
    return {
      type: 'system',
      content: `${name} has been muted in chat.`
    }
  }
}

const sayCommand: ChatCommand = {
  name: 'say',
  aliases: [],
  description: 'Speak in-character',
  usage: '/say <message>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const msg = args.trim()
    if (!msg) {
      return { type: 'error', content: 'Usage: /say <message>' }
    }
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** says: "${msg}"`
    }
  }
}

const pingCommand: ChatCommand = {
  name: 'ping',
  aliases: [],
  description: 'Ping a player or the map to get attention',
  usage: '/ping [player name|map]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const target = args.trim()
    if (!target || target.toLowerCase() === 'map') {
      return {
        type: 'broadcast',
        content: `**${ctx.playerName}** pings the map! 📍`
      }
    }
    const players = useLobbyStore.getState().players
    const found = players.find((p) => p.displayName.toLowerCase().startsWith(target.toLowerCase()))
    if (found) {
      return {
        type: 'broadcast',
        content: `**${ctx.playerName}** pings **${found.displayName}**! 🔔`
      }
    }
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** pings **${target}**! 🔔`
    }
  }
}

const whisperCommand: ChatCommand = {
  name: 'whisper',
  aliases: ['w', 'tell', 'dm'],
  description: 'Send a private message to the DM or a player',
  usage: '/whisper <player> <message>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const match = args.match(/^(\S+)\s+(.+)$/s)
    if (!match) {
      return { type: 'error', content: 'Usage: /whisper <player> <message>' }
    }
    const [, target, message] = match
    return {
      type: 'system',
      content: `[Whisper to ${target}] ${ctx.playerName}: ${message.trim()}`
    }
  }
}

const playersPingCommand: ChatCommand = {
  name: 'playersping',
  aliases: ['pingall', 'attention'],
  description: 'Ping all connected players with a notification',
  usage: '/playersping [message]',
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const msg = args.trim()
    return {
      type: 'broadcast',
      content: `**Attention all players!**${msg ? ` ${msg}` : ' The DM requests your attention.'}`
    }
  }
}

export const commands: ChatCommand[] = [
  meCommand,
  oocCommand,
  shoutCommand,
  languageCommand,
  playersCommand,
  kickCommand,
  muteCommand,
  sayCommand,
  pingCommand,
  whisperCommand,
  playersPingCommand
]
