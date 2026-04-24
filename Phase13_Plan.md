# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 13 of the D&D VTT project.

Phase 13 covers the **Token System** — creation, customization, rendering, movement, auras, vision, and stat block linking. The audit scored it 85% complete. The core mechanics (creation, movement sync, vision, HP bars, conditions, auras) are all working. The critical pattern is **"stored but never rendered"** — custom token colors, border styles, and custom images all have data model support and editor UI, but the rendering layer (`createTokenSprite`) ignores them completely, always drawing hardcoded entity type colored circles.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 13 is entirely client-side. No Raspberry Pi involvement.

**Token Rendering:**

| File | Lines | Key Issues |
|------|-------|-----------|
| `src/renderer/src/components/game/map/token-sprite.ts` | ~262 | Custom colors ignored — hardcoded `ENTITY_COLORS` at lines 4-8, 103; border always 2px solid at line 107; no image rendering for `imagePath` |

**Token Data & Types:**

| File | Lines | Key Info |
|------|-------|---------|
| `src/renderer/src/types/map.ts` | lines 64-140 | `MapToken` interface: `color`, `borderColor`, `borderStyle`, `imagePath`, `aura.*` all defined but some unused in rendering |

**Token UI:**

| File | Lines | Key Issues |
|------|-------|-----------|
| `src/renderer/src/components/game/dm/TokenPlacer.tsx` | 455 | Token creation — manual stats + monster import. Works. |
| `src/renderer/src/components/game/modals/dm-tools/TokenEditorModal.tsx` | 236 | Color/border customization UI exists — renders fine, but changes don't show on map |
| `src/renderer/src/components/game/overlays/TokenContextMenu.tsx` | ~250 | "Apply Condition" button is placeholder (closes menu, no modal) — lines 143-145, 238-244 |

**Token Movement:**

| File | Lines | Key Info |
|------|-------|---------|
| `src/renderer/src/hooks/use-token-movement.ts` | 397 | Advanced movement: OA detection, frightened block, grappled/restrained, terrain cost, mount sync |
| `src/renderer/src/components/game/map/token-animation.ts` | ~100 | Smooth animation between positions |
| `src/renderer/src/network/game-sync.ts` | ~293 | `dm:token-move` broadcast |

**Token Actions:**

| File | Lines | Key Info |
|------|-------|---------|
| `src/renderer/src/services/game-actions/token-actions.ts` | 216 | Place, move, remove, update; creature placement from DB (lines 181-207) |

---

## 📋 Core Objectives & Corrections

### CROSS-PHASE OVERLAP

Several items overlap with Phase 1:
- **Custom token images** (Phase 1 Step 5) — Phase 1 Plan already addresses this. This phase provides the detailed rendering implementation.
- **Token status ring** (Phase 1 Step 4) — Phase 1 Plan addresses `drawTokenStatusRing`. This phase provides condition badge detail.
- **Token context menu → conditions** (Phase 1 Step 6) — Phase 1 Plan addresses `QuickConditionModal` wiring.

This phase focuses on the **token-specific rendering and customization fixes** that Phase 1 only scaffolded.

### CRITICAL: Rendering Doesn't Match Data

| # | Issue | Data Exists | Rendered? |
|---|-------|------------|-----------|
| R1 | Custom token colors | `token.color` in MapToken, editable in TokenEditorModal | **NO** — `createTokenSprite` uses hardcoded `ENTITY_COLORS` |
| R2 | Custom border colors | `token.borderColor` in MapToken, editable in TokenEditorModal | **NO** — always `0x1f2937` |
| R3 | Border styles | `token.borderStyle: 'solid' \| 'dashed' \| 'double'` | **NO** — always 2px solid stroke |
| R4 | Custom token images | `token.imagePath` in MapToken | **NO** — no rendering path, no UI to set images |

### HIGH: Incomplete UI

