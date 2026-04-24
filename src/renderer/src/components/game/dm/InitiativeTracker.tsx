import { useCallback, useEffect, useRef, useState } from 'react'
import { play as playSound } from '../../../services/sound-manager'
import { useGameStore } from '../../../stores/use-game-store'
import type { CombatTimerConfig } from '../../../types/campaign'
import type { InitiativeEntry, InitiativeState } from '../../../types/game-state'
import type { MapToken } from '../../../types/map'
import InitiativeControls from './InitiativeControls'
import InitiativeEntryRow from './InitiativeEntry'
import type { NewEntry } from './InitiativeSetupForm'
import type { MapToken } from '../../../types/map'
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
  const [newEntries, setNewEntries] = useState<NewEntry[]>([
    { name: '', modifier: '0', entityType: 'player', surprised: false, legendaryResistances: '', inLair: false }
  ])
  const [checkedTokenIds, setCheckedTokenIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTotal, setEditTotal] = useState('')
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const reorderInitiative = useGameStore((s) => s.reorderInitiative)

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
          const r1 = Math.floor(Math.random() * 20) + 1
          const r2 = Math.floor(Math.random() * 20) + 1
          roll = Math.min(r1, r2)
        } else {
          roll = Math.floor(Math.random() * 20) + 1
        }
        if (isGroupInit && e.entityType === 'enemy' && !groupRolls.has(groupKey)) {
          groupRolls.set(groupKey, roll)
        }
        const lr = parseInt(e.legendaryResistances, 10)

        // Use the token's entityId if available, otherwise generate a new one
        let entityId: string
        if (e.tokenId) {
          const token = tokens?.find((t) => t.id === e.tokenId)
          entityId = token?.entityId || crypto.randomUUID()
        } else {
          entityId = crypto.randomUUID()
        }

        return {
          id: crypto.randomUUID(),
          entityId,
          entityName: e.surprised ? `${e.name.trim()} (Surprised)` : e.name.trim(),
          entityType: e.entityType,
          roll,
          modifier: mod,
          total: roll + mod,
          isActive: false,
          ...(lr > 0 ? { legendaryResistances: { max: lr, remaining: lr } } : {}),
          ...(e.inLair ? { inLair: true } : {})
        }
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
    entityName: 'Lair Action',
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

  // Initiative is active -- show tracker
  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Initiative</h3>
        <span className="text-xs text-amber-400 font-semibold">Round {initiative.round}</span>
      </div>

      <div className="space-y-1">
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
                  setDelayedEntries((prev) => [...prev, e])
                  onRemoveEntry(e.id)
                }
              }}
              onCenterToken={onCenterToken}
            />
          )
        })}
      </div>

      {/* Timer bar, delayed entries, add-entry form, turn controls */}
      <InitiativeControls
        isHost={isHost}
        timerEnabled={timerEnabled}
        timerRunning={timerRunning}
        timerExpired={timerExpired}
        timerAction={timerAction}
        timeRemaining={timeRemaining}
        timerSeconds={timerSeconds}
        delayedEntries={initiative?.entries.filter(e => e.isDelaying) ?? []}
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
