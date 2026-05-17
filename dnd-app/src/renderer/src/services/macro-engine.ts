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
 * Phase 16D — expand `{repeat N}BODY{/repeat}` blocks into N newline-joined
 * copies of BODY, so each iteration becomes its own macro line. Useful for
 * Extra Attack, Scorching Ray, Magic Missile, etc.
 *
 * Non-greedy match so nested expansions in BODY are left for the next pass.
 * Cap N at 20 to keep typo'd macros (`{repeat 999999}`) from runaway.
 *
 * Returns the expanded string; if no repeat blocks are present, returns
 * the input unchanged.
 */
export function expandRepeatBlocks(command: string): string {
  const re = /\{repeat\s+(\d+)\}([\s\S]*?)\{\/repeat\}/g
  return command.replace(re, (_match, countStr: string, body: string) => {
    const n = Math.max(1, Math.min(20, parseInt(countStr, 10)))
    const lines: string[] = []
    for (let i = 0; i < n; i++) lines.push(body)
    return lines.join('\n')
  })
}

/**
 * Execute a macro: expand repeat blocks, resolve variables, then dispatch
 * each non-empty line as its own command / dice roll / chat message.
 */
export function executeMacro(
  macro: Macro,
  ctx: CommandContext,
  character: Character5e | null,
  targetLabel?: string
): void {
  const expanded = expandRepeatBlocks(macro.command)
  const resolved = resolveMacroVariables(expanded, character, targetLabel)

  // Phase 16D — Multi-line execution. A macro can now produce multiple
  // independent outputs (one per iteration of a repeat block, or one per
  // hand-authored newline). Each line is dispatched independently.
  const lines = resolved
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  for (const line of lines) {
    if (line.startsWith('/')) {
      executeCommand(line, ctx)
    } else if (isDiceFormula(line)) {
      executeCommand(`/roll ${line}`, ctx)
    } else {
      ctx.addSystemMessage(`[Macro: ${macro.name}] ${line}`)
    }
  }
}
