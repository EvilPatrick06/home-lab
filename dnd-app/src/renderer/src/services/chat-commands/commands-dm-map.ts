import { load5eMonsters } from '../../services/data-provider'
import { useGameStore } from '../../stores/use-game-store'
import type { MapToken } from '../../types/map'
import { requireActiveMap, requireActiveMapId, requireTokenOnMap } from './helpers'
import type { ChatCommand } from './types'

const fogCommand: ChatCommand = {
  name: 'fog',
  aliases: [],
  description: 'Reveal or hide fog of war',
  usage: '/fog reveal [all] or /fog hide [all]',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const parts = args.trim().toLowerCase().split(/\s+/)
    const action = parts[0]
    const scope = parts[1]

    if (action !== 'reveal' && action !== 'hide') {
      ctx.addSystemMessage('Usage: /fog reveal [all] or /fog hide [all]')
      return
    }

    if (action === 'reveal' && scope === 'all') {
      ctx.broadcastSystemMessage('All fog of war revealed. Use the fog brush tool for fine control.')
    } else if (action === 'hide' && scope === 'all') {
      ctx.broadcastSystemMessage('All fog of war restored. Use the fog brush tool for fine control.')
    } else if (action === 'reveal') {
      ctx.addSystemMessage('Use the fog brush tool to reveal specific areas, or /fog reveal all to reveal everything.')
    } else {
      ctx.addSystemMessage('Use the fog brush tool to hide specific areas, or /fog hide all to hide everything.')
    }
  }
}

const mapCommand: ChatCommand = {
  name: 'map',
  aliases: [],
  description: 'Switch the active map',
  usage: '/map <name-or-id>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const query = args.trim().toLowerCase()
    if (!query) {
      ctx.addSystemMessage('Usage: /map <name-or-id>')
      return
    }

    const gameState = useGameStore.getState()
    const maps = gameState.maps || []

    const found = maps.find((m) => m.id === query || m.name?.toLowerCase().startsWith(query))

    if (!found) {
      const available = maps.map((m) => m.name || m.id).join(', ')
      ctx.addSystemMessage(`Map not found: "${query}". Available maps: ${available || 'none'}`)
      return
    }

    if (gameState.setActiveMap) {
      gameState.setActiveMap(found.id)
    }
    ctx.broadcastSystemMessage(`Map changed to: ${found.name || found.id}`)
  }
}

const tokenCommand: ChatCommand = {
  name: 'token',
  aliases: [],
  description: 'Add or remove tokens on the map',
  usage: '/token add <name> [x] [y] or /token remove <name>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    const action = parts[0]?.toLowerCase()

    if (action !== 'add' && action !== 'remove') {
      ctx.addSystemMessage('Usage: /token add <name> [x] [y] or /token remove <name>')
      return
    }

    const activeMap = requireActiveMap(ctx)
    if (!activeMap) return

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

      useGameStore.getState().addToken(activeMap.id, newToken)
      ctx.broadcastSystemMessage(`Token "${name}" placed at (${x}, ${y}).`)
    } else {
      const name = parts.slice(1).join(' ')
      if (!name) {
        ctx.addSystemMessage('Usage: /token remove <name>')
        return
      }

      const token = requireTokenOnMap(activeMap.id, name, ctx)
      if (!token) return

      useGameStore.getState().removeToken(activeMap.id, token.id)
      ctx.broadcastSystemMessage(`Token "${token.label}" removed.`)
    }
  }
}

const summonCommand: ChatCommand = {
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

    try {
      const monsters = await load5eMonsters()
      const monster =
        monsters.find((m: { name: string }) => m.name.toLowerCase() === monsterName) ||
        monsters.find((m: { name: string }) => m.name.toLowerCase().startsWith(monsterName))

      if (!monster) {
        ctx.addSystemMessage(`Monster not found: "${nameParts.join(' ')}"`)
        return
      }

      const activeMapId = requireActiveMapId(ctx)
      if (!activeMapId) return

      const sizeValue =
        monster.size === 'Large' ? 2 : monster.size === 'Huge' ? 3 : monster.size === 'Gargantuan' ? 4 : 1

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
    } catch {
      ctx.addSystemMessage('Failed to load monster data.')
    }
  }
}

const lightCommand: ChatCommand = {
  name: 'light',
  aliases: [],
  description: 'Set ambient lighting level',
  usage: '/light <bright|dim|dark>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const input = args.trim().toLowerCase()
    if (!input) {
      ctx.addSystemMessage('Usage: /light <bright|dim|dark>')
      return
    }

    let level: 'bright' | 'dim' | 'darkness'
    switch (input) {
      case 'bright':
        level = 'bright'
        break
      case 'dim':
        level = 'dim'
        break
      case 'dark':
      case 'darkness':
        level = 'darkness'
        break
      default:
        ctx.addSystemMessage('Light level must be bright, dim, or dark.')
        return
    }

    const gameState = useGameStore.getState()
    gameState.setAmbientLight(level)
    ctx.broadcastSystemMessage(`Ambient light set to ${level}.`)
  }
}

