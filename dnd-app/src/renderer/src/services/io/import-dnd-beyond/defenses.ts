/**
 * Defensive trait extraction for the D&D Beyond import.
 * Resolves movement speeds (from the race weightSpeeds block) plus senses,
 * resistances, immunities, and vulnerabilities (from modifiers).
 */

import type { DdbModifiers } from './ddb-types'

export function extractDefenses(
  data: Record<string, unknown>,
  modifiers: DdbModifiers | undefined
): {
  speed: number
  speeds: { swim: number; fly: number; climb: number; burrow: number }
  senses: string[]
  resistances: string[]
  immunities: string[]
  vulnerabilities: string[]
} {
  const result = {
    speed: 30,
    speeds: { swim: 0, fly: 0, climb: 0, burrow: 0 },
    senses: [] as string[],
    resistances: [] as string[],
    immunities: [] as string[],
    vulnerabilities: [] as string[]
  }

  // Speed from race
  const race = data.race as Record<string, unknown> | undefined
  const weightSpeeds = race?.weightSpeeds as Record<string, Record<string, unknown>> | undefined
  const normal = weightSpeeds?.normal
  const walkSpeed = normal?.walk
  if (typeof walkSpeed === 'number') result.speed = walkSpeed
  const swim = normal?.swim
  if (typeof swim === 'number') result.speeds.swim = swim
  const fly = normal?.fly
  if (typeof fly === 'number') result.speeds.fly = fly
  const climb = normal?.climb
  if (typeof climb === 'number') result.speeds.climb = climb
  const burrow = normal?.burrow
  if (typeof burrow === 'number') result.speeds.burrow = burrow

  if (!modifiers) return result

  const allMods = Object.values(modifiers).flat()
  const sensesSet = new Set<string>()
  const resistSet = new Set<string>()
  const immuneSet = new Set<string>()
  const vulnSet = new Set<string>()

  for (const mod of allMods) {
    if (!mod.subType) continue
    const name = mod.friendlySubtypeName ?? mod.subType.replace(/-/g, ' ')

    if (mod.type === 'sense') {
      const range = typeof mod.value === 'number' ? ` ${mod.value} ft.` : ''
      sensesSet.add(`${name}${range}`)
    } else if (mod.type === 'resistance') {
      resistSet.add(name)
    } else if (mod.type === 'immunity') {
      immuneSet.add(name)
    } else if (mod.type === 'vulnerability') {
      vulnSet.add(name)
    }
  }

  result.senses = [...sensesSet]
  result.resistances = [...resistSet]
  result.immunities = [...immuneSet]
  result.vulnerabilities = [...vulnSet]

  return result
}
