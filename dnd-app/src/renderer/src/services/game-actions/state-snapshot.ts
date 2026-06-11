/**
 * Build a compact text snapshot of the current game state for AI context.
 */

import { getCoverACBonus } from '../combat/combat-rules'
import { calculateCover } from '../combat/cover-calculator'
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
        // Elevation / floor (G44) — so the AI reasons about height (flight, falling, ranged) + which floor.
        if (t.elevation) desc += ` Elev:${t.elevation}ft`
        if (t.floor) desc += ` Floor:${t.floor}`
        // Special movement (G46) — non-walk speeds the AI should respect for terrain.
        const moves: string[] = []
        if (t.swimSpeed) moves.push(`swim ${t.swimSpeed}`)
        if (t.climbSpeed) moves.push(`climb ${t.climbSpeed}`)
        if (t.flySpeed) moves.push(`fly ${t.flySpeed}`)
        if (moves.length > 0) desc += ` Move[${moves.join(', ')}]`
        if (t.specialSenses && t.specialSenses.length > 0) {
          desc += ` Senses[${t.specialSenses.map((sn) => `${sn.type} ${sn.range}`).join(', ')}]`
        }
        // Token-level resistances/vulnerabilities/immunities the AI itself set (G47) — so it
        // can reason about damage mitigation it can't see from a stat block alone.
        if (t.resistances && t.resistances.length > 0) desc += ` Resist[${t.resistances.join(', ')}]`
        if (t.vulnerabilities && t.vulnerabilities.length > 0) desc += ` Vuln[${t.vulnerabilities.join(', ')}]`
        if (t.immunities && t.immunities.length > 0) desc += ` Immune[${t.immunities.join(', ')}]`
        if (t.spellSlots) {
          const slots = Object.entries(t.spellSlots)
            .filter(([, v]) => v.max > 0)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([lvl, v]) => `L${lvl} ${v.current}/${v.max}`)
            .join(', ')
          if (slots) desc += ` Slots[${slots}]`
        }
        if (t.conditions.length > 0) desc += ` [${t.conditions.join(', ')}]`
        if (t.companionType) desc += ` {${t.companionType}}`
        if (t.sourceSpell) {
          const exp = t.summonExpiresRound != null ? `, expires round ${t.summonExpiresRound}` : ''
          desc += ` (summoned via ${t.sourceSpell}${exp})`
        }
        if (t.monsterStatBlockId) desc += ` creature:${t.monsterStatBlockId}`
        lines.push(desc)
      }
    } else {
      lines.push('Tokens: none')
    }

    // Terrain cells (difficult/hazard/water/climbing/portal) — so the AI knows the
    // movement costs + on-entry hazards on the board it's running.
    if (activeMap.terrain && activeMap.terrain.length > 0) {
      lines.push('Terrain:')
      for (const c of activeMap.terrain) {
        let line = `- (${c.x}, ${c.y}): ${c.type} (move x${c.movementCost})`
        if (c.type === 'hazard' && c.hazardType)
          line += `, ${c.hazardType} hazard${c.hazardDamage ? ` ${c.hazardDamage} dmg on entry` : ''}`
        if (c.type === 'portal' && c.portalTarget)
          line += ` → map ${c.portalTarget.mapId} (${c.portalTarget.gridX}, ${c.portalTarget.gridY})`
        if (c.floor != null) line += ` [floor ${c.floor}]`
        lines.push(line)
      }
    }

    // Darkness zones (magical darkness — affects vision/light).
    if (activeMap.darknessZones && activeMap.darknessZones.length > 0) {
      lines.push('Darkness Zones:')
      for (const z of activeMap.darknessZones) {
        lines.push(
          `- ${z.id}: ${z.magicLevel ?? 'darkness'} radius ${z.radius}ft at (${z.x}, ${z.y})${z.floor != null ? ` [floor ${z.floor}]` : ''}`
        )
      }
    }

    // Walls (block movement / line-of-sight / give cover) — list them with ids so the
    // AI can open doors, knock down walls, etc. (G40).
    if (activeMap.wallSegments && activeMap.wallSegments.length > 0) {
      lines.push('Walls:')
      for (const w of activeMap.wallSegments) {
        let line = `- ${w.id}: ${w.type} (${w.x1},${w.y1})→(${w.x2},${w.y2})`
        if (w.type === 'door') line += w.isOpen ? ' [OPEN]' : ' [CLOSED]'
        if (w.floor != null) line += ` [floor ${w.floor}]`
        lines.push(line)
      }
    }

    // Scene regions / trigger zones (G43) — list with ids so the AI can update/remove them.
    if (activeMap.regions && activeMap.regions.length > 0) {
      lines.push('Regions:')
      for (const r of activeMap.regions) {
        lines.push(
          `- ${r.id}: "${r.name}" ${r.shape.type} on ${r.trigger} → ${r.action.type}${r.enabled ? '' : ' [disabled]'}${r.oneShot ? ' [one-shot]' : ''}`
        )
      }
    }

    // Drawings / annotations (G42 / 08H) — list ids so the AI can target remove_drawing (point
    // data is omitted to save tokens). Capped at 20; beyond that, suggest clear_drawings.
    if (activeMap.drawings && activeMap.drawings.length > 0) {
      lines.push('Drawings:')
      for (const d of activeMap.drawings.slice(0, 20)) {
        const text = d.text ? ` "${d.text.length > 30 ? `${d.text.slice(0, 30)}…` : d.text}"` : ''
        const dmOnly = d.visibleToPlayers === false ? ' [DM-only]' : ''
        const floor = d.floor != null ? ` [floor ${d.floor}]` : ''
        lines.push(`- ${d.id}: ${d.type}${text}${dmOnly}${floor}`)
      }
      if (activeMap.drawings.length > 20) {
        lines.push(`- …and ${activeMap.drawings.length - 20} more (use clear_drawings to remove all)`)
      }
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

  // Action economy — reaction availability + stances per combatant. Reactions are
  // mechanically enforced for player movement/spells (opportunity attacks, counterspell),
  // but the AI runs monsters: it needs to know whose reaction is still up (so it can take
  // opportunity attacks / counterspells) and who is Dodging/Disengaging/Dashing/Hidden.
  if (gameStore.initiative) {
    const econLines: string[] = []
    for (const entry of gameStore.initiative.entries) {
      const ts = gameStore.turnStates?.[entry.entityId]
      if (!ts) continue
      const label = activeMap?.tokens.find((t) => t.entityId === entry.entityId)?.label ?? entry.entityName
      const parts: string[] = [`reaction ${ts.reactionUsed ? 'USED' : 'available'}`]
      if (ts.actionUsed) parts.push('action used')
      if (ts.bonusActionUsed) parts.push('bonus used')
      if (typeof ts.movementRemaining === 'number' && typeof ts.movementMax === 'number') {
        parts.push(`move ${ts.movementRemaining}/${ts.movementMax}ft`)
      }
      if (ts.isDodging) parts.push('Dodging')
      if (ts.isDisengaging) parts.push('Disengaging')
      if (ts.isDashing) parts.push('Dashing')
      if (ts.isHidden) parts.push('Hidden')
      econLines.push(`  - ${label}: ${parts.join(', ')}`)
    }
    if (econLines.length > 0) {
      lines.push('\n[ACTION ECONOMY]')
      lines.push(...econLines)
    }
  }

  // Mounted combat — who is riding what (from turn-states), so the AI can reason about
  // mounted movement/attacks and dismounts. mountedOn holds the mount token's id.
  if (activeMap) {
    const mountedLines: string[] = []
    for (const ts of Object.values(gameStore.turnStates ?? {})) {
      if (!ts.mountedOn) continue
      const rider = activeMap.tokens.find((t) => t.entityId === ts.entityId)
      const mount = activeMap.tokens.find((t) => t.id === ts.mountedOn)
      if (rider && mount) {
        mountedLines.push(`  - ${rider.label} riding ${mount.label} (${ts.mountType ?? 'controlled'} mount)`)
      }
    }
    if (mountedLines.length > 0) {
      lines.push('\nMounted:')
      lines.push(...mountedLines)
    }
  }

  // Distances from the active combatant to everyone else, so the AI doesn't have to
  // compute positioning mentally (5e: 5 ft per square, Chebyshev / king-move).
  if (gameStore.initiative && activeMap) {
    const activeEntry = gameStore.initiative.entries[gameStore.initiative.currentIndex]
    const activeToken = activeMap.tokens.find((t) => t.entityId === activeEntry?.entityId)
    const others = activeMap.tokens.filter((t) => t.id !== activeToken?.id)
    if (activeToken && others.length > 0) {
      // Cover is attacker-relative (PHB 2024 p.17), so compute it from the active
      // combatant's vantage. Walls/closed doors escalate to total; creatures cap at
      // half. The AI uses this to apply the right AC/DEX-save bonus when it attacks.
      const walls = activeMap.wallSegments ?? []
      const cellSize = activeMap.grid.cellSize || 40
      lines.push(`\nDistances from ${activeToken.label} (current turn):`)
      for (const t of others) {
        const feet = Math.max(Math.abs(t.gridX - activeToken.gridX), Math.abs(t.gridY - activeToken.gridY)) * 5
        let line = `  - ${t.label}: ${feet} ft${feet <= 5 ? ' (adjacent)' : ''}`
        const cover = calculateCover(activeToken, t, walls, cellSize, activeMap.tokens)
        if (cover === 'total') {
          line += ', TOTAL cover (cannot be targeted)'
        } else if (cover !== 'none') {
          line += `, ${cover} cover (+${getCoverACBonus(cover)} AC & DEX saves vs ${activeToken.label})`
        }
        lines.push(line)
      }
    }
  }

  // Entity conditions — include remaining duration (G38) so the AI knows whether a
  // condition is timed (and how long is left) vs permanent, instead of guessing.
  if (gameStore.conditions.length > 0) {
    lines.push('\nConditions:')
    const round = gameStore.initiative?.round
    for (const c of gameStore.conditions) {
      let dur = ''
      if (c.duration === 'permanent') {
        dur = ', permanent'
      } else if (typeof c.duration === 'number') {
        // In combat, show rounds remaining from when it was applied; else the raw count.
        const remaining =
          typeof round === 'number' && typeof c.appliedRound === 'number'
            ? c.duration - (round - c.appliedRound)
            : c.duration
        dur = `, ${Math.max(0, remaining)} rounds left`
      }
      lines.push(`- ${c.entityName}: ${c.condition}${c.value ? ` ${c.value}` : ''}${dur} (${c.source})`)
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
        // Long rest is gated by a 24h cooldown (one benefit per day). Tell the AI whether a
        // long rest will succeed now, so it can narrate the prereq instead of failing silently.
        const untilLR = 86400 - sinceLR
        lines.push(
          untilLR <= 0
            ? 'Long rest: available now (24h cooldown met; also needs 8h uninterrupted + each PC above 0 HP)'
            : `Long rest: NOT yet available — ${Math.ceil(untilLR / 3600)} more hours until the 24h cooldown clears`
        )
      } else {
        lines.push('Long rest: available now (no long rest taken yet)')
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
      let line = `- ${e.name}`
      if (e.mechanicalEffect) line += `: ${e.mechanicalEffect}`
      if (e.saveDC) line += ` (DC ${e.saveDC})`
      lines.push(line)
    }
    lines.push('[/ACTIVE EFFECTS]')
  }

  // Active spell effects — ongoing spells the AI DM has cast (caster, duration, area,
  // save, summons), so it can perceive, sustain, and end them across turns.
  if (gameStore.activeSpellEffects.length > 0) {
    lines.push('\n[SPELL EFFECTS]')
    for (const e of gameStore.activeSpellEffects) {
      let line = `- ${e.name} by ${e.caster}`
      if (e.duration === 'concentration') line += ' (concentration)'
      else if (typeof e.duration === 'number') {
        const remaining = e.duration - (gameStore.round - e.startedRound)
        line += ` (${Math.max(0, remaining)} rounds left)`
      }
      if (e.shape && e.originX != null && e.originY != null) {
        line += ` — ${e.shape} ${e.radiusFt ?? 0}ft at (${e.originX}, ${e.originY})`
      }
      if (e.saveDC && e.saveType) line += ` [DC ${e.saveDC} ${e.saveType.toUpperCase()}]`
      if (e.conditionIfFail) line += ` → ${e.conditionIfFail} on fail`
      if (e.summonedLabels && e.summonedLabels.length > 0) line += ` {summons: ${e.summonedLabels.join(', ')}}`
      lines.push(line)
    }
    lines.push('[/SPELL EFFECTS]')
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
