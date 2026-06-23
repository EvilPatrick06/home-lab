import { useEffect, useState } from 'react'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { useT } from '../../../../i18n'
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
  const { t } = useT()
  const triggers = useGameStore((s) => s.triggers)
  const addTrigger = useGameStore((s) => s.addTrigger)
  const removeTrigger = useGameStore((s) => s.removeTrigger)
  const toggleTrigger = useGameStore((s) => s.toggleTrigger)
  const fireTrigger = useGameStore((s) => s.fireTrigger)

  useEscapeKey(onClose)

  const [showForm, setShowForm] = useState(false)
  const [history, setHistory] = useState<Array<{ triggerId: string; triggerName: string; timestamp: number }>>([])

  // PHASE-13 13D — global kill switch for proactive trigger processing (main-side observer).
  const [triggersPaused, setTriggersPaused] = useState(false)
  useEffect(() => {
    let cancelled = false
    void window.api.ai.getTriggerObserverEnabled().then((r) => {
      if (!cancelled) setTriggersPaused(!r.enabled)
    })
    return () => {
      cancelled = true
    }
  }, [])
  const handleTogglePaused = async (): Promise<void> => {
    const res = await window.api.ai.setTriggerObserverEnabled(triggersPaused) // currently paused → enable
    setTriggersPaused(!res.enabled)
  }

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
  const [spawnGridX, setSpawnGridX] = useState('')
  const [spawnGridY, setSpawnGridY] = useState('')
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
      case 'spawn_creature': {
        actionPayload.creatureId = creatureId
        // PHASE-13 13D — write coords only when BOTH are valid non-negative integers.
        const gx = Number.parseInt(spawnGridX, 10)
        const gy = Number.parseInt(spawnGridY, 10)
        if (Number.isInteger(gx) && gx >= 0 && Number.isInteger(gy) && gy >= 0) {
          actionPayload.gridX = gx
          actionPayload.gridY = gy
        }
        break
      }
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
    'w-full bg-surface-2 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 focus:border-amber-500 focus:outline-none'
  const labelClass = 'text-xs text-muted mb-0.5 block'

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-surface border border-border rounded-lg shadow-xl w-[680px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-fg">{t('game.triggerManagerModal.title')}</h2>
            {triggersPaused && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 border border-amber-700/40">
                {t('game.triggerManagerModal.pausedBadge')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* PHASE-13 13D — global pause/resume for all proactive trigger processing. */}
            <button
              type="button"
              onClick={() => void handleTogglePaused()}
              className="px-2 py-1 text-xs rounded border border-border text-gray-300 hover:bg-surface-2 cursor-pointer"
            >
              {triggersPaused ? t('game.triggerManagerModal.resumeAll') : t('game.triggerManagerModal.pauseAll')}
            </button>
            <button
              onClick={onClose}
              className="text-muted hover:text-white text-xl leading-none cursor-pointer"
              aria-label={t('common.actions.close')}
            >
              x
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Trigger list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-300">
                {t('game.triggerManagerModal.triggers', { count: triggers.length })}
              </span>
              <button
                onClick={() => setShowForm(!showForm)}
                className="px-3 py-1 text-xs bg-amber-600 hover:bg-accent-strong text-white rounded cursor-pointer"
              >
                {showForm ? t('common.actions.cancel') : t('game.triggerManagerModal.newTrigger')}
              </button>
            </div>

            {triggers.length === 0 && !showForm && (
              <p className="text-xs text-gray-500 italic">{t('game.triggerManagerModal.empty')}</p>
            )}

            <div className="space-y-2">
              {triggers.map((trig) => (
                <div
                  key={trig.id}
                  className={`border rounded-lg p-3 ${
                    trig.enabled ? 'border-gray-600 bg-surface-2/50' : 'border-border bg-surface-2/20 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleTrigger(trig.id)}
                        className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${
                          trig.enabled ? 'bg-amber-600' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                            trig.enabled ? 'left-4' : 'left-0.5'
                          }`}
                        />
                      </button>
                      <span className="text-sm font-medium text-gray-200">{trig.name}</span>
                      {trig.oneShot && (
                        <span className="text-xs px-1.5 py-0.5 bg-blue-900/50 text-blue-300 rounded">
                          {t('game.triggerManagerModal.oneShotBadge')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500">
                        {t('game.triggerManagerModal.fired', { count: trig.firedCount ?? 0 })}
                      </span>
                      <button
                        onClick={() => handleTestFire(trig)}
                        className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
                        title={t('game.triggerManagerModal.testFireTooltip')}
                      >
                        {t('game.triggerManagerModal.test')}
                      </button>
                      <button
                        onClick={() => removeTrigger(trig.id)}
                        className="px-2 py-0.5 text-xs bg-red-900/40 hover:bg-red-900/60 text-red-400 rounded cursor-pointer"
                      >
                        {t('common.actions.delete')}
                      </button>
                    </div>
                  </div>
                  <div className="mt-1.5 flex gap-3 text-xs text-muted">
                    <span>
                      {t('game.triggerManagerModal.eventLabel')}{' '}
                      <span className="text-gray-300">{t(`game.triggerManagerModal.events.${trig.event}`)}</span>
                    </span>
                    <span>
                      {t('game.triggerManagerModal.actionLabel')}{' '}
                      <span className="text-gray-300">{t(`game.triggerManagerModal.actions.${trig.action}`)}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Create trigger form */}
          {showForm && (
            <div className="border border-amber-700/50 rounded-lg p-4 bg-surface-2/40 space-y-3">
              <h3 className="text-sm font-medium text-amber-300">{t('game.triggerManagerModal.newTriggerTitle')}</h3>

              <div>
                <label className={labelClass}>{t('game.triggerManagerModal.name')}</label>
                <input
                  type="text"
                  name="trigger-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('game.triggerManagerModal.namePlaceholder')}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>{t('game.triggerManagerModal.eventType')}</label>
                  <select
                    name="trigger-event"
                    value={event}
                    onChange={(e) => setEvent(e.target.value as TriggerEvent)}
                    className={inputClass}
                  >
                    {EVENT_OPTIONS.map(([val]) => (
                      <option key={val} value={val}>
                        {t(`game.triggerManagerModal.events.${val}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>{t('game.triggerManagerModal.action')}</label>
                  <select
                    name="trigger-action"
                    value={action}
                    onChange={(e) => setAction(e.target.value as TriggerAction)}
                    className={inputClass}
                  >
                    {ACTION_OPTIONS.map(([val]) => (
                      <option key={val} value={val}>
                        {t(`game.triggerManagerModal.actions.${val}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Condition fields */}
              <div className="space-y-2">
                <span className="text-xs text-muted font-medium">{t('game.triggerManagerModal.condition')}</span>

                {(event === 'initiative_change' ||
                  event === 'hp_threshold' ||
                  event === 'token_enter_region' ||
                  event === 'condition_applied') && (
                  <div>
                    <label className={labelClass}>{t('game.triggerManagerModal.entityId')}</label>
                    <input
                      type="text"
                      name="entity-id"
                      value={entityId}
                      onChange={(e) => setEntityId(e.target.value)}
                      placeholder={t('game.triggerManagerModal.entityIdPlaceholder')}
                      className={inputClass}
                    />
                  </div>
                )}

                {event === 'hp_threshold' && (
                  <div>
                    <label className={labelClass}>{t('game.triggerManagerModal.hpThreshold')}</label>
                    <input
                      type="number"
                      name="hp-threshold"
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
                    <label className={labelClass}>{t('game.triggerManagerModal.regionId')}</label>
                    <input
                      type="text"
                      name="region-id"
                      value={regionId}
                      onChange={(e) => setRegionId(e.target.value)}
                      placeholder={t('game.triggerManagerModal.regionIdPlaceholder')}
                      className={inputClass}
                    />
                  </div>
                )}

                {event === 'condition_applied' && (
                  <div>
                    <label className={labelClass}>{t('game.triggerManagerModal.conditionName')}</label>
                    <input
                      type="text"
                      name="condition-name"
                      value={conditionName}
                      onChange={(e) => setConditionName(e.target.value)}
                      placeholder={t('game.triggerManagerModal.conditionNamePlaceholder')}
                      className={inputClass}
                    />
                  </div>
                )}

                {event === 'time_elapsed' && (
                  <div>
                    <label className={labelClass}>{t('game.triggerManagerModal.elapsedSeconds')}</label>
                    <input
                      type="number"
                      name="elapsed-seconds"
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
                <span className="text-xs text-muted font-medium">{t('game.triggerManagerModal.actionConfig')}</span>

                {(action === 'show_message' || action === 'narrate') && (
                  <div>
                    <label className={labelClass}>
                      {action === 'narrate'
                        ? t('game.triggerManagerModal.narrationPrompt')
                        : t('game.triggerManagerModal.messageText')}
                    </label>
                    <textarea
                      name="message-text"
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      placeholder={
                        action === 'narrate'
                          ? t('game.triggerManagerModal.narrationPlaceholder')
                          : t('game.triggerManagerModal.messagePlaceholder')
                      }
                      className={`${inputClass} h-16 resize-none`}
                    />
                  </div>
                )}

                {action === 'play_sound' && (
                  <div>
                    <label className={labelClass}>{t('game.triggerManagerModal.soundEventId')}</label>
                    <input
                      type="text"
                      name="sound-id"
                      value={soundId}
                      onChange={(e) => setSoundId(e.target.value)}
                      placeholder={t('game.triggerManagerModal.soundEventIdPlaceholder')}
                      className={inputClass}
                    />
                  </div>
                )}

                {action === 'spawn_creature' && (
                  <div>
                    <label className={labelClass}>{t('game.triggerManagerModal.creatureId')}</label>
                    <input
                      type="text"
                      name="creature-id"
                      value={creatureId}
                      onChange={(e) => setCreatureId(e.target.value)}
                      placeholder={t('game.triggerManagerModal.creatureIdPlaceholder')}
                      className={inputClass}
                    />
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <input
                        type="number"
                        name="spawn-grid-x"
                        min={0}
                        value={spawnGridX}
                        onChange={(e) => setSpawnGridX(e.target.value)}
                        placeholder={t('game.triggerManagerModal.gridX')}
                        className={inputClass}
                      />
                      <input
                        type="number"
                        name="spawn-grid-y"
                        min={0}
                        value={spawnGridY}
                        onChange={(e) => setSpawnGridY(e.target.value)}
                        placeholder={t('game.triggerManagerModal.gridY')}
                        className={inputClass}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{t('game.triggerManagerModal.spawnCoordsHint')}</p>
                  </div>
                )}

                {action === 'change_lighting' && (
                  <div>
                    <label className={labelClass}>{t('game.triggerManagerModal.lightingLevel')}</label>
                    <select
                      name="lighting-level"
                      value={lightingLevel}
                      onChange={(e) => setLightingLevel(e.target.value as 'bright' | 'dim' | 'darkness')}
                      className={inputClass}
                    >
                      <option value="bright">{t('game.triggerManagerModal.bright')}</option>
                      <option value="dim">{t('game.triggerManagerModal.dim')}</option>
                      <option value="darkness">{t('game.triggerManagerModal.darkness')}</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    name="one-shot"
                    checked={oneShot}
                    onChange={(e) => setOneShot(e.target.checked)}
                    className="rounded"
                  />
                  {t('game.triggerManagerModal.oneShot')}
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={resetForm}
                  className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
                >
                  {t('common.actions.cancel')}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!name.trim()}
                  className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-accent-strong disabled:bg-gray-700 disabled:text-gray-500 text-white rounded cursor-pointer"
                >
                  {t('game.triggerManagerModal.createTrigger')}
                </button>
              </div>
            </div>
          )}

          {/* Trigger history */}
          {history.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted block mb-1.5">
                {t('game.triggerManagerModal.fireHistory')}
              </span>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {history.map((h, i) => (
                  <div key={`${h.triggerId}-${h.timestamp}-${i}`} className="text-xs text-gray-500 flex gap-2">
                    <span className="text-gray-600">{new Date(h.timestamp).toLocaleTimeString()}</span>
                    <span className="text-muted">{h.triggerName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
          >
            {t('common.actions.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
