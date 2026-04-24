import { trigger3dDice } from '../../components/game/dice3d'
import { LIGHT_SOURCE_LABELS, LIGHT_SOURCES } from '../../data/light-sources'
import { useGameStore } from '../../stores/use-game-store'
import type { AoETargetResult } from '../combat/aoe-targeting'
import type { AttackOptions, AttackResult } from '../combat/attack-resolver'
import { findWeapon, formatAttackResult, resolveAttack } from '../combat/attack-resolver'
import type { DeathSaveResult, DeathSaveState, GrappleResult, ShoveResult } from '../combat/damage-resolver'
import { rollMultiple } from '../dice/dice-service'
import { findTokenByName, rollD20WithTag } from './helpers'
import type { ChatCommand } from './types'

// Re-export combat types for consumers that access them through the chat-commands barrel
export type {
  AttackOptions,
  AttackResult,
  DeathSaveResult,
  DeathSaveState,
  GrappleResult,
  ShoveResult,
  AoETargetResult
}

const grappleCommand: ChatCommand = {
  name: 'grapple',
  aliases: ['grab'],
  description: 'Attempt to grapple a creature (Athletics vs Athletics/Acrobatics)',
  usage: '/grapple <target>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const target = args.trim() || 'a creature'
    const { roll, tag } = rollD20WithTag()
    trigger3dDice({ formula: '1d20', rolls: [roll], total: roll, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** attempts to grapple ${target} — Athletics check: **${roll}**${tag}`
    }
  }
}

const shoveCommand: ChatCommand = {
  name: 'shove',
  aliases: ['push'],
  description: 'Attempt to shove a creature (Athletics vs Athletics/Acrobatics)',
  usage: '/shove <prone|away> <target>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    const direction = parts[0]?.toLowerCase() === 'away' ? 'away' : 'prone'
    const target = parts.slice(direction === parts[0]?.toLowerCase() ? 1 : 0).join(' ') || 'a creature'
    const { roll, tag } = rollD20WithTag()
    const effect = direction === 'away' ? '5 feet away' : 'Prone'
    trigger3dDice({ formula: '1d20', rolls: [roll], total: roll, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** attempts to shove ${target} (${effect}) — Athletics check: **${roll}**${tag}`
    }
  }
}

const readyactionCommand: ChatCommand = {
  name: 'readyaction',
  aliases: ['ready'],
  description: 'Ready an action with a trigger condition',
  usage: '/readyaction <trigger description>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const trigger = args.trim()
    if (!trigger) {
      return { type: 'error', content: 'Usage: /readyaction <trigger description>' }
    }
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** readies an action: "*${trigger}*"`
    }
  }
}

const delayactionCommand: ChatCommand = {
  name: 'delayaction',
  aliases: ['delay'],
  description: 'Delay your turn until a later point in the round',
  usage: '/delayaction',
  dmOnly: false,
  category: 'player',
  execute: (_args, ctx) => {
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** delays their turn.`
    }
  }
}

const multiattackCommand: ChatCommand = {
  name: 'multiattack',
  aliases: ['ma'],
  description: 'Declare a multiattack sequence',
  usage: '/multiattack <number of attacks>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const count = parseInt(args.trim(), 10)
    if (!count || count < 1 || count > 10) {
      return { type: 'error', content: 'Usage: /multiattack <1-10>' }
    }
    const diceRolls = rollMultiple(count, 20)
    const lines: string[] = []
    for (let i = 0; i < count; i++) {
      const roll = diceRolls[i]
      const tag = roll === 20 ? ' **CRIT!**' : roll === 1 ? ' *miss!*' : ''
      lines.push(`Attack ${i + 1}: **${roll}**${tag}`)
    }
    const total = diceRolls.reduce((s, r) => s + r, 0)
    trigger3dDice({ formula: `${count}d20`, rolls: diceRolls, total, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** Multiattack (${count}):\n${lines.join('\n')}`
    }
  }
}

const reactionCommand: ChatCommand = {
  name: 'reaction',
  aliases: ['rx'],
  description: 'Use or reset your reaction',
  usage: '/reaction <use|reset> [description]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    const sub = parts[0]?.toLowerCase()
    const desc = parts.slice(1).join(' ')
    if (sub === 'use') {
      return {
        type: 'broadcast',
        content: `**${ctx.playerName}** uses their Reaction${desc ? `: ${desc}` : ''}`
      }
    }
    if (sub === 'reset') {
      return {
        type: 'system',
        content: `${ctx.playerName}'s Reaction has been reset.`
      }
    }
    return { type: 'error', content: 'Usage: /reaction <use|reset> [description]' }
  }
}

