/**
 * PHASE-34 34E — turn a BattlemapSpec into a live, synced GameMap: compile geometry, render artwork,
 * build + add the map (auto-broadcasts), attach light fixtures, optionally switch to it, and post a
 * DM summary the AI can read next turn (where to place_creature). DM-only pins are wire-filtered by
 * the addMap sanitizer (this phase closed that gap).
 */

import type { BattlemapSpec } from '../../../../../shared/battlemap-spec'
import type { GameMap } from '../../../types/map'
import { postDmMessage } from '../../game-actions/broadcast-helpers'
import type { StoreAccessors } from '../../game-actions/types'
import { compileSpec } from './compile-spec'
import { renderBattlemap } from './tile-renderer'

const CELL = 40

export interface ApplyBattlemapResult {
  mapId: string
  mapName: string
  warnings: string[]
}

export interface ApplyBattlemapOpts {
  campaignId: string
  switchTo: boolean
  stores: StoreAccessors
  /** Injected for tests; production uses document.createElement('canvas'). */
  createCanvas?: () => HTMLCanvasElement
}

export function applyBattlemapSpec(spec: BattlemapSpec, opts: ApplyBattlemapOpts): ApplyBattlemapResult {
  const { stores } = opts
  const gameStore = stores.getGameStore().getState()
  const sendMessage = stores.getNetworkStore().getState().sendMessage

  const compiled = compileSpec(spec, CELL)
  const createCanvas = opts.createCanvas ?? (() => document.createElement('canvas'))
  const dataUrl = renderBattlemap(spec, compiled, CELL, createCanvas)
  const warnings = [...compiled.warnings]

  const mapId = crypto.randomUUID()
  const map: GameMap = {
    id: mapId,
    name: spec.name,
    campaignId: opts.campaignId,
    imagePath: dataUrl ?? '', // F3: empty = blank canvas (tolerated by the background hook)
    width: compiled.widthPx,
    height: compiled.heightPx,
    grid: { enabled: true, cellSize: CELL, offsetX: 0, offsetY: 0, color: '#4b5563', opacity: 0.4, type: 'square' },
    tokens: compiled.lightFixtures.map((f) => f.token),
    wallSegments: compiled.wallSegments,
    terrain: compiled.terrain,
    pins: compiled.pins,
    fogOfWar: { enabled: true, revealedCells: [], dynamicFogEnabled: true },
    createdAt: new Date().toISOString()
  }
  gameStore.addMap(map) // auto-broadcasts on mid-session creation (F4)

  // Attach light fixtures (needs in-game time; durationSeconds Infinity = never expires).
  if (gameStore.inGameTime) {
    for (const f of compiled.lightFixtures) {
      gameStore.lightSource(f.token.entityId, f.token.label, f.sourceKey, Number.POSITIVE_INFINITY)
      sendMessage?.('dm:light-source-update', {
        entityId: f.token.entityId,
        entityName: f.token.label,
        sourceName: f.sourceKey,
        action: 'light'
      })
    }
  } else if (compiled.lightFixtures.length > 0) {
    warnings.push('Lights were not lit — set the in-game time first.')
  }

  if (opts.switchTo) {
    gameStore.setActiveMap(mapId)
    sendMessage?.('dm:map-change', { mapId })
    gameStore.setAmbientLight(spec.ambientLight) // ambient is global, only set when switching
  }

  const summary = [
    `Battlemap "${spec.name}" created (${spec.width}x${spec.height} cells).`,
    `Party start: ${compiled.partySpawn.x},${compiled.partySpawn.y}.`,
    compiled.enemySpawns.length > 0
      ? `Enemy spawns: ${compiled.enemySpawns.map((e) => `${e.label ?? 'enemy'} @ ${e.x},${e.y}`).join('; ')}.`
      : ''
  ]
    .filter(Boolean)
    .join(' ')
  postDmMessage(stores, 'battlemap', summary, true)

  return { mapId, mapName: spec.name, warnings }
}
