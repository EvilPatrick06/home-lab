import { play as playSound } from '../../services/sound-manager'
import { useCharacterStore } from '../../stores/use-character-store'
import { useGameStore } from '../../stores/use-game-store'
import { is5eCharacter } from '../../types/character'
import type { Character5e } from '../../types/character-5e'
import type { MapToken } from '../../types/map'
import { getLatestCharacter, saveAndBroadcastCharacter } from './helpers'
import type { ChatCommand, CommandContext } from './types'

function resolveTarget(
  args: string,
  ctx: CommandContext
): { target: Character5e; remaining: string } | { error: string } {
  const parts = args.trim().split(/\s+/)

  // DM can target by name: /hp <targetName> <op> <value>
  if (ctx.isDM && parts.length >= 3) {
    const potentialName = parts[0].toLowerCase()
    const characters = useCharacterStore.getState().characters
    const match = characters.find((c) => is5eCharacter(c) && c.name.toLowerCase() === potentialName)
    if (match && is5eCharacter(match)) {
      const latest = getLatestCharacter(match.id)
      if (latest && is5eCharacter(latest)) {
        return { target: latest, remaining: parts.slice(1).join(' ') }
      }
      return { target: match as Character5e, remaining: parts.slice(1).join(' ') }
    }
  }

  // Player targets themselves
  if (!ctx.character?.id) {
    return { error: 'No character selected. Select a character first.' }
  }

  const char = getLatestCharacter(ctx.character?.id)
  if (!char || !is5eCharacter(char)) {
    return { error: 'Could not find your character.' }
  }

  return { target: char, remaining: args.trim() }
}

function applyHpChange(
  target: Character5e,
  op: string,
  value: number,
  ctx: CommandContext
): { handled: boolean; error?: string } {
  const maxHp = target.hitPoints.maximum
  const currentHp = target.hitPoints.current
  const tempHp = target.hitPoints.temporary

  let newHp = currentHp
  let newTempHp = tempHp

  if (op === '+') {
    // Healing: cannot exceed max HP
    newHp = Math.min(currentHp + value, maxHp)
    const healed = newHp - currentHp
    ctx.addSystemMessage(`${target.name} healed ${healed} HP (${currentHp} → ${newHp}/${maxHp})`)
    if (healed > 0) playSound('heal')
  } else if (op === '-') {
    // Damage: temp HP absorbs first
    let remaining = value
    if (newTempHp > 0) {
      const absorbed = Math.min(newTempHp, remaining)
      newTempHp -= absorbed
      remaining -= absorbed
      if (absorbed > 0) {
        ctx.addSystemMessage(
          `${target.name}: ${absorbed} damage absorbed by temp HP (temp HP: ${tempHp} → ${newTempHp})`
        )
      }
    }
    newHp = Math.max(currentHp - remaining, 0)
    ctx.addSystemMessage(
      `${target.name} took ${value} damage (${currentHp} → ${newHp}/${maxHp}${tempHp > 0 ? `, temp HP: ${tempHp} → ${newTempHp}` : ''})`
    )
    playSound('damage')
    if (newHp === 0) playSound('death')
  } else if (op === 'set' || op === '=') {
    // Set to exact value
    newHp = Math.max(0, Math.min(value, maxHp))
    ctx.addSystemMessage(`${target.name} HP set to ${newHp}/${maxHp}`)
  } else {
    return { handled: false, error: `Unknown operator: ${op}. Use +, -, or set.` }
  }

  const updatedChar: Character5e = {
    ...target,
    hitPoints: { maximum: maxHp, current: newHp, temporary: newTempHp }
  }

  saveAndBroadcastCharacter(updatedChar)

  // Also update game store tokens if in-game
  const gameState = useGameStore.getState()
  const activeMap = gameState.maps.find((m) => m.id === gameState.activeMapId)
  const token = activeMap?.tokens.find((t: MapToken) => t.entityId === target.id)
  if (token && activeMap) {
    useGameStore.getState().updateToken(activeMap.id, token.id, {
      currentHP: newHp,
      maxHP: maxHp
    })
  }

  return { handled: true }
}