| # | Issue | Location |
|---|-------|----------|
| U1 | Condition application button is placeholder | `TokenContextMenu.tsx` lines 143-145, 238-244 — `handleApplyCondition` just calls `onClose()` |
| U2 | No mount/dismount UI modal | `onOpenMountModal` prop exists but implementation unclear |
| U3 | No visual indication of token ownership for players | Players can't tell which tokens they can control |
| U4 | No shift+drag selection box for tokens | Only ctrl+click multi-selection |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Fix Custom Token Color Rendering (R1, R2)

**Step 1 — Use Custom Colors in createTokenSprite**
- Open `src/renderer/src/components/game/map/token-sprite.ts`
- Find `ENTITY_COLORS` at lines 4-8 and the fill color assignment at line 103
- Change to use the token's custom color with fallback to entity type:
  ```typescript
  const fillColor = token.color
    ? parseInt(token.color.replace('#', ''), 16)
    : ENTITY_COLORS[token.entityType] ?? 0x6b7280

  circle.fill({ color: fillColor })
  ```
- For the border color, find line 107:
  ```typescript
  const borderHex = token.borderColor
    ? parseInt(token.borderColor.replace('#', ''), 16)
    : 0x1f2937

  circle.stroke({ width: 2, color: borderHex, alpha: 1 })
  ```
- Ensure the `token.color` field is a hex string (e.g., `'#ff0000'`). Check the color picker format in `TokenEditorModal.tsx`.

**Step 2 — Implement Border Style Rendering (R3)**
- In `createTokenSprite`, replace the hardcoded solid stroke with style-aware rendering:
  ```typescript
  const borderWidth = 2
  switch (token.borderStyle) {
    case 'dashed': {
      // PixiJS doesn't natively support dashed strokes.
      // Workaround: draw dashed arc segments manually
      const segments = 12
      const arcLength = (2 * Math.PI) / segments
      for (let i = 0; i < segments; i += 2) {
        circle.arc(0, 0, radius, i * arcLength, (i + 1) * arcLength)
        circle.stroke({ width: borderWidth, color: borderHex })
      }
      break
    }
    case 'double': {
      circle.stroke({ width: borderWidth, color: borderHex })
      // Outer ring
      const outer = new Graphics()
      outer.circle(0, 0, radius + 3)
      outer.stroke({ width: 1, color: borderHex })
      container.addChild(outer)
      break
    }
    default: // 'solid'
      circle.stroke({ width: borderWidth, color: borderHex })
  }
  ```
- If PixiJS v8 has native dash support, use it instead of manual arcs

### Sub-Phase B: Custom Token Images (R4)

**Step 3 — Add Image Upload to TokenEditorModal**
- Open `src/renderer/src/components/game/modals/dm-tools/TokenEditorModal.tsx`
- Add an "Upload Image" section:
  ```tsx
  <div>
    <label>Token Image</label>
    <input type="file" accept="image/png,image/jpeg,image/webp"
           onChange={handleImageUpload} />
    {token.imagePath && (
      <div>
        <img src={token.imagePath} className="w-16 h-16 rounded-full object-cover" />
        <button onClick={() => updateToken({ imagePath: undefined })}>
          Remove Image
        </button>
      </div>
    )}
  </div>
  ```
- Read the file via FileReader → base64 data URL, store in `token.imagePath`
- Add file size validation (max 500KB per token image)

**Step 4 — Render Token Images in createTokenSprite**
- Open `src/renderer/src/components/game/map/token-sprite.ts`
- Add image rendering path at the beginning of sprite creation:
  ```typescript
  if (token.imagePath) {
    // Load texture from data URL or file path
    const texture = await Assets.load(token.imagePath)
    const sprite = new Sprite(texture)
    sprite.width = tokenSize
    sprite.height = tokenSize
    sprite.anchor.set(0.5)

    // Apply circular mask
    const mask = new Graphics()
    mask.circle(0, 0, radius)
    mask.fill({ color: 0xffffff })
    sprite.mask = mask

    container.addChild(mask, sprite)
  } else {
    // Existing colored circle rendering
  }
  ```
