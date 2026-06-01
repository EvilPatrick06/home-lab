/**
 * Shared resolution of a background's starting-equipment CHOICE, used by both the
 * Character Builder gear tab (display) and `build-character-5e` (the built sheet),
 * so the two never drift. A background offers two options — real gear (sometimes
 * with a bundled "<N> GP") or pure gold — and the gold is encoded as a "<N> GP"
 * pseudo-item (e.g. "15 GP", "50 GP") inside the option's `items`. That coin must
 * become currency, NOT a non-functional inventory row (the bug: the gear tab
 * showed BOTH options and a "50 GP" item while the GP counter stayed at the base).
 */

/** Parse a "<N> GP" pseudo-item to its gold value; 0 if the item isn't pure gold. */
export function parseGoldItem(item: string): number {
  const m = /^(\d+)\s*gp$/i.exec(item.trim())
  return m ? Number(m[1]) : 0
}

/** True when every item in the option is a "<N> GP" pseudo-item (the gold option). */
export function isGoldOnlyOption(option: { items: string[] }): boolean {
  return option.items.length > 0 && option.items.every((it) => parseGoldItem(it) > 0)
}

export interface ResolvedBackgroundGear {
  /** The chosen option's REAL gear (gold pseudo-items stripped). */
  items: Array<{ name: string; quantity: number }>
  /** Gold (gp) the choice grants — bundled coin for the equipment option, or the
   * full gold option's value. Credit this to currency, never to inventory. */
  gold: number
}

/**
 * Resolve a background's equipment choice to its real gear + gold.
 * @param options The background's equipment options (both A and B).
 * @param choice  'equipment' (take the gear) or 'gold' (take the coin).
 */
export function resolveBackgroundGear(
  options: Array<{ items: string[] }>,
  choice: 'equipment' | 'gold'
): ResolvedBackgroundGear {
  const sumGold = (items: string[]): number => items.reduce((s, it) => s + parseGoldItem(it), 0)
  const goldOption = options.find(isGoldOnlyOption)
  const equipOption = options.find((o) => !isGoldOnlyOption(o)) ?? options[0]
  if (choice === 'gold') {
    // 50 gp is the 2024 PHB default when a background doesn't spell out a gold option.
    return { items: [], gold: goldOption ? sumGold(goldOption.items) : 50 }
  }
  const chosen = equipOption?.items ?? []
  return {
    items: chosen.filter((item) => parseGoldItem(item) === 0).map((item) => ({ name: item, quantity: 1 })),
    gold: sumGold(chosen)
  }
}
