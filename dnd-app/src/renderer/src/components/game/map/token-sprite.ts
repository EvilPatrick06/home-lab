import { Assets, Container, Graphics, Sprite, Text, TextStyle, type Texture } from 'pixi.js'
import type { MapToken } from '../../../types/map'
import { drawTokenStatusRing } from './combat-animations'

// Module-level cache for loaded token image textures
const tokenTextureCache = new Map<string, Texture>()

const VALID_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp']

const ENTITY_COLORS: Record<string, number> = {
  player: 0x3b82f6, // blue
  enemy: 0xef4444, // red
  npc: 0xeab308 // yellow
}

const CONDITION_COLOR_MAP: Record<string, number> = {
  poisoned: 0x22c55e,
  stunned: 0xeab308,
  prone: 0x6b7280,
  frightened: 0xa855f7,
  blinded: 0x1e293b,
  charmed: 0xec4899,
  deafened: 0x78716c,
  grappled: 0xf97316,
  incapacitated: 0x64748b,
  invisible: 0x06b6d4,
  paralyzed: 0xfbbf24,
  petrified: 0x92400e,
  restrained: 0xf97316,
  unconscious: 0x991b1b,
  exhaustion: 0x854d0e,
  bloodied: 0xef4444,
  concentrating: 0x3b82f6
}

const CONDITION_DOT_FALLBACK = [0xa855f7, 0x22c55e, 0xf97316, 0x06b6d4, 0xec4899, 0x64748b]

const MAX_VISIBLE_DOTS = 3

/**
 * Creates a PixiJS Container representing a map token.
 *
 * Structure:
 * - Colored circle (by entity type)
 * - First letter label centered
 * - HP bar below (if applicable)
 * - Selection ring (if selected)
 * - Condition dots along the bottom edge
 */
