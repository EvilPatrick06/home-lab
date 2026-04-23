import { load5eNpcNames, load5eRandomTables } from '../../services/data-provider'
import { useLobbyStore } from '../../stores/use-lobby-store'
import type { Character5e, CustomFeature } from '../../types/character-5e'
import { getLatestCharacter, saveAndBroadcastCharacter } from './helpers'
import type { ChatCommand } from './types'

const npcCommand: ChatCommand = {
  name: 'npc',
  aliases: [],
  description: 'Speak as an NPC',
  usage: '/npc <name> <message>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const match = args.match(/^(\S+)\s+(.+)$/s)
    if (!match) {
      ctx.addSystemMessage('Usage: /npc <name> <message>')
      return
    }
    const [, npcName, message] = match
    ctx.broadcastSystemMessage(`[${npcName}]: ${message.trim()}`)
  }
}

const announceCommand: ChatCommand = {
  name: 'announce',
  aliases: ['ann'],
  description: 'Make a dramatic announcement',
  usage: '/announce <message>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    if (!args.trim()) {
      ctx.addSystemMessage('Usage: /announce <message>')
      return
    }
    ctx.broadcastSystemMessage(`📢 ${args.trim()}`)
  }
}

const weatherCommand: ChatCommand = {
  name: 'weather',
  aliases: [],
  description: 'Set weather description',
  usage: '/weather <description>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    if (!args.trim()) {
      ctx.addSystemMessage('Usage: /weather <description>')
      return
    }
    const weather = args.trim()
    ctx.broadcastSystemMessage(`🌦️ Weather changed: ${weather}`)
  }
}

const noteCommand: ChatCommand = {
  name: 'note',
  aliases: [],
  description: 'Add a DM-only note',
  usage: '/note <text>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    if (!args.trim()) {
      ctx.addSystemMessage('Usage: /note <text>')
      return
    }
    ctx.addSystemMessage(`📝 DM Note: ${args.trim()}`)
  }
}

const nameCommand: ChatCommand = {
  name: 'name',
  aliases: [],
  description: 'Generate a random NPC name',
  usage: '/name [species] [gender]',
  dmOnly: true,
  category: 'dm',
  execute: async (args, ctx) => {
    try {
      const data = (await load5eNpcNames()) as unknown as Record<string, Record<string, string[]>>
      const parts = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
      const speciesList = Object.keys(data)
      let species = parts[0]
      let gender = parts[1]

      if (!species || !speciesList.includes(species)) {
        species = speciesList[Math.floor(Math.random() * speciesList.length)]
      }

      const speciesData = data[species]
      if (!speciesData) {
        ctx.addSystemMessage(`No name data found for species: ${species}`)
        return
      }

      const genderOptions = Object.keys(speciesData).filter((k) => k !== 'last')
      if (!gender || !genderOptions.includes(gender)) {
        gender = genderOptions[Math.floor(Math.random() * genderOptions.length)]
      }

      const firstNames = speciesData[gender] || []
      const lastNames = speciesData.last || []

      if (firstNames.length === 0) {
        ctx.addSystemMessage(`No names found for ${species} ${gender}`)
        return
      }

      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)]
      const lastName = lastNames.length > 0 ? ` ${lastNames[Math.floor(Math.random() * lastNames.length)]}` : ''

      ctx.addSystemMessage(`Random name: ${firstName}${lastName}`)
    } catch {
      ctx.addSystemMessage('Failed to load NPC name data.')
    }
  }
}

const randomCommand: ChatCommand = {
  name: 'random',
  aliases: ['rtable'],
  description: 'Roll on a random table',
  usage: '/random <table>',
  dmOnly: true,
  category: 'dm',
  execute: async (args, ctx) => {
    const tableName = args.trim().toLowerCase()
    const validTables = [
      'personality',
      'ideals',
      'bonds',
      'flaws',
      'appearance',
      'mannerism',
      'tavern',
      'shop',
      'hook',
      'weather'
    ]

    if (!tableName || !validTables.includes(tableName)) {
      ctx.addSystemMessage(`Usage: /random <table>\nAvailable tables: ${validTables.join(', ')}`)
      return
    }

    try {
      const data = (await load5eRandomTables()) as unknown as Record<string, unknown>
      const table = data[tableName]

      if (!table || !Array.isArray(table) || table.length === 0) {
        ctx.addSystemMessage(`No entries found for table: ${tableName}`)
        return
      }

      const entry = table[Math.floor(Math.random() * table.length)]
      ctx.addSystemMessage(`🎲 [${tableName}]: ${entry}`)
    } catch {
      ctx.addSystemMessage('Failed to load random table data.')
    }
  }
}