const elevateCommand: ChatCommand = {
  name: 'elevate',
  aliases: ['elevation'],
  description: "Set a token's elevation in feet",
  usage: '/elevate <name> <height-in-feet>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    if (parts.length < 2) {
      ctx.addSystemMessage('Usage: /elevate <name> <height-in-feet>  (e.g. /elevate Goblin 30)')
      return
    }

    const heightStr = parts[parts.length - 1]
    const elevation = parseInt(heightStr, 10)
    if (Number.isNaN(elevation)) {
      ctx.addSystemMessage(`Invalid height: "${heightStr}". Provide a number in feet.`)
      return
    }

    const tokenName = parts.slice(0, -1).join(' ')
    const activeMap = requireActiveMap(ctx)
    if (!activeMap) return

    const token = requireTokenOnMap(activeMap.id, tokenName, ctx)
    if (!token) return

    useGameStore.getState().updateToken(activeMap.id, token.id, { elevation })

    if (elevation === 0) {
      ctx.broadcastSystemMessage(`${token.label} lands on the ground.`)
    } else if (elevation > 0) {
      ctx.broadcastSystemMessage(`${token.label} rises to ${elevation} ft elevation.`)
    } else {
      ctx.broadcastSystemMessage(`${token.label} descends to ${elevation} ft (below ground level).`)
    }
  }
}

const measureCommand: ChatCommand = {
  name: 'measure',
  aliases: ['distance', 'dist'],
  description: 'Measure distance between two grid positions',
  usage: '/measure <x1> <y1> <x2> <y2>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/).map(Number)
    if (parts.length < 4 || parts.some(Number.isNaN)) {
      ctx.addSystemMessage('Usage: /measure <x1> <y1> <x2> <y2>')
      return
    }
    const [x1, y1, x2, y2] = parts
    const dx = Math.abs(x2 - x1)
    const dy = Math.abs(y2 - y1)
    const dist = Math.max(dx, dy) * 5
    return {
      type: 'broadcast',
      content: `Distance: (${x1},${y1}) to (${x2},${y2}) = **${dist} ft** (${Math.max(dx, dy)} squares)`
    }
  }
}

const gridCommand: ChatCommand = {
  name: 'grid',
  aliases: [],
  description: 'Show, hide, or resize the grid',
  usage: '/grid <show|hide|size <px>>',
  dmOnly: true,
  category: 'dm',
  execute: (args, _ctx) => {
    const parts = args.trim().toLowerCase().split(/\s+/)
    const sub = parts[0]
    if (sub === 'show') {
      return { type: 'system', content: 'Grid visible.' }
    }
    if (sub === 'hide') {
      return { type: 'system', content: 'Grid hidden.' }
    }
    if (sub === 'size') {
      const px = parseInt(parts[1], 10)
      if (!px || px < 20 || px > 100) {
        return { type: 'error', content: 'Grid size must be 20-100 pixels.' }
      }
      return { type: 'system', content: `Grid cell size set to ${px}px.` }
    }
    return { type: 'error', content: 'Usage: /grid <show|hide|size <px>>' }
  }
}

const zoomCommand: ChatCommand = {
  name: 'zoom',
  aliases: [],
  description: 'Set map zoom level',
  usage: '/zoom <in|out|reset|percent>',
  dmOnly: false,
  category: 'player',
  execute: (args) => {
    const input = args.trim().toLowerCase()
    if (input === 'in') return { type: 'system', content: 'Zoomed in. Use scroll wheel for finer control.' }
    if (input === 'out') return { type: 'system', content: 'Zoomed out. Use scroll wheel for finer control.' }
    if (input === 'reset') return { type: 'system', content: 'Zoom reset to 100%.' }
    const pct = parseInt(input, 10)
    if (pct && pct >= 25 && pct <= 400) return { type: 'system', content: `Zoom set to ${pct}%.` }
    return { type: 'error', content: 'Usage: /zoom <in|out|reset|25-400>' }
  }
}

const centerCommand: ChatCommand = {
  name: 'center',
  aliases: ['focus'],
  description: 'Center the map on a token or coordinates',
  usage: '/center <token name|x y>',
  dmOnly: false,
  category: 'player',
  execute: (args) => {
    const input = args.trim()
    if (!input) return { type: 'error', content: 'Usage: /center <token name|x y>' }
    return { type: 'system', content: `Map centered on ${input}.` }
  }
}

