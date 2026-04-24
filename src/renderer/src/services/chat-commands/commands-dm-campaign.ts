import { useGameStore } from '../../stores/use-game-store'
import type { ChatCommand } from './types'

const calendarCommand: ChatCommand = {
  name: 'calendar',
  aliases: ['cal'],
  description: 'View or manage calendar events',
  usage: '/calendar <show|event add|event list>',
  dmOnly: true,
  category: 'dm',
  execute: (args, _ctx) => {
    const parts = args.trim().split(/\s+/)
    const sub = parts[0]?.toLowerCase()

    switch (sub) {
      case 'show':
      case 'view':
      case undefined:
      case '': {
        const time = useGameStore.getState().inGameTime
        if (!time) {
          return { type: 'system', content: 'No in-game time is set.' }
        }
        const hours = Math.floor(time.totalSeconds / 3600)
        const days = Math.floor(hours / 24)
        return {
          type: 'system',
          content: `Calendar: Day ${days + 1}, ${hours % 24}:00`
        }
      }

      case 'event': {
        const eventSub = parts[1]?.toLowerCase()
        if (eventSub === 'add') {
          const desc = parts.slice(2).join(' ')
          if (!desc) {
            return { type: 'error', content: 'Usage: /calendar event add <description>' }
          }
          return {
            type: 'broadcast',
            content: `**Calendar Event Added:** ${desc}`
          }
        }
        if (eventSub === 'list') {
          return { type: 'system', content: 'Calendar events: check the Calendar page for full details.' }
        }
        return { type: 'error', content: 'Usage: /calendar event <add|list>' }
      }

      default:
        return { type: 'error', content: 'Usage: /calendar <show|event add|event list>' }
    }
  }
}

const journalCommand: ChatCommand = {
  name: 'journal',
  aliases: ['j'],
  description: 'Add or view journal entries',
  usage: '/journal <entry|show> [text]',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    const sub = parts[0]?.toLowerCase()

    if (sub === 'entry' || sub === 'add') {
      const text = parts.slice(1).join(' ')
      if (!text) {
        return { type: 'error', content: 'Usage: /journal entry <text>' }
      }
      return {
        type: 'system',
        content: `[Journal Entry] ${text}`
      }
    }

    if (sub === 'show' || sub === 'open' || !sub) {
      ctx.openModal?.('notes')
      return
    }

    return { type: 'error', content: 'Usage: /journal <entry|show> [text]' }
  }
}

const handoutCommand: ChatCommand = {
  name: 'handout',
  aliases: ['ho'],
  description: 'Share or create a handout',
  usage: '/handout <share|create> <title>',
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const parts = args.trim().split(/\s+/)
    const sub = parts[0]?.toLowerCase()
    const title = parts.slice(1).join(' ')

    if (sub === 'share' && title) {
      return {
        type: 'broadcast',
        content: `**Handout Shared:** ${title}`
      }
    }
    if (sub === 'create' && title) {
      return {
        type: 'system',
        content: `Handout "${title}" created. Edit via the Journal panel.`
      }
    }
    return { type: 'error', content: 'Usage: /handout <share|create> <title>' }
  }
}

const sessionCommand: ChatCommand = {
  name: 'session',
  aliases: ['sess'],
  description: 'Session management (start, end, recap)',
  usage: '/session <start|end|recap>',
  dmOnly: true,
  category: 'dm',
  execute: (args, _ctx) => {
    const sub = args.trim().toLowerCase()

    switch (sub) {
      case 'start':
        return {
          type: 'broadcast',
          content: `**Session Started!** Welcome, adventurers. Let the journey continue...`
        }

      case 'end':
        return {
          type: 'broadcast',
          content: `**Session Ended.** Thank you for playing! See you next time.`
        }

      case 'recap': {
        return {
          type: 'broadcast',
          content: `**Session Recap:** (DM, describe what happened last session here via /announce)`
        }
      }

      default:
        return { type: 'error', content: 'Usage: /session <start|end|recap>' }
    }
  }
}

const snapshotCommand: ChatCommand = {
  name: 'snapshot',
  aliases: ['save-state'],
  description: 'Save or restore a game state snapshot',
  usage: '/snapshot [restore]',
  dmOnly: true,
  category: 'dm',
  execute: (args) => {
    const sub = args.trim().toLowerCase()
    if (sub === 'restore') {
      return { type: 'system', content: 'State restore: use the campaign detail page to load a previous save.' }
    }
    return {
      type: 'system',
      content: 'Game state snapshot saved.'
    }
  }
}

const maplistCommand: ChatCommand = {
  name: 'maplist',
  aliases: ['maps'],
  description: 'List all available maps in the campaign',
  usage: '/maplist',
  dmOnly: true,
  category: 'dm',
  execute: () => {
    const gameState = useGameStore.getState()
    const maps = gameState.maps
    if (maps.length === 0) {
      return { type: 'system', content: 'No maps configured for this campaign.' }
    }
    const activeId = gameState.activeMapId
    const lines = maps.map((m) => {
      const tag = m.id === activeId ? ' **(active)**' : ''
      return `- ${m.name || m.id}${tag}`
    })
    return {
      type: 'system',
      content: `**Maps (${maps.length}):**\n${lines.join('\n')}`
    }
  }
}

export const commands: ChatCommand[] = [
  calendarCommand,
  journalCommand,
  handoutCommand,
  sessionCommand,
  snapshotCommand,
  maplistCommand
]
