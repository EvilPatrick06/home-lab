import { useEffect, useMemo, useState } from 'react'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { useT } from '../../../../i18n'
import { useGameStore } from '../../../../stores/use-game-store'
import type { MapToken } from '../../../../types/map'
import type { AoEConfig, AoEShape, Direction8 } from '../../map/aoe-overlay'
import { getAoECells } from '../../map/aoe-overlay'

interface AoETemplateModalProps {
  tokens: MapToken[]
  gridWidth: number
  gridHeight: number
  onPlace: (config: AoEConfig) => void
  onClose: () => void
  /** QA-S3: live preview overlay on the map while the DM adjusts the
   * config. Called on every config change with the current AoEConfig,
   * and once with null on unmount so a cancel clears the overlay. */
  onPreview?: (config: AoEConfig | null) => void
}

const SHAPES: Array<{ id: AoEShape; label: string; desc: string; needsDirection: boolean }> = [
  { id: 'cone', label: 'Cone', desc: 'Triangle spreading from origin', needsDirection: true },
  { id: 'cube', label: 'Cube', desc: 'Square of NxN cells', needsDirection: false },
  { id: 'cylinder', label: 'Cylinder', desc: 'Circle (height informational)', needsDirection: false },
  { id: 'emanation', label: 'Emanation', desc: 'All cells within distance of entity', needsDirection: false },
  { id: 'line', label: 'Line', desc: 'Rectangle along direction', needsDirection: true },
  { id: 'sphere', label: 'Sphere', desc: 'Circle of cells', needsDirection: false }
]

const DIRECTIONS: Array<{ id: Direction8; label: string }> = [
  { id: 'N', label: 'N' },
  { id: 'NE', label: 'NE' },
  { id: 'E', label: 'E' },
  { id: 'SE', label: 'SE' },
  { id: 'S', label: 'S' },
  { id: 'SW', label: 'SW' },
  { id: 'W', label: 'W' },
  { id: 'NW', label: 'NW' }
]

const SIZE_PRESETS = [10, 15, 20, 30, 40, 60, 90, 120]