const npcMoodCommand: ChatCommand = {
  name: 'npcmood',
  aliases: ['mood', 'attitude'],
  description: "Set an NPC's mood/attitude (friendly, indifferent, hostile)",
  usage: '/npcmood <npc name> <friendly|indifferent|hostile>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    if (parts.length < 2) {
      ctx.addSystemMessage('Usage: /npcmood <npc name> <friendly|indifferent|hostile>')
      return
    }
    const mood = parts[parts.length - 1].toLowerCase()
    const validMoods = ['friendly', 'indifferent', 'hostile', 'neutral', 'suspicious', 'fearful']
    if (!validMoods.includes(mood)) {
      ctx.addSystemMessage(`Invalid mood. Options: ${validMoods.join(', ')}`)
      return
    }
    const npcName = parts.slice(0, -1).join(' ')
    ctx.broadcastSystemMessage(`**${npcName}**'s attitude: ${mood}`)
  }
}

const grantFeatureCommand: ChatCommand = {
  name: 'grant-feature',
  aliases: ['grantfeature'],
  description: 'Grant a custom feature to a character',
  usage: '/grant-feature <character> <name> [description]',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    // Parse: first word is character, rest is "name | description" or just "name"
    const firstSpace = args.indexOf(' ')
    if (firstSpace < 0) {
      ctx.addSystemMessage('Usage: /grant-feature <character> <name> [| description]')
      return
    }
    const charQuery = args.slice(0, firstSpace)
    const rest = args.slice(firstSpace + 1)

    const lobbyState = useLobbyStore.getState()
    const player = lobbyState.players?.find((p) => p.displayName?.toLowerCase().startsWith(charQuery.toLowerCase()))
    if (!player?.characterId) {
      ctx.addSystemMessage(`Character not found: "${charQuery}"`)
      return
    }
    const character = getLatestCharacter(player.characterId)
    if (!character) {
      ctx.addSystemMessage(`Character data not found for "${charQuery}"`)
      return
    }

    // Split on pipe for optional description
    const parts = rest.split('|').map((s) => s.trim())
    const featureName = parts[0]
    const description = parts[1] ?? ''

    const newFeature: CustomFeature = {
      id: crypto.randomUUID(),
      name: featureName,
      source: 'DM Award',
      description,
      grantedAt: new Date().toISOString()
    }
    const updated: Character5e = {
      ...character,
      customFeatures: [...(character.customFeatures ?? []), newFeature],
      updatedAt: new Date().toISOString()
    }
    saveAndBroadcastCharacter(updated)
    ctx.broadcastSystemMessage(`**${ctx.playerName}** granted **${featureName}** to ${character.name}.`)
  }
}

const revokeFeatureCommand: ChatCommand = {
  name: 'revoke-feature',
  aliases: ['revokefeature'],
  description: 'Remove a custom feature from a character',
  usage: '/revoke-feature <character> <feature name>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const firstSpace = args.indexOf(' ')
    if (firstSpace < 0) {
      ctx.addSystemMessage('Usage: /revoke-feature <character> <feature name>')
      return
    }
    const charQuery = args.slice(0, firstSpace)
    const featureQuery = args
      .slice(firstSpace + 1)
      .trim()
      .toLowerCase()

    const lobbyState = useLobbyStore.getState()
    const player = lobbyState.players?.find((p) => p.displayName?.toLowerCase().startsWith(charQuery.toLowerCase()))
    if (!player?.characterId) {
      ctx.addSystemMessage(`Character not found: "${charQuery}"`)
      return
    }
    const character = getLatestCharacter(player.characterId)
    if (!character) {
      ctx.addSystemMessage(`Character data not found for "${charQuery}"`)
      return
    }

    const features = character.customFeatures ?? []
    const idx = features.findIndex((f) => f.name.toLowerCase().includes(featureQuery))
    if (idx < 0) {
      ctx.addSystemMessage(`No custom feature matching "${featureQuery}" found on ${character.name}.`)
      return
    }
    const removedName = features[idx].name
    const updated: Character5e = {
      ...character,
      customFeatures: features.filter((_, i) => i !== idx),
      updatedAt: new Date().toISOString()
    }
    saveAndBroadcastCharacter(updated)
    ctx.broadcastSystemMessage(`**${ctx.playerName}** revoked **${removedName}** from ${character.name}.`)
  }
}

export const commands: ChatCommand[] = [
  npcCommand,
  announceCommand,
  weatherCommand,
  noteCommand,
  nameCommand,
  randomCommand,
  npcMoodCommand,
  grantFeatureCommand,
  revokeFeatureCommand
]
