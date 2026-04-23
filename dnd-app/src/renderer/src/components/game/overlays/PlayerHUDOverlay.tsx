import { useCallback, useMemo, useRef, useState } from 'react'
import { resolveEffects } from '../../../services/combat/effect-resolver-5e'
import { useCharacterStore } from '../../../stores/use-character-store'
import { useGameStore } from '../../../stores/use-game-store'
import { useNetworkStore } from '../../../stores/use-network-store'
import type { Character } from '../../../types/character'
import { is5eCharacter } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import { abilityModifier, formatMod } from '../../../types/character-common'
import type { EntityCondition } from '../../../types/game-state'
import PlayerHUDActions from './PlayerHUDActions'
import PlayerHUDEffects, { PlayerHUDEffectsExpanded } from './PlayerHUDEffects'
import PlayerHUDStats from './PlayerHUDStats'

function ConnectionBadge(): JSX.Element | null {
  const role = useNetworkStore((s) => s.role)
  const latencyMs = useNetworkStore((s) => s.latencyMs)
  if (role !== 'client' || latencyMs === null) return null

  const color = latencyMs < 100 ? 'bg-green-500' : latencyMs < 300 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <span className="flex items-center gap-1 shrink-0" title={`Latency: ${latencyMs}ms`}>
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-[9px] text-gray-500">{latencyMs}ms</span>
    </span>
  )
}

interface PlayerHUDOverlayProps {
  character: Character | null
  conditions: EntityCondition[]
}

