import { useGameStore } from '../../stores/use-game-store'
import { is5eCharacter } from '../../types/character'
import { getLatestCharacter } from './helpers'
import type { ChatCommand, CommandContext, CommandResult } from './types'

// /move - Declare movement in feet
const moveCommand: ChatCommand = {
  name: 'move',
  aliases: [],
  category: 'player',
  dmOnly: false,
  description: 'Declare movement in feet',
  usage: '/move <feet>',
  execute: (args: string, ctx: CommandContext): CommandResult => {
    if (!ctx.character) {
      return { handled: true, error: 'No active character.' }
    }

    const char = getLatestCharacter(ctx.character.id)
    if (!char || !is5eCharacter(char)) {
      return { handled: true, error: 'No active 5e character found.' }
    }

    const parts = args.trim().split(/\s+/)
    const feet = parseInt(parts[0], 10)
    if (Number.isNaN(feet) || feet <= 0) {
      return { handled: true, error: 'Usage: /move <feet>' }
    }

    const name = char.name || 'Character'
    const entityId = char.id
    const gameStore = useGameStore.getState()

    try {
      gameStore.useMovement(entityId, feet)
    } catch {
      return { handled: true, error: `${name} does not have ${feet} ft. of movement remaining.` }
    }

    const ts = gameStore.getTurnState(entityId)
    const remaining = ts?.movementRemaining ?? 0
    ctx.addSystemMessage(`${name} moves ${feet} ft. (${remaining} ft. remaining)`)
    return { handled: true }
  }
}

// /endturn - End your turn in initiative
const endturnCommand: ChatCommand = {
  name: 'endturn',
  aliases: ['et', 'done'],
  category: 'player',
  dmOnly: false,
  description: 'End your turn in initiative',
  usage: '/endturn',
  execute: (_args: string, ctx: CommandContext): CommandResult => {
    if (!ctx.character) {
      return { handled: true, error: 'No active character.' }
    }

    const char = getLatestCharacter(ctx.character.id)
    if (!char || !is5eCharacter(char)) {
      return { handled: true, error: 'No active 5e character found.' }
    }

    const name = char.name || 'Character'
    const gameStore = useGameStore.getState()

    gameStore.nextTurn()
    ctx.broadcastSystemMessage(`${name} ends their turn.`)
    return { handled: true }
  }
}

// /jump - Calculate jump distance
const jumpCommand: ChatCommand = {
  name: 'jump',
  aliases: [],
  category: 'player',
  dmOnly: false,
  description: 'Calculate jump distance based on STR',
  usage: '/jump [long|high]',
  execute: (args: string, ctx: CommandContext): CommandResult => {
    if (!ctx.character) {
      return { handled: true, error: 'No active character.' }
    }

    const char = getLatestCharacter(ctx.character.id)
    if (!char || !is5eCharacter(char)) {
      return { handled: true, error: 'No active 5e character found.' }
    }

    const name = char.name || 'Character'
    const strScore = char.abilityScores?.strength ?? 10
    const strMod = Math.floor((strScore - 10) / 2)

    const parts = args.trim().split(/\s+/)
    const jumpType = parts[0]?.toLowerCase()

    if (jumpType === 'high') {
      const runningHigh = 3 + strMod
      const standingHigh = Math.floor(runningHigh / 2)
      ctx.addSystemMessage(
        `${name} — High Jump: ${runningHigh} ft. (running), ${standingHigh} ft. (standing). [STR mod: ${strMod >= 0 ? '+' : ''}${strMod}]`
      )
    } else if (jumpType === 'long' || !jumpType) {
      const runningLong = strScore
      const standingLong = Math.floor(runningLong / 2)
      ctx.addSystemMessage(
        `${name} — Long Jump: ${runningLong} ft. (running), ${standingLong} ft. (standing). [STR score: ${strScore}]`
      )
    } else {
      return { handled: true, error: 'Usage: /jump [long|high]' }
    }

    return { handled: true }
  }
}

export const commands: ChatCommand[] = [moveCommand, endturnCommand, jumpCommand]