- Add texture caching to avoid reloading per render cycle:
  ```typescript
  const textureCache = new Map<string, Texture>()
  ```
- Handle load errors gracefully — fall back to colored circle if image fails

**Step 5 — Add Image to TokenPlacer**
- Open `src/renderer/src/components/game/dm/TokenPlacer.tsx`
- Add image upload option during initial token creation (before placement)
- Allow setting image alongside manual stats or monster import

### Sub-Phase C: Condition Application UI (U1)

**Step 6 — Wire TokenContextMenu to QuickConditionModal**
- Open `src/renderer/src/components/game/overlays/TokenContextMenu.tsx`
- Find `handleApplyCondition` at lines 143-145 (currently just calls `onClose()`)
- Replace with logic to open `QuickConditionModal`:
  ```typescript
  const [showConditionModal, setShowConditionModal] = useState(false)

  const handleApplyCondition = () => {
    setShowConditionModal(true)
  }

  // In render:
  {showConditionModal && (
    <QuickConditionModal
      targetTokenId={token.id}
      targetEntityId={token.entityId}
      onClose={() => {
        setShowConditionModal(false)
        onClose()
      }}
    />
  )}
  ```
- Import `QuickConditionModal` from `src/renderer/src/components/game/modals/combat/QuickConditionModal.tsx`
- Note: Phase 1 Step 6 also addresses this. If Phase 1 has already been executed, verify the fix is in place. If not, implement it here.

### Sub-Phase D: Mounted Combat UI (U2)

**Step 7 — Create MountDismountModal**
- Create `MountDismountModal.tsx` in the combat modals:
  ```tsx
  interface MountDismountModalProps {
    riderId: string      // the character mounting
    availableMounts: MapToken[]  // tokens that can be mounts (Large+ creatures)
    onMount: (mountTokenId: string) => void
    onDismount: () => void
    onClose: () => void
  }
  ```
- Show available mount tokens (Large or larger creatures within 5ft)
- "Mount" button sets `riderId` on the mount token
- "Dismount" button clears `riderId` and places rider adjacent

**Step 8 — Wire to TokenContextMenu**
- Find `onOpenMountModal` prop in token-related components
- Wire it to open `MountDismountModal` with the current token as the rider
- Add "Mount" / "Dismount" options in the token context menu when:
  - Mount: token is adjacent to a Large+ ally with no current rider
  - Dismount: token has `riderId` set (is currently riding a mount)

### Sub-Phase E: Token Ownership Visual (U3)

**Step 9 — Add Ownership Indicators for Players**
- Open `src/renderer/src/components/game/map/token-sprite.ts`
- For player clients (not DM), add a visual indicator on tokens they control:
  ```typescript
  if (!isHost && token.entityId === playerCharacterId) {
    // Add subtle glow or border highlight to indicate "your token"
    const ownerIndicator = new Graphics()
    ownerIndicator.circle(0, 0, radius + 2)
    ownerIndicator.stroke({ width: 1, color: 0x60a5fa, alpha: 0.6 }) // soft blue
    container.addChildAt(ownerIndicator, 0)
  }
  ```
- Pass `isHost` and `playerCharacterId` into `createTokenSprite` (may need to add to params)
- This tells players which token(s) they can drag

### Sub-Phase F: Shift+Drag Selection Box (U4)

**Step 10 — Implement Drag Selection Box**
- Open `src/renderer/src/components/game/map/map-event-handlers.ts`
- The `selectionBoxRef` already exists for visual rendering
- Wire it to actually select tokens within the box:
  ```typescript
  // On mouseup with selection box:
  if (selectionBox) {
    const { x, y, width, height } = selectionBox
    const selectedIds = activeMap.tokens
      .filter(token => {
        const tokenPixelX = token.gridX * cellSize
        const tokenPixelY = token.gridY * cellSize
        return tokenPixelX >= x && tokenPixelX <= x + width &&
               tokenPixelY >= y && tokenPixelY <= y + height
      })
      .map(t => t.id)
    setSelectedTokenIds(selectedIds)
  }
  ```
