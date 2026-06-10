export const meta = {
  name: 'map-background-covers-map-diagnosis',
  description: 'Pin down the exact element (background-colored) that renders over the map, and whether explicit zIndex layering fixes it',
  phases: [{ title: 'Investigate' }, { title: 'Verify' }]
}

const CTX = `
User bug (FURIOUS, reported repeatedly): on the PixiJS game map (dnd-app/src/renderer/src/components/game/map/),
"the background covers the map" — a fill the SAME COLOR as the canvas background appears OVER the map. The user
says: the map should ALWAYS be on top of the background, below drawings/tokens. They demanded an explicit layer
system: Background < Map < Drawings/Tokens/Other.

A FIX WAS JUST APPLIED (verify it actually addresses the real culprit):
- map-pixi-setup.ts: added exported LAYER_Z constants; set world.sortableChildren = true; assigned every layer an
  explicit .zIndex (map image = LAYER_Z.map = 0, everything else higher).
- use-map-background.ts: the map image sprite now gets sprite.zIndex = LAYER_Z.map.
- MapCanvas.tsx: combat + audio layers get zIndex; a previous pan-CLAMP (which had broken WASD) was REVERTED.

KEY FACTS:
- Pixi app clear color is 0x111827 (map-pixi-setup.ts initPixiApp 'background'). The world Container holds the map
  image (added via addChildAt(sprite,0) in use-map-background.ts) + all overlay layers (createMapLayers).
- The map wrapper div uses CSS 'bg-surface'; there's a z-30 'bg-black' fade overlay (MapCanvas.tsx ~818) gated on a
  'fading' state (map-switch). lighting-overlay.ts fills the whole map with black (drawPlayerView) or a faint amber
  (drawDMPreview), but drawLightingOverlay early-returns when ambientLight==='bright' && no walls && no darkness zones.
  fog-overlay defaults enabled:false. effectiveIsDM = isDM && viewMode==='dm' (GameLayout) is passed as MapCanvas isHost.
`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['culprit', 'isBackgroundColored', 'rendersOverMap', 'whenItHappens', 'fixedByZIndex', 'evidence', 'additionalFixNeeded'],
  properties: {
    culprit: { type: 'string', description: 'the exact element/layer that visually covers the map, with file:line' },
    isBackgroundColored: { type: 'boolean' },
    rendersOverMap: { type: 'boolean', description: 'does it actually paint ON TOP of the map image (vs beside/around it)?' },
    whenItHappens: { type: 'string', description: 'on load / when panning / always / only for non-DM / etc.' },
    fixedByZIndex: { type: 'boolean', description: 'does the just-applied LAYER_Z/sortableChildren change fix it?' },
    evidence: { type: 'string' },
    additionalFixNeeded: { type: 'string', description: 'if zIndex does NOT fix it, the precise additional fix (file:symbol)' }
  }
}

phase('Investigate')
const angles = [
  'Trace what actually paints over the map IMAGE when the user pans (WASD). Is it the canvas clear color (0x111827) revealed where the world has no children once panned past the map edge — i.e. NOT a z-order bug at all but the map simply not covering the viewport? Read MapCanvas.tsx applyTransform + map-event-handlers.ts setupKeyboardPan + use-map-background.ts (initial fit). Decide: is the cure a z-order layer system, or pan-clamping / cover-fit so the map fills the viewport?',
  'Determine whether the just-applied zIndex/sortableChildren layer system actually changes anything: was the map image already at the back (addChildAt(sprite,0)) with all overlays above it? If it was ALREADY correctly ordered, the layer system is a no-op for the real symptom — say so and identify what the real fix must be.',
  'Check every full-extent fill for the background color (0x111827 / bg-surface / 0x000000 darkness / the z-30 bg-black fade): which (if any) can render OVER the map image, and under what condition (solo non-DM lighting? a stuck fade? CSS bg-surface showing through a non-covering canvas?). Ground in file:line.'
]
const findings = await parallel(
  angles.map((a, i) => () =>
    agent(`${CTX}\n\nINVESTIGATE (angle ${i + 1}): ${a}\n\nRead the real code. Return your structured finding.`, {
      label: `investigate:${i + 1}`,
      phase: 'Investigate',
      agentType: 'Explore',
      schema: SCHEMA
    })
  )
)

phase('Verify')
const verdict = await agent(
  `${CTX}\n\nThree investigators reported:\n${findings.filter(Boolean).map((f, i) => `[${i}] culprit=${f.culprit} | overMap=${f.rendersOverMap} | when=${f.whenItHappens} | fixedByZIndex=${f.fixedByZIndex} | additionalFix=${f.additionalFixNeeded}`).join('\n')}\n\nSynthesize the SINGLE most likely true explanation of what the user sees, whether the applied zIndex layer system fixes it, and the precise remaining fix if not. Be decisive.`,
  { label: 'synthesize', phase: 'Verify', schema: {
    type: 'object', additionalProperties: false,
    required: ['realCause', 'zIndexFixesIt', 'remainingFix', 'confidence'],
    properties: {
      realCause: { type: 'string' },
      zIndexFixesIt: { type: 'boolean' },
      remainingFix: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
    }
  } }
)

return { findings, verdict }