function parseOpAndValue(input: string): { op: string; value: number } | null {
  const trimmed = input.trim()

  // Handle "set N" or "= N"
  const setMatch = trimmed.match(/^(?:set|=)\s*(\d+)$/i)
  if (setMatch) {
    return { op: 'set', value: parseInt(setMatch[1], 10) }
  }

  // Handle "+N" or "- N"
  const modMatch = trimmed.match(/^([+-])\s*(\d+)$/)
  if (modMatch) {
    return { op: modMatch[1], value: parseInt(modMatch[2], 10) }
  }

  // Handle bare number as set
  const bareMatch = trimmed.match(/^(\d+)$/)
  if (bareMatch) {
    return { op: 'set', value: parseInt(bareMatch[1], 10) }
  }

  return null
}

export const commands: ChatCommand[] = [
  // /hp - Adjust HP
  {
    name: 'hp',
    aliases: [],
    description: 'Adjust hit points. DM can target a character by name.',
    usage: '/hp [target] <+/-/set> <amount>',
    examples: ['/hp +5', '/hp -10', '/hp set 30', '/hp Thorin -8', '/hp = 25'],
    category: 'player',
    dmOnly: false,
    execute: (args: string, ctx: CommandContext) => {
      if (!args.trim()) {
        return { handled: false, error: 'Usage: /hp [target] <+/-/set> <amount>  e.g. /hp +5, /hp -10, /hp set 30' }
      }

      const resolved = resolveTarget(args, ctx)
      if ('error' in resolved) {
        return { handled: false, error: resolved.error }
      }

      const parsed = parseOpAndValue(resolved.remaining)
      if (!parsed) {
        return {
          handled: false,
          error: `Could not parse HP change: "${resolved.remaining}". Use +N, -N, or set N.`
        }
      }

      return applyHpChange(resolved.target, parsed.op, parsed.value, ctx)
    }
  },

  // /heal - Heal HP (shorthand for /hp +N)
  {
    name: 'heal',
    aliases: [],
    description: 'Heal hit points (shorthand for /hp +N)',
    usage: '/heal [target] <amount>',
    examples: ['/heal 10', '/heal Thorin 15'],
    category: 'player',
    dmOnly: false,
    execute: (args: string, ctx: CommandContext) => {
      if (!args.trim()) {
        return { handled: false, error: 'Usage: /heal [target] <amount>  e.g. /heal 10' }
      }

      const parts = args.trim().split(/\s+/)

      // Check if DM is targeting someone: /heal <name> <amount>
      if (ctx.isDM && parts.length >= 2) {
        const potentialName = parts[0].toLowerCase()
        const characters = useCharacterStore.getState().characters
        const match = characters.find((c) => is5eCharacter(c) && c.name.toLowerCase() === potentialName)
        if (match && is5eCharacter(match)) {
          const value = parseInt(parts[1], 10)
          if (Number.isNaN(value) || value < 0) {
            return { handled: false, error: `Invalid heal amount: ${parts[1]}` }
          }
          const latest = getLatestCharacter(match.id) as Character5e | null
          return applyHpChange(latest ?? (match as Character5e), '+', value, ctx)
        }
      }

      // Player heals themselves
      const value = parseInt(parts[parts.length - 1], 10)
      if (Number.isNaN(value) || value < 0) {
        return { handled: false, error: `Invalid heal amount: ${parts[parts.length - 1]}` }
      }

      if (!ctx.character?.id) {
        return { handled: false, error: 'No character selected. Select a character first.' }
      }

      const char = getLatestCharacter(ctx.character?.id)
      if (!char || !is5eCharacter(char)) {
        return { handled: false, error: 'Could not find your character.' }
      }

      return applyHpChange(char, '+', value, ctx)
    }
  },

  // /damage - Take damage (shorthand for /hp -N)
  {
    name: 'damage',
    aliases: ['dmg'],
    description: 'Take damage (shorthand for /hp -N). Temp HP absorbs damage first.',
    usage: '/damage [target] <amount>',
    examples: ['/damage 10', '/dmg Thorin 8'],
    category: 'player',
    dmOnly: false,
    execute: (args: string, ctx: CommandContext) => {
      if (!args.trim()) {
        return { handled: false, error: 'Usage: /damage [target] <amount>  e.g. /damage 10' }
      }

      const parts = args.trim().split(/\s+/)

      // Check if DM is targeting someone: /damage <name> <amount>
      if (ctx.isDM && parts.length >= 2) {
        const potentialName = parts[0].toLowerCase()
        const characters = useCharacterStore.getState().characters
        const match = characters.find((c) => is5eCharacter(c) && c.name.toLowerCase() === potentialName)
        if (match && is5eCharacter(match)) {
          const value = parseInt(parts[1], 10)
          if (Number.isNaN(value) || value < 0) {
            return { handled: false, error: `Invalid damage amount: ${parts[1]}` }
          }
          const latest = getLatestCharacter(match.id) as Character5e | null
          return applyHpChange(latest ?? (match as Character5e), '-', value, ctx)
        }
      }

      // Player damages themselves
      const value = parseInt(parts[parts.length - 1], 10)
      if (Number.isNaN(value) || value < 0) {
        return { handled: false, error: `Invalid damage amount: ${parts[parts.length - 1]}` }
      }

      if (!ctx.character?.id) {
        return { handled: false, error: 'No character selected. Select a character first.' }
      }

      const char = getLatestCharacter(ctx.character?.id)
      if (!char || !is5eCharacter(char)) {
        return { handled: false, error: 'Could not find your character.' }
      }

      return applyHpChange(char, '-', value, ctx)
    }
  },

  // /hphalf - Halve current HP (for half damage on saves)
  {
    name: 'hphalf',
    aliases: ['halfhp', 'halfdamage'],
    description: "Halve a character's current HP (e.g., after a successful save for half damage)",
    usage: '/hphalf [target]',
    examples: ['/hphalf', '/hphalf Thorin'],
    category: 'player',
    dmOnly: false,
    execute: (args: string, ctx: CommandContext) => {
      const resolved = resolveTarget(args || '', ctx)
      if ('error' in resolved) {
        return { handled: false, error: resolved.error }
      }

      const { target } = resolved
      const currentHp = target.hitPoints.current
      const halved = Math.floor(currentHp / 2)

      return applyHpChange(target, 'set', halved, ctx)
    }
  },

  // /temphp - Set temporary HP
  {
    name: 'temphp',
    aliases: ['thp'],
    description: 'Set temporary hit points. Temp HP does not stack; uses the higher value.',
    usage: '/temphp [target] <amount>',
    examples: ['/temphp 10', '/thp 15', '/temphp Thorin 8'],
    category: 'player',
    dmOnly: false,
    execute: (args: string, ctx: CommandContext) => {
      if (!args.trim()) {
        return { handled: false, error: 'Usage: /temphp <amount>  e.g. /temphp 10' }
      }

      const parts = args.trim().split(/\s+/)
      let target: Character5e | null = null

      // Check if DM is targeting someone: /temphp <name> <amount>
      if (ctx.isDM && parts.length >= 2) {
        const potentialName = parts[0].toLowerCase()
        const characters = useCharacterStore.getState().characters
        const match = characters.find((c) => is5eCharacter(c) && c.name.toLowerCase() === potentialName)
        if (match && is5eCharacter(match)) {
          const latest = getLatestCharacter(match.id)
          target = (latest && is5eCharacter(latest) ? latest : match) as Character5e
          const value = parseInt(parts[1], 10)
          if (Number.isNaN(value) || value < 0) {
            return { handled: false, error: `Invalid temp HP amount: ${parts[1]}` }
          }

          const currentTemp = target.hitPoints.temporary
          // Temp HP does not stack - use the higher value
          const newTemp = Math.max(currentTemp, value)

          const updatedChar: Character5e = {
            ...target,
            hitPoints: { maximum: target.hitPoints.maximum, current: target.hitPoints.current, temporary: newTemp }
          }

          saveAndBroadcastCharacter(updatedChar)
          ctx.addSystemMessage(`${target.name} gained ${value} temp HP (${currentTemp} → ${newTemp})`)
          return { handled: true }
        }
      }

      // Player sets their own temp HP
      const value = parseInt(parts[parts.length - 1], 10)
      if (Number.isNaN(value) || value < 0) {
        return { handled: false, error: `Invalid temp HP amount: ${parts[parts.length - 1]}` }
      }

      if (!ctx.character?.id) {
        return { handled: false, error: 'No character selected. Select a character first.' }
      }

      const char = getLatestCharacter(ctx.character?.id)
      if (!char || !is5eCharacter(char)) {
        return { handled: false, error: 'Could not find your character.' }
      }

      const currentTemp = char.hitPoints.temporary
      // Temp HP does not stack - use the higher value
      const newTemp = Math.max(currentTemp, value)

      const updatedChar: Character5e = {
        ...char,
        hitPoints: { maximum: char.hitPoints.maximum, current: char.hitPoints.current, temporary: newTemp }
      }

      saveAndBroadcastCharacter(updatedChar)
      ctx.addSystemMessage(`${char.name} gained ${value} temp HP (${currentTemp} → ${newTemp})`)

      return { handled: true }
    }
  },

  // /halve - Halve current HP (for resistance, etc.)
  {
    name: 'halve',
    aliases: ['half', 'resist'],
    description: 'Halve a damage amount (resistance) and apply to a character',
    usage: '/halve [target] <damage>',
    examples: ['/halve 20', '/half Thorin 14'],
    category: 'player',
    dmOnly: false,
    execute: (args: string, ctx: CommandContext) => {
      if (!args.trim()) {
        return { handled: false, error: 'Usage: /halve [target] <damage>' }
      }

      const parts = args.trim().split(/\s+/)

      // Check if DM is targeting someone
      if (ctx.isDM && parts.length >= 2) {
        const potentialName = parts[0].toLowerCase()
        const characters = useCharacterStore.getState().characters
        const match = characters.find((c) => is5eCharacter(c) && c.name.toLowerCase() === potentialName)
        if (match && is5eCharacter(match)) {
          const dmgRaw = parseInt(parts[1], 10)
          if (Number.isNaN(dmgRaw) || dmgRaw < 0) {
            return { handled: false, error: `Invalid damage amount: ${parts[1]}` }
          }
          const halved = Math.floor(dmgRaw / 2)
          const latest = getLatestCharacter(match.id) as Character5e | null
          ctx.addSystemMessage(`${match.name}: ${dmgRaw} damage halved (resistance) → ${halved}`)
          return applyHpChange(latest ?? (match as Character5e), '-', halved, ctx)
        }
      }

      // Player applies to themselves
      const dmgRaw = parseInt(parts[parts.length - 1], 10)
      if (Number.isNaN(dmgRaw) || dmgRaw < 0) {
        return { handled: false, error: `Invalid damage amount: ${parts[parts.length - 1]}` }
      }

      if (!ctx.character?.id) {
        return { handled: false, error: 'No character selected. Select a character first.' }
      }

      const char = getLatestCharacter(ctx.character?.id)
      if (!char || !is5eCharacter(char)) {
        return { handled: false, error: 'Could not find your character.' }
      }

      const halved = Math.floor(dmgRaw / 2)
      ctx.addSystemMessage(`${char.name}: ${dmgRaw} damage halved (resistance) → ${halved}`)
      return applyHpChange(char, '-', halved, ctx)
    }
  }
]