- Trigger on shift+mousedown → drag → mouseup (not regular drag which moves tokens)
- Show the selection rectangle during drag (already visually rendered)

### Sub-Phase G: Player Character Auto-Token Creation

**Step 11 — Auto-Create Token from Player Character Sheet**
- When a player selects a character in the lobby and the game starts, automatically create a player token with the character's stats:
  ```typescript
  function createTokenFromCharacter(character: Character5e): Partial<MapToken> {
    return {
      entityId: character.id,
      entityType: 'player',
      label: character.name.substring(0, 3),
      maxHP: character.hitPoints.maximum,
      currentHP: character.hitPoints.current,
      ac: character.armorClass,
      walkSpeed: character.speed,
      darkvision: DARKVISION_SPECIES.includes(character.species?.id ?? ''),
      darkvisionRange: character.features?.find(f => f.name === 'Superior Darkvision') ? 120 : 60,
    }
  }
  ```
- The DM can then place the token on the map via the standard placement flow
- Or auto-place at a designated "start position" if the map has one

---

## ⚠️ Constraints & Edge Cases

### Custom Colors
- **Color format**: `TokenEditorModal` uses a color picker that may output `'#rrggbb'` format. PixiJS expects `0xRRGGBB` integer. Always convert: `parseInt(color.replace('#', ''), 16)`.
- **Undefined vs null**: If `token.color` is undefined/null/empty, fall back to entity type color. Do NOT render a black/invisible token.
- **Network sync**: Custom colors must be included in `dm:token-update` payloads so all clients see the same colors.

### Token Images
- **File size**: Base64-encoded images are ~33% larger than binary. A 500KB image becomes ~667KB in JSON. Since tokens are persisted in game state JSON, large images bloat save files. Enforce strict size limits.
- **Texture caching**: PixiJS `Assets.load()` caches by URL. Base64 data URLs are unique per image, so caching works automatically. However, if the same image is used on multiple tokens, it will be cached once.
- **Circular mask**: The mask must match the token's size. Large tokens (2x2, 3x3) need a proportionally larger mask and sprite.
- **Fallback rendering**: If `Assets.load()` fails (corrupt data URL), catch the error and fall back to colored circle rendering.

### Border Styles
- **PixiJS v8 Graphics API**: Check whether `@pixi/graphics` v8 supports `dash` in stroke options. If it does, use native dashes instead of manual arc segments. If not, the manual approach works but is visually approximated.
- **Performance**: Dashed/double borders add drawing calls per token. For maps with 50+ tokens, verify there's no visible performance impact.

### Condition Modal
- **Phase 1 overlap**: Phase 1 Step 6 also addresses this exact issue. If Phase 1 has already been implemented, verify the fix rather than duplicating. If not, implement here.
- **Condition list**: The `QuickConditionModal` should show all 15 2024 PHB conditions (Blinded, Charmed, Deafened, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious, Exhaustion).

### Mounted Combat
- **Mount size**: Only creatures of size Large or larger can be mounts for Medium/Small riders (2024 PHB rule).
- **Movement**: When mounted, the rider uses the mount's speed, not their own. The existing `use-token-movement.ts` mount speed override (lines 221-228) handles this.
- **Opportunity attacks**: When the mount moves, enemies can take OAs against the rider OR the mount (rider's choice in controlled mount rules). Verify `use-token-movement.ts` handles this.

### Selection Box
- **Camera transform**: The selection box coordinates must be in world space (accounting for zoom and pan), not screen space. Use the PixiJS world container's inverse transform to convert screen coordinates.
- **Performance**: Don't check every token on every mousemove during drag. Only calculate selection on mouseup.

Begin implementation now. Start with Sub-Phase A (Steps 1-2) for custom color/border rendering — these are the highest-impact fixes since users already see the customization UI but the changes don't appear on the map. Then Sub-Phase B (Steps 3-5) for token images as the most requested missing feature.
