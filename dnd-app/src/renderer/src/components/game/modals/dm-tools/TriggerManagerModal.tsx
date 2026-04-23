import { useState } from 'react'
import { useGameStore } from '../../../../stores/use-game-store'
import type { DmTrigger } from '../../../../types/game-state'

interface TriggerManagerModalProps {
  onClose: () => void
}

type TriggerEvent = DmTrigger['event']
type TriggerAction = DmTrigger['action']

const EVENT_LABELS: Record<TriggerEvent, string> = {
  initiative_change: 'Initiative Change',
  hp_threshold: 'HP Threshold',
  time_elapsed: 'Time Elapsed',
  token_enter_region: 'Token Enters Region',
  condition_applied: 'Condition Applied',
  combat_start: 'Combat Start',
  combat_end: 'Combat End'
}

const ACTION_LABELS: Record<TriggerAction, string> = {
  narrate: 'AI Narration',
  spawn_creature: 'Spawn Creature',
  play_sound: 'Play Sound',
  change_lighting: 'Change Lighting',
  show_message: 'Show Message'
}

const EVENT_OPTIONS = Object.entries(EVENT_LABELS) as [TriggerEvent, string][]
const ACTION_OPTIONS = Object.entries(ACTION_LABELS) as [TriggerAction, string][]

