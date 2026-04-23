import { useGameStore } from '../../stores/use-game-store'
import type { ChatCommand } from './types'

const statblockCommand: ChatCommand = {
  name: 'statblock',
  aliases: ['sb', 'stats'],
  description: 'Look up a monster stat block',
  usage: '/statblock <monster name>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const name = args.trim()
    if (!name) {
      return { type: 'error', content: 'Usage: /statblock <monster name>' }
    }
    ctx.openModalWithArgs?.('creatures', { search: name })
    return
  }
}

const crCommand: ChatCommand = {
  name: 'cr',
  aliases: ['challengerating'],
  description: 'Look up monsters by challenge rating',
  usage: '/cr <rating>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const cr = args.trim()
    if (!cr) {
      return { type: 'error', content: 'Usage: /cr <rating> (e.g., /cr 5, /cr 1/2)' }
    }
    ctx.openModalWithArgs?.('creatures', { cr })
    return
  }
}

const spawnCommand: ChatCommand = {
  name: 'spawn',
  aliases: [],
  description: 'Spawn one or more creatures on the map',
  usage: '/spawn <creature name> [x<count>]',
  dmOnly: true,
  category: 'dm',
  execute: (args, _ctx) => {
    const input = args.trim()
    if (!input) {
      return { type: 'error', content: 'Usage: /spawn <creature name> [x<count>]' }
    }

    const countMatch = input.match(/\bx(\d+)$/i)
    const count = countMatch ? parseInt(countMatch[1], 10) : 1
    const name = countMatch ? input.slice(0, countMatch.index).trim() : input

    if (count < 1 || count > 20) {
      return { type: 'error', content: 'Count must be between 1 and 20.' }
    }

    return {
      type: 'broadcast',
      content: `**DM** spawns ${count > 1 ? `${count}x ` : ''}**${name}** onto the map.`
    }
  }
}

const killCommand: ChatCommand = {
  name: 'kill',
  aliases: ['slay'],
  description: 'Set a token to 0 HP (kill) or kill all enemies',
  usage: '/kill <token name|all>',
  dmOnly: true,
  category: 'dm',
  execute: (args, _ctx) => {
    const target = args.trim().toLowerCase()
    if (!target) {
      return { type: 'error', content: 'Usage: /kill <token name|all>' }
    }

    const gameState = useGameStore.getState()
    const activeMapId = gameState.activeMapId
    const activeMap = gameState.maps.find((m) => m.id === activeMapId)
    if (!activeMap) {
      return { type: 'error', content: 'No active map.' }
    }

    if (target === 'all') {
      const enemies = activeMap.tokens.filter((t) => t.entityType === 'enemy' && (t.currentHP ?? 0) > 0)
      for (const enemy of enemies) {
        gameState.updateToken(activeMap.id, enemy.id, { currentHP: 0 })
      }
      return {
        type: 'broadcast',
        content: `**DM** killed all enemies (${enemies.length} creatures set to 0 HP).`
      }
    }

    const token = activeMap.tokens.find((t) => t.label.toLowerCase().includes(target))
    if (!token) {
      return { type: 'error', content: `No token found matching "${target}".` }
    }

    gameState.updateToken(activeMap.id, token.id, { currentHP: 0 })
    return {
      type: 'broadcast',
      content: `**DM** killed **${token.label}** (set to 0 HP).`
    }
  }
}

const legendaryCommand: ChatCommand = {
  name: 'legendary',
  aliases: ['legend', 'la'],
  description: 'Declare a legendary action for a creature',
  usage: '/legendary <creature> <action description>',
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const parts = args.trim().split(/\s+/)
    if (parts.length < 2) {
      return { type: 'error', content: 'Usage: /legendary <creature> <action description>' }
    }
    const creature = parts[0]
    const action = parts.slice(1).join(' ')
    return {
      type: 'broadcast',
      content: `**${creature}** uses a Legendary Action: ${action}`
    }
  }
}