const useobjCommand: ChatCommand = {
  name: 'useobj',
  aliases: ['interact', 'object'],
  description: 'Use an Object interaction (PHB 2024)',
  usage: '/useobj <description>',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const desc = args.trim() || 'an object'
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** uses their Object interaction: ${desc}`
    }
  }
}

const dashCommand: ChatCommand = {
  name: 'dash',
  aliases: [],
  description: 'Take the Dash action (double movement)',
  usage: '/dash',
  dmOnly: false,
  category: 'player',
  execute: (_args, ctx) => {
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** takes the **Dash** action (double movement this turn).`
    }
  }
}

const disengageCommand: ChatCommand = {
  name: 'disengage',
  aliases: [],
  description: 'Take the Disengage action (no opportunity attacks)',
  usage: '/disengage',
  dmOnly: false,
  category: 'player',
  execute: (_args, ctx) => {
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** takes the **Disengage** action (no opportunity attacks).`
    }
  }
}

const dodgeCommand: ChatCommand = {
  name: 'dodge',
  aliases: [],
  description: 'Take the Dodge action (disadvantage on attacks against you)',
  usage: '/dodge',
  dmOnly: false,
  category: 'player',
  execute: (_args, ctx) => {
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** takes the **Dodge** action (attacks against them have disadvantage, advantage on DEX saves).`
    }
  }
}

const hideCommand: ChatCommand = {
  name: 'hide',
  aliases: ['stealth'],
  description: 'Take the Hide action (Stealth check)',
  usage: '/hide',
  dmOnly: false,
  category: 'player',
  execute: (_args, ctx) => {
    const { roll, tag } = rollD20WithTag()
    trigger3dDice({ formula: '1d20', rolls: [roll], total: roll, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** takes the **Hide** action — Stealth check: **${roll}**${tag}`
    }
  }
}

const searchCommand: ChatCommand = {
  name: 'search',
  aliases: [],
  description: 'Take the Search action (Perception/Investigation check)',
  usage: '/search [perception|investigation]',
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const skill = args.trim().toLowerCase() === 'investigation' ? 'Investigation' : 'Perception'
    const { roll, tag } = rollD20WithTag()
    trigger3dDice({ formula: '1d20', rolls: [roll], total: roll, rollerName: ctx.playerName })
    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** takes the **Search** action — ${skill} check: **${roll}**${tag}`
    }
  }
}

const offhandAttackCommand: ChatCommand = {
  name: 'offhand',
  aliases: ['attackoffhand', 'bonusattack'],
  description: 'Make an off-hand attack (bonus action, no ability modifier to damage unless negative)',
  usage: '/offhand <target> [damage-dice]',
  examples: ['/offhand Goblin 1d6', '/offhand Orc'],
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    const target = parts[0] || 'a creature'
    const damageDice = parts[1] || '1d6'
    const { roll: attackRoll, tag } = rollD20WithTag()
    const isCrit = attackRoll === 20

    let damageTotal = 0
    let damageRolls: number[] = []
    const match = damageDice.match(/^(\d*)d(\d+)/)
    if (match) {
      const count = match[1] ? parseInt(match[1], 10) : 1
      const sides = parseInt(match[2], 10)
      const actualCount = isCrit ? count * 2 : count
      damageRolls = rollMultiple(actualCount, sides)
      damageTotal = damageRolls.reduce((s, r) => s + r, 0)
    }

    // Trigger 3D dice for the attack roll
    trigger3dDice({ formula: '1d20', rolls: [attackRoll], total: attackRoll, rollerName: ctx.playerName })
    // Trigger 3D dice for damage if applicable
    if (damageRolls.length > 0) {
      trigger3dDice({
        formula: `${damageRolls.length}d${match![2]}`,
        rolls: damageRolls,
        total: damageTotal,
        rollerName: ctx.playerName
      })
    }

    ctx.broadcastSystemMessage(
      `${ctx.playerName} makes an off-hand attack against ${target}!${tag} Attack: [${attackRoll}]` +
        (damageTotal > 0 ? ` | Damage: ${damageTotal} (no ability modifier)` : '')
    )
    return { handled: true }
  }
}

