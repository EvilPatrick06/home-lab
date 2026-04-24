import type { MapToken, RegionAction, RegionShape, SceneRegion } from '../../types/map'

// ─── Geometry: point-in-shape tests ────────────────────────────

function pointInCircle(px: number, py: number, shape: Extract<RegionShape, { type: 'circle' }>): boolean {
  const dx = px - shape.centerX
  const dy = py - shape.centerY
  return dx * dx + dy * dy <= shape.radius * shape.radius
}

function pointInRectangle(px: number, py: number, shape: Extract<RegionShape, { type: 'rectangle' }>): boolean {
  return px >= shape.x && px < shape.x + shape.width && py >= shape.y && py < shape.y + shape.height
}

/**
 * Ray-casting algorithm for point-in-polygon.
 * Counts how many times a horizontal ray from (px, py) crosses polygon edges.
 */
function pointInPolygon(px: number, py: number, shape: Extract<RegionShape, { type: 'polygon' }>): boolean {
  const { points } = shape
  if (points.length < 3) return false

  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x
    const yi = points[i].y
    const xj = points[j].x
    const yj = points[j].y

    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

export function pointInRegionShape(gridX: number, gridY: number, shape: RegionShape): boolean {
  const px = gridX + 0.5
  const py = gridY + 0.5

  switch (shape.type) {
    case 'circle':
      return pointInCircle(px, py, shape)
    case 'rectangle':
      return pointInRectangle(px, py, shape)
    case 'polygon':
      return pointInPolygon(px, py, shape)
  }
}

// ─── Region containment queries ────────────────────────────────

export function getRegionsAtPoint(regions: SceneRegion[], gridX: number, gridY: number, floor?: number): SceneRegion[] {
  return regions.filter((r) => {
    if (!r.enabled) return false
    if (floor !== undefined && r.floor !== undefined && r.floor !== floor) return false
    return pointInRegionShape(gridX, gridY, r.shape)
  })
}

// ─── Enter / Leave event detection ─────────────────────────────

export interface RegionEvent {
  region: SceneRegion
  type: 'enter' | 'leave'
  token: MapToken
}

export function detectRegionEvents(
  token: MapToken,
  prevGridX: number,
  prevGridY: number,
  newGridX: number,
  newGridY: number,
  regions: SceneRegion[]
): RegionEvent[] {
  if (prevGridX === newGridX && prevGridY === newGridY) return []

  const events: RegionEvent[] = []
  const floor = token.floor

  for (const region of regions) {
    if (!region.enabled) continue
    if (floor !== undefined && region.floor !== undefined && region.floor !== floor) continue

    const wasInside = pointInRegionShape(prevGridX, prevGridY, region.shape)
    const nowInside = pointInRegionShape(newGridX, newGridY, region.shape)

    if (!wasInside && nowInside && region.trigger === 'enter') {
      events.push({ region, type: 'enter', token })
    }
    if (wasInside && !nowInside && region.trigger === 'leave') {
      events.push({ region, type: 'leave', token })
    }
  }

  return events
}

// ─── Trigger action execution ──────────────────────────────────

export interface RegionActionContext {
  token: MapToken
  mapId: string
  addChatMessage: (msg: {
    id: string
    senderId: string
    senderName: string
    content: string
    timestamp: number
    isSystem: boolean
  }) => void
  moveToken: (mapId: string, tokenId: string, gridX: number, gridY: number) => void
  updateToken: (mapId: string, tokenId: string, updates: Partial<MapToken>) => void
  addCondition: (condition: {
    id: string
    entityId: string
    entityName: string
    condition: string
    value?: number
    duration: number | 'permanent'
    source: string
    appliedRound: number
  }) => void
  updateRegion: (mapId: string, regionId: string, updates: Partial<SceneRegion>) => void
  setActiveMap?: (mapId: string) => void
  round: number
}

export function executeRegionAction(region: SceneRegion, action: RegionAction, ctx: RegionActionContext): void {
  const { token, mapId } = ctx

  switch (action.type) {
    case 'alert-dm': {
      ctx.addChatMessage({
        id: `region-alert-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        senderId: 'system',
        senderName: 'Region Alert',
        content: `[${region.name}] ${action.message} (triggered by ${token.label})`,
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }

    case 'teleport': {
      if (action.targetMapId === mapId) {
        ctx.moveToken(mapId, token.id, action.targetGridX, action.targetGridY)
      } else {
        ctx.moveToken(mapId, token.id, action.targetGridX, action.targetGridY)
        ctx.setActiveMap?.(action.targetMapId)
      }
      ctx.addChatMessage({
        id: `region-teleport-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        senderId: 'system',
        senderName: 'Region',
        content: `${token.label} was teleported by "${region.name}"`,
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }

    case 'apply-condition': {
      const conditions = [...(token.conditions || [])]
      if (!conditions.includes(action.condition)) {
        conditions.push(action.condition)
        ctx.updateToken(mapId, token.id, { conditions })
      }

      ctx.addCondition({
        id: crypto.randomUUID(),
        entityId: token.entityId,
        entityName: token.label,
        condition: action.condition,
        duration: action.duration ?? 'permanent',
        source: `Region: ${region.name}`,
        appliedRound: ctx.round
      })

      ctx.addChatMessage({
        id: `region-condition-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        senderId: 'system',
        senderName: 'Region',
        content: `${token.label} is now ${action.condition} (from "${region.name}")`,
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }
  }

  if (region.oneShot) {
    ctx.updateRegion(mapId, region.id, { enabled: false })
  }
}

/**
 * Process all region events for a token move and execute their actions.
 */
export function processTokenRegionTriggers(
  token: MapToken,
  prevGridX: number,
  prevGridY: number,
  newGridX: number,
  newGridY: number,
  regions: SceneRegion[],
  ctx: RegionActionContext
): RegionEvent[] {
  const events = detectRegionEvents(token, prevGridX, prevGridY, newGridX, newGridY, regions)

  for (const event of events) {
    executeRegionAction(event.region, event.region.action, ctx)
  }

  return events
}
