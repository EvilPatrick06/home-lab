/**
 * Map Token Commands — chat commands for adding, removing, cloning,
 * hiding/showing, and moving tokens on the map.
 */

import { useGameStore } from '../../stores/use-game-store'
import type { MapToken } from '../../types/map'
import type { MonsterStatBlock } from '../../types/monster'
import { load5eMonsters } from '../data-provider'
import { requireActiveMapId, requireTokenOnMap } from './helpers'
import type { ChatCommand } from './types'

async function getMonsterByName(name: string): Promise<{ name: string; hp: number; ac: number; size: string } | null> {
  const monsters = await load5eMonsters()
  const q = name.toLowerCase()
  const match = monsters.find((m: MonsterStatBlock) => m.name.toLowerCase() === q)
  if (!match) return null
  return {
    name: match.name,
    hp: match.hp ?? 10,
    ac: match.ac ?? 10,
    size: match.size ?? 'Medium'
  }
}

export const tokenCommand: ChatCommand = {
  name: 'token',
  aliases: [],
  description: 'Add or remove tokens on the map',
  usage: '/token add <name> [x] [y] or /token remove <name>',
  dmOnly: true,
  category: 'dm',
  execute: async (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    const action = parts[0]?.toLowerCase()

    if (action !== 'add' && action !== 'remove') {
      ctx.addSystemMessage('Usage: /token add <name> [x] [y] or /token remove <name>')
      return
    }

    const activeMapId = requireActiveMapId(ctx)
    if (!activeMapId) return

    if (action === 'add') {
      const name = parts[1]
      if (!name) {
        ctx.addSystemMessage('Usage: /token add <name> [x] [y]')
        return
      }
      const x = parts[2] ? parseInt(parts[2], 10) : 0
      const y = parts[3] ? parseInt(parts[3], 10) : 0

      const newToken: MapToken = {
        id: `token-${Date.now()}`,
        entityId: `token-${Date.now()}`,
        entityType: 'npc',
        label: name,
        gridX: x,
        gridY: y,
        sizeX: 1,
        sizeY: 1,
        visibleToPlayers: true,
        conditions: []
      }

      useGameStore.getState().addToken(activeMapId, newToken)
      ctx.broadcastSystemMessage(`Token "${name}" placed at (${x}, ${y}).`)
    } else {
      const name = parts.slice(1).join(' ')
      if (!name) {
        ctx.addSystemMessage('Usage: /token remove <name>')
        return
      }

      const token = requireTokenOnMap(activeMapId, name, ctx)
      if (!token) return

      useGameStore.getState().removeToken(activeMapId, token.id)
      ctx.broadcastSystemMessage(`Token "${token.label}" removed.`)
    }
  }
}

export const summonCommand: ChatCommand = {
  name: 'summon',
  aliases: [],
  description: 'Summon a creature from the monster database',
  usage: '/summon <monster-name> [x] [y]',
  dmOnly: true,
  category: 'dm',
  execute: async (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    if (parts.length === 0 || !parts[0]) {
      ctx.addSystemMessage('Usage: /summon <monster-name> [x] [y]')
      return
    }

    // Check if last two args are coordinates
    let x = 0
    let y = 0
    let nameParts = [...parts]

    if (parts.length >= 3) {
      const maybeY = parseInt(parts[parts.length - 1], 10)
      const maybeX = parseInt(parts[parts.length - 2], 10)
      if (!Number.isNaN(maybeX) && !Number.isNaN(maybeY)) {
        x = maybeX
        y = maybeY
        nameParts = parts.slice(0, -2)
      }
    }

    const monsterName = nameParts.join(' ').toLowerCase()

    const monster = await getMonsterByName(monsterName)
    if (!monster) {
      ctx.addSystemMessage(`Monster not found: "${nameParts.join(' ')}"`)
      return
    }

    const activeMapId = requireActiveMapId(ctx)
    if (!activeMapId) return

    const sizeValue = monster.size === 'Large' ? 2 : monster.size === 'Huge' ? 3 : monster.size === 'Gargantuan' ? 4 : 1

    const newToken: MapToken = {
      id: `monster-${Date.now()}`,
      entityId: `monster-${Date.now()}`,
      entityType: 'enemy',
      label: monster.name,
      gridX: x,
      gridY: y,
      sizeX: sizeValue,
      sizeY: sizeValue,
      visibleToPlayers: true,
      conditions: [],
      currentHP: monster.hp,
      maxHP: monster.hp,
      ac: monster.ac
    }

    useGameStore.getState().addToken(activeMapId, newToken)
    ctx.broadcastSystemMessage(`${monster.name} appears at (${x}, ${y})!`)
  }
}

