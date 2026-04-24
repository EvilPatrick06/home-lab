import type { Macro } from '../stores/use-macro-store'
import type { Character5e } from '../types/character-5e'
import { abilityModifier, formatMod } from '../types/character-common'
import type { CommandContext } from './chat-commands/index'
import { executeCommand } from './chat-commands/index'

/**
 * Resolve $variable tokens in a macro command string.
 *
 * Supported variables:
 *   $self / $name  → character name
 *   $target        → currently selected token label
 *   $mod.str/dex/con/int/wis/cha → ability modifier (signed, e.g. "+3")
 *   $prof          → proficiency bonus (signed)
 *   $level         → character level
 */
export function resolveMacroVariables(command: string, character: Character5e | null, targetLabel?: string): string {
  if (!command.includes('$')) return command

  return command.replace(/\$(\w+(?:\.\w+)?)/g, (_match, varName: string) => {
    // Ability modifiers: $mod.str, $mod.dex, etc.
    if (varName.startsWith('mod.')) {
      if (!character) return _match
      const shortAbility = varName.slice(4).toLowerCase()
      const abilityMap: Record<string, keyof Character5e['abilityScores']> = {
        str: 'strength',
        dex: 'dexterity',
        con: 'constitution',
        int: 'intelligence',
        wis: 'wisdom',
        cha: 'charisma'
      }
      const fullName = abilityMap[shortAbility]
      if (!fullName) return _match
      const score = character.abilityScores[fullName]
      if (score === undefined) return _match
      const mod = abilityModifier(score)
      return formatMod(mod)
    }

    switch (varName) {
      case 'self':
      case 'name':
        return character?.name ?? _match

      case 'target':
        return targetLabel ?? _match

      case 'prof': {
        if (!character) return _match
        const pb = character.level <= 20 ? Math.ceil(character.level / 4) + 1 : Math.ceil((character.level - 1) / 4) + 1
        return formatMod(pb)
      }

      case 'level':
        return character ? String(character.level) : _match

      default:
        return _match
    }
  })
}

/** Simple check if a string looks like a dice formula (e.g., "2d6+3", "1d20-1") */
function isDiceFormula(s: string): boolean {
  return /^\d*d\d+([+-]\d+)?$/i.test(s.trim())
}

/**
 * Execute a macro: resolve variables, then dispatch as command, dice roll, or chat message.
 */
export function executeMacro(
  macro: Macro,
  ctx: CommandContext,
  character: Character5e | null,
  targetLabel?: string
): void {
  const resolved = resolveMacroVariables(macro.command, character, targetLabel)

  if (resolved.startsWith('/')) {
    // It's a slash command
    executeCommand(resolved, ctx)
  } else if (isDiceFormula(resolved)) {
    // Auto-wrap bare dice formulas as /roll
    executeCommand(`/roll ${resolved}`, ctx)
  } else {
    // Plain text — send as system message
    ctx.addSystemMessage(`[Macro: ${macro.name}] ${resolved}`)
  }
}