export default function PlayerHUDOverlay({ character, conditions }: PlayerHUDOverlayProps): JSX.Element {
  const underwaterCombat = useGameStore((s) => s.underwaterCombat)
  const ambientLight = useGameStore((s) => s.ambientLight)
  const travelPace = useGameStore((s) => s.travelPace)
  const turnStates = useGameStore((s) => s.turnStates)
  const customEffects = useGameStore((s) => s.customEffects)

  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const hudRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (
      target.tagName === 'BUTTON' ||
      target.tagName === 'INPUT' ||
      target.closest('button') ||
      target.closest('input')
    )
      return
    if (!hudRef.current) return
    const rect = hudRef.current.getBoundingClientRect()
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    setDragging(true)

    const onMove = (ev: MouseEvent): void => {
      setPosition({
        x: ev.clientX - dragOffset.current.x,
        y: ev.clientY - dragOffset.current.y
      })
    }
    const onUp = (): void => {
      setDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  const myCustomEffects = useMemo(
    () => customEffects.filter((e) => e.targetEntityId === character?.id),
    [customEffects, character?.id]
  )

  if (!character) return <></>
  const char5e = is5eCharacter(character) ? character : null

  // Resolved effects for HUD indicators
  const resolved = useMemo(() => (char5e ? resolveEffects(char5e, myCustomEffects) : null), [char5e, myCustomEffects])

  const hp = character.hitPoints
  const ac = character.armorClass
  const speed = character.speed
  const dexMod = abilityModifier(character.abilityScores.dexterity)
  const bloodied = hp.current > 0 && hp.current <= Math.floor(hp.maximum / 2)
  const turnState = turnStates[character.id]

  // Save & broadcast helper
  const saveAndBroadcast = useCallback((updated: Character5e) => {
    useCharacterStore.getState().saveCharacter(updated)
    const activeMap = useGameStore.getState().maps.find((m) => m.id === useGameStore.getState().activeMapId)
    if (activeMap) {
      const token = activeMap.tokens.find((t) => t.entityId === updated.id)
      if (token) {
        useGameStore.getState().updateToken(activeMap.id, token.id, {
          currentHP: updated.hitPoints.current
        })
      }
    }
    const { role, sendMessage } = useNetworkStore.getState()
    if (role !== 'host') {
      sendMessage('dm:character-update', {
        characterId: updated.id,
        characterData: updated,
        targetPeerId: 'host'
      })
    }
  }, [])

  // HP adjustment
  const adjustHP = useCallback(
    (delta: number) => {
      if (!char5e) return
      const latest = useCharacterStore.getState().characters.find((c) => c.id === char5e.id) as Character5e | undefined
      if (!latest || !is5eCharacter(latest)) return

      let newCurrent = latest.hitPoints.current
      let newTemp = latest.hitPoints.temporary

      if (delta < 0) {
        const dmg = Math.abs(delta)
        if (newTemp > 0) {
          const absorbed = Math.min(newTemp, dmg)
          newTemp -= absorbed
          newCurrent = Math.max(0, newCurrent - (dmg - absorbed))
        } else {
          newCurrent = Math.max(0, newCurrent - dmg)
        }
      } else {
        newCurrent = Math.min(latest.hitPoints.maximum, newCurrent + delta)
      }

      const wasAtZero = latest.hitPoints.current === 0
      const updates: Partial<typeof latest> = {
        hitPoints: { ...latest.hitPoints, current: newCurrent, temporary: newTemp },
        updatedAt: new Date().toISOString()
      }
      if (wasAtZero && newCurrent > 0 && latest.deathSaves) {
        updates.deathSaves = { successes: 0, failures: 0 }
      }
      saveAndBroadcast({ ...latest, ...updates })
    },
    [char5e, saveAndBroadcast]
  )

  const handleHPEdit = useCallback(
    (val: number) => {
      if (!char5e) return
      const latest = useCharacterStore.getState().characters.find((c) => c.id === char5e.id) as Character5e | undefined
      if (!latest || !is5eCharacter(latest)) return

      const newHP = Math.max(0, Math.min(latest.hitPoints.maximum, val))
      const updated = {
        ...latest,
        hitPoints: { ...latest.hitPoints, current: newHP },
        updatedAt: new Date().toISOString()
      }
      saveAndBroadcast(updated)
    },
    [char5e, saveAndBroadcast]
  )

  // Spell slot toggle
  const toggleSpellSlot = useCallback(
    (level: number) => {
      if (!char5e) return
      const latest = useCharacterStore.getState().characters.find((c) => c.id === char5e.id) as Character5e | undefined
      if (!latest || !is5eCharacter(latest)) return

      const slot = latest.spellSlotLevels[level]
      if (!slot) return
      const newCurrent = slot.current > 0 ? slot.current - 1 : slot.max
      const updated = {
        ...latest,
        spellSlotLevels: { ...latest.spellSlotLevels, [level]: { ...slot, current: newCurrent } },
        updatedAt: new Date().toISOString()
      }
      saveAndBroadcast(updated)
    },
    [char5e, saveAndBroadcast]
  )

  // Pact slot toggle
  const togglePactSlot = useCallback(
    (level: number) => {
      if (!char5e || !char5e.pactMagicSlotLevels) return
      const latest = useCharacterStore.getState().characters.find((c) => c.id === char5e.id) as Character5e | undefined
      if (!latest || !is5eCharacter(latest) || !latest.pactMagicSlotLevels) return

      const slot = latest.pactMagicSlotLevels[level]
      if (!slot) return
      const newCurrent = slot.current > 0 ? slot.current - 1 : slot.max
      const updated = {
        ...latest,
        pactMagicSlotLevels: { ...latest.pactMagicSlotLevels, [level]: { ...slot, current: newCurrent } },
        updatedAt: new Date().toISOString()
      }
      saveAndBroadcast(updated)
    },
    [char5e, saveAndBroadcast]
  )

  // Class resource adjust
  const adjustResource = useCallback(
    (resourceId: string, delta: number) => {
      if (!char5e) return
      const latest = useCharacterStore.getState().characters.find((c) => c.id === char5e.id) as Character5e | undefined
      if (!latest || !is5eCharacter(latest)) return

      const updated = {
        ...latest,
        classResources: (latest.classResources ?? []).map((r) =>
          r.id === resourceId ? { ...r, current: Math.max(0, Math.min(r.max, r.current + delta)) } : r
        ),
        updatedAt: new Date().toISOString()
      }
      saveAndBroadcast(updated)
    },
    [char5e, saveAndBroadcast]
  )

  // Heroic Inspiration toggle
  const toggleInspiration = useCallback(() => {
    if (!char5e) return
    const latest = useCharacterStore.getState().characters.find((c) => c.id === char5e.id) as Character5e | undefined
    if (!latest || !is5eCharacter(latest)) return

    const updated = { ...latest, heroicInspiration: !latest.heroicInspiration, updatedAt: new Date().toISOString() }
    saveAndBroadcast(updated)
  }, [char5e, saveAndBroadcast])

  // Temp HP setter
  const setTempHP = useCallback(
    (val: number) => {
      if (!char5e) return
      const latest = useCharacterStore.getState().characters.find((c) => c.id === char5e.id) as Character5e | undefined
      if (!latest || !is5eCharacter(latest)) return

      const updated = {
        ...latest,
        hitPoints: { ...latest.hitPoints, temporary: val },
        updatedAt: new Date().toISOString()
      }
      saveAndBroadcast(updated)
    },
    [char5e, saveAndBroadcast]
  )

  // Spell slot pips renderer
  const renderSlotPips = (level: number, current: number, max: number, isPact: boolean = false): JSX.Element => (
    <div className="flex items-center gap-0.5" key={`${isPact ? 'pact' : 'spell'}-${level}`}>
      <span className="text-[9px] text-gray-500 w-5">{isPact ? 'P' : `L${level}`}</span>
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          onClick={() => (isPact ? togglePactSlot(level) : toggleSpellSlot(level))}
          className={`w-2.5 h-2.5 rounded-full border cursor-pointer transition-colors ${
            i < current
              ? isPact
                ? 'bg-purple-500 border-purple-400'
                : 'bg-blue-500 border-blue-400'
              : 'bg-gray-700 border-gray-600'
          }`}
          title={`${isPact ? 'Pact' : 'Spell'} slot L${level}: ${current}/${max} (click to toggle)`}
        />
      ))}
    </div>
  )

  const style: React.CSSProperties = position
    ? { position: 'fixed', left: position.x, top: position.y, transform: 'none' }
    : {}

  return (
    <div
      ref={hudRef}
      className={`${position ? '' : 'absolute top-16 left-1/2 -translate-x-1/2'} z-10 ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={style}
      onMouseDown={handleMouseDown}
    >
      <div
        className={`bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-xl select-none transition-all ${expanded ? 'w-[420px]' : ''}`}
      >
        {/* Collapsed view (always visible) */}
        <div className="px-3 py-2 flex items-center gap-3 flex-wrap">
          <PlayerHUDStats
            characterName={character.name}
            hp={hp}
            ac={ac}
            char5e={char5e}
            expanded={expanded}
            onAdjustHP={adjustHP}
            onEditHP={handleHPEdit}
            renderSlotPips={renderSlotPips}
          />

          <ConnectionBadge />

          <PlayerHUDEffects
            characterId={character.id}
            char5e={char5e}
            conditions={conditions}
            resolved={resolved}
            bloodied={bloodied}
            underwaterCombat={underwaterCombat}
            ambientLight={ambientLight}
            travelPace={travelPace}
          />

          {/* Expand/collapse toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-gray-500 hover:text-gray-300 cursor-pointer ml-auto"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '\u25B2' : '\u25BC'}
          </button>
        </div>

        {/* Expanded view */}
        {expanded && char5e && (
          <div className="px-3 pb-3 space-y-2 border-t border-gray-700/50 pt-2">
            <PlayerHUDActions
              char5e={char5e}
              hp={hp}
              speed={speed}
              dexMod={dexMod}
              formatMod={formatMod}
              onSetTempHP={setTempHP}
              onToggleSpellSlot={toggleSpellSlot}
              onTogglePactSlot={togglePactSlot}
              onAdjustResource={adjustResource}
              onToggleInspiration={toggleInspiration}
              renderSlotPips={renderSlotPips}
            />

            <PlayerHUDEffectsExpanded
              char5e={char5e}
              hpCurrent={hp.current}
              resolved={resolved}
              myCustomEffects={myCustomEffects}
              turnState={turnState}
              saveAndBroadcast={saveAndBroadcast}
            />
          </div>
        )}
      </div>
    </div>
  )
}
