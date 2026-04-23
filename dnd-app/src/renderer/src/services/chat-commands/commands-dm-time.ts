import { useCampaignStore } from '../../stores/use-campaign-store'
import { useCharacterStore } from '../../stores/use-character-store'
import { useGameStore } from '../../stores/use-game-store'
import { advanceTrackedDowntime, getActiveDowntimeForCharacter, updateDowntimeProgress } from '../downtime-service'
import type { ChatCommand } from './types'

const timeCommand: ChatCommand = {
  name: 'time',
  aliases: [],
  description: 'Show, advance, or set in-game time',
  usage: '/time <show|set <hours>|<amount> <unit>>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    const sub = parts[0]?.toLowerCase()

    // /time show — display current time
    if (sub === 'show' || sub === 'status' || !sub) {
      const time = useGameStore.getState().inGameTime
      if (!time) {
        ctx.addSystemMessage('No in-game time is set.')
        return
      }
      const totalHours = Math.floor(time.totalSeconds / 3600)
      const days = Math.floor(totalHours / 24)
      const hours = totalHours % 24
      const minutes = Math.floor((time.totalSeconds % 3600) / 60)
      ctx.addSystemMessage(
        `Current time: Day ${days + 1}, ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
      )
      return
    }

    // /time set <hours> — set time to specific hour (0-23)
    if (sub === 'set') {
      const targetHour = parseInt(parts[1], 10)
      if (Number.isNaN(targetHour) || targetHour < 0 || targetHour > 23) {
        ctx.addSystemMessage('Usage: /time set <hour> (0-23)')
        return
      }
      const time = useGameStore.getState().inGameTime
      if (!time) {
        ctx.addSystemMessage('No in-game time is set.')
        return
      }
      const currentDay = Math.floor(time.totalSeconds / 86400)
      const newSeconds = currentDay * 86400 + targetHour * 3600
      const diff = newSeconds - time.totalSeconds
      if (diff > 0) {
        useGameStore.getState().advanceTimeSeconds(diff)
      } else {
        // Advance to next day at that hour
        useGameStore.getState().advanceTimeSeconds(86400 + diff)
      }
      ctx.broadcastSystemMessage(`Time set to ${String(targetHour).padStart(2, '0')}:00.`)
      return
    }

    if (parts.length < 2) {
      ctx.addSystemMessage('Usage: /time <show|set <hour>|<amount> <unit>> (units: minutes, hours, days, rounds)')
      return
    }

    const amount = parseInt(parts[0], 10)
    const unit = parts[1].toLowerCase()

    if (Number.isNaN(amount) || amount <= 0) {
      ctx.addSystemMessage('Amount must be a positive number.')
      return
    }

    const validUnits = ['minutes', 'minute', 'min', 'hours', 'hour', 'hr', 'days', 'day', 'rounds', 'round', 'rd']
    if (!validUnits.includes(unit)) {
      ctx.addSystemMessage(`Invalid unit: "${unit}". Use: minutes, hours, days, or rounds.`)
      return
    }

    let seconds: number
    let displayUnit: string
    switch (unit) {
      case 'rounds':
      case 'round':
      case 'rd':
        seconds = amount * 6 // 6 seconds per round
        displayUnit = amount === 1 ? 'round' : 'rounds'
        break
      case 'minutes':
      case 'minute':
      case 'min':
        seconds = amount * 60
        displayUnit = amount === 1 ? 'minute' : 'minutes'
        break
      case 'hours':
      case 'hour':
      case 'hr':
        seconds = amount * 60 * 60
        displayUnit = amount === 1 ? 'hour' : 'hours'
        break
      case 'days':
      case 'day':
        seconds = amount * 60 * 60 * 24
        displayUnit = amount === 1 ? 'day' : 'days'
        break
      default:
        seconds = amount * 60
        displayUnit = 'minutes'
    }

    const gameState = useGameStore.getState()
    gameState.advanceTimeSeconds(seconds)

    ctx.broadcastSystemMessage(`⏰ ${amount} ${displayUnit} have passed.`)
  }
}

const shopCommand: ChatCommand = {
  name: 'shop',
  aliases: [],
  description: 'Open/close shop or manage shop inventory',
  usage: '/shop [open|close|add <item> <price>|remove <item>]',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    const sub = parts[0]?.toLowerCase()

    const gameState = useGameStore.getState()

    if (!sub || sub === 'open') {
      if (!gameState.shopOpen) gameState.openShop()
      ctx.addSystemMessage('Shop opened.')
      return
    }

    if (sub === 'close') {
      if (gameState.shopOpen) gameState.closeShop()
      ctx.addSystemMessage('Shop closed.')
      return
    }

    if (sub === 'add') {
      const pricePart = parts[parts.length - 1]
      const price = parseInt(pricePart, 10)
      const hasPrice = !Number.isNaN(price) && parts.length >= 3
      const itemName = hasPrice ? parts.slice(1, -1).join(' ') : parts.slice(1).join(' ')
      if (!itemName) {
        ctx.addSystemMessage('Usage: /shop add <item name> [price in gp]')
        return
      }
      ctx.broadcastSystemMessage(`**Shop:** "${itemName}" added${hasPrice ? ` (${price} gp)` : ''}.`)
      return
    }

    if (sub === 'remove') {
      const itemName = parts.slice(1).join(' ')
      if (!itemName) {
        ctx.addSystemMessage('Usage: /shop remove <item name>')
        return
      }
      ctx.broadcastSystemMessage(`**Shop:** "${itemName}" removed.`)
      return
    }

    // Toggle fallback
    if (gameState.shopOpen) {
      gameState.closeShop()
      ctx.addSystemMessage('Shop closed.')
    } else {
      gameState.openShop()
      ctx.addSystemMessage('Shop opened.')
    }
  }
}

const downtimeCommand: ChatCommand = {
  name: 'downtime',
  aliases: ['dt'],
  description: 'Open the downtime panel or manage tracked activities',
  usage: '/downtime [advance <character> [days] | complete <character> | abandon <character> | status]',
  dmOnly: false,
  category: 'dm',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    const sub = parts[0]?.toLowerCase()

    // No subcommand — open the modal
    if (!sub) {
      ctx.openModal?.('downtime')
      return
    }

    // /downtime status — show all active downtime
    if (sub === 'status') {
      const campaign = useCampaignStore.getState().getActiveCampaign()
      if (!campaign) {
        ctx.addSystemMessage('No active campaign.')
        return
      }
      const active = (campaign.downtimeProgress ?? []).filter((e) => e.status === 'in-progress')
      if (active.length === 0) {
        ctx.addSystemMessage('No active downtime activities.')
        return
      }
      const lines = active.map(
        (e) => `- **${e.characterName}**: ${e.activityName} (${e.daysSpent}/${e.daysRequired} days)`
      )
      ctx.addSystemMessage(`**Active Downtime:**\n${lines.join('\n')}`)
      return
    }

    // Subcommands that require a character name
    const charName = parts.slice(1, sub === 'advance' ? -1 : undefined).join(' ') || parts[1]
    if (!charName) {
      ctx.addSystemMessage(`Usage: /downtime ${sub} <character name>${sub === 'advance' ? ' [days]' : ''}`)
      return
    }

    const campaign = useCampaignStore.getState().getActiveCampaign()
    if (!campaign) {
      ctx.addSystemMessage('No active campaign.')
      return
    }

    // Find character by name (case-insensitive)
    const characters = useCharacterStore.getState().characters
    const char = characters.find((c) => c.name.toLowerCase() === charName.toLowerCase())
    if (!char) {
      ctx.addSystemMessage(`Character "${charName}" not found.`)
      return
    }

    const entries = getActiveDowntimeForCharacter(campaign, char.id)
    if (entries.length === 0) {
      ctx.addSystemMessage(`No active downtime for ${char.name}.`)
      return
    }
    // Work on the first active entry
    const entry = entries[0]

    if (sub === 'advance') {
      const daysStr = parts[parts.length - 1]
      const days = parseInt(daysStr, 10)
      const advDays = !Number.isNaN(days) && parts.length > 2 ? days : 1

      const { campaign: updated, complete } = advanceTrackedDowntime(campaign, entry.id, advDays)
      useCampaignStore.getState().saveCampaign(updated)
      const updatedEntry = (updated.downtimeProgress ?? []).find((e) => e.id === entry.id)
      if (complete) {
        ctx.broadcastSystemMessage(`**${char.name}** completed: ${entry.activityName}!`)
      } else if (updatedEntry) {
        ctx.broadcastSystemMessage(
          `**${char.name}** advanced ${entry.activityName}: ${updatedEntry.daysSpent}/${updatedEntry.daysRequired} days`
        )
      }
      return
    }

    if (sub === 'complete') {
      const updated = updateDowntimeProgress(campaign, entry.id, { status: 'completed' })
      useCampaignStore.getState().saveCampaign(updated)
      ctx.broadcastSystemMessage(`**${char.name}** completed: ${entry.activityName}!`)
      return
    }

    if (sub === 'abandon') {
      const updated = updateDowntimeProgress(campaign, entry.id, { status: 'abandoned' })
      useCampaignStore.getState().saveCampaign(updated)
      ctx.broadcastSystemMessage(`**${char.name}** abandoned: ${entry.activityName}.`)
      return
    }

    // Unknown subcommand — just open modal
    ctx.openModal?.('downtime')
  }
}

const craftCommand: ChatCommand = {
  name: 'craft',
  aliases: [],
  description: 'Open crafting browser for a character',
  usage: '/craft',
  dmOnly: false,
  category: 'dm',
  execute: (_args, ctx) => {
    ctx.openModal?.('downtime')
  }
}

const timeSetCommand: ChatCommand = {
  name: 'timeset',
  aliases: ['settime'],
  description: 'Set the in-game time to a specific value',
  usage: '/timeset <hours>:<minutes> or /timeset dawn|noon|dusk|midnight',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const input = args.trim().toLowerCase()
    if (!input) {
      ctx.addSystemMessage('Usage: /timeset <HH:MM> or /timeset dawn|noon|dusk|midnight')
      return
    }

    const presets: Record<string, string> = {
      dawn: '06:00',
      sunrise: '06:00',
      noon: '12:00',
      midday: '12:00',
      dusk: '18:00',
      sunset: '18:00',
      midnight: '00:00',
      night: '22:00'
    }

    const timeStr = presets[input] || input
    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/)
    if (!timeMatch) {
      ctx.addSystemMessage(`Invalid time: "${input}". Use HH:MM format or preset (dawn, noon, dusk, midnight).`)
      return
    }

    const hours = parseInt(timeMatch[1], 10)
    const minutes = parseInt(timeMatch[2], 10)
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      ctx.addSystemMessage('Time must be 00:00-23:59.')
      return
    }

    const gameState = useGameStore.getState()
    const totalSeconds = hours * 3600 + minutes * 60
    const currentTime = gameState.inGameTime
    // Preserve day count: keep the same number of full days, just change time-of-day
    const currentDaySeconds = currentTime ? Math.floor(currentTime.totalSeconds / 86400) * 86400 : 0
    gameState.setInGameTime({ totalSeconds: currentDaySeconds + totalSeconds })
    const padded = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    ctx.broadcastSystemMessage(`In-game time set to ${padded}.`)
  }
}

const restCommand: ChatCommand = {
  name: 'rest',
  aliases: [],
  description: 'Announce a short or long rest',
  usage: '/rest <short|long>',
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const type = args.trim().toLowerCase()
    if (type !== 'short' && type !== 'long') {
      ctx.addSystemMessage('Usage: /rest <short|long>')
      return
    }
    if (type === 'short') {
      ctx.broadcastSystemMessage('The party takes a **Short Rest** (1 hour). Spend Hit Dice to recover HP.')
    } else {
      ctx.broadcastSystemMessage('The party takes a **Long Rest** (8 hours). HP, spell slots, and abilities restored.')
    }
  }
}

export const commands: ChatCommand[] = [
  timeCommand,
  shopCommand,
  downtimeCommand,
  craftCommand,
  timeSetCommand,
  restCommand
]