export function createTokenSprite(
  token: MapToken,
  cellSize: number,
  isSelected: boolean,
  isActiveTurn = false,
  showHpBar = true,
  lightingCondition?: 'bright' | 'dim' | 'darkness',
  isDM = true,
  existingContainer?: Container
): Container {
  const container = existingContainer ?? new Container()
  // Clean up all overlay elements, but keep avatar if it's the exact same
  const oldAvatar = container.children.find((c) => c.label === 'avatar-container')
  container.removeChildren()

  container.label = `token-${token.id}`

  const tokenSize = cellSize * Math.max(token.sizeX, token.sizeY)
  const radius = (tokenSize - 4) / 2
  const cx = tokenSize / 2
  const cy = tokenSize / 2

  // Active turn glow (drawn behind everything)
  if (isActiveTurn) {
    const turnGlow = new Graphics()
    turnGlow.circle(cx, cy, radius + 6)
    turnGlow.fill({ color: 0x22c55e, alpha: 0.25 }) // green glow
    turnGlow.circle(cx, cy, radius + 3)
    turnGlow.stroke({ width: 2, color: 0x22c55e, alpha: 0.8 })
    container.addChild(turnGlow)
  }

  // Aura ring (drawn behind the token, beneath selection ring)
  if (token.aura && (token.aura.visibility === 'all' || isDM)) {
    // Convert aura radius from feet to pixels (assuming 5ft per grid cell)
    const auraRadiusPixels = (token.aura.radius / 5) * cellSize
    const auraRing = new Graphics()

    // Convert hex color string to number
    const auraColor = parseInt(token.aura.color.replace('#', ''), 16)

    // Draw filled circle for the aura
    auraRing.circle(cx, cy, auraRadiusPixels)
    auraRing.fill({ color: auraColor, alpha: token.aura.opacity })

    // Optional: add a subtle border to the aura
    auraRing.circle(cx, cy, auraRadiusPixels)
    auraRing.stroke({ width: 1, color: auraColor, alpha: token.aura.opacity * 0.5 })

    container.addChild(auraRing)
  }

  // Selection ring (drawn behind the token)
  if (isSelected) {
    const selRing = new Graphics()
    selRing.circle(cx, cy, radius + 4)
    selRing.fill({ color: 0xf59e0b, alpha: 0.4 })
    selRing.circle(cx, cy, radius + 2)
    selRing.stroke({ width: 2, color: 0xf59e0b, alpha: 1 })
    container.addChild(selRing)
  }

  const fillColor = token.color
    ? parseInt(token.color.replace('#', ''), 16)
    : (ENTITY_COLORS[token.entityType] ?? 0x6b7280)

  const borderColorHex = token.borderColor ? parseInt(token.borderColor.replace('#', ''), 16) : 0x1f2937

  const hasValidImage =
    token.imagePath && VALID_IMAGE_EXTENSIONS.some((ext) => token.imagePath!.toLowerCase().endsWith(ext))
  const cachedTexture = hasValidImage ? tokenTextureCache.get(token.imagePath!) : undefined

  let avatarContainer: Container | null = null

  // Can we reuse old avatar? (Must check if the imagePath is still the same, usually it is)
  const isImageMatch = oldAvatar?.name === token.imagePath
  const isFallbackMatch = oldAvatar?.name === `fallback-${fillColor}`

  if (oldAvatar && (isImageMatch || (!hasValidImage && isFallbackMatch))) {
    avatarContainer = oldAvatar
    container.addChild(avatarContainer)
  } else {
    avatarContainer = new Container()
    avatarContainer.label = 'avatar-container'
    avatarContainer.name = token.imagePath ?? `fallback-${fillColor}`

    if (cachedTexture) {
      const imgSprite = new Sprite(cachedTexture)
      const diameter = radius * 2
      imgSprite.width = diameter
      imgSprite.height = diameter
      imgSprite.x = cx - radius
      imgSprite.y = cy - radius

      const mask = new Graphics()
      mask.circle(cx, cy, radius)
      mask.fill({ color: 0xffffff })
      imgSprite.mask = mask
      avatarContainer.addChild(mask)
      avatarContainer.addChild(imgSprite)
    } else {
      const circle = new Graphics()
      circle.circle(cx, cy, radius)
      circle.fill({ color: fillColor, alpha: 0.85 })
      avatarContainer.addChild(circle)

      if (hasValidImage && !tokenTextureCache.has(token.imagePath!)) {
        tokenTextureCache.set(token.imagePath!, null as unknown as Texture)
        Assets.load(token.imagePath!)
          .then((texture: Texture) => {
            tokenTextureCache.set(token.imagePath!, texture)
          })
          .catch(() => {
            tokenTextureCache.delete(token.imagePath!)
          })
      }
    }

    // Draw border
    const border = new Graphics()
    switch (token.borderStyle) {
      case 'dashed': {
        const segments = 12
        const arcLength = (2 * Math.PI) / segments
        for (let i = 0; i < segments; i += 2) {
          border.moveTo(cx + radius * Math.cos(i * arcLength), cy + radius * Math.sin(i * arcLength))
          border.arc(cx, cy, radius, i * arcLength, (i + 1) * arcLength)
        }
        border.stroke({ width: 2, color: borderColorHex, alpha: 1 })
        break
      }
      case 'double': {
        border.circle(cx, cy, radius)
        border.stroke({ width: 2, color: borderColorHex, alpha: 1 })
        border.circle(cx, cy, radius + 3)
        border.stroke({ width: 1, color: borderColorHex, alpha: 0.8 })
        break
      }
      default:
        border.circle(cx, cy, radius)
        border.stroke({ width: 2, color: borderColorHex, alpha: 1 })
        break
    }
    avatarContainer.addChild(border)

    container.addChild(avatarContainer)
  }

  // Destroy old avatar if we didn't reuse it
  if (oldAvatar && oldAvatar !== avatarContainer) {
    oldAvatar.destroy({ children: true })
  }

  // Label — show full name for DM or when nameVisible is true, otherwise first letter
  const showFullName = isDM || token.nameVisible !== false
  const labelText = showFullName
    ? token.label.length > 8
      ? `${token.label.slice(0, 7)}\u2026`
      : token.label
    : token.label.charAt(0).toUpperCase()
  const labelFontSize = showFullName ? Math.max(9, radius * 0.55) : Math.max(12, radius * 0.9)
  const style = new TextStyle({
    fontFamily: 'Arial, sans-serif',
    fontSize: labelFontSize,
    fontWeight: 'bold',
    fill: 0xffffff,
    align: 'center'
  })
  const text = new Text({ text: labelText, style })
  text.anchor.set(0.5, 0.5)
  text.x = cx
  text.y = cy
  container.addChild(text)

  // HP bar below the token (gated by showHpBar)
  if (showHpBar && token.maxHP !== undefined && token.maxHP > 0 && token.currentHP !== undefined) {
    const barWidth = tokenSize - 8
    const barHeight = 4
    const barX = 4
    const barY = tokenSize + 2

    const bgBar = new Graphics()
    bgBar.roundRect(barX, barY, barWidth, barHeight, 2)
    bgBar.fill({ color: 0x374151, alpha: 0.8 })
    container.addChild(bgBar)

    const hpPercent = Math.max(0, Math.min(1, token.currentHP / token.maxHP))
    if (hpPercent > 0) {
      const hpBar = new Graphics()
      const hpColor = hpPercent > 0.5 ? 0x22c55e : hpPercent > 0.25 ? 0xeab308 : 0xef4444
      hpBar.roundRect(barX, barY, barWidth * hpPercent, barHeight, 2)
      hpBar.fill({ color: hpColor, alpha: 0.9 })
      container.addChild(hpBar)
    }
  }

  // Status ring based on HP percentage
  if (token.currentHP !== undefined && token.maxHP !== undefined && token.maxHP > 0) {
    const hpPercent = Math.max(0, Math.min(1, token.currentHP / token.maxHP))
    const statusRing = new Graphics()
    drawTokenStatusRing(statusRing, cx, cy, tokenSize - 4, hpPercent)
    container.addChild(statusRing)
  }

  // Condition indicator dots (color-coded, max 3 visible + overflow)
  if (token.conditions.length > 0) {
    const dotRadius = 3
    const dotSpacing = 8
    const visibleCount = Math.min(token.conditions.length, MAX_VISIBLE_DOTS)
    const overflow = token.conditions.length - MAX_VISIBLE_DOTS
    const totalSlots = overflow > 0 ? visibleCount + 1 : visibleCount
    const startX = cx - ((totalSlots - 1) * dotSpacing) / 2
    const dotY = -dotRadius - 2

    for (let i = 0; i < visibleCount; i++) {
      const condName = token.conditions[i].toLowerCase()
      const dotColor = CONDITION_COLOR_MAP[condName] ?? CONDITION_DOT_FALLBACK[i % CONDITION_DOT_FALLBACK.length]
      const dot = new Graphics()
      dot.circle(startX + i * dotSpacing, dotY, dotRadius)
      dot.fill({ color: dotColor, alpha: 1 })
      container.addChild(dot)
    }

    if (overflow > 0) {
      const overflowX = startX + visibleCount * dotSpacing
      const overflowStyle = new TextStyle({
        fontFamily: 'Arial, sans-serif',
        fontSize: 7,
        fontWeight: 'bold',
        fill: 0xffffff,
        align: 'center'
      })
      const overflowText = new Text({ text: `+${overflow}`, style: overflowStyle })
      overflowText.anchor.set(0.5, 0.5)
      overflowText.x = overflowX
      overflowText.y = dotY
      container.addChild(overflowText)
    }
  }

  // Elevation badge (shown in top-right when elevation != 0)
  if (token.elevation && token.elevation !== 0) {
    const elevLabel = `${token.elevation > 0 ? '+' : ''}${token.elevation}ft`
    const elevStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: Math.max(8, radius * 0.4),
      fontWeight: 'bold',
      fill: 0xffffff,
      align: 'center'
    })
    const elevText = new Text({ text: elevLabel, style: elevStyle })
    elevText.anchor.set(0.5, 0.5)

    // Position at top-right of token
    const badgeX = cx + radius * 0.6
    const badgeY = cy - radius * 0.6

    // Background pill
    const badgeBg = new Graphics()
    const badgeColor = token.elevation > 0 ? 0x3b82f6 : 0x92400e // blue for up, amber for down
    const pillW = elevText.width + 6
    const pillH = elevText.height + 2
    badgeBg.roundRect(badgeX - pillW / 2, badgeY - pillH / 2, pillW, pillH, 3)
    badgeBg.fill({ color: badgeColor, alpha: 0.9 })
    container.addChild(badgeBg)

    elevText.x = badgeX
    elevText.y = badgeY
    container.addChild(elevText)
  }

  // Lighting condition badge (bottom-left, shown for dim/darkness)
  if (lightingCondition && lightingCondition !== 'bright') {
    const badgeRadius = Math.max(5, radius * 0.25)
    const badgeX = cx - radius * 0.6
    const badgeY = cy + radius * 0.6

    const badgeBg = new Graphics()
    const badgeColor = lightingCondition === 'dim' ? 0x6366f1 : 0x1e1b4b // indigo for dim, dark indigo for darkness
    badgeBg.circle(badgeX, badgeY, badgeRadius + 1)
    badgeBg.fill({ color: badgeColor, alpha: 0.9 })
    container.addChild(badgeBg)

    // Half-moon for dim, filled circle for darkness
    const icon = new Graphics()
    if (lightingCondition === 'dim') {
      // Half-moon: draw circle then cut left half
      icon.arc(badgeX, badgeY, badgeRadius - 1, -Math.PI / 2, Math.PI / 2, false)
      icon.fill({ color: 0xfbbf24, alpha: 0.9 })
    } else {
      // Filled circle for darkness
      icon.circle(badgeX, badgeY, badgeRadius - 1)
      icon.fill({ color: 0x4b5563, alpha: 0.9 })
    }
    container.addChild(icon)
  }

  // Rider indicator badge (top-left, shown when a rider is on this mount)
  if (token.riderId) {
    const badgeRadius = Math.max(5, radius * 0.25)
    const badgeX = cx - radius * 0.6
    const badgeY = cy - radius * 0.6

    // Background circle
    const riderBadgeBg = new Graphics()
    riderBadgeBg.circle(badgeX, badgeY, badgeRadius + 1)
    riderBadgeBg.fill({ color: 0x16a34a, alpha: 0.9 }) // green-600
    container.addChild(riderBadgeBg)

    // "R" label for rider
    const riderStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: Math.max(7, badgeRadius * 1.2),
      fontWeight: 'bold',
      fill: 0xffffff,
      align: 'center'
    })
    const riderLabel = new Text({ text: 'R', style: riderStyle })
    riderLabel.anchor.set(0.5, 0.5)
    riderLabel.x = badgeX
    riderLabel.y = badgeY
    container.addChild(riderLabel)
  }

  // Position on grid
  container.x = token.gridX * cellSize
  container.y = token.gridY * cellSize

  // Store token metadata for hit testing
  container.eventMode = 'static'
  container.cursor = 'pointer'
  container.hitArea = {
    contains: (x: number, y: number) => {
      const dx = x - cx
      const dy = y - cy
      return dx * dx + dy * dy <= radius * radius
    }
  }

  return container
}