function generateId(): string {
  return `trigger-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
}

export default function TriggerManagerModal({ onClose }: TriggerManagerModalProps): JSX.Element {
  const triggers = useGameStore((s) => s.triggers)
  const addTrigger = useGameStore((s) => s.addTrigger)
  const removeTrigger = useGameStore((s) => s.removeTrigger)
  const toggleTrigger = useGameStore((s) => s.toggleTrigger)
  const fireTrigger = useGameStore((s) => s.fireTrigger)

  const [showForm, setShowForm] = useState(false)
  const [history, setHistory] = useState<Array<{ triggerId: string; triggerName: string; timestamp: number }>>([])

  // Form state
  const [name, setName] = useState('')
  const [event, setEvent] = useState<TriggerEvent>('combat_start')
  const [action, setAction] = useState<TriggerAction>('show_message')
  const [oneShot, setOneShot] = useState(false)

  // Condition fields
  const [entityId, setEntityId] = useState('')
  const [threshold, setThreshold] = useState(50)
  const [regionId, setRegionId] = useState('')
  const [conditionName, setConditionName] = useState('')
  const [elapsed, setElapsed] = useState(0)

  // Action payload fields
  const [messageText, setMessageText] = useState('')
  const [soundId, setSoundId] = useState('')
  const [creatureId, setCreatureId] = useState('')
  const [lightingLevel, setLightingLevel] = useState<'bright' | 'dim' | 'darkness'>('dim')

  const handleCreate = (): void => {
    if (!name.trim()) return

    const condition: DmTrigger['condition'] = {}
    if (entityId) condition.entityId = entityId
    if (event === 'hp_threshold') condition.threshold = threshold
    if (event === 'token_enter_region' && regionId) condition.regionId = regionId
    if (event === 'condition_applied' && conditionName) condition.conditionName = conditionName
    if (event === 'time_elapsed') condition.elapsed = elapsed

    const actionPayload: Record<string, unknown> = {}
    switch (action) {
      case 'show_message':
      case 'narrate':
        actionPayload.text = messageText
        break
      case 'play_sound':
        actionPayload.soundId = soundId
        break
      case 'spawn_creature':
        actionPayload.creatureId = creatureId
        break
      case 'change_lighting':
        actionPayload.level = lightingLevel
        break
    }

    const trigger: DmTrigger = {
      id: generateId(),
      name: name.trim(),
      event,
      condition,
      action,
      actionPayload,
      enabled: true,
      oneShot,
      firedCount: 0
    }

    addTrigger(trigger)
    resetForm()
  }

  const resetForm = (): void => {
    setName('')
    setEvent('combat_start')
    setAction('show_message')
    setOneShot(false)
    setEntityId('')
    setThreshold(50)
    setRegionId('')
    setConditionName('')
    setElapsed(0)
    setMessageText('')
    setSoundId('')
    setCreatureId('')
    setLightingLevel('dim')
    setShowForm(false)
  }

  const handleTestFire = (trigger: DmTrigger): void => {
    fireTrigger(trigger.id)
    setHistory((prev) => [
      { triggerId: trigger.id, triggerName: trigger.name, timestamp: Date.now() },
      ...prev.slice(0, 49)
    ])
  }

  const inputClass =
    'w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 focus:border-amber-500 focus:outline-none'
  const labelClass = 'text-xs text-gray-400 mb-0.5 block'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-[680px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100">AI Proactive Triggers</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none cursor-pointer">
            x
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Trigger list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-300">Triggers ({triggers.length})</span>
              <button
                onClick={() => setShowForm(!showForm)}
                className="px-3 py-1 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded cursor-pointer"
              >
                {showForm ? 'Cancel' : '+ New Trigger'}
              </button>
            </div>

            {triggers.length === 0 && !showForm && (
              <p className="text-xs text-gray-500 italic">No triggers configured. Create one to get started.</p>
            )}

            <div className="space-y-2">
              {triggers.map((t) => (
                <div
                  key={t.id}
                  className={`border rounded-lg p-3 ${
                    t.enabled ? 'border-gray-600 bg-gray-800/50' : 'border-gray-700 bg-gray-800/20 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleTrigger(t.id)}
                        className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${
                          t.enabled ? 'bg-amber-600' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                            t.enabled ? 'left-4' : 'left-0.5'
                          }`}
                        />
                      </button>
                      <span className="text-sm font-medium text-gray-200">{t.name}</span>
                      {t.oneShot && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-900/50 text-blue-300 rounded">one-shot</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-500">fired {t.firedCount ?? 0}x</span>
                      <button
                        onClick={() => handleTestFire(t)}
                        className="px-2 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
                        title="Test fire this trigger"
                      >
                        Test
                      </button>
                      <button
                        onClick={() => removeTrigger(t.id)}
                        className="px-2 py-0.5 text-[10px] bg-red-900/40 hover:bg-red-900/60 text-red-400 rounded cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="mt-1.5 flex gap-3 text-[10px] text-gray-400">
                    <span>
                      Event: <span className="text-gray-300">{EVENT_LABELS[t.event]}</span>
                    </span>
                    <span>
                      Action: <span className="text-gray-300">{ACTION_LABELS[t.action]}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Create trigger form */}
          {showForm && (
            <div className="border border-amber-700/50 rounded-lg p-4 bg-gray-800/40 space-y-3">
              <h3 className="text-sm font-medium text-amber-300">New Trigger</h3>

              <div>
                <label className={labelClass}>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Boss enters phase 2"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Event Type</label>
                  <select
                    value={event}
                    onChange={(e) => setEvent(e.target.value as TriggerEvent)}
                    className={inputClass}
                  >
                    {EVENT_OPTIONS.map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Action</label>
                  <select
                    value={action}
                    onChange={(e) => setAction(e.target.value as TriggerAction)}
                    className={inputClass}
                  >
                    {ACTION_OPTIONS.map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Condition fields */}
              <div className="space-y-2">
                <span className="text-xs text-gray-400 font-medium">Condition</span>

                {(event === 'initiative_change' ||
                  event === 'hp_threshold' ||
                  event === 'token_enter_region' ||
                  event === 'condition_applied') && (
                  <div>
                    <label className={labelClass}>Entity ID (optional)</label>
                    <input
                      type="text"
                      value={entityId}
                      onChange={(e) => setEntityId(e.target.value)}
                      placeholder="Leave blank for any entity"
                      className={inputClass}
                    />
                  </div>
                )}

                {event === 'hp_threshold' && (
                  <div>
                    <label className={labelClass}>HP Threshold (%)</label>
                    <input
                      type="number"
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                      min={0}
                      max={100}
                      className={inputClass}
                    />
                  </div>
                )}

                {event === 'token_enter_region' && (
                  <div>
                    <label className={labelClass}>Region ID</label>
                    <input
                      type="text"
                      value={regionId}
                      onChange={(e) => setRegionId(e.target.value)}
                      placeholder="ID of the target region"
                      className={inputClass}
                    />
                  </div>
                )}

                {event === 'condition_applied' && (
                  <div>
                    <label className={labelClass}>Condition Name</label>
                    <input
                      type="text"
                      value={conditionName}
                      onChange={(e) => setConditionName(e.target.value)}
                      placeholder="e.g., Frightened, Poisoned"
                      className={inputClass}
                    />
                  </div>
                )}

                {event === 'time_elapsed' && (
                  <div>
                    <label className={labelClass}>Elapsed Seconds</label>
                    <input
                      type="number"
                      value={elapsed}
                      onChange={(e) => setElapsed(Number(e.target.value))}
                      min={0}
                      className={inputClass}
                    />
                  </div>
                )}
              </div>

              {/* Action payload fields */}
              <div className="space-y-2">
                <span className="text-xs text-gray-400 font-medium">Action Config</span>

                {(action === 'show_message' || action === 'narrate') && (
                  <div>
                    <label className={labelClass}>{action === 'narrate' ? 'Narration Prompt' : 'Message Text'}</label>
                    <textarea
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      placeholder={action === 'narrate' ? 'Describe the scene...' : 'Message to display...'}
                      className={`${inputClass} h-16 resize-none`}
                    />
                  </div>
                )}

                {action === 'play_sound' && (
                  <div>
                    <label className={labelClass}>Sound Event ID</label>
                    <input
                      type="text"
                      value={soundId}
                      onChange={(e) => setSoundId(e.target.value)}
                      placeholder="e.g., combat.hit.critical"
                      className={inputClass}
                    />
                  </div>
                )}

                {action === 'spawn_creature' && (
                  <div>
                    <label className={labelClass}>Creature ID</label>
                    <input
                      type="text"
                      value={creatureId}
                      onChange={(e) => setCreatureId(e.target.value)}
                      placeholder="ID from creatures.json"
                      className={inputClass}
                    />
                  </div>
                )}

                {action === 'change_lighting' && (
                  <div>
                    <label className={labelClass}>Lighting Level</label>
                    <select
                      value={lightingLevel}
                      onChange={(e) => setLightingLevel(e.target.value as 'bright' | 'dim' | 'darkness')}
                      className={inputClass}
                    >
                      <option value="bright">Bright</option>
                      <option value="dim">Dim</option>
                      <option value="darkness">Darkness</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={oneShot}
                    onChange={(e) => setOneShot(e.target.checked)}
                    className="rounded"
                  />
                  One-shot (disable after first fire)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={resetForm}
                  className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!name.trim()}
                  className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded cursor-pointer"
                >
                  Create Trigger
                </button>
              </div>
            </div>
          )}

          {/* Trigger history */}
          {history.length > 0 && (
            <div>
              <span className="text-xs font-medium text-gray-400 block mb-1.5">Fire History</span>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {history.map((h, i) => (
                  <div key={`${h.triggerId}-${h.timestamp}-${i}`} className="text-[10px] text-gray-500 flex gap-2">
                    <span className="text-gray-600">{new Date(h.timestamp).toLocaleTimeString()}</span>
                    <span className="text-gray-400">{h.triggerName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
