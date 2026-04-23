import { useGameStore } from '../../stores/use-game-store'
import type { ChatCommand } from './types'

// Generate a condition shortcut command for each standard 5e condition
function makeConditionShortcut(conditionName: string, aliases: string[], _description: string): ChatCommand {
  return {
    name: conditionName.toLowerCase(),
    aliases,
    description: `Toggle ${conditionName} condition on a target`,
    usage: `/${conditionName.toLowerCase()} <target> [duration]`,
    dmOnly: false,
    category: 'player',
    execute: (args, ctx) => {
      const parts = args.trim().split(/\s+/)
      const durationStr = parts[parts.length - 1]
      const durationNum = parseInt(durationStr, 10)
      const hasDuration = !Number.isNaN(durationNum) && durationNum > 0
      const target = hasDuration ? parts.slice(0, -1).join(' ') : parts.join(' ')

      if (!target) {
        return { type: 'error', content: `Usage: /${conditionName.toLowerCase()} <target> [rounds]` }
      }

      const gameState = useGameStore.getState()
      // Try to find an existing condition to toggle off
      const existing = gameState.conditions.find(
        (c) => c.condition === conditionName && c.entityName?.toLowerCase() === target.toLowerCase()
      )

      if (existing) {
        gameState.removeCondition(existing.id)
        return {
          type: 'broadcast',
          content: `**${conditionName}** removed from ${target}.`
        }
      }

      const condId = `cond-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
      gameState.addCondition({
        id: condId,
        entityId: target.toLowerCase().replace(/\s+/g, '-'),
        entityName: target,
        condition: conditionName,
        duration: hasDuration ? durationNum : 'permanent',
        source: ctx.playerName,
        appliedRound: gameState.round
      })

      const durText = hasDuration ? ` for ${durationNum} round${durationNum !== 1 ? 's' : ''}` : ''
      return {
        type: 'broadcast',
        content: `**${conditionName}** applied to ${target}${durText} (by ${ctx.playerName}).`
      }
    }
  }
}

export const commands: ChatCommand[] = [
  makeConditionShortcut(
    'Blinded',
    ['blind'],
    'Cannot see; auto-fail sight-based checks; attacks have disadvantage; attacks against have advantage'
  ),
  makeConditionShortcut('Charmed', ['charm'], 'Cannot attack the charmer; charmer has advantage on social checks'),
  makeConditionShortcut('Deafened', ['deaf'], 'Cannot hear; auto-fail hearing-based checks'),
  makeConditionShortcut(
    'Frightened',
    ['fear', 'scared'],
    'Disadvantage on checks/attacks while source is in line of sight; cannot willingly move closer'
  ),
  makeConditionShortcut(
    'Grappled',
    ['grapple-cond'],
    'Speed becomes 0; ends if grappler incapacitated or moved out of reach'
  ),
  makeConditionShortcut('Incapacitated', ['incap'], 'Cannot take actions or reactions'),
  makeConditionShortcut(
    'Invisible',
    ['invis'],
    'Impossible to see without magic; attacks have advantage; attacks against have disadvantage'
  ),
  makeConditionShortcut(
    'Paralyzed',
    ['paralyze'],
    'Incapacitated; auto-fail STR/DEX saves; attacks have advantage; melee hits are auto-crits'
  ),
  makeConditionShortcut(
    'Petrified',
    ['stone'],
    'Turned to stone; incapacitated; resistance to all damage; immune to poison/disease'
  ),
  makeConditionShortcut('Poisoned', ['poison'], 'Disadvantage on attack rolls and ability checks'),
  makeConditionShortcut(
    'Prone',
    [],
    'Disadvantage on attacks; melee attacks against have advantage; ranged attacks against have disadvantage; costs half speed to stand'
  ),
  makeConditionShortcut(
    'Restrained',
    ['restrain'],
    'Speed 0; attacks have disadvantage; attacks against have advantage; disadvantage on DEX saves'
  ),
  makeConditionShortcut('Stunned', ['stun'], 'Incapacitated; auto-fail STR/DEX saves; attacks against have advantage'),
  makeConditionShortcut(
    'Unconscious',
    ['unconscious-cond', 'ko'],
    'Incapacitated; drops held items; falls prone; auto-fail STR/DEX saves; melee auto-crits'
  )
]
