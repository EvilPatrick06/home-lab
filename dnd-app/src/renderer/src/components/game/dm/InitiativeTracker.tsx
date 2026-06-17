import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '../../../i18n'
import { buildMonsterTurnContext, runMonsterTurn } from '../../../services/combat/monster-turn-executor'
import { planMonsterTurn } from '../../../services/combat/monster-turn-planner'
import { enrichInitiativeEntry } from '../../../services/game-actions/initiative-enrichment'
import { getDragPayload, hasLibraryDrag } from '../../../services/library/drag-data'
import { play as playSound } from '../../../services/sound-manager'
import { getGameStore, getLobbyStore, getNetworkStore } from '../../../stores/store-accessors'
import { useGameStore } from '../../../stores/use-game-store'
import type { CombatTimerConfig, MonsterAutomationConfig } from '../../../types/campaign'
import type { InitiativeEntry, InitiativeState } from '../../../types/game-state'
import type { MapToken } from '../../../types/map'
import { cryptoRandom } from '../../../utils/crypto-random'
import { EmptyState } from '../../ui'
import InitiativeControls from './InitiativeControls'
import InitiativeEntryRow from './InitiativeEntry'
import type { NewEntry } from './InitiativeSetupForm'
import InitiativeSetupForm from './InitiativeSetupForm'

interface InitiativeTrackerProps {
  initiative: InitiativeState | null
  round: number
  isHost: boolean
  onStartInitiative: (entries: InitiativeEntry[]) => void
  onNextTurn: () => void
  onPrevTurn: () => void
  onEndInitiative: () => void
  onUpdateEntry: (entryId: string, updates: Partial<InitiativeEntry>) => void
  onRemoveEntry: (entryId: string) => void
  onAddEntry?: (entry: InitiativeEntry) => void
  onDelayTurn?: (entityId: string) => void
  onUndelay?: (entityId: string) => void
  tokens?: MapToken[]
  /** Called when user clicks a portrait to center the map on that token */
  onCenterToken?: (entityId: string) => void
  /** Persisted combat timer config */
  combatTimer?: CombatTimerConfig
  /** Called when DM changes combat timer settings */
  onCombatTimerChange?: (config: CombatTimerConfig) => void
}