const lairCommand: ChatCommand = {
  name: 'lair',
  aliases: [],
  description: 'Trigger a lair action',
  usage: '/lair <description>',
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const desc = args.trim()
    if (!desc) {
      return { type: 'error', content: 'Usage: /lair <lair action description>' }
    }
    return {
      type: 'broadcast',
      content: `**Lair Action:** ${desc}`
    }
  }
}

const healallCommand: ChatCommand = {
  name: 'healall',
  aliases: [],
  description: 'Heal all player tokens to full HP',
  usage: '/healall',
  dmOnly: true,
  category: 'dm',
  execute: () => {
    const gameState = useGameStore.getState()
    const activeMapId = gameState.activeMapId
    const activeMap = gameState.maps.find((m) => m.id === activeMapId)
    if (!activeMap) {
      return { type: 'error', content: 'No active map.' }
    }

    const players = activeMap.tokens.filter((t) => t.entityType === 'player' && t.maxHP != null)
    for (const p of players) {
      gameState.updateToken(activeMap.id, p.id, { currentHP: p.maxHP })
    }
    return {
      type: 'broadcast',
      content: `**DM** healed all player characters to full HP (${players.length} characters).`
    }
  }
}

const npcMoodCommand: ChatCommand = {
  name: 'npcmood',
  aliases: ['mood', 'attitude'],
  description: "Set an NPC's attitude/mood (Hostile, Indifferent, Friendly)",
  usage: '/npcmood <npc name> <hostile|indifferent|friendly>',
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const parts = args.trim().split(/\s+/)
    if (parts.length < 2) {
      return { type: 'error', content: 'Usage: /npcmood <npc name> <hostile|indifferent|friendly>' }
    }
    const mood = parts[parts.length - 1].toLowerCase()
    const npcName = parts.slice(0, -1).join(' ')
    const validMoods = ['hostile', 'indifferent', 'friendly']
    if (!validMoods.includes(mood)) {
      return { type: 'error', content: `Mood must be one of: ${validMoods.join(', ')}` }
    }
    return {
      type: 'broadcast',
      content: `**${npcName}**'s attitude is now **${mood.charAt(0).toUpperCase() + mood.slice(1)}**.`
    }
  }
}

const npcSpeakCommand: ChatCommand = {
  name: 'npcsay',
  aliases: ['npcsay'],
  description: 'Have an NPC speak with their name highlighted',
  usage: '/npcsay <npc name> <dialogue>',
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const match = args.match(/^(\S+)\s+(.+)$/s)
    if (!match) {
      return { type: 'error', content: 'Usage: /npcsay <npc name> <dialogue>' }
    }
    const [, npcName, dialogue] = match
    return {
      type: 'broadcast',
      content: `**${npcName}** says: *"${dialogue.trim()}"*`
    }
  }
}

const reviveCommand: ChatCommand = {
  name: 'revive',
  aliases: ['stabilize'],
  description: 'Stabilize or revive a creature (set to 1 HP)',
  usage: '/revive <token name>',
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const name = args.trim()
    if (!name) {
      return { type: 'error', content: 'Usage: /revive <token name>' }
    }

    const gameState = useGameStore.getState()
    const activeMapId = gameState.activeMapId
    const activeMap = gameState.maps.find((m) => m.id === activeMapId)
    if (!activeMap) {
      return { type: 'error', content: 'No active map.' }
    }

    const token = activeMap.tokens.find((t) => t.label.toLowerCase().includes(name.toLowerCase()))
    if (!token) {
      return { type: 'error', content: `No token found matching "${name}".` }
    }

    gameState.updateToken(activeMap.id, token.id, { currentHP: 1 })
    return {
      type: 'broadcast',
      content: `**${token.label}** has been stabilized (set to 1 HP).`
    }
  }
}

export const commands: ChatCommand[] = [
  statblockCommand,
  crCommand,
  spawnCommand,
  killCommand,
  legendaryCommand,
  lairCommand,
  healallCommand,
  npcMoodCommand,
  npcSpeakCommand,
  reviveCommand
]
