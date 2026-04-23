import { useAiDmStore } from '../../stores/use-ai-dm-store'
import type { ChatCommand } from './types'

const dmCommand: ChatCommand = {
  name: 'dm',
  aliases: ['ai', 'aidm'],
  description: 'AI DM controls and queries',
  usage: '/dm <pause|resume|model|context|history|encounter|puzzle|trap|secret|status>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    const sub = parts[0]?.toLowerCase()
    const rest = parts.slice(1).join(' ')

    const aiStore = useAiDmStore.getState()

    switch (sub) {
      case 'pause': {
        aiStore.setPaused(true)
        return { type: 'system', content: 'AI DM paused. It will not respond to player messages.' }
      }

      case 'resume': {
        aiStore.setPaused(false)
        return { type: 'system', content: 'AI DM resumed. It will now respond to player messages.' }
      }

      case 'status': {
        const isPaused = aiStore.paused
        const msgCount = aiStore.messages.length
        const scene = aiStore.sceneStatus
        return {
          type: 'system',
          content: `AI DM Status: ${isPaused ? 'PAUSED' : 'ACTIVE'} | Messages: ${msgCount} | Scene: ${scene}`
        }
      }

      case 'model': {
        if (!rest) {
          return { type: 'system', content: 'Current AI model: check AI DM settings panel.' }
        }
        return { type: 'system', content: `Model switching requires the AI DM settings panel.` }
      }

      case 'context': {
        const contextSub = parts[1]?.toLowerCase()
        if (contextSub === 'show') {
          const msgCount = aiStore.messages.length
          return { type: 'system', content: `AI context: ${msgCount} messages in conversation.` }
        }
        if (contextSub === 'clear') {
          aiStore.clearMessages()
          return { type: 'system', content: 'AI DM conversation context cleared.' }
        }
        return { type: 'error', content: 'Usage: /dm context <show|clear>' }
      }

      case 'history': {
        const historySub = parts[1]?.toLowerCase()
        if (historySub === 'show') {
          const messages = aiStore.messages
          if (messages.length === 0) {
            return { type: 'system', content: 'No AI DM conversation history.' }
          }
          const last5 = messages.slice(-5)
          const lines = last5.map((m) => `[${m.role}] ${m.content.slice(0, 100)}${m.content.length > 100 ? '...' : ''}`)
          return { type: 'system', content: `Last ${last5.length} AI messages:\n${lines.join('\n')}` }
        }
        if (historySub === 'clear') {
          aiStore.clearMessages()
          return { type: 'system', content: 'AI DM history cleared.' }
        }
        return { type: 'error', content: 'Usage: /dm history <show|clear>' }
      }

      case 'encounter': {
        if (rest === 'balance' || !rest) {
          ctx.openModal?.('encounterBuilder')
          return
        }
        return { type: 'error', content: 'Usage: /dm encounter [balance]' }
      }

      case 'puzzle': {
        if (!rest) {
          return { type: 'error', content: 'Usage: /dm puzzle <description>' }
        }
        return {
          type: 'broadcast',
          content: `**Puzzle:** ${rest}`
        }
      }

      case 'trap': {
        if (!rest) {
          return { type: 'error', content: 'Usage: /dm trap <description>' }
        }
        return {
          type: 'broadcast',
          content: `**Trap:** ${rest}`
        }
      }

      case 'secret': {
        if (!rest) {
          return { type: 'error', content: 'Usage: /dm secret <note>' }
        }
        return { type: 'system', content: `[DM Secret] ${rest}` }
      }

      default: {
        return {
          type: 'system',
          content: 'Usage: /dm <pause|resume|status|model|context|history|encounter|puzzle|trap|secret>'
        }
      }
    }
  }
}

export const commands: ChatCommand[] = [dmCommand]