export default function AoETemplateModal({
  tokens,
  gridWidth,
  gridHeight,
  onPlace,
  onClose,
  onPreview
}: AoETemplateModalProps): JSX.Element {
  const { t } = useT()
  useEscapeKey(onClose)
  const [shape, setShape] = useState<AoEShape>('sphere')
  const [sizeFeet, setSizeFeet] = useState(20)
  const [direction, setDirection] = useState<Direction8>('N')
  // S-7 — when opened via the map's right-click "Place AoE here", origin defaults
  // to that cell (set as pendingPlaceCell); otherwise the map center.
  const placeCell = useGameStore.getState().pendingPlaceCell
  const [originX, setOriginX] = useState(placeCell?.gridX ?? Math.floor(gridWidth / 2))
  const [originY, setOriginY] = useState(placeCell?.gridY ?? Math.floor(gridHeight / 2))
  const [widthFeet, setWidthFeet] = useState(5)
  const [step, _setStep] = useState<'config' | 'preview'>('config')

  const currentShape = SHAPES.find((s) => s.id === shape)!

  const config: AoEConfig = useMemo(
    () => ({
      shape,
      sizeFeet,
      originX,
      originY,
      direction: currentShape.needsDirection ? direction : undefined,
      widthFeet: shape === 'line' ? widthFeet : undefined,
      entitySize: 1
    }),
    [shape, sizeFeet, originX, originY, currentShape.needsDirection, direction, widthFeet]
  )

  // QA-S3: keep the live preview overlay in sync with the modal's
  // current config; clear it on cancel/close.
  useEffect(() => {
    onPreview?.(config)
  }, [config, onPreview])
  useEffect(() => {
    return () => {
      onPreview?.(null)
    }
  }, [onPreview])

  // Preview: count affected cells and tokens
  const affectedCells = useMemo(() => getAoECells(config), [config])
  const affectedTokens = useMemo(() => {
    const cellSet = new Set(affectedCells.map((c) => `${c.x},${c.y}`))
    return tokens.filter((t) => {
      for (let dx = 0; dx < t.sizeX; dx++) {
        for (let dy = 0; dy < t.sizeY; dy++) {
          if (cellSet.has(`${t.gridX + dx},${t.gridY + dy}`)) return true
        }
      }
      return false
    })
  }, [affectedCells, tokens])

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} role="presentation" />
      <div className="relative bg-surface border border-border rounded-xl p-5 w-[440px] max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-200">
            {step === 'config' ? t('game.aoeTemplateModal.title') : t('game.aoeTemplateModal.placeTitle')}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label={t('common.actions.close')}
          >
            &times;
          </button>
        </div>

        {step === 'config' && (
          <div className="space-y-4">
            {/* Shape selection */}
            <div>
              <span className="text-xs text-muted block mb-1">{t('game.aoeTemplateModal.shape')}</span>
              <div className="grid grid-cols-3 gap-1">
                {SHAPES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setShape(s.id)}
                    className={`px-2 py-2 text-xs rounded-lg cursor-pointer border ${
                      shape === s.id
                        ? 'bg-red-900/40 border-red-500 text-red-300'
                        : 'bg-surface-2 border-border text-muted hover:bg-gray-700'
                    }`}
                  >
                    <div className="font-semibold">{t(`game.aoeTemplateModal.shapes.${s.id}.label`)}</div>
                    <div className="text-[9px] text-gray-500">{t(`game.aoeTemplateModal.shapes.${s.id}.desc`)}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Size */}
            <div>
              <span className="text-xs text-muted block mb-1">
                {t('game.aoeTemplateModal.sizeLabel', {
                  dimension:
                    shape === 'cone' || shape === 'line'
                      ? t('game.aoeTemplateModal.length')
                      : shape === 'cube'
                        ? t('game.aoeTemplateModal.side')
                        : t('game.aoeTemplateModal.radius'),
                  size: sizeFeet
                })}
              </span>
              <div className="flex gap-1 flex-wrap">
                {SIZE_PRESETS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSizeFeet(s)}
                    className={`px-2 py-1 text-xs rounded cursor-pointer ${
                      sizeFeet === s ? 'bg-red-600 text-white' : 'bg-surface-2 text-muted hover:bg-gray-700'
                    }`}
                  >
                    {s}ft
                  </button>
                ))}
              </div>
            </div>

            {/* Direction (for cone/line) */}
            {currentShape.needsDirection && (
              <div>
                <span className="text-xs text-muted block mb-1">{t('game.aoeTemplateModal.direction')}</span>
                <div className="grid grid-cols-8 gap-1">
                  {DIRECTIONS.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setDirection(d.id)}
                      className={`px-1 py-1.5 text-xs rounded cursor-pointer ${
                        direction === d.id ? 'bg-red-600 text-white' : 'bg-surface-2 text-muted hover:bg-gray-700'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Width for line */}
            {shape === 'line' && (
              <div>
                <span className="text-xs text-muted block mb-1">
                  {t('game.aoeTemplateModal.width', { size: widthFeet })}
                </span>
                <div className="flex gap-1">
                  {[5, 10, 15].map((w) => (
                    <button
                      key={w}
                      onClick={() => setWidthFeet(w)}
                      className={`px-3 py-1 text-xs rounded cursor-pointer ${
                        widthFeet === w ? 'bg-red-600 text-white' : 'bg-surface-2 text-muted hover:bg-gray-700'
                      }`}
                    >
                      {w}ft
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Origin position */}
            <div>
              <span className="text-xs text-muted block mb-1">
                {t('game.aoeTemplateModal.origin', { x: originX, y: originY })}
              </span>
              <div className="flex gap-2 items-center">
                <label className="text-xs text-gray-500">{t('game.aoeTemplateModal.x')}</label>
                <input
                  type="number"
                  min={0}
                  max={gridWidth - 1}
                  value={originX}
                  onChange={(e) => setOriginX(parseInt(e.target.value, 10) || 0)}
                  className="w-16 px-2 py-1 text-xs bg-surface-2 border border-border rounded text-white"
                />
                <label className="text-xs text-gray-500">{t('game.aoeTemplateModal.y')}</label>
                <input
                  type="number"
                  min={0}
                  max={gridHeight - 1}
                  value={originY}
                  onChange={(e) => setOriginY(parseInt(e.target.value, 10) || 0)}
                  className="w-16 px-2 py-1 text-xs bg-surface-2 border border-border rounded text-white"
                />
              </div>
              <p className="text-xs text-gray-600 mt-1">{t('game.aoeTemplateModal.originHint')}</p>
            </div>

            {/* Preview info */}
            <div className="bg-surface-2 rounded-lg px-3 py-2">
              <div className="text-xs text-muted">
                {t('game.aoeTemplateModal.affectedCells')}{' '}
                <span className="text-white font-semibold">{affectedCells.length}</span>
              </div>
              {affectedTokens.length > 0 && (
                <div className="text-xs text-red-400 mt-1">
                  {t('game.aoeTemplateModal.tokensInside', {
                    tokens: affectedTokens.map((tok) => tok.label).join(', ')
                  })}
                </div>
              )}
            </div>

            <button
              onClick={() => onPlace(config)}
              className="w-full px-4 py-3 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg cursor-pointer text-sm"
            >
              {t('game.aoeTemplateModal.placeButton')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
