import { useCallback, useState } from 'react'
import { useGameStore } from '../../../stores/use-game-store'
import type { GameMap, RegionAction, RegionShape, RegionTrigger, SceneRegion } from '../../../types/map'

interface RegionManagerProps {
  activeMap: GameMap | null
}

type RegionShapeType = 'circle' | 'rectangle' | 'polygon'

const TRIGGER_LABELS: Record<RegionTrigger, string> = {
  enter: 'On Enter',
  leave: 'On Leave',
  'start-turn': 'Start of Turn',
  'end-turn': 'End of Turn'
}

const ACTION_LABELS: Record<RegionAction['type'], string> = {
  'alert-dm': 'Alert DM',
  teleport: 'Teleport',
  'apply-condition': 'Apply Condition'
}

const COMMON_CONDITIONS = [
  'Prone',
  'Poisoned',
  'Frightened',
  'Blinded',
  'Deafened',
  'Restrained',
  'Stunned',
  'Paralyzed',
  'Charmed',
  'Invisible'
]

export default function RegionManager({ activeMap }: RegionManagerProps): JSX.Element {
  const gameStore = useGameStore()
  const regions = activeMap?.regions ?? []

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [shapeType, setShapeType] = useState<RegionShapeType>('rectangle')
  const [trigger, setTrigger] = useState<RegionTrigger>('enter')
  const [actionType, setActionType] = useState<RegionAction['type']>('alert-dm')
  const [alertMessage, setAlertMessage] = useState('A creature entered the region!')
  const [condition, setCondition] = useState('Prone')
  const [teleportX, setTeleportX] = useState(0)
  const [teleportY, setTeleportY] = useState(0)
  const [teleportMapId, setTeleportMapId] = useState('')
  const [visibleToPlayers, setVisibleToPlayers] = useState(false)
  const [oneShot, setOneShot] = useState(false)
  const [color, setColor] = useState('#f87171')

  const [shapeCircleCX, setShapeCircleCX] = useState(5)
  const [shapeCircleCY, setShapeCircleCY] = useState(5)
  const [shapeCircleR, setShapeCircleR] = useState(3)
  const [shapeRectX, setShapeRectX] = useState(3)
  const [shapeRectY, setShapeRectY] = useState(3)
  const [shapeRectW, setShapeRectW] = useState(4)
  const [shapeRectH, setShapeRectH] = useState(4)
  const [shapePolyPoints, setShapePolyPoints] = useState('3,3 7,3 5,7')

  const resetForm = useCallback(() => {
    setName('')
    setShapeType('rectangle')
    setTrigger('enter')
    setActionType('alert-dm')
    setAlertMessage('A creature entered the region!')
    setCondition('Prone')
    setTeleportX(0)
    setTeleportY(0)
    setTeleportMapId('')
    setVisibleToPlayers(false)
    setOneShot(false)
    setColor('#f87171')
    setShapeCircleCX(5)
    setShapeCircleCY(5)
    setShapeCircleR(3)
    setShapeRectX(3)
    setShapeRectY(3)
    setShapeRectW(4)
    setShapeRectH(4)
    setShapePolyPoints('3,3 7,3 5,7')
    setEditingId(null)
  }, [])

  const buildShape = useCallback((): RegionShape => {
    switch (shapeType) {
      case 'circle':
        return { type: 'circle', centerX: shapeCircleCX, centerY: shapeCircleCY, radius: shapeCircleR }
      case 'rectangle':
        return { type: 'rectangle', x: shapeRectX, y: shapeRectY, width: shapeRectW, height: shapeRectH }
      case 'polygon': {
        const points = shapePolyPoints
          .trim()
          .split(/\s+/)
          .map((pair) => {
            const [x, y] = pair.split(',').map(Number)
            return { x: x || 0, y: y || 0 }
          })
        return { type: 'polygon', points }
      }
    }
  }, [
    shapeType,
    shapeCircleCX,
    shapeCircleCY,
    shapeCircleR,
    shapeRectX,
    shapeRectY,
    shapeRectW,
    shapeRectH,
    shapePolyPoints
  ])

  const buildAction = useCallback((): RegionAction => {
    switch (actionType) {
      case 'alert-dm':
        return { type: 'alert-dm', message: alertMessage }
      case 'teleport':
        return {
          type: 'teleport',
          targetMapId: teleportMapId || activeMap?.id || '',
          targetGridX: teleportX,
          targetGridY: teleportY
        }
      case 'apply-condition':
        return { type: 'apply-condition', condition }
    }
  }, [actionType, alertMessage, teleportMapId, activeMap?.id, teleportX, teleportY, condition])

  const handleSave = useCallback(() => {
    if (!activeMap || !name.trim()) return

    const region: SceneRegion = {
      id: editingId ?? crypto.randomUUID(),
      name: name.trim(),
      shape: buildShape(),
      trigger,
      action: buildAction(),
      enabled: true,
      visibleToPlayers,
      oneShot,
      color
    }

    if (editingId) {
      gameStore.updateRegion(activeMap.id, editingId, region)
    } else {
      gameStore.addRegion(activeMap.id, region)
    }

    resetForm()
    setShowForm(false)
  }, [
    activeMap,
    name,
    editingId,
    buildShape,
    trigger,
    buildAction,
    visibleToPlayers,
    oneShot,
    color,
    gameStore,
    resetForm
  ])

  const handleEdit = useCallback((region: SceneRegion) => {
    setEditingId(region.id)
    setName(region.name)
    setTrigger(region.trigger)
    setActionType(region.action.type)
    setVisibleToPlayers(region.visibleToPlayers)
    setOneShot(region.oneShot)
    setColor(region.color ?? '#f87171')

    const s = region.shape
    setShapeType(s.type)
    if (s.type === 'circle') {
      setShapeCircleCX(s.centerX)
      setShapeCircleCY(s.centerY)
      setShapeCircleR(s.radius)
    } else if (s.type === 'rectangle') {
      setShapeRectX(s.x)
      setShapeRectY(s.y)
      setShapeRectW(s.width)
      setShapeRectH(s.height)
    } else if (s.type === 'polygon') {
      setShapePolyPoints(s.points.map((p) => `${p.x},${p.y}`).join(' '))
    }

    const a = region.action
    if (a.type === 'alert-dm') setAlertMessage(a.message)
    if (a.type === 'teleport') {
      setTeleportMapId(a.targetMapId)
      setTeleportX(a.targetGridX)
      setTeleportY(a.targetGridY)
    }
    if (a.type === 'apply-condition') setCondition(a.condition)

    setShowForm(true)
  }, [])

  const inputClass =
    'w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:border-amber-500 focus:outline-none'
  const labelClass = 'block text-[10px] text-gray-500 mb-0.5'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Regions</h3>
        <button
          onClick={() => {
            resetForm()
            setShowForm(!showForm)
          }}
          className="px-2 py-0.5 text-[10px] rounded bg-amber-600 text-white hover:bg-amber-500 cursor-pointer"
        >
          {showForm ? 'Cancel' : '+ New'}
        </button>
      </div>

      {showForm && (
        <div className="space-y-2 bg-gray-800/50 rounded-lg p-2 border border-gray-700">
          <div>
            <label className={labelClass}>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Trap, Teleporter..."
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Shape</label>
            <select
              value={shapeType}
              onChange={(e) => setShapeType(e.target.value as RegionShapeType)}
              className={inputClass}
            >
              <option value="rectangle">Rectangle</option>
              <option value="circle">Circle</option>
              <option value="polygon">Polygon</option>
            </select>
          </div>

          {shapeType === 'rectangle' && (
            <div className="grid grid-cols-4 gap-1">
              <div>
                <label className={labelClass}>X</label>
                <input
                  type="number"
                  value={shapeRectX}
                  onChange={(e) => setShapeRectX(+e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Y</label>
                <input
                  type="number"
                  value={shapeRectY}
                  onChange={(e) => setShapeRectY(+e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>W</label>
                <input
                  type="number"
                  value={shapeRectW}
                  onChange={(e) => setShapeRectW(+e.target.value)}
                  min={1}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>H</label>
                <input
                  type="number"
                  value={shapeRectH}
                  onChange={(e) => setShapeRectH(+e.target.value)}
                  min={1}
                  className={inputClass}
                />
              </div>
            </div>
          )}

          {shapeType === 'circle' && (
            <div className="grid grid-cols-3 gap-1">
              <div>
                <label className={labelClass}>Center X</label>
                <input
                  type="number"
                  value={shapeCircleCX}
                  onChange={(e) => setShapeCircleCX(+e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Center Y</label>
                <input
                  type="number"
                  value={shapeCircleCY}
                  onChange={(e) => setShapeCircleCY(+e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Radius</label>
                <input
                  type="number"
                  value={shapeCircleR}
                  onChange={(e) => setShapeCircleR(+e.target.value)}
                  min={1}
                  className={inputClass}
                />
              </div>
            </div>
          )}

          {shapeType === 'polygon' && (
            <div>
              <label className={labelClass}>Points (x,y pairs separated by spaces)</label>
              <input
                value={shapePolyPoints}
                onChange={(e) => setShapePolyPoints(e.target.value)}
                placeholder="3,3 7,3 5,7"
                className={inputClass}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-1">
            <div>
              <label className={labelClass}>Trigger</label>
              <select
                value={trigger}
                onChange={(e) => setTrigger(e.target.value as RegionTrigger)}
                className={inputClass}
              >
                {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Action</label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as RegionAction['type'])}
                className={inputClass}
              >
                {Object.entries(ACTION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {actionType === 'alert-dm' && (
            <div>
              <label className={labelClass}>Alert Message</label>
              <input value={alertMessage} onChange={(e) => setAlertMessage(e.target.value)} className={inputClass} />
            </div>
          )}

          {actionType === 'apply-condition' && (
            <div>
              <label className={labelClass}>Condition</label>
              <select value={condition} onChange={(e) => setCondition(e.target.value)} className={inputClass}>
                {COMMON_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {actionType === 'teleport' && (
            <div className="grid grid-cols-3 gap-1">
              <div className="col-span-3">
                <label className={labelClass}>Target Map ID (blank = current)</label>
                <input
                  value={teleportMapId}
                  onChange={(e) => setTeleportMapId(e.target.value)}
                  placeholder="Current map"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Grid X</label>
                <input
                  type="number"
                  value={teleportX}
                  onChange={(e) => setTeleportX(+e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Grid Y</label>
                <input
                  type="number"
                  value={teleportY}
                  onChange={(e) => setTeleportY(+e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={visibleToPlayers}
                onChange={(e) => setVisibleToPlayers(e.target.checked)}
                className="accent-cyan-500 w-3 h-3 cursor-pointer"
              />
              <span className="text-[10px] text-gray-400">Visible to players</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={oneShot}
                onChange={(e) => setOneShot(e.target.checked)}
                className="accent-cyan-500 w-3 h-3 cursor-pointer"
              />
              <span className="text-[10px] text-gray-400">One-shot</span>
            </label>
          </div>

          <div>
            <label className={labelClass}>Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-8 h-6 rounded border border-gray-700 cursor-pointer"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="w-full py-1.5 text-xs rounded-lg bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-40 cursor-pointer"
          >
            {editingId ? 'Update Region' : 'Create Region'}
          </button>
        </div>
      )}

      {regions.length === 0 && !showForm && (
        <p className="text-xs text-gray-600 text-center py-4">
          No regions defined. Click "+ New" to create trigger zones.
        </p>
      )}

      {regions.map((region) => (
        <div
          key={region.id}
          className={`rounded-lg border p-2 text-xs ${region.enabled ? 'border-gray-700 bg-gray-800/50' : 'border-gray-800 bg-gray-900/50 opacity-60'}`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-semibold text-gray-200">{region.name}</span>
            <div className="flex gap-1">
              <button
                onClick={() =>
                  activeMap && gameStore.updateRegion(activeMap.id, region.id, { enabled: !region.enabled })
                }
                className="px-1.5 py-0.5 text-[9px] rounded bg-gray-700 text-gray-400 hover:text-white cursor-pointer"
              >
                {region.enabled ? 'Disable' : 'Enable'}
              </button>
              <button
                onClick={() => handleEdit(region)}
                className="px-1.5 py-0.5 text-[9px] rounded bg-gray-700 text-gray-400 hover:text-white cursor-pointer"
              >
                Edit
              </button>
              <button
                onClick={() => activeMap && gameStore.removeRegion(activeMap.id, region.id)}
                className="px-1.5 py-0.5 text-[9px] rounded bg-red-900/50 text-red-400 hover:text-red-200 cursor-pointer"
              >
                Del
              </button>
            </div>
          </div>
          <div className="text-gray-500 space-x-2">
            <span>{region.shape.type}</span>
            <span>{TRIGGER_LABELS[region.trigger]}</span>
            <span className="text-amber-400">{ACTION_LABELS[region.action.type]}</span>
            {region.oneShot && <span className="text-cyan-400">(one-shot)</span>}
          </div>
        </div>
      ))}

      {activeMap && regions.length > 0 && (
        <button
          onClick={() => gameStore.clearRegions(activeMap.id)}
          className="w-full px-3 py-1.5 text-xs bg-red-900/30 border border-red-800 rounded-lg text-red-300 hover:bg-red-900/50 cursor-pointer"
        >
          Clear All Regions ({regions.length})
        </button>
      )}
    </div>
  )
}