const unarmedAttackCommand: ChatCommand = {
  name: 'unarmed',
  aliases: ['attackunarmed', 'punch'],
  description: 'Make an unarmed strike (1 + STR modifier bludgeoning damage)',
  usage: '/unarmed <target>',
  examples: ['/unarmed Goblin', '/punch Thug'],
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    const target = args.trim() || 'a creature'
    const { roll: attackRoll, tag } = rollD20WithTag()
    const isCrit = attackRoll === 20
    const strMod = ctx.character ? Math.floor((ctx.character.abilityScores.strength - 10) / 2) : 0
    const damage = Math.max(1, 1 + strMod) * (isCrit ? 2 : 1)

    trigger3dDice({ formula: '1d20', rolls: [attackRoll], total: attackRoll, rollerName: ctx.playerName })

    ctx.broadcastSystemMessage(
      `${ctx.playerName} makes an unarmed strike against ${target}!${tag} Attack: [${attackRoll}] | Damage: ${damage} bludgeoning`
    )
    return { handled: true }
  }
}

const aoeDamageCommand: ChatCommand = {
  name: 'aoedamage',
  aliases: ['damageaoe', 'aoe'],
  description: 'Apply damage to multiple targets (AoE)',
  usage: '/aoedamage <formula> <type> <target1> <target2> ...',
  examples: ['/aoedamage 8d6 fire Goblin1 Goblin2 Orc', '/aoe 3d8 thunder all'],
  dmOnly: true,
  category: 'dm',
  execute: (args, ctx) => {
    const parts = args.trim().split(/\s+/)
    if (parts.length < 3) {
      return { handled: false, error: 'Usage: /aoedamage <formula> <type> <target1> [target2] ...' }
    }
    const formulaStr = parts[0]
    const damageType = parts[1]
    const targets = parts.slice(2)

    const match = formulaStr.match(/^(\d*)d(\d+)([+-]\d+)?$/)
    if (!match) {
      return { handled: false, error: `Invalid dice formula: ${formulaStr}` }
    }
    const count = match[1] ? parseInt(match[1], 10) : 1
    const sides = parseInt(match[2], 10)
    const modifier = match[3] ? parseInt(match[3], 10) : 0

    const rolls = rollMultiple(count, sides)
    const total = rolls.reduce((s, r) => s + r, 0) + modifier

    trigger3dDice({ formula: formulaStr, rolls, total, rollerName: ctx.playerName })

    const targetList = targets.join(', ')
    ctx.broadcastSystemMessage(
      `AoE Damage! ${ctx.playerName} deals ${total} ${damageType} damage [${rolls.join(', ')}${modifier ? (modifier > 0 ? '+' : '') + modifier : ''}] to: ${targetList}`
    )
    return { handled: true }
  }
}

const attackCommand: ChatCommand = {
  name: 'attack',
  aliases: ['atk'],
  description: 'Make a weapon attack against a target (full attack pipeline)',
  usage: '/attack <weapon> <target>',
  examples: ['/attack longsword Goblin', '/atk shortbow Orc'],
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    if (!ctx.character) {
      return { type: 'error', content: 'No character loaded. Select a character first.' }
    }

    const parts = args.trim().split(/\s+/)
    if (parts.length < 2) {
      return { type: 'error', content: 'Usage: /attack <weapon> <target>' }
    }

    // Last word(s) = target name, first word(s) = weapon name
    // Try splitting: first token is weapon, rest is target
    const weaponSearch = parts[0]
    const targetSearch = parts.slice(1).join(' ')

    const weapon = findWeapon(ctx.character.weapons, weaponSearch)
    if (!weapon) {
      const available = ctx.character.weapons.map((w) => w.name).join(', ')
      return {
        type: 'error',
        content: `Weapon "${weaponSearch}" not found. Available: ${available || 'none'}`
      }
    }

    const targetToken = findTokenByName(targetSearch)
    if (!targetToken) {
      return { type: 'error', content: `Target "${targetSearch}" not found on the map.` }
    }

    // Find attacker token
    const { maps, activeMapId } = useGameStore.getState()
    const activeMap = maps.find((m) => m.id === activeMapId)
    const attackerToken = activeMap?.tokens.find((t) => t.entityId === ctx.character!.id)
    if (!attackerToken) {
      return { type: 'error', content: 'Your token is not on the map.' }
    }

    const result = resolveAttack(ctx.character, weapon, attackerToken, targetToken)

    if (result.rangeCategory === 'out-of-range') {
      return {
        type: 'error',
        content: `${targetToken.label} is out of range for ${weapon.name}.`
      }
    }

    // Trigger 3D dice for attack roll
    trigger3dDice({
      formula: '1d20',
      rolls: [result.attackRoll],
      total: result.attackTotal,
      rollerName: ctx.playerName
    })

    // Trigger 3D dice for damage if hit
    if (result.isHit && result.damageRolls.length > 0) {
      trigger3dDice({
        formula: `${result.damageRolls.length}d${weapon.damage.match(/d(\d+)/)?.[1] ?? '6'}`,
        rolls: result.damageRolls,
        total: result.damageTotal,
        rollerName: ctx.playerName
      })
    }

    const message = formatAttackResult(result)
    ctx.broadcastSystemMessage(message)
    return { handled: true }
  }
}

