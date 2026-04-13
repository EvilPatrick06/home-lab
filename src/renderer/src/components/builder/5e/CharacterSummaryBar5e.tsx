import { useEffect, useMemo, useRef, useState } from 'react'
import type { ArmorForAC, DerivedStats5e } from '../../../services/character/stat-calculator-5e'
import { calculate5eStats } from '../../../services/character/stat-calculator-5e'
import { load5eClasses, load5eSpecies } from '../../../services/data-provider'
import { buildArmorFromEquipment5e } from '../../../stores/builder/slices/save-slice-5e'
import { useBuilderStore } from '../../../stores/use-builder-store'
import { ABILITY_NAMES, abilityModifier, formatMod } from '../../../types/character-common'
import { CharacterIcon } from '../shared/IconPicker'

// Ensure imported types are used for type-safety

function EditableHP({
  currentHP,
  maxHP,
  tempHP,
  onChangeHP,
  onChangeTempHP
}: {
  currentHP: number | null
  maxHP: number
  tempHP: number
  onChangeHP: (hp: number | null) => void
  onChangeTempHP: (hp: number) => void
}): JSX.Element {
  const [editingHP, setEditingHP] = useState(false)
  const [editingTemp, setEditingTemp] = useState(false)
  const [draftHP, setDraftHP] = useState('')
  const [draftTemp, setDraftTemp] = useState('')
  const hpRef = useRef<HTMLInputElement>(null)
  const tempRef = useRef<HTMLInputElement>(null)

  const displayHP = currentHP ?? maxHP

  function startEditHP(): void {
    setDraftHP(String(displayHP))
    setEditingHP(true)
    setTimeout(() => hpRef.current?.focus(), 0)
  }

  function commitHP(): void {
    const parsed = parseInt(draftHP, 10)
    if (!Number.isNaN(parsed)) {
      onChangeHP(parsed === maxHP ? null : parsed)
    }
    setEditingHP(false)
  }

  function startEditTemp(): void {
    setDraftTemp(String(tempHP))
    setEditingTemp(true)
    setTimeout(() => tempRef.current?.focus(), 0)
  }

  function commitTemp(): void {
    const parsed = parseInt(draftTemp, 10)
    if (!Number.isNaN(parsed) && parsed >= 0) {
      onChangeTempHP(parsed)
    }
    setEditingTemp(false)
  }

  function handleKeyDown(commit: () => void, cancel: () => void) {
    return (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') commit()
      else if (e.key === 'Escape') cancel()
    }
  }

  const hpColor = displayHP >= maxHP ? 'text-green-400' : displayHP > maxHP / 2 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className="text-center cursor-pointer" onClick={() => !editingHP && startEditHP()}>
      <div className="text-xs text-gray-500">HP</div>
      {editingHP ? (
        <input
          ref={hpRef}
          type="number"
          value={draftHP}
          onChange={(e) => setDraftHP(e.target.value)}
          onBlur={commitHP}
          onKeyDown={handleKeyDown(commitHP, () => setEditingHP(false))}
          className="w-12 text-center font-bold bg-transparent border-b border-green-400 outline-none text-green-400 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
        />
      ) : (
        <div className="flex items-center gap-0.5">
          <span className={`font-bold ${hpColor}`}>{displayHP}</span>
          <span className="text-gray-600 text-xs">/{maxHP}</span>
          {tempHP > 0 && (
            <span
              className="text-blue-400 text-xs font-medium ml-0.5 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                startEditTemp()
              }}
              title="Temp HP"
            >
              +
              {editingTemp ? (
                <input
                  ref={tempRef}
                  type="number"
                  min={0}
                  value={draftTemp}
                  onChange={(e) => setDraftTemp(e.target.value)}
                  onBlur={commitTemp}
                  onKeyDown={handleKeyDown(commitTemp, () => setEditingTemp(false))}
                  className="w-6 text-center bg-transparent border-b border-blue-400 outline-none text-blue-400 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                />
              ) : (
                tempHP
              )}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function CompletionBadge(): JSX.Element {
  const characterName = useBuilderStore((s) => s.characterName)
  const buildSlots = useBuilderStore((s) => s.buildSlots)

  const completionInfo = useMemo(() => {
    let completed = 0
    const total = 6
    if (characterName.trim()) completed++
    const ancestrySlot = buildSlots.find((s) => s.category === 'ancestry')
    if (ancestrySlot?.selectedId) completed++
    const classSlot = buildSlots.find((s) => s.category === 'class')
    if (classSlot?.selectedId) completed++
    const bgSlot = buildSlots.find((s) => s.category === 'background')
    if (bgSlot?.selectedId) completed++
    const abilitySlot = buildSlots.find((s) => s.id === 'ability-scores')
    if (abilitySlot?.selectedId) completed++
    const skillSlot = buildSlots.find((s) => s.id === 'skill-choices')
    if (skillSlot?.selectedId) completed++
    return { completed, total }
  }, [characterName, buildSlots])

  const { completed, total } = completionInfo
  const color =
    completed === total
      ? 'bg-green-600 text-green-100'
      : completed >= 4
        ? 'bg-amber-600 text-amber-100'
        : 'bg-red-600 text-red-100'

  return (
    <span
      className={`${color} text-xs font-bold px-1.5 py-0.5 rounded`}
      title={`${completed}/${total} foundation steps complete`}
    >
      {completed}/{total}
    </span>
  )
}

export default function CharacterSummaryBar5e(): JSX.Element {
  const { buildSlots, characterName, abilityScores, targetLevel, iconType, iconPreset, iconCustom } = useBuilderStore()
  const currentHP = useBuilderStore((s) => s.currentHP)
  const tempHP = useBuilderStore((s) => s.tempHP)
  const setCurrentHP = useBuilderStore((s) => s.setCurrentHP)
  const setTempHP = useBuilderStore((s) => s.setTempHP)

  const backgroundAbilityBonuses = useBuilderStore((s) => s.backgroundAbilityBonuses)

  const speciesSlot = buildSlots.find((s) => s.category === 'ancestry')
  const classSlot = buildSlots.find((s) => s.category === 'class')

  const classEquipment = useBuilderStore((s) => s.classEquipment)

  // Load SRD class/species data for accurate stat calculation
  const [classHitDie, setClassHitDie] = useState<string | null>(null)
  const [classSaves, setClassSaves] = useState<string[]>([])
  const [className, setClassName] = useState<string | null>(null)
  const [speciesData, setSpeciesData] = useState<{
    speed: number
    size: string
  } | null>(null)
  const [armorEntries, setArmorEntries] = useState<ArmorForAC[]>([])

  useEffect(() => {
    let cancelled = false
    const classId = classSlot?.selectedId
    const speciesId = speciesSlot?.selectedId
    if (classId) {
      load5eClasses().then((classes) => {
        if (cancelled) return
        const cls = classes.find((c) => c.id === classId)
        if (cls) {
          setClassHitDie(cls.coreTraits.hitPointDie)
          setClassSaves(cls.coreTraits.savingThrowProficiencies)
          setClassName(cls.name)
        }
      })
    } else {
      setClassHitDie(null)
      setClassSaves([])
      setClassName(null)
    }
    if (speciesId) {
      load5eSpecies().then((speciesList) => {
        if (cancelled) return
        const foundSpecies = speciesList.find((r) => r.id === speciesId)
        if (foundSpecies) {
          setSpeciesData({
            speed: foundSpecies.speed,
            size:
              foundSpecies.size.type === 'choice'
                ? (foundSpecies.size.options?.[0] ?? 'Medium')
                : (foundSpecies.size.value ?? 'Medium')
          })
        }
      })
    } else {
      setSpeciesData(null)
    }
    return () => {
      cancelled = true
    }
  }, [classSlot?.selectedId, speciesSlot?.selectedId])

  useEffect(() => {
    let cancelled = false
    if (classEquipment.length > 0) {
      buildArmorFromEquipment5e(classEquipment).then(({ armor }) => {
        if (cancelled) return
        setArmorEntries(
          armor.map((a) => ({
            acBonus: a.acBonus,
            equipped: a.equipped,
            type: a.type === 'shield' ? 'shield' : 'armor',
            category: a.category,
            dexCap: a.dexCap
          }))
        )
      })
    } else {
      setArmorEntries([])
    }
    return () => {
      cancelled = true
    }
  }, [classEquipment])

  const speciesSlotId = speciesSlot?.selectedId ?? null

  const stats5e: DerivedStats5e | null = useMemo(() => {
    const cls =
      classHitDie != null
        ? { hitDie: parseInt(classHitDie.replace(/\D/g, ''), 10) || 8, savingThrows: classSaves }
        : null
    const speciesBonuses =
      backgroundAbilityBonuses && Object.keys(backgroundAbilityBonuses).length > 0
        ? (backgroundAbilityBonuses as Partial<Record<string, number>>)
        : undefined
    return calculate5eStats(
      abilityScores,
      speciesData,
      cls,
      targetLevel,
      speciesBonuses,
      speciesSlotId,
      undefined,
      undefined,
      undefined,
      armorEntries,
      className ? [className] : []
    )
  }, [
    abilityScores,
    targetLevel,
    classHitDie,
    classSaves,
    speciesData,
    backgroundAbilityBonuses,
    speciesSlotId,
    armorEntries,
    className
  ])

  const maxHP = stats5e?.maxHP ?? 0
  const ac = stats5e?.armorClass ?? '--'
  const speed = stats5e?.speed ?? '--'

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-gray-900 border-b border-gray-700 text-sm shrink-0">
      {/* Name & Identity */}
      <div className="flex items-center gap-3 min-w-0">
        <CharacterIcon
          iconType={iconType}
          iconPreset={iconPreset}
          iconCustom={iconCustom}
          name={characterName}
          size="md"
        />
        <div className="min-w-0">
          <div className="font-semibold truncate text-gray-100">{characterName || 'Unnamed Character'}</div>
          <div className="text-xs text-gray-500 truncate">
            Lv {targetLevel} {speciesSlot?.selectedName ?? '???'} {classSlot?.selectedName ?? '???'}
          </div>
        </div>
      </div>

      <CompletionBadge />

      <div className="w-px h-8 bg-gray-700" />

      {/* HP - Editable */}
      <EditableHP
        currentHP={currentHP}
        maxHP={maxHP}
        tempHP={tempHP}
        onChangeHP={setCurrentHP}
        onChangeTempHP={setTempHP}
      />

      <div className="w-px h-8 bg-gray-700" />

      {/* Ability Scores */}
      <div className="flex gap-3">
        {ABILITY_NAMES.map((ab) => {
          const score = stats5e?.abilityScores[ab] ?? abilityScores[ab]
          const mod = abilityModifier(score)
          return (
            <div key={ab} className="text-center min-w-[40px]">
              <div className="text-xs text-gray-500 uppercase">{ab.slice(0, 3)}</div>
              <div className="font-bold text-amber-400">{formatMod(mod)}</div>
            </div>
          )
        })}
      </div>

      <div className="w-px h-8 bg-gray-700" />

      {/* Saves - 5e */}
      {stats5e && (
        <div className="flex gap-3">
          {['fortitude', 'reflex', 'will'].map((save, i) => {
            const abilities = ['constitution', 'dexterity', 'wisdom']
            const val = stats5e.savingThrows[abilities[i]] ?? 0
            const labels = ['Fort', 'Ref', 'Will']
            return (
              <div key={save} className="text-center min-w-[36px]">
                <div className="text-xs text-gray-500">{labels[i]}</div>
                <div className="font-semibold">{formatMod(val)}</div>
              </div>
            )
          })}
        </div>
      )}

      <div className="w-px h-8 bg-gray-700" />

      {/* AC */}
      <div className="text-center">
        <div className="text-xs text-gray-500">AC</div>
        <div className="font-bold">{ac}</div>
      </div>

      {/* Speed */}
      <div className="text-center">
        <div className="text-xs text-gray-500">Speed</div>
        <div className="font-semibold">{speed} ft</div>
      </div>
    </div>
  )
}