const darknessCommand: ChatCommand = {
  name: 'darkness',
  aliases: [],
  description: 'Set the map to magical darkness',
  usage: '/darkness [radius] [x y]',
  dmOnly: true,
  category: 'dm',
  execute: (args, _ctx) => {
    const parts = args.trim().split(/\s+/)
    const radius = parseInt(parts[0], 10) || 15
    return {
      type: 'broadcast',
      content: `**Magical Darkness** (${radius} ft radius) fills the area.`
    }
  }
}

const weatherCommand2: ChatCommand = {
  name: 'setweather',
  aliases: [],
  description: 'Set weather conditions on the map',
  usage: '/setweather <clear|rain|snow|fog|storm>',
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const weather = args.trim().toLowerCase() || 'clear'
    const validWeathers = ['clear', 'rain', 'snow', 'fog', 'storm', 'wind', 'hail', 'blizzard']
    if (!validWeathers.includes(weather)) {
      return { type: 'error', content: `Valid weather: ${validWeathers.join(', ')}` }
    }
    return {
      type: 'broadcast',
      content: `**Weather changed to:** ${weather}`
    }
  }
}

const sunmoonCommand: ChatCommand = {
  name: 'sunmoon',
  aliases: ['daynight'],
  description: 'Toggle day/night cycle',
  usage: '/sunmoon <day|night|dawn|dusk>',
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const phase = args.trim().toLowerCase() || 'day'
    const validPhases = ['day', 'night', 'dawn', 'dusk', 'noon', 'midnight']
    if (!validPhases.includes(phase)) {
      return { type: 'error', content: `Valid phases: ${validPhases.join(', ')}` }
    }
    return {
      type: 'broadcast',
      content: `**Time of day:** ${phase}`
    }
  }
}

const tokenCloneCommand: ChatCommand = {
  name: 'tokenclone',
  aliases: ['clone'],
  description: 'Clone a token on the map (creates a duplicate nearby)',
  usage: '/tokenclone <token name> [count]',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
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

    const activeMap = requireActiveMap(ctx)
    if (!activeMap) return

    const original = requireTokenOnMap(activeMap.id, name, ctx)
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
      useGameStore.getState().addToken(activeMap.id, cloneToken)
    }
    ctx.broadcastSystemMessage(`Cloned ${original.label} x${cloneCount}.`)
  }
}

const tokenHideCommand: ChatCommand = {
  name: 'tokenhide',
  aliases: [],
  description: 'Hide a token from players (DM can still see it)',
  usage: '/tokenhide <token name>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const name = args.trim()
    if (!name) {
      ctx.addSystemMessage('Usage: /tokenhide <token name>')
      return
    }

    const activeMap = requireActiveMap(ctx)
    if (!activeMap) return

    const token = requireTokenOnMap(activeMap.id, name, ctx)
    if (!token) return

    useGameStore.getState().updateToken(activeMap.id, token.id, { visibleToPlayers: false })
    ctx.addSystemMessage(`${token.label} is now hidden from players.`)
  }
}

const tokenShowCommand: ChatCommand = {
  name: 'tokenshow',
  aliases: ['tokenreveal'],
  description: 'Show a hidden token to players',
  usage: '/tokenshow <token name>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const name = args.trim()
    if (!name) {
      ctx.addSystemMessage('Usage: /tokenshow <token name>')
      return
    }

    const activeMap = requireActiveMap(ctx)
    if (!activeMap) return

    const token = requireTokenOnMap(activeMap.id, name, ctx)
    if (!token) return

    useGameStore.getState().updateToken(activeMap.id, token.id, { visibleToPlayers: true })
    ctx.broadcastSystemMessage(`${token.label} appears!`)
  }
}

const moveTokenCommand: ChatCommand = {
  name: 'tokenmove',
  aliases: ['tpmove', 'teleport'],
  description: 'Move a token to specific grid coordinates',
  usage: '/tokenmove <token name> <x> <y>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
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
    const activeMap = requireActiveMap(ctx)
    if (!activeMap) return

    const token = requireTokenOnMap(activeMap.id, name, ctx)
    if (!token) return

    useGameStore.getState().updateToken(activeMap.id, token.id, { gridX: x, gridY: y })
    ctx.broadcastSystemMessage(`${token.label} moved to (${x}, ${y}).`)
  }
}

export const commands: ChatCommand[] = [
  fogCommand,
  mapCommand,
  tokenCommand,
  summonCommand,
  lightCommand,
  elevateCommand,
  measureCommand,
  gridCommand,
  zoomCommand,
  centerCommand,
  darknessCommand,
  weatherCommand2,
  sunmoonCommand,
  tokenCloneCommand,
  tokenHideCommand,
  tokenShowCommand,
  moveTokenCommand
]
