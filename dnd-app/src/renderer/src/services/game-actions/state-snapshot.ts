/**
 * Build a compact text snapshot of the current game state for AI context.
 */

import { getTokenStats } from '../game/token-stats'
import type { StoreAccessors } from './types'

export function buildGameStateSnapshot(
  stores: StoreAccessors,
  exactTimeDefault: 'always' | 'contextual' | 'never' = 'contextual'
): string {
  const gameStore = stores.getGameStore().getState()
  const activeMap = gameStore.maps.find((m) => m.id === gameStore.activeMapId)

  const lines: string[] = ['[GAME STATE]']

  // Active map info
  if (activeMap) {
    const gridCols = Math.ceil(activeMap.width / (activeMap.grid.cellSize || 40))
    const gridRows = Math.ceil(activeMap.height / (activeMap.grid.cellSize || 40))
    lines.push(`Active Map: "${activeMap.name}" (${gridCols}x${gridRows} cells, 5ft/cell)`)

    // Tokens
    if (activeMap.tokens.length > 0) {
      lines.push('Tokens:')
      for (const t of activeMap.tokens) {
        const s = getTokenStats(t)
        let desc = `- ${t.label} (${t.entityType}) at (${t.gridX}, ${t.gridY}) ${t.sizeX}x${t.sizeY}`
        if (t.currentHP != null && s.maxHP != null) {
          const bloodied = t.currentHP <= Math.floor(s.maxHP / 2) && t.currentHP > 0
          desc += ` HP:${t.currentHP}/${s.maxHP}${bloodied ? ' [BLOODIED]' : ''}`
        }
        if (s.ac != null) desc += ` AC:${s.ac}`
        if (s.walkSpeed) desc += ` Speed:${s.walkSpeed}`
        if (t.conditions.length > 0) desc += ` [${t.conditions.join(', ')}]`
        if (t.companionType) desc += ` {${t.companionType}}`
        if (t.monsterStatBlockId) desc += ` creature:${t.monsterStatBlockId}`
        lines.push(desc)
      }
    } else {
      lines.push('Tokens: none')
    }
  } else {
    lines.push('Active Map: none')
  }

  // Initiative
  if (gameStore.initiative) {
    lines.push(`\nInitiative: Round ${gameStore.initiative.round}`)
    for (let i = 0; i < gameStore.initiative.entries.length; i++) {
      const e = gameStore.initiative.entries[i]
      const marker = i === gameStore.initiative.currentIndex ? ' <- CURRENT' : ''
      let extras = ''
      if (e.legendaryActions) {
        const avail = e.legendaryActions.maximum - e.legendaryActions.used
        extras += ` LA:${avail}/${e.legendaryActions.maximum}`
      }
      if (e.legendaryResistances) {
        extras += ` LR:${e.legendaryResistances.remaining}/${e.legendaryResistances.max}`
      }
      if (e.rechargeAbilities && e.rechargeAbilities.length > 0) {
        const abilities = e.rechargeAbilities
          .map((a) => `${a.name}(${a.available ? 'ready' : `recharge ${a.rechargeOn}+`})`)
          .join(', ')
        extras += ` [${abilities}]`
      }
      lines.push(`  ${i + 1}. ${e.entityName} (${e.total})${extras}${marker}`)
    }
  }

  // Concentration — who is concentrating on what (so the AI can reason about /
  // narrate concentration breaks and roll the save on damage).
  const concentrating = Object.values(gameStore.turnStates ?? {}).filter((ts) => ts.concentratingSpell)
  if (concentrating.length > 0) {
    lines.push('\nConcentration:')
    for (const ts of concentrating) {
      const label = activeMap?.tokens.find((t) => t.entityId === ts.entityId)?.label ?? ts.entityId
      lines.push(`  - ${label} is concentrating on ${ts.concentratingSpell}`)
    }
  }

  // Distances from the active combatant to everyone else, so the AI doesn't have to
  // compute positioning mentally (5e: 5 ft per square, Chebyshev / king-move).
  if (gameStore.initiative && activeMap) {
    const activeEntry = gameStore.initiative.entries[gameStore.initiative.currentIndex]
    const activeToken = activeMap.tokens.find((t) => t.entityId === activeEntry?.entityId)
    const others = activeMap.tokens.filter((t) => t.id !== activeToken?.id)
    if (activeToken && others.length > 0) {
      lines.push(`\nDistances from ${activeToken.label} (current turn):`)
      for (const t of others) {
        const feet = Math.max(Math.abs(t.gridX - activeToken.gridX), Math.abs(t.gridY - activeToken.gridY)) * 5
        lines.push(`  - ${t.label}: ${feet} ft${feet <= 5 ? ' (adjacent)' : ''}`)
      }
    }
  }

  // Entity conditions
  if (gameStore.conditions.length > 0) {
    lines.push('\nConditions:')
    for (const c of gameStore.conditions) {
      lines.push(`- ${c.entityName}: ${c.condition}${c.value ? ` ${c.value}` : ''} (${c.source})`)
    }
  }

  // Environment
  const envParts: string[] = []
  if (gameStore.ambientLight !== 'bright') envParts.push(`Light: ${gameStore.ambientLight}`)
  if (gameStore.underwaterCombat) envParts.push('Underwater: yes')
  if (gameStore.travelPace) envParts.push(`Travel Pace: ${gameStore.travelPace}`)
  if (envParts.length > 0) {
    lines.push(`\n${envParts.join(' | ')}`)
  }

  // Available maps
  if (gameStore.maps.length > 1) {
    lines.push(`\nAvailable Maps: ${gameStore.maps.map((m) => m.name).join(', ')}`)
  }

  // In-game time
  if (gameStore.inGameTime) {
    const totalSec = gameStore.inGameTime.totalSeconds
    const hour = Math.floor((totalSec % 86400) / 3600)
    const minute = Math.floor((totalSec % 3600) / 60)
    const dayNum = Math.floor(totalSec / 86400) + 1
    const phase =
      hour >= 5 && hour < 7
        ? 'dawn'
        : hour >= 7 && hour < 12
          ? 'morning'
          : hour >= 12 && hour < 18
            ? 'afternoon'
            : hour >= 18 && hour < 20
              ? 'dusk'
              : hour >= 20 && hour < 22
                ? 'evening'
                : 'night'
    lines.push(`\n[GAME TIME]`)
    lines.push(`Day ${dayNum}, ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} (${phase})`)
    lines.push(`Total seconds: ${totalSec}`)
    // The exactTimeDefault preference the AI is told to honor (always state exact
    // clock times / use judgment / avoid exact times). Now actually in the snapshot.
    lines.push(`Exact-time preference: ${exactTimeDefault}`)
    if (gameStore.restTracking) {
      if (gameStore.restTracking.lastLongRestSeconds != null) {
        const sinceLR = totalSec - gameStore.restTracking.lastLongRestSeconds
        lines.push(`Time since last long rest: ${Math.floor(sinceLR / 3600)} hours`)
      }
    }
    // Active light sources
    if (gameStore.activeLightSources.length > 0) {
      lines.push('Active light sources:')
      for (const ls of gameStore.activeLightSources) {
        const remaining =
          ls.durationSeconds === Infinity
            ? 'permanent'
            : `${Math.max(0, Math.ceil((ls.durationSeconds - (totalSec - ls.startedAtSeconds)) / 60))} min`
        lines.push(`  - ${ls.entityName}: ${ls.sourceName} (${remaining} remaining)`)
      }
    }
    lines.push(`[/GAME TIME]`)
  }

  // Shop
  if (gameStore.shopOpen) {
    lines.push(`\nShop Open: "${gameStore.shopName}" (${gameStore.shopInventory.length} items)`)
  }

  // Active environmental effects
  if (gameStore.activeEnvironmentalEffects.length > 0) {
    lines.push('\n[ACTIVE EFFECTS]')
    for (const e of gameStore.activeEnvironmentalEffects) {
      lines.push(`- ${e.name}`)
    }
    lines.push('[/ACTIVE EFFECTS]')
  }

  // Active diseases
  if (gameStore.activeDiseases.length > 0) {
    lines.push('\nActive Diseases:')
    for (const d of gameStore.activeDiseases) {
      lines.push(`- ${d.targetName}: ${d.name} (saves: ${d.successCount} success / ${d.failCount} fail)`)
    }
  }

  // Active curses
  if (gameStore.activeCurses.length > 0) {
    lines.push('\nActive Curses:')
    for (const c of gameStore.activeCurses) {
      lines.push(`- ${c.targetName}: ${c.name}${c.source ? ` (from ${c.source})` : ''}`)
    }
  }

  // Placed traps (DM context only — don't reveal to players)
  const armedTraps = gameStore.placedTraps.filter((t) => t.armed)
  if (armedTraps.length > 0) {
    lines.push('\n[DM ONLY] Armed Traps:')
    for (const t of armedTraps) {
      lines.push(`- ${t.name} at (${t.gridX}, ${t.gridY})${t.revealed ? ' [REVEALED]' : ' [HIDDEN]'}`)
    }
  }

  lines.push('[/GAME STATE]')
  return lines.join('\n')
}
