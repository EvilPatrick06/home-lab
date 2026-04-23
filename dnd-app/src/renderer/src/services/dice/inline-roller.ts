export interface InlineRollResult {
  label: string // e.g., "Athletics", "Dexterity Save", "Longsword"
  formula: string // e.g., "1d20+5"
  roll: number // the d20 result
  modifier: number // the modifier
  total: number // roll + modifier
  isCrit: boolean // natural 20
  isFumble: boolean // natural 1
  advantage?: 'advantage' | 'disadvantage'
  rolls?: number[] // if advantage/disadvantage, both d20 rolls
}

// Roll with optional advantage/disadvantage
export function rollInline(
  label: string,
  modifier: number,
  advantage?: 'advantage' | 'disadvantage'
): InlineRollResult {
  const roll1 = Math.floor(Math.random() * 20) + 1

  if (advantage) {
    const roll2 = Math.floor(Math.random() * 20) + 1
    const chosen = advantage === 'advantage' ? Math.max(roll1, roll2) : Math.min(roll1, roll2)
    return {
      label,
      formula: `1d20${modifier >= 0 ? '+' : ''}${modifier}`,
      roll: chosen,
      modifier,
      total: chosen + modifier,
      isCrit: chosen === 20,
      isFumble: chosen === 1,
      advantage,
      rolls: [roll1, roll2]
    }
  }

  return {
    label,
    formula: `1d20${modifier >= 0 ? '+' : ''}${modifier}`,
    roll: roll1,
    modifier,
    total: roll1 + modifier,
    isCrit: roll1 === 20,
    isFumble: roll1 === 1
  }
}

// Format result for chat display
export function formatInlineRoll(result: InlineRollResult): string {
  let str = `**${result.label}**: `
  if (result.advantage) {
    str += `[${result.rolls?.[0]}, ${result.rolls?.[1]}] → `
  }
  if (result.isCrit) str += '**NAT 20!** '
  else if (result.isFumble) str += '**NAT 1!** '
  str += `${result.roll} + ${result.modifier} = **${result.total}**`
  return str
}
