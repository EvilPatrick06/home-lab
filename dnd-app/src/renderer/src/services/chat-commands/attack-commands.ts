import { trigger3dDice } from '../../components/game/dice3d'
import { LIGHT_SOURCE_LABELS, LIGHT_SOURCES } from '../../data/light-sources'
import { useGameStore } from '../../stores/use-game-store'
import { formatAttackResult } from '../combat/attack-formatter'
import { findWeapon, resolveAttack } from '../combat/attack-resolver'
import { rollMultiple } from '../dice/dice-service'
import { findTokenByName, rollD20WithTag } from './helpers'
import type { ChatCommand } from './types'

export const offhandAttackCommand: ChatCommand = {
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

    trigger3dDice({ formula: '1d20', rolls: [attackRoll], total: attackRoll, rollerName: ctx.playerName })

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

export const unarmedAttackCommand: ChatCommand = {
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

export const aoeDamageCommand: ChatCommand = {
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

export const attackCommand: ChatCommand = {
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

    trigger3dDice({
      formula: '1d20',
      rolls: [result.attackRoll],
      total: result.attackTotal,
      rollerName: ctx.playerName
    })

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

export const torchCommand: ChatCommand = {
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

    let sourceKey = 'torch'

    if (trimmed) {
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

    const existing = gameState.activeLightSources.find(
      (ls) => ls.entityId === token.entityId || ls.entityId === token.id
    )
    if (existing) {
      gameState.extinguishSource(existing.id)
    }

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