export default function InitiativeTracker({
  initiative,
  round: _round,
  isHost,
  onStartInitiative,
  onNextTurn,
  onPrevTurn,
  onEndInitiative,
  onUpdateEntry,
  onRemoveEntry,
  onAddEntry,
  onDelayTurn,
  onUndelay,
  tokens = [],
  onCenterToken,
  combatTimer,
  onCombatTimerChange
}: InitiativeTrackerProps): JSX.Element {
  const { t } = useT()
  const [newEntries, setNewEntries] = useState<NewEntry[]>([
    { name: '', modifier: '0', entityType: 'player', surprised: false, legendaryResistances: '', inLair: false }
  ])
  const [checkedTokenIds, setCheckedTokenIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTotal, setEditTotal] = useState('')
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const reorderInitiative = useGameStore((s) => s.reorderInitiative)
  const pendingWaves = useGameStore((s) => s.pendingWaves)
  const deployWave = useGameStore((s) => s.deployWave)

  // PHASE-30 — monster automation (suggest/run buttons + config). Off by default (null).
  const monsterAutomation = useGameStore((s) => s.monsterAutomation)
  const setMonsterAutomation = useGameStore((s) => s.setMonsterAutomation)
  const [autoBusy, setAutoBusy] = useState(false)

  // Combat timer state
  const [timerEnabled, setTimerEnabled] = useState(combatTimer?.enabled ?? false)
  const [timerSeconds, setTimerSeconds] = useState(combatTimer?.seconds ?? 60)
  const [timerAction, setTimerAction] = useState<'warning' | 'auto-skip'>(combatTimer?.action ?? 'warning')
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerExpired, setTimerExpired] = useState(false)
  const [showTimerConfig, setShowTimerConfig] = useState(false)
  const [customSeconds, setCustomSeconds] = useState(String(combatTimer?.seconds ?? 60))
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isPaused = useGameStore((s) => s.isPaused)
  const currentIndexRef = useRef<number>(-1)

  // Persist timer config changes
  const updateTimerConfig = useCallback(
    (updates: Partial<CombatTimerConfig>) => {
      const newConfig: CombatTimerConfig = {
        enabled: updates.enabled ?? timerEnabled,
        seconds: updates.seconds ?? timerSeconds,
        action: updates.action ?? timerAction
      }
      if (updates.enabled !== undefined) setTimerEnabled(newConfig.enabled)
      if (updates.seconds !== undefined) setTimerSeconds(newConfig.seconds)
      if (updates.action !== undefined) setTimerAction(newConfig.action)
      onCombatTimerChange?.(newConfig)
    },
    [timerEnabled, timerSeconds, timerAction, onCombatTimerChange]
  )

  // Start timer when turn changes
  useEffect(() => {
    if (!initiative || !timerEnabled || !isHost) return
    const newIndex = initiative.currentIndex
    if (newIndex === currentIndexRef.current) return
    currentIndexRef.current = newIndex
    setTimerExpired(false)
    setTimeRemaining(timerSeconds)
    setTimerRunning(true)
  }, [initiative?.currentIndex, timerEnabled, timerSeconds, isHost, initiative])

  // Tick the timer
  useEffect(() => {
    if (!timerRunning || isPaused) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setTimerRunning(false)
          setTimerExpired(true)
          if (timerAction === 'auto-skip') onNextTurn()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [timerRunning, isPaused, timerAction, onNextTurn])

  // Stop timer when initiative ends
  useEffect(() => {
    if (!initiative) {
      setTimerRunning(false)
      setTimeRemaining(0)
      setTimerExpired(false)
      currentIndexRef.current = -1
    }
  }, [initiative])

  const addNewEntryRow = (): void => {
    setNewEntries([
      ...newEntries,
      { name: '', modifier: '0', entityType: 'enemy', surprised: false, legendaryResistances: '', inLair: false }
    ])
  }

  const updateNewEntry = (index: number, updates: Partial<NewEntry>): void => {
    setNewEntries(newEntries.map((e, i) => (i === index ? { ...e, ...updates } : e)))
  }

  const removeNewEntry = (index: number): void => {
    if (newEntries.length <= 1) return
    setNewEntries(newEntries.filter((_, i) => i !== index))
  }

  const handleRollInitiative = (): void => {
    const isGroupInit = useGameStore.getState().groupInitiativeEnabled ?? false
    const groupRolls = new Map<string, number>()

    const entries: InitiativeEntry[] = newEntries
      .filter((e) => e.name.trim())
      .map((e) => {
        const mod = parseInt(e.modifier, 10) || 0
        let roll: number
        const groupKey = `${e.entityType}:${e.name.trim().toLowerCase()}`
        if (isGroupInit && e.entityType === 'enemy' && groupRolls.has(groupKey)) {
          roll = groupRolls.get(groupKey)!
        } else if (e.surprised) {
          const r1 = Math.floor(cryptoRandom() * 20) + 1
          const r2 = Math.floor(cryptoRandom() * 20) + 1
          roll = Math.min(r1, r2)
        } else {
          roll = Math.floor(cryptoRandom() * 20) + 1
        }
        if (isGroupInit && e.entityType === 'enemy' && !groupRolls.has(groupKey)) {
          groupRolls.set(groupKey, roll)
        }
        const lr = parseInt(e.legendaryResistances, 10)

        // Use the token's entityId if available, otherwise generate a new one
        const token = e.tokenId ? tokens?.find((t) => t.id === e.tokenId) : undefined
        const entityId = token?.entityId || crypto.randomUUID()

        const entry: InitiativeEntry = {
          id: crypto.randomUUID(),
          entityId,
          entityName: e.surprised ? t('game.initiativeTracker.surprisedName', { name: e.name.trim() }) : e.name.trim(),
          entityType: e.entityType,
          roll,
          modifier: mod,
          total: roll + mod,
          isActive: false,
          ...(lr > 0 ? { legendaryResistances: { max: lr, remaining: lr } } : {}),
          ...(e.inLair ? { inLair: true } : {})
        }
        // 08B — enrich from the token's library stat block (manual LR input above is preserved).
        return enrichInitiativeEntry(entry, token)
      })

    if (entries.length > 0) {
      onStartInitiative(entries)
      playSound('initiative-start')
    }
  }

  const handleEditSave = (entryId: string): void => {
    const newTotal = parseInt(editTotal, 10)
    if (!Number.isNaN(newTotal)) {
      onUpdateEntry(entryId, { total: newTotal })
    }
    setEditingId(null)
    setEditTotal('')
  }

  // Handle library monster drop into initiative tracker
  const [dragOver, setDragOver] = useState(false)
  const handleInitDragOver = useCallback((e: React.DragEvent) => {
    if (hasLibraryDrag(e)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDragOver(true)
    }
  }, [])
  const handleInitDragLeave = useCallback(() => setDragOver(false), [])
  const handleInitDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const payload = getDragPayload(e)
      if (payload?.type !== 'library-monster' || !onAddEntry) return
      const { loadAllStatBlocks } = await import('../../../services/data-provider')
      const allMonsters = await loadAllStatBlocks()
      const monster = allMonsters.find((m) => m.id === payload.itemId)
      if (!monster) return
      const mod = monster.initiative?.modifier ?? Math.floor((monster.abilityScores.dex - 10) / 2)
      const roll = Math.floor(cryptoRandom() * 20) + 1
      onAddEntry({
        id: crypto.randomUUID(),
        entityId: crypto.randomUUID(),
        entityName: monster.name,
        entityType: 'enemy',
        roll,
        modifier: mod,
        total: roll + mod,
        isActive: false
      })
    },
    [onAddEntry]
  )

  // Initiative not active -- show setup
  if (!initiative) {
    return (
      <InitiativeSetupForm
        isHost={isHost}
        newEntries={newEntries}
        tokens={tokens}
        checkedTokenIds={checkedTokenIds}
        timerEnabled={timerEnabled}
        timerSeconds={timerSeconds}
        timerAction={timerAction}
        showTimerConfig={showTimerConfig}
        customSeconds={customSeconds}
        onUpdateNewEntry={updateNewEntry}
        onRemoveNewEntry={removeNewEntry}
        onAddNewEntryRow={addNewEntryRow}
        onSetNewEntries={setNewEntries}
        onSetCheckedTokenIds={setCheckedTokenIds}
        onSetShowTimerConfig={setShowTimerConfig}
        onSetCustomSeconds={setCustomSeconds}
        onUpdateTimerConfig={updateTimerConfig}
        onRollInitiative={handleRollInitiative}
      />
    )
  }

  // Build display entries with optional lair action at init 20
  const hasLairCreature = initiative.entries.some((e) => e.inLair)
  const displayEntries: Array<InitiativeEntry & { isLairAction?: boolean }> = []
  let lairInserted = false
  const lairEntry: InitiativeEntry & { isLairAction?: boolean } = {
    id: '__lair-action__',
    entityId: '__lair-action__',
    entityName: t('game.initiativeTracker.lairAction'),
    entityType: 'enemy',
    roll: 20,
    modifier: 0,
    total: 20,
    isActive: false,
    isLairAction: true
  }

  for (const entry of initiative.entries) {
    if (hasLairCreature && !lairInserted && entry.total < 20) {
      displayEntries.push(lairEntry)
      lairInserted = true
    }
    displayEntries.push(entry)
  }
  if (hasLairCreature && !lairInserted) {
    displayEntries.push(lairEntry)
  }

  // PHASE-30 — automation surface for the CURRENT enemy entry (host-only, stat-block-backed).
  const STORES = { getGameStore, getLobbyStore, getNetworkStore }
  const activeEntry = initiative.entries[initiative.currentIndex]
  const activeToken = activeEntry ? tokens.find((tk) => tk.entityId === activeEntry.entityId) : undefined
  const canAutomate = isHost && activeEntry?.entityType === 'enemy' && !!activeToken?.monsterStatBlockId

  const handleSuggestTurn = (): void => {
    if (!activeEntry) return
    const ctx = buildMonsterTurnContext(activeEntry.entityName, STORES)
    const content =
      'error' in ctx
        ? ctx.error
        : (() => {
            const plan = planMonsterTurn(ctx)
            return [`🧭 ${plan.actorLabel} (${plan.intTier} tactics):`, ...plan.rationale.map((r) => `• ${r}`)].join(
              '\n'
            )
          })()
    // DM-only: post to local chat WITHOUT a network broadcast.
    getLobbyStore()
      .getState()
      .addChatMessage({
        id: `mt-suggest-${Date.now()}-${cryptoRandom().toString(36).slice(2, 8)}`,
        senderId: 'ai-dm',
        senderName: 'Dungeon Master',
        content,
        timestamp: Date.now(),
        isSystem: true
      })
  }
  const handleRunTurn = (): void => {
    if (!activeEntry || autoBusy) return
    setAutoBusy(true)
    try {
      runMonsterTurn(activeEntry.entityName, STORES)
    } finally {
      setAutoBusy(false)
    }
  }
  const defaultAutomation: MonsterAutomationConfig = {
    autoRun: false,
    autoRunMaxInt: 7,
    autoAdvance: true,
    flavorNarration: false
  }
  const patchAutomation = (patch: Partial<MonsterAutomationConfig>): void => {
    setMonsterAutomation({ ...(monsterAutomation ?? defaultAutomation), ...patch })
  }

  // Initiative is active -- show tracker
  return (
    <div
      className={`space-y-3 ${dragOver ? 'ring-2 ring-amber-500/50 ring-inset rounded-lg' : ''}`}
      role="region"
      aria-label={t('game.initiativeTracker.trackerLabel')}
      aria-live="polite"
      onDragOver={handleInitDragOver}
      onDragLeave={handleInitDragLeave}
      onDrop={handleInitDrop}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          {t('game.initiativeTracker.title')}
        </h3>
        <span className="text-xs text-accent font-semibold">
          {t('game.initiativeTracker.round', { round: initiative.round })}
        </span>
      </div>

      {/* Phase 26d — deploy pending encounter waves */}
      {isHost && pendingWaves.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {pendingWaves.map((w, i) => (
            <button
              key={i}
              onClick={() => deployWave(i)}
              className="px-2 py-1 text-xs rounded bg-red-700/40 border border-red-600/50 text-red-200 hover:bg-red-700/60"
              title={
                w.triggerCondition
                  ? t('game.initiativeTracker.triggerTitle', { condition: w.triggerCondition })
                  : undefined
              }
            >
              {t('game.initiativeTracker.deployWave', { name: w.name, count: w.tokens.length })}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1">
        {displayEntries.length === 0 && (
          <EmptyState
            compact
            title={t('game.initiativeTracker.emptyTitle')}
            description={t('game.initiativeTracker.emptyDescription')}
          />
        )}
        {displayEntries.map((entry) => {
          const realIndex = initiative.entries.findIndex((e) => e.id === entry.id)
          return (
            <InitiativeEntryRow
              key={entry.id}
              entry={entry}
              realIndex={realIndex}
              isHost={isHost}
              editingId={editingId}
              editTotal={editTotal}
              draggedIndex={draggedIndex}
              dragOverIndex={dragOverIndex}
              onDragStart={(idx) => setDraggedIndex(idx)}
              onDragOver={(_e, idx) => setDragOverIndex(idx)}
              onDragEnd={() => {
                setDraggedIndex(null)
                setDragOverIndex(null)
              }}
              onDrop={(from, to) => {
                if (from !== null) reorderInitiative(from, to)
              }}
              onEditStart={(id, total) => {
                setEditingId(id)
                setEditTotal(String(total))
              }}
              onEditChange={setEditTotal}
              onEditSave={handleEditSave}
              onEditCancel={() => {
                setEditingId(null)
                setEditTotal('')
              }}
              onUpdateEntry={onUpdateEntry}
              onRemoveEntry={onRemoveEntry}
              onDelayEntry={(e) => {
                if (onDelayTurn) {
                  onDelayTurn(e.entityId)
                } else {
                  // Fallback to old behavior if no delay action provided
                  // (setDelayedEntries was removed in favor of the isDelaying flag below;
                  // mark the entry as delayed via onUpdateEntry instead of the removed state setter)
                  onUpdateEntry(e.id, { isDelaying: true })
                }
              }}
              onCenterToken={onCenterToken}
            />
          )
        })}
      </div>

      {/* PHASE-30 — monster automation: per-turn Suggest/Run buttons + host config (all opt-in). */}
      {isHost && (
        <div className="px-2 py-1.5 border-t border-border/40 text-xs space-y-1.5">
          {canAutomate && (
            <div className="flex items-center gap-2">
              <span className="text-gray-500">{activeEntry?.entityName}:</span>
              <button
                onClick={handleSuggestTurn}
                className="px-1.5 py-0.5 rounded bg-surface-2 text-muted hover:bg-gray-700 hover:text-gray-300 cursor-pointer"
              >
                {t('game.initiativeTracker.automation.suggest')}
              </button>
              <button
                onClick={handleRunTurn}
                disabled={autoBusy}
                className="px-1.5 py-0.5 rounded bg-accent/70 text-white hover:bg-accent cursor-pointer disabled:opacity-50"
              >
                {autoBusy
                  ? t('game.initiativeTracker.automation.busy')
                  : t('game.initiativeTracker.automation.runTurn')}
              </button>
            </div>
          )}
          <label className="flex items-center gap-1.5 cursor-pointer text-gray-400">
            <input
              type="checkbox"
              checked={monsterAutomation !== null}
              onChange={(e) => setMonsterAutomation(e.target.checked ? defaultAutomation : null)}
            />
            {t('game.initiativeTracker.automation.configTitle')}
          </label>
          {monsterAutomation && (
            <div className="ml-5 space-y-1">
              <label className="flex items-center gap-1.5 cursor-pointer text-gray-400">
                <input
                  type="checkbox"
                  checked={monsterAutomation.autoRun}
                  onChange={(e) => patchAutomation({ autoRun: e.target.checked })}
                />
                {t('game.initiativeTracker.automation.autoRun')}
              </label>
              <label className="flex items-center gap-1.5 text-gray-400">
                {t('game.initiativeTracker.automation.autoRunMaxInt')}
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={monsterAutomation.autoRunMaxInt}
                  onChange={(e) =>
                    patchAutomation({
                      autoRunMaxInt: Math.max(1, Math.min(30, Number.parseInt(e.target.value, 10) || 7))
                    })
                  }
                  className="w-12 bg-surface-2 border border-border rounded px-1 py-0.5"
                />
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-gray-400">
                <input
                  type="checkbox"
                  checked={monsterAutomation.autoAdvance}
                  onChange={(e) => patchAutomation({ autoAdvance: e.target.checked })}
                />
                {t('game.initiativeTracker.automation.autoAdvance')}
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-gray-400">
                <input
                  type="checkbox"
                  checked={monsterAutomation.flavorNarration}
                  onChange={(e) => patchAutomation({ flavorNarration: e.target.checked })}
                />
                {t('game.initiativeTracker.automation.flavorNarration')}
              </label>
            </div>
          )}
        </div>
      )}

      {/* Timer bar, delayed entries, add-entry form, turn controls */}
      <InitiativeControls
        isHost={isHost}
        timerEnabled={timerEnabled}
        timerRunning={timerRunning}
        timerExpired={timerExpired}
        timerAction={timerAction}
        timeRemaining={timeRemaining}
        timerSeconds={timerSeconds}
        delayedEntries={initiative?.entries.filter((e) => e.isDelaying) ?? []}
        onAddEntry={onAddEntry}
        onReenterDelayed={(entry) => {
          if (onUndelay) {
            onUndelay(entry.entityId)
          }
        }}
        onRemoveDelayed={(entityId) => {
          // For now, just undelay - could add a separate remove action later if needed
          if (onUndelay) {
            onUndelay(entityId)
          }
        }}
        onPrevTurn={onPrevTurn}
        onNextTurn={onNextTurn}
        onEndInitiative={onEndInitiative}
      />
    </div>
  )
}
