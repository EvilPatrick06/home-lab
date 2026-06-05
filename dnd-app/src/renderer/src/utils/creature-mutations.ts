import { getTokenStats } from '../services/game/token-stats'
import type { GameMap, MapToken } from '../types/map'

interface CreatureStatChange {
  type: string
  targetLabel?: string
  value?: number
  damageType?: string
  name?: string
  reason?: string
  damageTypes?: string[]
  replace?: boolean
}

/**
 * Apply creature-targeted stat mutations from AI DM responses.
 * These target map tokens by label (case-insensitive) rather than persisted characters.
 */
export function applyCreatureMutations(
  changes: CreatureStatChange[],
  activeMap: GameMap | null,
  updateToken: (mapId: string, tokenId: string, updates: Partial<MapToken>) => void
): Array<{ change: CreatureStatChange; applied: boolean; reason?: string }> {
  if (!activeMap) return changes.map((c) => ({ change: c, applied: false, reason: 'No active map' }))

  const results: Array<{ change: CreatureStatChange; applied: boolean; reason?: string }> = []

  for (const change of changes) {
    const label = change.targetLabel
    if (!label) {
      results.push({ change, applied: false, reason: 'No targetLabel' })
      continue
    }

    const token = activeMap.tokens.find((t) => t.label.toLowerCase() === label.toLowerCase())

    if (!token) {
      results.push({ change, applied: false, reason: `Token not found: ${label}` })
      continue
    }

    switch (change.type) {
      case 'creature_damage': {
        const hp = token.currentHP ?? 0
        const newHP = Math.max(0, hp - (change.value ?? 0))
        updateToken(activeMap.id, token.id, { currentHP: newHP })
        results.push({ change, applied: true })
        break
      }
      case 'creature_heal': {
        const hp = token.currentHP ?? 0
        const max = getTokenStats(token).maxHP ?? hp
        const newHP = Math.min(max, hp + (change.value ?? 0))
        updateToken(activeMap.id, token.id, { currentHP: newHP })
        results.push({ change, applied: true })
        break
      }
      case 'creature_add_condition': {
        const conditions = [...(token.conditions || [])]
        const condName = change.name ?? ''
        if (condName && !conditions.includes(condName)) {
          conditions.push(condName)
          updateToken(activeMap.id, token.id, { conditions })
        }
        results.push({ change, applied: true })
        break
      }
      case 'creature_remove_condition': {
        const conditions = (token.conditions || []).filter((c) => c.toLowerCase() !== (change.name ?? '').toLowerCase())
        updateToken(activeMap.id, token.id, { conditions })
        results.push({ change, applied: true })
        break
      }
      case 'creature_kill': {
        updateToken(activeMap.id, token.id, { currentHP: 0 })
        results.push({ change, applied: true })
        break
      }
      case 'creature_set_resistance':
      case 'creature_set_vulnerability':
      case 'creature_set_immunity': {
        const field =
          change.type === 'creature_set_resistance'
            ? 'resistances'
            : change.type === 'creature_set_vulnerability'
              ? 'vulnerabilities'
              : 'immunities'
        const existing = change.replace ? [] : (token[field] ?? [])
        // Merge (dedup, lower-cased) so the damage-resolver picks them up; replace=true wipes first.
        const merged = Array.from(new Set([...existing, ...(change.damageTypes ?? [])].map((d) => d.toLowerCase())))
        updateToken(activeMap.id, token.id, { [field]: merged })
        results.push({ change, applied: true })
        break
      }
      default:
        results.push({ change, applied: false, reason: `Unknown creature change type: ${change.type}` })
    }
  }

  return results
}
