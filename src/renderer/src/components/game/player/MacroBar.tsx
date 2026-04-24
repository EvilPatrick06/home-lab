import { useMemo, useState } from 'react'
import { useMacroStore } from '../../../stores/use-macro-store'
import type { Character } from '../../../types/character'
import { is5eCharacter } from '../../../types/character'
import { abilityModifier, formatMod } from '../../../types/character-common'

interface MacroBarProps {
  character: Character | null
  onRoll: (formula: string, label: string) => void
}

interface MacroButton {
  id: string
  label: string
  formula: string
  category: 'weapon' | 'skill' | 'save' | 'custom'
  color: string
}

const SKILL_ABILITIES: Record<string, string> = {
  Acrobatics: 'dexterity',
  'Animal Handling': 'wisdom',
  Arcana: 'intelligence',
  Athletics: 'strength',
  Deception: 'charisma',
  History: 'intelligence',
  Insight: 'wisdom',
  Intimidation: 'charisma',
  Investigation: 'intelligence',
  Medicine: 'wisdom',
  Nature: 'intelligence',
  Perception: 'wisdom',
  Performance: 'charisma',
  Persuasion: 'charisma',
  Religion: 'intelligence',
  'Sleight of Hand': 'dexterity',
  Stealth: 'dexterity',
  Survival: 'wisdom'
}

export default function MacroBar({ character, onRoll }: MacroBarProps): JSX.Element | null {
  const [showAll, setShowAll] = useState(false)
  const [customFormula, setCustomFormula] = useState('')
  const [customLabel, setCustomLabel] = useState('')

  const macros = useMemo<MacroButton[]>(() => {
    if (!character || !is5eCharacter(character)) return []

    const char5e = character
    const pb = char5e.level <= 20 ? Math.ceil(char5e.level / 4) + 1 : Math.ceil((char5e.level - 1) / 4) + 1
    const buttons: MacroButton[] = []

    // Weapon attack macros
    for (const weapon of char5e.weapons) {
      const atkMod = weapon.attackBonus
      buttons.push({
        id: `atk-${weapon.id}`,
        label: `${weapon.name}: ${formatMod(atkMod)}`,
        formula: `1d20${atkMod >= 0 ? '+' : ''}${atkMod}`,
        category: 'weapon',
        color: 'bg-red-900/40 border-red-700/50 text-red-300 hover:bg-red-800/60'
      })

      if (weapon.damage) {
        buttons.push({
          id: `dmg-${weapon.id}`,
          label: `${weapon.name} dmg`,
          formula: weapon.damage,
          category: 'weapon',
          color: 'bg-orange-900/40 border-orange-700/50 text-orange-300 hover:bg-orange-800/60'
        })
      }
    }

    // Skill check macros (proficient skills only when collapsed, all when expanded)
    for (const skill of char5e.skills) {
      const abilityKey = SKILL_ABILITIES[skill.name] ?? skill.ability
      const abilityScore = char5e.abilityScores[abilityKey as keyof typeof char5e.abilityScores] ?? 10
      const mod = abilityModifier(abilityScore)
      let bonus = mod
      if (skill.proficient) bonus += pb
      if (skill.expertise) bonus += pb

      if (!showAll && !skill.proficient && !skill.expertise) continue

      buttons.push({
        id: `skill-${skill.name}`,
        label: `${skill.name}: ${formatMod(bonus)}`,
        formula: `1d20${bonus >= 0 ? '+' : ''}${bonus}`,
        category: 'skill',
        color: skill.proficient
          ? 'bg-blue-900/40 border-blue-700/50 text-blue-300 hover:bg-blue-800/60'
          : 'bg-gray-800/60 border-gray-700/50 text-gray-400 hover:bg-gray-700/60'
      })
    }

    return buttons
  }, [character, showAll])

  if (!character) return null

  const handleCustomRoll = (): void => {
    if (!customFormula.trim()) return
    onRoll(customFormula.trim(), customLabel.trim() || 'Custom')
    setCustomFormula('')
    setCustomLabel('')
  }

  const handlePinToHotbar = (macro: MacroButton): void => {
    const { hotbar, setHotbarSlot } = useMacroStore.getState()
    // Find first empty slot
    const emptyIndex = hotbar.indexOf(null)
    if (emptyIndex === -1) return // all slots full
    setHotbarSlot(emptyIndex, {
      id: `pinned-${macro.id}-${Date.now()}`,
      name: macro.label,
      command: `/roll ${macro.formula}`,
      icon: macro.category === 'weapon' ? '\u2694\uFE0F' : undefined,
      color: macro.color.split(' ')[0] // just the bg class
    })
  }

  const renderMacroButton = (macro: MacroButton): JSX.Element => (
    <div key={macro.id} className="relative group shrink-0">
      <button
        onClick={() => onRoll(macro.formula, macro.label)}
        className={`px-2 py-1 text-[10px] font-medium rounded border transition-colors cursor-pointer ${macro.color}`}
        title={`Roll ${macro.formula}`}
      >
        {macro.label}
      </button>
      <button
        onClick={() => handlePinToHotbar(macro)}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 text-[8px] rounded-full bg-gray-900 border border-gray-600 text-gray-400 hover:text-amber-400 hover:border-amber-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        title="Pin to hotbar"
      >
        +
      </button>
    </div>
  )

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 overflow-x-auto">
      {/* Weapon macros */}
      {macros.filter((m) => m.category === 'weapon').map(renderMacroButton)}

      {macros.filter((m) => m.category === 'weapon').length > 0 &&
        macros.filter((m) => m.category === 'skill').length > 0 && <div className="w-px h-4 bg-gray-700/50 shrink-0" />}

      {/* Skill macros */}
      {macros.filter((m) => m.category === 'skill').map(renderMacroButton)}

      {/* Toggle all skills */}
      <button
        onClick={() => setShowAll(!showAll)}
        className="shrink-0 px-1.5 py-1 text-[9px] text-gray-500 hover:text-gray-300 cursor-pointer border border-gray-700/30 rounded"
        title={showAll ? 'Show proficient only' : 'Show all skills'}
      >
        {showAll ? 'Less' : 'All'}
      </button>

      {/* Custom formula */}
      <div className="shrink-0 flex items-center gap-1 ml-1">
        <input
          type="text"
          value={customFormula}
          onChange={(e) => setCustomFormula(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCustomRoll()
          }}
          placeholder="2d6+3"
          className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
        />
        <button
          onClick={handleCustomRoll}
          disabled={!customFormula.trim()}
          className="px-1.5 py-0.5 text-[10px] bg-amber-600/40 border border-amber-500/50 text-amber-300 rounded cursor-pointer hover:bg-amber-600/60 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Roll
        </button>
      </div>
    </div>
  )
}
