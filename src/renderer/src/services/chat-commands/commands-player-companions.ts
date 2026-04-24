import { useGameStore } from '../../stores/use-game-store'
import type { MapToken } from '../../types/map'
import {
  addConditionOnCharacter,
  removeConditionByPrefix,
  removeConditionBySubstring,
  requireLatestCharacter
} from './helpers'
import type { ChatCommand } from './types'

export const commands: ChatCommand[] = [
  {
    name: 'wildshape',
    aliases: ['ws'],
    category: 'player',
    dmOnly: false,
    description: 'Transform into beast form or revert',
    usage: '/wildshape <beast-name> or /wildshape off',
    execute: (_args, context) => {
      if (!context.character) return { type: 'error', content: 'No active character.' }
      const char = requireLatestCharacter(context)
      if (!char) return { type: 'error', content: 'No active character.' }

      const rawArgs = _args.trim()
      if (!rawArgs) {
        return { type: 'error', content: 'Usage: /wildshape <beast-name> or /wildshape off' }
      }

      if (rawArgs.toLowerCase() === 'off' || rawArgs.toLowerCase() === 'revert') {
        const removed = removeConditionByPrefix(char.id, 'wild shape')
        if (removed) {
          return { type: 'broadcast', content: `${char.name} reverts from wild shape.` }
        }
        return { type: 'system', content: 'Not currently in wild shape.' }
      }

      // Drop existing wild shape first
      removeConditionByPrefix(char.id, 'wild shape')

      addConditionOnCharacter(char, `Wild Shape: ${rawArgs}`)

      return { type: 'broadcast', content: `${char.name} wild shapes into a ${rawArgs}!` }
    }
  },
  {
    name: 'familiar',
    aliases: [],
    category: 'player',
    dmOnly: false,
    description: 'Summon or dismiss a familiar',
    usage: '/familiar <type> or /familiar dismiss',
    execute: (_args, context) => {
      if (!context.character) return { type: 'error', content: 'No active character.' }
      const char = requireLatestCharacter(context)
      if (!char) return { type: 'error', content: 'No active character.' }

      const rawArgs = _args.trim()
      if (!rawArgs) {
        return { type: 'error', content: 'Usage: /familiar <type> or /familiar dismiss' }
      }

      if (rawArgs.toLowerCase() === 'dismiss') {
        const removed = removeConditionByPrefix(char.id, 'familiar')
        if (removed) {
          return { type: 'broadcast', content: `${char.name} dismisses their familiar.` }
        }
        return { type: 'system', content: 'No familiar to dismiss.' }
      }

      // Drop existing familiar first
      removeConditionByPrefix(char.id, 'familiar')

      addConditionOnCharacter(char, `Familiar: ${rawArgs}`)

      return { type: 'broadcast', content: `${char.name} summons a ${rawArgs} familiar!` }
    }
  },
  {
    name: 'steed',
    aliases: [],
    category: 'player',
    dmOnly: false,
    description: 'Summon or dismiss a phantom steed',
    usage: '/steed or /steed dismiss',
    execute: (_args, context) => {
      if (!context.character) return { type: 'error', content: 'No active character.' }
      const char = requireLatestCharacter(context)
      if (!char) return { type: 'error', content: 'No active character.' }

      const rawArgs = _args.trim()

      if (rawArgs.toLowerCase() === 'dismiss') {
        const removed = removeConditionBySubstring(char.id, 'steed')
        if (removed) {
          return { type: 'broadcast', content: `${char.name} dismisses their steed.` }
        }
        return { type: 'system', content: 'No steed to dismiss.' }
      }

      // Drop existing steed first
      removeConditionBySubstring(char.id, 'steed')

      addConditionOnCharacter(char, 'Phantom Steed')

      return { type: 'broadcast', content: `${char.name} summons a spectral steed!` }
    }
  },
  {
    name: 'companions',
    aliases: ['comp'],
    category: 'player',
    dmOnly: false,
    description: 'List active companions',
    usage: '/companions',
    execute: (_args, context) => {
      if (!context.character) return { type: 'error', content: 'No active character.' }
      const char = requireLatestCharacter(context)
      if (!char) return { type: 'error', content: 'No active companions on the map.' }

      const gameState = useGameStore.getState()
      const activeMap = gameState.maps.find((m) => m.id === gameState.activeMapId)
      const tokens: MapToken[] = activeMap?.tokens ?? []

      const companionTokens = tokens.filter((t: MapToken) => t.ownerEntityId === char.id && t.id !== char.id)

      if (companionTokens.length === 0) {
        return { type: 'system', content: 'No active companions on the map.' }
      }

      const lines = ['**Active Companions**']
      for (const token of companionTokens) {
        const name = token.label ?? token.id
        const hp = token.currentHP ?? '?'
        const maxHp = token.maxHP ?? '?'
        const type = token.companionType ?? 'companion'
        const pos = `(${token.gridX}, ${token.gridY})`
        lines.push(`- **${name}** [${type}] — HP: ${hp}/${maxHp} — Position: ${pos}`)
      }

      return { type: 'system', content: lines.join('\n') }
    }
  }
]