// ─── Speaking indicator ──────────────────────────────────────

const SPEAKING_RING_LABEL = 'speaking-ring'

/**
 * Adds or removes a pulsing speaking indicator ring on a token container.
 * When speaking is true, draws a colored ring that pulses between alpha 0.3 and 1.0.
 * When speaking is false, removes the ring.
 *
 * @param container - The token Container returned by createTokenSprite
 * @param speaking - Whether the player owning this token is currently speaking
 * @param playerColor - Optional hex color for the ring (defaults to 0x22c55e / green)
 */
export function setSpeaking(container: Container, speaking: boolean, playerColor?: number): void {
  // Remove existing speaking ring if present
  const existing = container.children.find((c) => c.label === SPEAKING_RING_LABEL)
  if (existing) {
    container.removeChild(existing)
  }

  if (!speaking) return

  // Derive token geometry from the container's first Graphics child
  // The token is structured as: [optional glow/selection] [main circle] [text] ...
  // We need the center and radius, which we can derive from the container bounds
  const bounds = container.getLocalBounds()
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  // Approximate the radius from the bounds (the main circle dominates width)
  const radius = Math.min(bounds.width, bounds.height) / 2

  const ringColor = playerColor ?? 0x22c55e // default: green
  const ring = new Graphics()
  ring.label = SPEAKING_RING_LABEL

  // Draw the speaking ring
  ring.circle(cx, cy, radius + 5)
  ring.stroke({ width: 3, color: ringColor, alpha: 0.8 })

  // Animate the ring alpha with a simple ticker-based pulse.
  // We store the start time and compute alpha from a sine wave.
  const startTime = Date.now()
  ring.onRender = () => {
    const elapsed = (Date.now() - startTime) / 1000
    // Pulse between 0.3 and 1.0 at ~2Hz
    const t = (Math.sin(elapsed * Math.PI * 4) + 1) / 2 // 0..1
    ring.alpha = 0.3 + t * 0.7
  }

  // Insert behind the main circle (index 0 = furthest back)
  container.addChildAt(ring, 0)
}
