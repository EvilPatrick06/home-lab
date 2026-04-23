// Shared currency utilities for parsing costs and deducting with conversion

export function parseCost(costStr: string): { amount: number; currency: 'pp' | 'gp' | 'sp' | 'cp' } | null {
  const match = costStr.match(/^([\d,]+(?:\.\d+)?)\s*(pp|gp|sp|cp)$/i)
  if (!match) return null
  const amount = parseFloat(match[1].replace(',', ''))
  if (Number.isNaN(amount)) return null
  return { amount, currency: match[2].toLowerCase() as 'pp' | 'gp' | 'sp' | 'cp' }
}

export function totalInCopper(c: { pp: number; gp: number; sp: number; cp: number }): number {
  return c.pp * 1000 + c.gp * 100 + c.sp * 10 + c.cp
}

export function deductWithConversion(
  currency: { pp: number; gp: number; sp: number; cp: number },
  cost: { amount: number; currency: 'pp' | 'gp' | 'sp' | 'cp' }
): { pp: number; gp: number; sp: number; cp: number } | null {
  const rates = { pp: 1000, gp: 100, sp: 10, cp: 1 } as const
  const costInCopper = cost.amount * rates[cost.currency]
  const totalCopper = totalInCopper(currency)
  if (totalCopper < costInCopper) return null

  let remaining = costInCopper
  const result = { ...currency }

  const exactDeduct = Math.min(result[cost.currency], cost.amount)
  result[cost.currency] -= exactDeduct
  remaining -= exactDeduct * rates[cost.currency]

  for (const [key, rate] of [
    ['pp', 1000],
    ['gp', 100],
    ['sp', 10],
    ['cp', 1]
  ] as const) {
    if (remaining <= 0) break
    const canDeduct = Math.min(result[key], Math.floor(remaining / rate))
    result[key] -= canDeduct
    remaining -= canDeduct * rate
  }

  if (remaining > 0) {
    for (const [key, rate] of [
      ['pp', 1000],
      ['gp', 100],
      ['sp', 10],
      ['cp', 1]
    ] as const) {
      if (remaining <= 0) break
      if (result[key] > 0 && rate > remaining) {
        result[key] -= 1
        let change = rate - remaining
        remaining = 0
        for (const [changeKey, changeRate] of [
          ['gp', 100],
          ['sp', 10],
          ['cp', 1]
        ] as const) {
          if (change <= 0) break
          if (changeRate < rate) {
            const coins = Math.floor(change / changeRate)
            result[changeKey] += coins
            change -= coins * changeRate
          }
        }
      }
    }
    if (remaining > 0) return null
  }

  return result
}

export function addCurrency(
  currency: { pp: number; gp: number; sp: number; cp: number },
  credit: { amount: number; currency: 'pp' | 'gp' | 'sp' | 'cp' }
): { pp: number; gp: number; sp: number; cp: number } {
  return { ...currency, [credit.currency]: currency[credit.currency] + credit.amount }
}

export function computeSellPrice(costStr: string): { amount: number; currency: 'pp' | 'gp' | 'sp' | 'cp' } | null {
  const parsed = parseCost(costStr)
  if (!parsed || parsed.amount <= 0) return null
  // Sell at half price, compute in copper then return in the original denomination
  const rates = { pp: 1000, gp: 100, sp: 10, cp: 1 } as const
  const halfCopper = Math.floor((parsed.amount * rates[parsed.currency]) / 2)
  if (halfCopper <= 0) return null
  // Return in the highest denomination that divides evenly, otherwise copper
  for (const [denom, rate] of [
    ['pp', 1000],
    ['gp', 100],
    ['sp', 10],
    ['cp', 1]
  ] as const) {
    if (halfCopper >= rate && halfCopper % rate === 0) {
      return { amount: halfCopper / rate, currency: denom }
    }
  }
  return { amount: halfCopper, currency: 'cp' }
}
