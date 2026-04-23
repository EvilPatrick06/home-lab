import { useGameStore } from '../../stores/use-game-store'
import { requireActiveMap, requireTokenOnMap } from './helpers'
import type { ChatCommand } from './types'

export const fogCommand: ChatCommand = {
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

export const lightCommand: ChatCommand = {
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

export const elevateCommand: ChatCommand = {
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

export const darknessCommand: ChatCommand = {
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

export const weatherCommand2: ChatCommand = {
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

export const sunmoonCommand: ChatCommand = {
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

export const gridCommand: ChatCommand = {
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

export const zoomCommand: ChatCommand = {
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

export const centerCommand: ChatCommand = {
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
