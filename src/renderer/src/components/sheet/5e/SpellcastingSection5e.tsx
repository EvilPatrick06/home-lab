import { lazy, Suspense, useState } from 'react'
import {
  computeSpellcastingInfo,
  FULL_CASTERS_5E,
  getCantripsKnown,
  getItemGrantedSpells,
  getPreparedSpellMax,
  HALF_CASTERS_5E,
  isMulticlassSpellcaster,
  isWarlockPactMagic
} from '../../../services/character/spell-data'
import { useCharacterStore } from '../../../stores/use-character-store'
import { useGameStore } from '../../../stores/use-game-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'
import { useNetworkStore } from '../../../stores/use-network-store'
import type { Character } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import type { SpellEntry } from '../../../types/character-common'
import { abilityModifier } from '../../../types/character-common'
import SheetSectionWrapper from '../shared/SheetSectionWrapper'
import SpellList5e from './SpellList5e'
import SpellSlotTracker5e from './SpellSlotTracker5e'

const MulticlassAdvisor = lazy(() => import('./MulticlassAdvisor'))
const SpellPrepOptimizer = lazy(() => import('./SpellPrepOptimizer'))

interface SpellcastingSection5eProps {
  character: Character5e
  readonly?: boolean
}

export default function SpellcastingSection5e({ character, readonly }: SpellcastingSection5eProps): JSX.Element {
  const knownSpells: SpellEntry[] = character.knownSpells ?? []
  const spellSlotLevels = character.spellSlotLevels ?? {}
  const pactMagicSlotLevels = character.pactMagicSlotLevels ?? {}
  const preparedSpellIds: string[] = character.preparedSpellIds ?? []
  const proficiencyBonus = Math.floor((character.level - 1) / 4) + 2
  const [ritualMessage, setRitualMessage] = useState<string | null>(null)
  const [concentrationConfirm, setConcentrationConfirm] = useState<SpellEntry | null>(null)
  const [pendingCastSlot, setPendingCastSlot] = useState<number | null>(null)
  const [showMulticlassAdvisor, setShowMulticlassAdvisor] = useState(false)
  const [showSpellPrepOptimizer, setShowSpellPrepOptimizer] = useState(false)

  const turnState = useGameStore((s) => s.getTurnState(character.id))
  const isConcentrating = !!turnState?.concentratingSpell

  const hasWarlock = character.classes.some((c) => isWarlockPactMagic(c.name.toLowerCase()))
  const hasNonWarlockCaster = character.classes.some((c) => {
    const id = c.name.toLowerCase()
    return id !== 'warlock' && (FULL_CASTERS_5E.includes(id) || HALF_CASTERS_5E.includes(id))
  })
  const isPureWarlock = hasWarlock && !hasNonWarlockCaster

  const hasCasting =
    !!character.spellcasting ||
    knownSpells.length > 0 ||
    !!computeSpellcastingInfo(
      character.classes.map((c) => ({
        classId: c.name.toLowerCase(),
        subclassId: c.subclass?.toLowerCase(),
        level: c.level
      })),
      character.abilityScores,
      character.level,
      character.buildChoices.classId,
      character.buildChoices.subclassId
    )

  if (!hasCasting && Object.keys(spellSlotLevels).length === 0 && Object.keys(pactMagicSlotLevels).length === 0) {
    return <></>
  }

  // Merge item-granted spells
  const itemSpells = getItemGrantedSpells(character.magicItems ?? [], knownSpells)
  const allSpells = [...knownSpells]
  for (const iSpell of itemSpells) {
    if (!allSpells.some((s) => s.name === iSpell.name)) {
      allSpells.push(iSpell)
    }
  }

  // Group spells by level
  const spellsByLevel = new Map<number, SpellEntry[]>()
  for (const spell of allSpells) {
    const group = spellsByLevel.get(spell.level) ?? []
    group.push(spell)
    spellsByLevel.set(spell.level, group)
  }

  const preparedCount = knownSpells.filter((s) => s.level > 0 && preparedSpellIds.includes(s.id)).length

  function handleTogglePrepared(spellId: string): void {
    if (readonly) return
    const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
    const currentPrepared = latest.preparedSpellIds ?? []
    let updatedPrepared: string[]
    if (currentPrepared.includes(spellId)) {
      updatedPrepared = currentPrepared.filter((id) => id !== spellId)
    } else {
      updatedPrepared = [...currentPrepared, spellId]
    }
    const updated = { ...latest, preparedSpellIds: updatedPrepared, updatedAt: new Date().toISOString() } as Character
    useCharacterStore.getState().saveCharacter(updated)
  }

  function handleInnateUseClick(spellId: string): void {
    if (readonly) return
    const latest = (useCharacterStore.getState().characters.find((c) => c.id === character.id) ||
      character) as Character5e
    const updatedSpells = (latest.knownSpells ?? []).map((s) => {
      if (s.id !== spellId || !s.innateUses) return s
      const remaining = s.innateUses.remaining
      const max = s.innateUses.max
      if (remaining > 0 || (remaining === -1 && max === -1)) {
        return {
          ...s,
          innateUses: {
            ...s.innateUses,
            remaining: Math.max(0, (remaining === -1 ? (proficiencyBonus ?? 2) : remaining) - 1)
          }
        }
      } else {
        const resolvedMax = max === -1 ? (proficiencyBonus ?? 2) : max
        return { ...s, innateUses: { ...s.innateUses, remaining: Math.min(resolvedMax, remaining + 1) } }
      }
    })
    const updated = { ...latest, knownSpells: updatedSpells, updatedAt: new Date().toISOString() } as Character
    useCharacterStore.getState().saveCharacter(updated)
  }

  function handleCastRitual(spell: SpellEntry): void {
    setRitualMessage(`Casting ${spell.name} as a ritual (10 minutes, no slot used).`)
    setTimeout(() => setRitualMessage(null), 4000)

    const lobby = useLobbyStore.getState()
    const localPeerId = useNetworkStore.getState().localPeerId
    const localPlayer = lobby.players.find((p) => p.peerId === localPeerId)
    lobby.addChatMessage({
      id: `ritual-${Date.now()}`,
      senderId: localPeerId ?? 'local',
      senderName: localPlayer?.displayName ?? character.name,
      content: `${character.name} casts ${spell.name} as a ritual (10 min, no slot used).`,
      timestamp: Date.now(),
      isSystem: true
    })
  }

  function handleConcentrationWarning(spell: SpellEntry): void {
    setConcentrationConfirm(spell)
  }

  function deductSlot(slotLevel: number): void {
    const latest = (useCharacterStore.getState().characters.find((c) => c.id === character.id) ||
      character) as Character5e
    const currentSlots = { ...latest.spellSlotLevels }
    const slot = currentSlots[slotLevel]
    if (slot && slot.current > 0) {
      currentSlots[slotLevel] = { ...slot, current: slot.current - 1 }
    }
    const updated = { ...latest, spellSlotLevels: currentSlots, updatedAt: new Date().toISOString() } as Character
    useCharacterStore.getState().saveCharacter(updated)
  }

  function broadcastCast(spell: SpellEntry, slotLevel: number): void {
    const lobby = useLobbyStore.getState()
    const localPeerId = useNetworkStore.getState().localPeerId
    const localPlayer = lobby.players.find((p) => p.peerId === localPeerId)
    const isUpcast = slotLevel > spell.level
    let content = `${character.name} casts ${spell.name} (Level ${slotLevel} slot)${isUpcast ? ' [Upcast]' : ''}.`
    if (isUpcast && spell.higherLevels) {
      content += ` At Higher Levels: ${spell.higherLevels}`
    }
    lobby.addChatMessage({
      id: `cast-${Date.now()}`,
      senderId: localPeerId ?? 'local',
      senderName: localPlayer?.displayName ?? character.name,
      content,
      timestamp: Date.now(),
      isSystem: true
    })
  }

  function handleCastSpell(spell: SpellEntry, slotLevel: number): void {
    if (readonly) return

    // If concentration spell and already concentrating, prompt for switch
    if (spell.concentration && isConcentrating) {
      setPendingCastSlot(slotLevel)
      setConcentrationConfirm(spell)
      return
    }

    deductSlot(slotLevel)

    if (spell.concentration) {
      useGameStore.getState().setConcentrating(character.id, spell.name)
    }

    broadcastCast(spell, slotLevel)
  }

  function confirmConcentrationSwitch(): void {
    if (!concentrationConfirm) return

    // If there's a pending slot, deduct it and broadcast
    if (pendingCastSlot != null) {
      deductSlot(pendingCastSlot)
      broadcastCast(concentrationConfirm, pendingCastSlot)
    }

    useGameStore.getState().setConcentrating(character.id, concentrationConfirm.name)
    setConcentrationConfirm(null)
    setPendingCastSlot(null)
  }

  return (
    <SheetSectionWrapper title="Spellcasting">
      {/* Ritual casting message */}
      {ritualMessage && (
        <div className="mb-3 text-xs bg-blue-900/30 border border-blue-700/50 rounded px-3 py-2 text-blue-300">
          {ritualMessage}
        </div>
      )}

      {/* Concentration switch confirm dialog */}
      {concentrationConfirm && (
        <div className="mb-3 bg-yellow-900/30 border border-yellow-700/50 rounded px-3 py-2">
          <p className="text-xs text-yellow-300 mb-2">
            You are concentrating on <strong>{turnState?.concentratingSpell}</strong>. Casting{' '}
            <strong>{concentrationConfirm.name}</strong> will end that concentration. Continue?
          </p>
          <div className="flex gap-2">
            <button
              onClick={confirmConcentrationSwitch}
              className="px-2 py-0.5 text-[10px] rounded bg-yellow-600 text-white hover:bg-yellow-500 cursor-pointer"
            >
              Yes, Switch
            </button>
            <button
              onClick={() => {
                setConcentrationConfirm(null)
                setPendingCastSlot(null)
              }}
              className="px-2 py-0.5 text-[10px] rounded bg-gray-700 text-gray-300 hover:bg-gray-600 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Spell slot tracker */}
      <SpellSlotTracker5e
        character={character}
        readonly={readonly}
        spellSlotLevels={spellSlotLevels}
        pactMagicSlotLevels={pactMagicSlotLevels}
        isPureWarlock={isPureWarlock}
      />

      {/* Spellcasting info */}
      {(() => {
        const classesForCalc = character.classes.map((c) => ({
          classId: c.name.toLowerCase(),
          subclassId: c.subclass?.toLowerCase(),
          level: c.level
        }))
        const scInfo = computeSpellcastingInfo(
          classesForCalc,
          character.abilityScores,
          character.level,
          character.buildChoices.classId,
          character.buildChoices.subclassId
        )
        if (!scInfo) return null
        return (
          <div className="mb-3 flex gap-4 text-sm text-gray-400">
            <span>
              Ability: <span className="text-amber-400 capitalize">{scInfo.ability}</span>
            </span>
            <span>
              DC: <span className="text-amber-400">{scInfo.spellSaveDC}</span>
            </span>
            <span>
              Attack:{' '}
              <span className="text-amber-400">
                {scInfo.spellAttackBonus >= 0 ? '+' : ''}
                {scInfo.spellAttackBonus}
              </span>
            </span>
            {isMulticlassSpellcaster(classesForCalc) ? (
              <span className="text-purple-400 text-xs">(Multiclass Slots)</span>
            ) : null}
          </div>
        )
      })()}

      {/* Species spellcasting info */}
      {(() => {
        const classesForCalc = character.classes.map((c) => ({
          classId: c.name.toLowerCase(),
          subclassId: c.subclass?.toLowerCase(),
          level: c.level
        }))
        const scInfo = computeSpellcastingInfo(
          classesForCalc,
          character.abilityScores,
          character.level,
          character.buildChoices.classId,
          character.buildChoices.subclassId
        )
        if (scInfo) return null
        const speciesAbility = character.buildChoices.speciesSpellcastingAbility
        const hasSpeciesSpells = knownSpells.some((s) => s.source === 'species' || s.id.startsWith('species-'))
        if (!speciesAbility || !hasSpeciesSpells) return null
        const abilityMod = abilityModifier(character.abilityScores[speciesAbility])
        const dc = 8 + proficiencyBonus + abilityMod
        const attackBonus = proficiencyBonus + abilityMod
        return (
          <div className="mb-3 flex gap-4 text-sm text-gray-400">
            <span>
              Species Ability: <span className="text-purple-400 capitalize">{speciesAbility}</span>
            </span>
            <span>
              DC: <span className="text-purple-400">{dc}</span>
            </span>
            <span>
              Attack:{' '}
              <span className="text-purple-400">
                {attackBonus >= 0 ? '+' : ''}
                {attackBonus}
              </span>
            </span>
          </div>
        )
      })()}

      {/* Spell cap info + prepared count */}
      {knownSpells.length > 0 &&
        (() => {
          const cantrips = knownSpells.filter((s) => s.level === 0)
          const nonCantrips = knownSpells.filter((s) => s.level > 0)

          let cantripsMax = 0
          for (const cls of character.classes) {
            const cId = cls.name.toLowerCase()
            cantripsMax += getCantripsKnown(cId, cls.level)
          }

          return (
            <div className="mb-3 flex gap-4 text-xs text-gray-500">
              {cantripsMax > 0 && (
                <span>
                  Cantrips: <span className="text-amber-400">{cantrips.length}</span>/{cantripsMax}
                </span>
              )}
              {cantripsMax === 0 && cantrips.length > 0 && (
                <span>
                  Cantrips: <span className="text-amber-400">{cantrips.length}</span>
                </span>
              )}
              {nonCantrips.length > 0 &&
                (() => {
                  const primaryClassId = character.classes[0]?.name?.toLowerCase() ?? ''
                  const primaryClassLevel = character.classes[0]?.level ?? character.level
                  const maxPrepared = getPreparedSpellMax(primaryClassId, primaryClassLevel)
                  return (
                    <>
                      <span>
                        Prepared Spells: <span className="text-amber-400">{preparedCount}</span>
                        {maxPrepared != null && <span className="text-gray-500">/{maxPrepared}</span>}
                      </span>
                      <span>
                        Total Known: <span className="text-amber-400">{nonCantrips.length}</span>
                      </span>
                    </>
                  )
                })()}
            </div>
          )
        })()}

      {/* Utility buttons */}
      <div className="flex gap-2 mb-3">
        {character.classes.length > 1 && (
          <button
            onClick={() => setShowMulticlassAdvisor(true)}
            className="px-2 py-1 text-[10px] rounded transition-colors cursor-pointer bg-purple-600/30 text-purple-300 hover:bg-purple-600/50"
          >
            Multiclass Advisor
          </button>
        )}
        {knownSpells.filter((s) => s.level > 0).length > 0 && (
          <button
            onClick={() => setShowSpellPrepOptimizer(true)}
            className="px-2 py-1 text-[10px] rounded transition-colors cursor-pointer bg-blue-600/30 text-blue-300 hover:bg-blue-600/50"
          >
            Optimize Prep
          </button>
        )}
      </div>

      {/* Known spells by level */}
      <SpellList5e
        spellsByLevel={spellsByLevel}
        readonly={readonly}
        preparedSpellIds={preparedSpellIds}
        onTogglePrepared={handleTogglePrepared}
        onToggleInnateUse={handleInnateUseClick}
        onCastRitual={handleCastRitual}
        onConcentrationWarning={handleConcentrationWarning}
        onCastSpell={handleCastSpell}
        spellSlotLevels={spellSlotLevels}
        proficiencyBonus={proficiencyBonus}
        isConcentrating={isConcentrating}
        concentratingSpell={turnState?.concentratingSpell}
      />

      {/* Multiclass Advisor modal */}
      {showMulticlassAdvisor && (
        <Suspense fallback={null}>
          <MulticlassAdvisor
            open={showMulticlassAdvisor}
            onClose={() => setShowMulticlassAdvisor(false)}
            abilityScores={character.abilityScores}
            currentClasses={character.classes.map((c) => c.name.toLowerCase())}
          />
        </Suspense>
      )}

      {/* Spell Prep Optimizer modal */}
      {showSpellPrepOptimizer && (
        <Suspense fallback={null}>
          <SpellPrepOptimizer
            open={showSpellPrepOptimizer}
            onClose={() => setShowSpellPrepOptimizer(false)}
            classId={character.classes[0]?.name.toLowerCase()}
            level={character.level}
            preparedSpells={knownSpells
              .filter((s) => s.level > 0 && preparedSpellIds.includes(s.id))
              .map((s) => ({
                name: s.name,
                school: s.school,
                level: s.level,
                concentration: s.concentration,
                ritual: s.ritual
              }))}
            knownSpells={knownSpells
              .filter((s) => s.level > 0)
              .map((s) => ({ name: s.name, level: s.level, ritual: s.ritual }))}
          />
        </Suspense>
      )}
    </SheetSectionWrapper>
  )
}
