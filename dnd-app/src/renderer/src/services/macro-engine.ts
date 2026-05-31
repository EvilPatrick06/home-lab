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

    // Numeric self stats: $self.hp, $self.maxhp (Phase 16D — also used by {if} conditionals).
    if (varName === 'self.hp') return character ? String(character.hitPoints.current) : _match
    if (varName === 'self.maxhp') return character ? String(character.hitPoints.maximum) : _match

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

/** Thrown by the conditional parser on malformed `{if}` syntax; surfaced as a chat error. */
class MacroSyntaxError extends Error {}

const ABILITY_MAP: Record<string, keyof Character5e['abilityScores']> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma'
}

/** Resolve a single numeric macro variable for use inside `{if}` conditions. Returns null if unknown. */
function resolveNumericVar(name: string, character: Character5e | null): number | null {
  if (!character) return null
  switch (name) {
    case 'self.hp':
      return character.hitPoints.current
    case 'self.maxhp':
      return character.hitPoints.maximum
    case 'level':
      return character.level
    case 'prof':
      return character.level <= 20 ? Math.ceil(character.level / 4) + 1 : Math.ceil((character.level - 1) / 4) + 1
    default:
      if (name.startsWith('mod.')) {
        const full = ABILITY_MAP[name.slice(4).toLowerCase()]
        if (!full) return null
        return abilityModifier(character.abilityScores[full])
      }
      return null
  }
}

/**
 * Phase 16D — hand-rolled (NO eval) arithmetic + comparison evaluator for `{if}` conditions.
 * Recursive descent over `+ - * /` with precedence and unary minus, on numbers + the numeric
 * variable allowlist ($self.hp, $self.maxhp, $mod.*, $prof, $level). Throws MacroSyntaxError.
 */
function evalArithmetic(tokens: string[], pos: { i: number }): number {
  // expr := term (('+'|'-') term)*
  let value = evalTerm(tokens, pos)
  while (pos.i < tokens.length && (tokens[pos.i] === '+' || tokens[pos.i] === '-')) {
    const op = tokens[pos.i++]
    const rhs = evalTerm(tokens, pos)
    value = op === '+' ? value + rhs : value - rhs
  }
  return value
}
function evalTerm(tokens: string[], pos: { i: number }): number {
  // term := factor (('*'|'/') factor)*
  let value = evalFactor(tokens, pos)
  while (pos.i < tokens.length && (tokens[pos.i] === '*' || tokens[pos.i] === '/')) {
    const op = tokens[pos.i++]
    const rhs = evalFactor(tokens, pos)
    if (op === '/') {
      if (rhs === 0) throw new MacroSyntaxError('division by zero')
      value = value / rhs
    } else {
      value = value * rhs
    }
  }
  return value
}
function evalFactor(tokens: string[], pos: { i: number }): number {
  // factor := '-' factor | number
  if (tokens[pos.i] === '-') {
    pos.i++
    return -evalFactor(tokens, pos)
  }
  const tok = tokens[pos.i++]
  const n = Number(tok)
  if (tok === undefined || Number.isNaN(n)) throw new MacroSyntaxError(`expected number, got "${tok ?? 'end'}"`)
  return n
}
function evalExpression(expr: string): number {
  const tokens = expr.match(/\d+\.?\d*|[+\-*/]/g)
  if (!tokens || tokens.length === 0) throw new MacroSyntaxError(`empty expression "${expr}"`)
  const pos = { i: 0 }
  const value = evalArithmetic(tokens, pos)
  if (pos.i !== tokens.length) throw new MacroSyntaxError(`unexpected token "${tokens[pos.i]}"`)
  return value
}

const COMPARATORS: Array<[string, (a: number, b: number) => boolean]> = [
  ['<=', (a, b) => a <= b],
  ['>=', (a, b) => a >= b],
  ['==', (a, b) => a === b],
  ['!=', (a, b) => a !== b],
  ['<', (a, b) => a < b],
  ['>', (a, b) => a > b]
]

/** Evaluate a single `{if}` condition string (already variable-substituted to numbers). */
function evalCondition(cond: string): boolean {
  for (const [op, fn] of COMPARATORS) {
    const idx = cond.indexOf(op)
    if (idx !== -1) {
      const lhs = evalExpression(cond.slice(0, idx))
      const rhs = evalExpression(cond.slice(idx + op.length))
      return fn(lhs, rhs)
    }
  }
  throw new MacroSyntaxError(`no comparison operator in "${cond.trim()}"`)
}

/**
 * Phase 16D — expand `{if COND}TRUE{else}FALSE{/if}` blocks. Runs AFTER repeat expansion and
 * BEFORE variable resolution. COND's numeric variables are substituted first, then a hand-rolled
 * evaluator (no eval) decides the branch. Throws MacroSyntaxError on malformed input so the
 * caller can surface a clear chat error instead of crashing.
 */
export function expandConditionalBlocks(command: string, character: Character5e | null): string {
  if (!command.includes('{if')) return command
  const re = /\{if\s+([^}]+)\}([\s\S]*?)(?:\{else\}([\s\S]*?))?\{\/if\}/g
  return command.replace(re, (_m, cond: string, truthy: string, falsy?: string) => {
    // Substitute numeric vars in the condition only.
    const resolved = cond.replace(/\$(\w+(?:\.\w+)?)/g, (_m, name: string) => {
      const v = resolveNumericVar(name, character)
      if (v === null) throw new MacroSyntaxError(`unknown variable "$${name}"`)
      return String(v)
    })
    return evalCondition(resolved) ? truthy : (falsy ?? '')
  })
}

/**
 * Execute a macro: expand repeat blocks, expand conditionals, resolve variables, then dispatch
 * each non-empty line as its own command / dice roll / chat message.
 */
export function executeMacro(
  macro: Macro,
  ctx: CommandContext,
  character: Character5e | null,
  targetLabel?: string
): void {
  const expanded = expandRepeatBlocks(macro.command)
  let conditional: string
  try {
    conditional = expandConditionalBlocks(expanded, character)
  } catch (err) {
    const detail = err instanceof MacroSyntaxError ? `: ${err.message}` : ''
    ctx.addSystemMessage(`[Macro: ${macro.name}] syntax error in {if ...}${detail}`)
    return
  }
  const resolved = resolveMacroVariables(conditional, character, targetLabel)

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
