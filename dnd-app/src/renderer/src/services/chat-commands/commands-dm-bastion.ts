import { useBastionStore } from '../../stores/use-bastion-store'
import { useCharacterStore } from '../../stores/use-character-store'
import { ENLARGE_COSTS, getBpPerTurn } from '../../types/bastion'
import type { ChatCommand } from './types'

const BARRACK_CAPACITY: Record<string, number> = { cramped: 4, roomy: 12, vast: 25 }

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
          `Bastion Points: ${bastion.bastionPoints ?? 0} BP`,
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

        // Determine owner level for BP generation
        const characters = useCharacterStore.getState().characters
        const owner = characters.find((c) => c.id === bastion.ownerId)
        const charLevel = owner?.level ?? 5

        store.completeTurn(bastion.id, turn.turnNumber, charLevel)

        // Re-read to get updated turn
        const updated = useBastionStore.getState().bastions.find((b) => b.id === bastion.id)
        const completedTurn = updated?.turns.find((t) => t.turnNumber === turn.turnNumber)
        const eventDesc = completedTurn?.eventOutcome ?? 'No event'

        const bpEarned = getBpPerTurn(charLevel)

        return {
          type: 'broadcast',
          content: `**${bastion.name}** — Bastion Turn ${turn.turnNumber}\nEvent: ${eventDesc}${bpEarned > 0 ? `\nBP earned: +${bpEarned} (now ${updated?.bastionPoints ?? 0} BP)` : ''}`
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
          content: `**${bastion.name}** Treasury: ${treasury} GP | ${bastion.bastionPoints ?? 0} BP`
        }
      }

      case 'hire': {
        const hirelingName = parts.slice(1).join(' ')
        if (!hirelingName) {
          return { type: 'error', content: 'Usage: /bastion hire <hireling name>' }
        }
        const barracks = bastion.specialFacilities.filter((f) => f.type === 'barrack')
        if (barracks.length === 0) {
          return { type: 'error', content: `${bastion.name}: Build a barrack first.` }
        }
        const store = useBastionStore.getState()
        const barrack = barracks.find((b) => {
          const cap = BARRACK_CAPACITY[b.space] ?? 12
          const assigned = bastion.defenders.filter((d) => d.barrackId === b.id).length
          return assigned < cap
        })
        if (!barrack) {
          return { type: 'error', content: `${bastion.name}: All barracks at capacity.` }
        }
        store.recruitDefenders(bastion.id, barrack.id, [hirelingName])
        return {
          type: 'broadcast',
          content: `**${bastion.name}** hires **${hirelingName}** — assigned to ${barrack.name}.`
        }
      }

      case 'upgrade': {
        const facilityName = parts.slice(1).join(' ')
        if (!facilityName) {
          return { type: 'error', content: 'Usage: /bastion upgrade <facility name>' }
        }
        const facility = bastion.specialFacilities.find((f) => f.name.toLowerCase() === facilityName.toLowerCase())
        if (!facility) {
          return { type: 'error', content: `No special facility named "${facilityName}" found.` }
        }
        if (facility.space === 'vast') {
          return { type: 'error', content: `${facility.name} is already Vast and cannot be enlarged further.` }
        }
        const activeConstruction = bastion.construction.some((p) => p.facilityId === facility.id)
        if (activeConstruction) {
          return { type: 'error', content: `${facility.name} already has an active construction project.` }
        }
        const costKey = facility.space === 'cramped' ? 'cramped-roomy' : 'roomy-vast'
        const targetSpace = facility.space === 'cramped' ? 'roomy' : 'vast'
        const cost = ENLARGE_COSTS[costKey]
        if (!cost) {
          return { type: 'error', content: `Cannot determine enlargement cost for ${facility.name}.` }
        }
        const store = useBastionStore.getState()
        store.startConstruction(bastion.id, {
          projectType: 'enlarge-special',
          facilityId: facility.id,
          targetSpace: targetSpace as 'roomy' | 'vast',
          cost: cost.gp,
          daysRequired: cost.days
        })
        return {
          type: 'broadcast',
          content: `**${bastion.name}** begins enlarging **${facility.name}** to ${targetSpace} (${cost.gp} GP, ${cost.days} days).`
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