const torchCommand: ChatCommand = {
  name: 'torch',
  aliases: ['light', 'lantern', 'lamp'],
  description: 'Toggle a personal light source on your token',
  usage: '/torch [source|off]',
  examples: ['/torch', '/light lantern', '/light off', '/lamp'],
  dmOnly: false,
  category: 'player',
  execute: (args, ctx) => {
    if (!ctx.character) {
      return { type: 'error', content: 'No character loaded. Select a character first.' }
    }

    const gameState = useGameStore.getState()
    const activeMap = gameState.maps.find((m) => m.id === gameState.activeMapId)
    const token = activeMap?.tokens.find((t) => t.entityId === ctx.character!.id)

    if (!token) {
      return { type: 'error', content: 'Your token is not on the map.' }
    }

    const trimmed = args.trim().toLowerCase()

    // Handle extinguish
    if (trimmed === 'off' || trimmed === 'extinguish' || trimmed === 'out') {
      const existing = gameState.activeLightSources.find(
        (ls) => ls.entityId === token.entityId || ls.entityId === token.id
      )
      if (existing) {
        gameState.extinguishSource(existing.id)
        return {
          type: 'broadcast',
          content: `**${ctx.playerName}** extinguishes their ${existing.sourceName}.`
        }
      }
      return { type: 'system', content: 'No active light source to extinguish.' }
    }

    // Determine which light source to use
    let sourceKey = 'torch' // Default

    if (trimmed) {
      // Fuzzy match against light source keys and labels
      const lower = trimmed
      const matchByKey = Object.keys(LIGHT_SOURCES).find(
        (k) => k.includes(lower) || lower.includes(k.replace(/-/g, ' '))
      )
      const matchByLabel = Object.entries(LIGHT_SOURCE_LABELS).find(([, label]) => label.toLowerCase().includes(lower))

      if (matchByKey) {
        sourceKey = matchByKey
      } else if (matchByLabel) {
        sourceKey = matchByLabel[0]
      } else {
        const available = Object.values(LIGHT_SOURCE_LABELS).join(', ')
        return {
          type: 'error',
          content: `Unknown light source "${trimmed}". Available: ${available}`
        }
      }
    }

    const sourceDef = LIGHT_SOURCES[sourceKey]
    const sourceLabel = LIGHT_SOURCE_LABELS[sourceKey] ?? sourceKey

    // Extinguish any existing light on this token first
    const existing = gameState.activeLightSources.find(
      (ls) => ls.entityId === token.entityId || ls.entityId === token.id
    )
    if (existing) {
      gameState.extinguishSource(existing.id)
    }

    // Attach the new light source
    const entityId = token.entityId ?? token.id
    gameState.lightSource(entityId, token.label, sourceKey, sourceDef.durationSeconds)

    const durationStr =
      sourceDef.durationSeconds === Infinity
        ? 'indefinitely'
        : `for ${Math.floor(sourceDef.durationSeconds / 60)} minutes`

    return {
      type: 'broadcast',
      content: `**${ctx.playerName}** lights a **${sourceLabel}** (bright ${sourceDef.brightRadius} ft, dim ${sourceDef.dimRadius} ft, ${durationStr}).`
    }
  }
}

export const commands: ChatCommand[] = [
  grappleCommand,
  shoveCommand,
  readyactionCommand,
  delayactionCommand,
  multiattackCommand,
  reactionCommand,
  useobjCommand,
  dashCommand,
  disengageCommand,
  dodgeCommand,
  hideCommand,
  searchCommand,
  offhandAttackCommand,
  unarmedAttackCommand,
  aoeDamageCommand,
  attackCommand,
  torchCommand
]
