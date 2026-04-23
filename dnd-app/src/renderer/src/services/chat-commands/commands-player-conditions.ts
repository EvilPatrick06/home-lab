import { trigger3dDice } from '../../components/game/dice3d'
import { playConditionSound } from '../../services/sound-manager'
import { useCharacterStore } from '../../stores/use-character-store'
import { useGameStore } from '../../stores/use-game-store'
import type { MapToken } from '../../types/map'
import { rollSingle } from '../dice/dice-service'
import { getLatestCharacter } from './helpers'
import type { ChatCommand } from './types'

export const commands: ChatCommand[] = [
  {
    name: 'condition',
    aliases: ['cond'],
    category: 'player',
    dmOnly: false,
    description: 'Toggle condition on a target (with optional duration)',
    usage: '/condition <name> or /condition <target> <name> [rounds]',
    execute: (_args, context) => {
      const parts = _args.trim().split(/\s+/)
      if (parts.length === 0 || !parts[0]) {
        return { type: 'error', content: 'Usage: /condition <name> or /condition <target> <name> [rounds]' }
      }

      const gameState = useGameStore.getState()
      const activeMap = gameState.maps.find((m) => m.id === gameState.activeMapId)
      const tokens: MapToken[] = activeMap?.tokens ?? []

      let targetId: string | undefined
      let targetName: string | undefined
      let conditionName: string
      let rounds: number | undefined

      // Check if last arg is a number (duration in rounds)
      const lastArg = parts[parts.length - 1]
      const lastIsNumber = /^\d+$/.test(lastArg) && parts.length > 1

      if (lastIsNumber) {
        rounds = parseInt(lastArg, 10)
      }

      const effectiveParts = lastIsNumber ? parts.slice(0, -1) : parts

      if (effectiveParts.length >= 2 && context.isDM) {
        // DM targeting: /condition <target> <condition> [rounds]
        const potentialTarget = effectiveParts[0].toLowerCase()
        const token = tokens.find(
          (t: MapToken) => t.label?.toLowerCase() === potentialTarget || t.id?.toLowerCase() === potentialTarget
        )
        if (token) {
          targetId = token.id
          targetName = token.label ?? token.id
          conditionName = effectiveParts.slice(1).join(' ')
        } else {
          // Assume entire thing is the condition name (multi-word condition)
          conditionName = effectiveParts.join(' ')
        }
      } else {
        conditionName = effectiveParts.join(' ')
      }

      // Default to player's own character
      if (!targetId) {
        if (!context.character?.id) return { type: 'error', content: 'No active character.' }
        const char = getLatestCharacter(context.character.id)
        if (!char) return { type: 'error', content: 'No active character.' }
        targetId = char.id
        targetName = char.name
      }

      // Check if condition already exists — toggle off
      const existing = gameState.conditions ?? []
      const matchingCondition = existing.find(
        (c) => c.entityId === targetId && c.condition.toLowerCase() === conditionName.toLowerCase()
      )

      if (matchingCondition) {
        gameState.removeCondition(matchingCondition.id)
        return {
          type: 'broadcast',
          content: `${targetName} is no longer ${conditionName}.`
        }
      } else {
        const condition = {
          id: crypto.randomUUID(),
          entityId: targetId!,
          entityName: targetName ?? targetId!,
          condition: conditionName,
          duration: rounds !== undefined ? rounds : ('permanent' as const),
          source: context.character?.id ?? 'command',
          appliedRound: gameState.round
        }
        gameState.addCondition(condition)
        playConditionSound(conditionName)

        const durationText = rounds !== undefined ? ` for ${rounds} round${rounds !== 1 ? 's' : ''}` : ''
        return {
          type: 'broadcast',
          content: `${targetName} is now ${conditionName}${durationText}.`
        }
      }
    }
  },
  {
    name: 'exhaustion',
    aliases: ['exh'],
    category: 'player',
    dmOnly: false,
    description: 'Adjust exhaustion level',
    usage: '/exhaustion +1 or /exhaustion -1 or /exhaustion set 3',
    execute: (_args, context) => {
      if (!context.character?.id) return { type: 'error', content: 'No active character.' }
      const char = getLatestCharacter(context.character.id)
      if (!char) return { type: 'error', content: 'No active character.' }

      const rawArgs = _args.trim()
      if (!rawArgs) {
        const gameState = useGameStore.getState()
        const existing = (gameState.conditions ?? []).find(
          (c) => c.entityId === char.id && c.condition.toLowerCase() === 'exhaustion'
        )
        const level = existing?.value ?? 0
        return { type: 'system', content: `**Exhaustion Level:** ${level}/6` }
      }

      let newLevel: number
      const gameState = useGameStore.getState()
      const existing = (gameState.conditions ?? []).find(
        (c) => c.entityId === char.id && c.condition.toLowerCase() === 'exhaustion'
      )
      const currentLevel = existing?.value ?? 0

      const setMatch = rawArgs.match(/^set\s+(\d+)$/i)
      const adjustMatch = rawArgs.match(/^([+-])(\d+)$/)

      if (setMatch) {
        newLevel = parseInt(setMatch[1], 10)
      } else if (adjustMatch) {
        const delta = parseInt(adjustMatch[2], 10) * (adjustMatch[1] === '+' ? 1 : -1)
        newLevel = currentLevel + delta
      } else {
        return { type: 'error', content: 'Usage: /exhaustion +1, /exhaustion -1, or /exhaustion set 3' }
      }

      newLevel = Math.max(0, Math.min(6, newLevel))

      // Remove existing exhaustion condition
      if (existing) {
        gameState.removeCondition(existing.id)
      }

      if (newLevel > 0) {
        gameState.addCondition({
          id: crypto.randomUUID(),
          entityId: char.id,
          entityName: char.name,
          condition: 'Exhaustion',
          duration: 'permanent',
          source: 'command',
          appliedRound: gameState.round,
          value: newLevel
        })
      }

      if (newLevel >= 6) {
        // 2024 PHB: Exhaustion level 6 = death. Set HP to 0.
        const { saveCharacter } = useCharacterStore.getState()
        const latest = useCharacterStore.getState().characters.find((c) => c.id === char.id)
        if (latest) {
          saveCharacter({
            ...latest,
            hitPoints: { ...latest.hitPoints, current: 0 },
            updatedAt: new Date().toISOString()
          })
        }
        return { type: 'broadcast', content: `${char.name} reaches Exhaustion level 6 — **death**.` }
      }
      if (newLevel === 0) {
        return { type: 'broadcast', content: `${char.name} is no longer exhausted.` }
      }
      return { type: 'broadcast', content: `${char.name} is now at Exhaustion level ${newLevel}/6.` }
    }
  },
  {
    name: 'conccheck',
    aliases: ['concentrationcheck', 'concave'],
    category: 'player',
    dmOnly: false,
    description: 'Roll a concentration saving throw (CON save, DC = max of 10 or half damage taken)',
    usage: '/conccheck <damage taken>',
    execute: (_args, context) => {
      if (!context.character?.id) return { type: 'error', content: 'No active character.' }
      const char = getLatestCharacter(context.character.id)
      if (!char) return { type: 'error', content: 'No active character.' }

      const rawArgs = _args.trim()
      const damage = parseInt(rawArgs, 10)
      if (!rawArgs || Number.isNaN(damage) || damage < 0) {
        return { type: 'error', content: 'Usage: /conccheck <damage taken>' }
      }

      const dc = Math.max(10, Math.floor(damage / 2))
      const conScore = char.abilityScores?.constitution ?? 10
      const conMod = Math.floor((conScore - 10) / 2)
      const profBonus = Math.ceil((char.level ?? 1) / 4) + 1
      const proficiencies = char.proficiencies?.savingThrows ?? []
      const isProf = proficiencies.includes('constitution' as never)
      const totalMod = conMod + (isProf ? profBonus : 0)

      const roll = rollSingle(20)
      const total = roll + totalMod
      const passed = total >= dc
      const tag = roll === 20 ? ' **Natural 20!**' : roll === 1 ? ' *Natural 1!*' : ''

      trigger3dDice({ formula: '1d20', rolls: [roll], total: roll, rollerName: char.name })

      const result = passed ? 'Concentration maintained!' : 'Concentration BROKEN!'
      return {
        type: 'broadcast',
        content: `**${char.name}** Concentration Save (DC ${dc}, ${damage} damage): [${roll}] ${totalMod >= 0 ? '+' : ''}${totalMod} = **${total}**${tag} — ${result}`
      }
    }
  },
  {
    name: 'concentrate',
    aliases: ['conc'],
    category: 'player',
    dmOnly: false,
    description: 'Set or drop concentration on a spell',
    usage: '/concentrate <spell> or /concentrate off',
    execute: (_args, context) => {
      if (!context.character?.id) return { type: 'error', content: 'No active character.' }
      const char = getLatestCharacter(context.character.id)
      if (!char) return { type: 'error', content: 'No active character.' }

      const rawArgs = _args.trim()
      if (!rawArgs) {
        return { type: 'error', content: 'Usage: /concentrate <spell> or /concentrate off' }
      }

      const gameState = useGameStore.getState()

      if (rawArgs.toLowerCase() === 'off' || rawArgs.toLowerCase() === 'drop') {
        const existing = (gameState.conditions ?? []).find(
          (c) => c.entityId === char.id && c.condition.toLowerCase().startsWith('concentrating')
        )
        if (existing) {
          gameState.removeCondition(existing.id)
          return { type: 'broadcast', content: `${char.name} drops concentration.` }
        }
        return { type: 'system', content: 'Not concentrating on anything.' }
      }

      // Drop existing concentration first
      const existing = (gameState.conditions ?? []).find(
        (c) => c.entityId === char.id && c.condition.toLowerCase().startsWith('concentrating')
      )
      if (existing) {
        gameState.removeCondition(existing.id)
      }

      const conditionName = `Concentrating: ${rawArgs}`
      gameState.addCondition({
        id: crypto.randomUUID(),
        entityId: char.id,
        entityName: char.name,
        condition: conditionName,
        duration: 'permanent',
        source: 'command',
        appliedRound: gameState.round
      })

      return { type: 'broadcast', content: `${char.name} is concentrating on **${rawArgs}**.` }
    }
  }
]
