import { useMemo } from 'react'
import { computeSpellcastingInfo } from '../../../services/character/spell-data'
import { resolveEffects } from '../../../services/combat/effect-resolver-5e'
import { useCharacterStore } from '../../../stores/use-character-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'
import { useNetworkStore } from '../../../stores/use-network-store'
import type { Character } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import type { ArmorEntry } from '../../../types/character-common'
import { abilityModifier, formatMod } from '../../../types/character-common'
import DeathSaves5e from './DeathSaves5e'
import HitPointsBar5e from './HitPointsBar5e'

interface CombatStatsBar5eProps {
  character: Character5e
  readonly?: boolean
}

export default function CombatStatsBar5e({ character, readonly }: CombatStatsBar5eProps): JSX.Element {
  const saveCharacter = useCharacterStore((s) => s.saveCharacter)
  const storeCharacter = useCharacterStore((s) => s.characters.find((c) => c.id === character.id))
  const effectiveCharacter = (storeCharacter ?? character) as Character5e

  const profBonus = Math.ceil(character.level / 4) + 1

  // Dynamic AC calculation from equipped armor
  const armor: ArmorEntry[] = effectiveCharacter.armor ?? []
  const equippedArmor = armor.find((a) => a.equipped && a.type === 'armor')
  const equippedShield = armor.find((a) => a.equipped && a.type === 'shield')
  const dexMod = abilityModifier(effectiveCharacter.abilityScores.dexterity)

  const feats = effectiveCharacter.feats ?? []
  const hasDefenseFS = feats.some((f) => f.id === 'fighting-style-defense')
  const hasMediumArmorMaster = feats.some((f) => f.id === 'medium-armor-master')
  const hasHeavyArmorMaster = feats.some((f) => f.id === 'heavy-armor-master')

  // Resolve mechanical effects from magic items, feats, fighting styles
  const resolved = useMemo(() => resolveEffects(effectiveCharacter), [effectiveCharacter])

  const dynamicAC = (() => {
    let ac: number
    if (equippedArmor) {
      let dexCap = equippedArmor.dexCap
      if (hasMediumArmorMaster && dexCap != null && dexCap > 0 && equippedArmor.category === 'medium') {
        dexCap = dexCap + 1
      }
      const cappedDex = dexCap === 0 ? 0 : dexCap != null ? Math.min(dexMod, dexCap) : dexMod
      ac = equippedArmor.acBonus + cappedDex
      if (hasDefenseFS) ac += 1
    } else {
      const classNames = effectiveCharacter.classes.map((c) => c.name.toLowerCase())
      const conMod = abilityModifier(effectiveCharacter.abilityScores.constitution)
      const wisMod = abilityModifier(effectiveCharacter.abilityScores.wisdom)
      const chaMod = abilityModifier(effectiveCharacter.abilityScores.charisma)
      const isDraconicSorcerer = effectiveCharacter.classes.some(
        (c) =>
          c.name.toLowerCase() === 'sorcerer' && c.subclass?.toLowerCase().replace(/\s+/g, '-') === 'draconic-sorcery'
      )
      const candidates: number[] = [10 + dexMod]
      if (classNames.includes('barbarian')) candidates.push(10 + dexMod + conMod)
      if (classNames.includes('monk') && !equippedShield) candidates.push(10 + dexMod + wisMod)
      if (isDraconicSorcerer) candidates.push(10 + dexMod + chaMod)
      ac = Math.max(...candidates)
    }
    if (equippedShield) {
      ac += equippedShield.acBonus
    }
    const effectACBonus = resolved.acBonus - (hasDefenseFS && equippedArmor ? 1 : 0)
    if (effectACBonus > 0) ac += effectACBonus
    return ac
  })()

  // Initiative for 5e
  const hasAlert = feats.some((f) => f.id === 'alert')
  const dynamicInitiative = dexMod + (hasAlert ? profBonus : 0) + resolved.initiativeBonus
  const thirdStat = { label: 'Initiative', value: formatMod(dynamicInitiative) }

  const initTooltipParts = [`DEX ${formatMod(dexMod)}`]
  if (hasAlert) initTooltipParts.push(`+${profBonus} (Alert)`)
  if (resolved.initiativeBonus > 0) {
    resolved.sources
      .filter((s) => s.effects.some((e) => e.type === 'initiative_bonus'))
      .forEach((s) => {
        const bonus = s.effects.filter((e) => e.type === 'initiative_bonus').reduce((sum, e) => sum + (e.value ?? 0), 0)
        initTooltipParts.push(`+${bonus} (${s.sourceName})`)
      })
  }
  initTooltipParts.push(`= ${formatMod(dynamicInitiative)}`)

  // AC equipment bonus indicator
  const classNames = effectiveCharacter.classes.map((c) => c.name.toLowerCase())
  const unarmoredCandidates: number[] = [10 + dexMod]
  if (classNames.includes('barbarian'))
    unarmoredCandidates.push(10 + dexMod + abilityModifier(effectiveCharacter.abilityScores.constitution))
  if (classNames.includes('monk') && !equippedShield)
    unarmoredCandidates.push(10 + dexMod + abilityModifier(effectiveCharacter.abilityScores.wisdom))
  const isDraconicSorcererForBonus = effectiveCharacter.classes.some(
    (c) => c.name.toLowerCase() === 'sorcerer' && c.subclass?.toLowerCase().replace(/\s+/g, '-') === 'draconic-sorcery'
  )
  if (isDraconicSorcererForBonus)
    unarmoredCandidates.push(10 + dexMod + abilityModifier(effectiveCharacter.abilityScores.charisma))
  const unarmoredAC = Math.max(...unarmoredCandidates)
  const acEquipmentBonus = dynamicAC - unarmoredAC

  const characterSize = effectiveCharacter.size ?? 'Medium'

  return (
    <div className="mb-6">
      <div className="grid grid-cols-5 gap-3">
        {/* HP */}
        <HitPointsBar5e character={character} effectiveCharacter={effectiveCharacter} readonly={readonly} />

        {/* AC */}
        <div
          className="bg-gray-900/50 border border-gray-700 rounded-lg p-3 text-center"
          title={[
            equippedArmor ? `${equippedArmor.name}: ${equippedArmor.acBonus}` : `Unarmored: 10 + DEX`,
            equippedShield ? `Shield: +${equippedShield.acBonus}` : '',
            hasDefenseFS && equippedArmor ? '+1 (Defense)' : '',
            hasMediumArmorMaster && equippedArmor?.category === 'medium' ? '+1 DEX cap (Medium Armor Master)' : '',
            hasHeavyArmorMaster && equippedArmor?.category === 'heavy' ? `DR ${profBonus} (Heavy Armor Master)` : '',
            ...resolved.sources
              .filter((s) => s.effects.some((e) => e.type === 'ac_bonus') && s.sourceType !== 'fighting-style')
              .map((s) => {
                const bonus = s.effects.filter((e) => e.type === 'ac_bonus').reduce((sum, e) => sum + (e.value ?? 0), 0)
                return `+${bonus} (${s.sourceName})`
              })
          ]
            .filter(Boolean)
            .join('\n')}
        >
          <div className="text-xs text-gray-400 uppercase">AC</div>
          <div className="text-xl font-bold">{dynamicAC}</div>
          {acEquipmentBonus > 0 && <div className="text-xs text-blue-400">+{acEquipmentBonus} equip</div>}
          {hasDefenseFS && equippedArmor && <div className="text-[10px] text-green-400">+1 Defense</div>}
          {resolved.sources
            .filter((s) => s.effects.some((e) => e.type === 'ac_bonus') && s.sourceType !== 'fighting-style')
            .map((s) => (
              <div key={s.sourceId} className="text-[10px] text-purple-400">
                +{s.effects.filter((e) => e.type === 'ac_bonus').reduce((sum, e) => sum + (e.value ?? 0), 0)}{' '}
                {s.sourceName}
              </div>
            ))}
        </div>

        {/* Initiative */}
        <div
          className="bg-gray-900/50 border border-gray-700 rounded-lg p-3 text-center"
          title={initTooltipParts.join('\n')}
        >
          <div className="text-xs text-gray-400 uppercase">{thirdStat.label}</div>
          <div className="text-xl font-bold">{thirdStat.value}</div>
          {hasAlert && <div className="text-[10px] text-green-400">+PB (Alert)</div>}
        </div>

        {/* Speed */}
        {(() => {
          const rawSpeed = character.speed ?? 30
          const hasSpeedy = feats.some((f) => f.id === 'speedy')
          const hasBoonOfSpeed = feats.some((f) => f.id === 'boon-of-speed')
          const featSpeedBonus = (hasSpeedy ? 10 : 0) + (hasBoonOfSpeed ? 30 : 0)
          const baseSpeed = rawSpeed + featSpeedBonus + resolved.speedBonus
          const conditions = effectiveCharacter.conditions ?? []
          const hasGrappled = conditions.some((c) => c.name?.toLowerCase() === 'grappled')
          const hasRestrained = conditions.some((c) => c.name?.toLowerCase() === 'restrained')
          const exhaustionLevel = (() => {
            const exh = conditions.find((c) => c.name?.toLowerCase() === 'exhaustion')
            return exh?.value ?? 0
          })()
          const speedZero = hasGrappled || hasRestrained
          const exhaustionPenalty = exhaustionLevel * 5
          const effectiveSpeed = speedZero ? 0 : Math.max(0, baseSpeed - exhaustionPenalty)
          const isReduced = effectiveSpeed < baseSpeed

          const tooltipParts: string[] = [`Base: ${rawSpeed} ft`]
          if (hasSpeedy) tooltipParts.push('+10 ft (Speedy)')
          if (hasBoonOfSpeed) tooltipParts.push('+30 ft (Boon of Speed)')
          if (resolved.speedBonus > 0) {
            resolved.sources
              .filter((s) => s.effects.some((e) => e.type === 'speed_bonus'))
              .forEach((s) => {
                const bonus = s.effects
                  .filter((e) => e.type === 'speed_bonus')
                  .reduce((sum, e) => sum + (e.value ?? 0), 0)
                tooltipParts.push(`+${bonus} ft (${s.sourceName})`)
              })
          }
          if (hasGrappled) tooltipParts.push('Grappled: Speed 0')
          if (hasRestrained) tooltipParts.push('Restrained: Speed 0')
          if (exhaustionLevel > 0) tooltipParts.push(`Exhaustion ${exhaustionLevel}: -${exhaustionPenalty} ft`)

          return (
            <div
              className="bg-gray-900/50 border border-gray-700 rounded-lg p-3 text-center"
              title={isReduced || featSpeedBonus > 0 || resolved.speedBonus > 0 ? tooltipParts.join('\n') : undefined}
            >
              <div className="text-xs text-gray-400 uppercase">Speed</div>
              <div className={`text-xl font-bold ${isReduced ? 'text-red-400' : ''}`}>{effectiveSpeed} ft</div>
              {isReduced && <div className="text-[10px] text-red-400 mt-0.5">(base {baseSpeed} ft)</div>}
              {(() => {
                const speeds = effectiveCharacter.speeds
                if (!speeds) return null
                const entries = Object.entries(speeds).filter(([, v]) => v > 0)
                if (entries.length === 0) return null
                return (
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {entries.map(([k, v]) => `${k} ${v} ft`).join(', ')}
                  </div>
                )
              })()}
            </div>
          )
        })()}

        {/* Size */}
        <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-400 uppercase">Size</div>
          <div className="text-xl font-bold">{characterSize}</div>
          {effectiveCharacter.creatureType && (
            <div className="text-[10px] text-gray-500">{effectiveCharacter.creatureType}</div>
          )}
        </div>

        {/* Prof Bonus + Save DC + Passive Perception */}
        <div className="col-span-5 text-sm text-gray-400 flex gap-4">
          <span>
            Proficiency Bonus: <span className="text-amber-400 font-semibold">+{profBonus}</span>
          </span>
          {(() => {
            const scInfo = computeSpellcastingInfo(
              effectiveCharacter.classes.map((c) => ({
                classId: c.name.toLowerCase(),
                subclassId: c.subclass?.toLowerCase(),
                level: c.level
              })),
              effectiveCharacter.abilityScores,
              effectiveCharacter.level,
              effectiveCharacter.buildChoices.classId,
              effectiveCharacter.buildChoices.subclassId
            )
            if (!scInfo) return null
            const effectiveDC = scInfo.spellSaveDC + resolved.spellDCBonus
            const effectiveAttack = scInfo.spellAttackBonus + resolved.spellAttackBonus
            const dcTooltipParts = [`Base ${scInfo.spellSaveDC}`]
            if (resolved.spellDCBonus > 0) dcTooltipParts.push(`+${resolved.spellDCBonus} (items)`)
            return (
              <>
                <span title={dcTooltipParts.length > 1 ? dcTooltipParts.join(' ') : undefined}>
                  Save DC: <span className="font-semibold text-amber-400">{effectiveDC}</span>
                </span>
                <span
                  title={
                    resolved.spellAttackBonus > 0
                      ? `Base ${formatMod(scInfo.spellAttackBonus)} + ${resolved.spellAttackBonus} (items)`
                      : undefined
                  }
                >
                  Spell Atk: <span className="text-amber-400 font-semibold">{formatMod(effectiveAttack)}</span>
                </span>
              </>
            )
          })()}
          {(() => {
            const percSkill = effectiveCharacter.skills.find((s) => s.name === 'Perception')
            const percBonus = percSkill?.expertise ? profBonus * 2 : percSkill?.proficient ? profBonus : 0
            const conditions = effectiveCharacter.conditions ?? []
            const exhCond = conditions.find((c) => c.name?.toLowerCase() === 'exhaustion')
            const exhPenalty = (exhCond?.value ?? 0) * 2
            const passivePerc = 10 + abilityModifier(effectiveCharacter.abilityScores.wisdom) + percBonus - exhPenalty
            return (
              <span
                title={
                  exhPenalty > 0
                    ? `Base ${10 + abilityModifier(effectiveCharacter.abilityScores.wisdom) + percBonus} - ${exhPenalty} (Exhaustion)`
                    : undefined
                }
              >
                Passive Perception:{' '}
                <span className={`font-semibold ${exhPenalty > 0 ? 'text-red-400' : 'text-amber-400'}`}>
                  {passivePerc}
                </span>
              </span>
            )
          })()}
        </div>

        {/* Senses */}
        {effectiveCharacter.senses && effectiveCharacter.senses.length > 0 && (
          <div className="col-span-5 text-sm text-gray-400">
            Senses: <span className="text-amber-400">{effectiveCharacter.senses.join(', ')}</span>
          </div>
        )}
      </div>

      {/* Wild Shape Tracker (Druid level 2+) */}
      {effectiveCharacter.wildShapeUses && effectiveCharacter.wildShapeUses.max > 0 && (
        <div className="mt-3 bg-gray-900/50 border border-green-900/50 rounded-lg p-3">
          <div className="flex items-center gap-4">
            <span className="text-sm text-green-400 font-semibold">Wild Shape:</span>
            <div className="flex items-center gap-2">
              <button
                disabled={readonly || effectiveCharacter.wildShapeUses.current <= 0}
                aria-label="Use Wild Shape"
                onClick={() => {
                  const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
                  const ws = (latest as Character5e).wildShapeUses
                  if (!ws || ws.current <= 0) return
                  const updated = {
                    ...latest,
                    wildShapeUses: { ...ws, current: ws.current - 1 },
                    updatedAt: new Date().toISOString()
                  }
                  saveCharacter(updated)
                  const { role: r, sendMessage } = useNetworkStore.getState()
                  if (r === 'host' && updated.playerId !== 'local') {
                    sendMessage('dm:character-update', {
                      characterId: updated.id,
                      characterData: updated,
                      targetPeerId: updated.playerId
                    })
                    useLobbyStore.getState().setRemoteCharacter(updated.id, updated as Character)
                  }
                }}
                className="w-6 h-6 rounded bg-gray-800 border border-gray-600 hover:border-green-500 text-gray-400 hover:text-green-400 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-bold flex items-center justify-center"
              >
                -
              </button>
              <span className="text-lg font-bold text-green-400">{effectiveCharacter.wildShapeUses.current}</span>
              <span className="text-sm text-gray-500">/ {effectiveCharacter.wildShapeUses.max}</span>
              <button
                disabled={readonly || effectiveCharacter.wildShapeUses.current >= effectiveCharacter.wildShapeUses.max}
                aria-label="Regain Wild Shape use"
                onClick={() => {
                  const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
                  const ws = (latest as Character5e).wildShapeUses
                  if (!ws || ws.current >= ws.max) return
                  const updated = {
                    ...latest,
                    wildShapeUses: { ...ws, current: ws.current + 1 },
                    updatedAt: new Date().toISOString()
                  }
                  saveCharacter(updated)
                  const { role: r, sendMessage } = useNetworkStore.getState()
                  if (r === 'host' && updated.playerId !== 'local') {
                    sendMessage('dm:character-update', {
                      characterId: updated.id,
                      characterData: updated,
                      targetPeerId: updated.playerId
                    })
                    useLobbyStore.getState().setRemoteCharacter(updated.id, updated as Character)
                  }
                }}
                className="w-6 h-6 rounded bg-gray-800 border border-gray-600 hover:border-green-500 text-gray-400 hover:text-green-400 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-bold flex items-center justify-center"
              >
                +
              </button>
            </div>
            <span className="text-xs text-gray-500 ml-auto">Short Rest: +1 | Long Rest: all</span>
          </div>
        </div>
      )}

      {/* Death Saves (when HP <= 0) */}
      <DeathSaves5e character={character} effectiveCharacter={effectiveCharacter} readonly={readonly} />
    </div>
  )
}