export const tokenCloneCommand: ChatCommand = {
  name: 'tokenclone',
  aliases: ['clone'],
  description: 'Clone a token on the map (creates a duplicate nearby)',
  usage: '/tokenclone <token name> [count]',
  dmOnly: true,
  category: 'dm',
  execute: async (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    if (!parts[0]) {
      ctx.addSystemMessage('Usage: /tokenclone <token name> [count]')
      return
    }

    const lastPart = parts[parts.length - 1]
    const count = parseInt(lastPart, 10)
    const hasCount = !Number.isNaN(count) && parts.length > 1 && count >= 1 && count <= 20
    const name = hasCount ? parts.slice(0, -1).join(' ') : parts.join(' ')
    const cloneCount = hasCount ? count : 1

    const activeMapId = requireActiveMapId(ctx)
    if (!activeMapId) return

    const original = requireTokenOnMap(activeMapId, name, ctx)
    if (!original) return

    for (let i = 0; i < cloneCount; i++) {
      const cloneToken: MapToken = {
        ...original,
        id: `token-${Date.now()}-${i}`,
        entityId: `token-${Date.now()}-${i}`,
        label: `${original.label} (${i + 2})`,
        gridX: original.gridX + i + 1,
        gridY: original.gridY
      }
      useGameStore.getState().addToken(activeMapId, cloneToken)
    }
    ctx.broadcastSystemMessage(`Cloned ${original.label} x${cloneCount}.`)
  }
}

export const tokenHideCommand: ChatCommand = {
  name: 'tokenhide',
  aliases: [],
  description: 'Hide a token from players (DM can still see it)',
  usage: '/tokenhide <token name>',
  dmOnly: true,
  category: 'dm',
  execute: async (args, ctx) => {
    const name = args.trim()
    if (!name) {
      ctx.addSystemMessage('Usage: /tokenhide <token name>')
      return
    }

    const activeMapId = requireActiveMapId(ctx)
    if (!activeMapId) return

    const token = requireTokenOnMap(activeMapId, name, ctx)
    if (!token) return

    useGameStore.getState().updateToken(activeMapId, token.id, { visibleToPlayers: false })
    ctx.addSystemMessage(`${token.label} is now hidden from players.`)
  }
}

export const tokenShowCommand: ChatCommand = {
  name: 'tokenshow',
  aliases: ['tokenreveal'],
  description: 'Show a hidden token to players',
  usage: '/tokenshow <token name>',
  dmOnly: true,
  category: 'dm',
  execute: async (args, ctx) => {
    const name = args.trim()
    if (!name) {
      ctx.addSystemMessage('Usage: /tokenshow <token name>')
      return
    }

    const activeMapId = requireActiveMapId(ctx)
    if (!activeMapId) return

    const token = requireTokenOnMap(activeMapId, name, ctx)
    if (!token) return

    useGameStore.getState().updateToken(activeMapId, token.id, { visibleToPlayers: true })
    ctx.broadcastSystemMessage(`${token.label} appears!`)
  }
}

export const moveTokenCommand: ChatCommand = {
  name: 'tokenmove',
  aliases: ['tpmove', 'teleport'],
  description: 'Move a token to specific grid coordinates',
  usage: '/tokenmove <token name> <x> <y>',
  dmOnly: true,
  category: 'dm',
  execute: async (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    if (parts.length < 3) {
      ctx.addSystemMessage('Usage: /tokenmove <token name> <x> <y>')
      return
    }

    const y = parseInt(parts[parts.length - 1], 10)
    const x = parseInt(parts[parts.length - 2], 10)
    if (Number.isNaN(x) || Number.isNaN(y)) {
      ctx.addSystemMessage('Coordinates must be numbers.')
      return
    }

    const name = parts.slice(0, -2).join(' ')
    const activeMapId = requireActiveMapId(ctx)
    if (!activeMapId) return

    const token = requireTokenOnMap(activeMapId, name, ctx)
    if (!token) return

    useGameStore.getState().updateToken(activeMapId, token.id, { gridX: x, gridY: y })
    ctx.broadcastSystemMessage(`${token.label} moved to (${x}, ${y}).`)
  }
}
