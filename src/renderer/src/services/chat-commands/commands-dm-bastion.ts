import { useBastionStore } from '../../stores/use-bastion-store'
import type { ChatCommand } from './types'

const bastionCommand: ChatCommand = {
  name: 'bastion',
  aliases: [],
  description: 'Manage bastion turns and status',
  usage: '/bastion <status|turn|events|treasury> [name]',
  dmOnly: true,
  category: 'dm',
  execute: (args, _ctx) => {
    const parts = args.trim().split(/\s+/)
    const sub = parts[0]?.toLowerCase()
    const bastionName = parts.slice(1).join(' ')

    const { bastions } = useBastionStore.getState()

    if (bastions.length === 0) {
      return { type: 'error', content: 'No bastions found. Create one from the Bastion page.' }
    }

    // Find bastion by name or use first
    const bastion = bastionName
      ? bastions.find((b) => b.name.toLowerCase().includes(bastionName.toLowerCase()))
      : bastions[0]

    if (!bastion) {
      return { type: 'error', content: `No bastion found matching "${bastionName}".` }
    }

    const { inGameTime, treasury, turns } = bastion
    const daysSinceLast = inGameTime.currentDay - inGameTime.lastBastionTurnDay
    const daysUntilTurn = Math.max(0, inGameTime.turnFrequencyDays - daysSinceLast)
    const turnReady = daysSinceLast >= inGameTime.turnFrequencyDays

    switch (sub) {
      case 'status': {
        const facilities = [
          ...bastion.basicFacilities.map((f) => f.name),
          ...bastion.specialFacilities.map((f) => f.name)
        ]
        const lines = [
          `**${bastion.name}** — Bastion Status`,
          `Day: ${inGameTime.currentDay}`,
          `Treasury: ${treasury} gp`,
          `Facilities: ${facilities.length > 0 ? facilities.join(', ') : 'None'}`,
          `Turns completed: ${turns.length}`,
          turnReady
            ? '**Bastion turn is READY!**'
            : `Next turn in ${daysUntilTurn} day${daysUntilTurn !== 1 ? 's' : ''}`
        ]
        return { type: 'broadcast', content: lines.join('\n') }
      }

      case 'turn': {
        if (!turnReady) {
          return {
            type: 'system',
            content: `${bastion.name}: Next turn in ${daysUntilTurn} day${daysUntilTurn !== 1 ? 's' : ''}. Advance time with /time.`
          }
        }
        const store = useBastionStore.getState()
        const turn = store.startTurn(bastion.id)
        if (!turn) {
          return { type: 'error', content: `Failed to start bastion turn for ${bastion.name}.` }
        }
        store.rollAndResolveEvent(bastion.id, turn.turnNumber)
        store.completeTurn(bastion.id, turn.turnNumber)

        // Re-read to get updated turn
        const updated = useBastionStore.getState().bastions.find((b) => b.id === bastion.id)
        const completedTurn = updated?.turns.find((t) => t.turnNumber === turn.turnNumber)
        const eventDesc = completedTurn?.eventOutcome ?? 'No event'

        return {
          type: 'broadcast',
          content: `**${bastion.name}** — Bastion Turn ${turn.turnNumber}\nEvent: ${eventDesc}`
        }
      }

      case 'events': {
        const count = parseInt(parts[1], 10) || 5
        const recentTurns = turns.slice(-count)
        if (recentTurns.length === 0) {
          return { type: 'system', content: `${bastion.name}: No turns completed yet.` }
        }
        const lines = [`**${bastion.name}** — Recent Events`]
        for (const t of recentTurns) {
          lines.push(`Turn ${t.turnNumber}: ${t.eventOutcome ?? 'No event'}`)
        }
        return { type: 'broadcast', content: lines.join('\n') }
      }

      case 'treasury': {
        return {
          type: 'broadcast',
          content: `**${bastion.name}** Treasury: ${treasury} gp`
        }
      }

      case 'hire': {
        const hirelingName = parts.slice(1).join(' ')
        if (!hirelingName) {
          return { type: 'error', content: 'Usage: /bastion hire <hireling name>' }
        }
        return {
          type: 'broadcast',
          content: `**${bastion.name}** hires **${hirelingName}** as a hireling.`
        }
      }

      case 'upgrade': {
        const facilityName = parts.slice(1).join(' ')
        if (!facilityName) {
          return { type: 'error', content: 'Usage: /bastion upgrade <facility name>' }
        }
        return {
          type: 'broadcast',
          content: `**${bastion.name}** upgrades facility: **${facilityName}**.`
        }
      }

      default: {
        return {
          type: 'system',
          content: 'Usage: /bastion <status|turn|events|treasury|hire|upgrade> [name]'
        }
      }
    }
  }
}

export const commands: ChatCommand[] = [bastionCommand]
