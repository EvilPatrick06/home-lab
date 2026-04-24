import { useState } from 'react'
import { SKILLS_5E } from '../../../data/skills'
import {
  getToolSkillAdvantage as getToolAdvantage,
  TOOL_SKILL_INTERACTIONS
} from '../../../services/character/stat-calculator-5e'
import { useGameStore } from '../../../stores/use-game-store'
import type { Character } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import type { AbilityName } from '../../../types/character-common'
import { abilityModifier, formatMod } from '../../../types/character-common'

interface SkillRollButtonProps {
  character: Character | null
  playerName?: string
  onRoll: (result: { formula: string; total: number; rolls: number[] }) => void
}

const ABILITY_LABELS: Record<AbilityName, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA'
}

const SAVE_ORDER: AbilityName[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']

function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1
}

export default function SkillRollButton({ character, onRoll }: SkillRollButtonProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'skills' | 'saves'>('skills')
  const [advantage, setAdvantage] = useState<'normal' | 'advantage' | 'disadvantage'>('normal')

  const gameConditions = useGameStore((s) => s.conditions)
  const travelPace = useGameStore((s) => s.travelPace)

  if (!character) return <></>

  const char5e = character as Character5e
  const profBonus = Math.ceil(character.level / 4) + 1

  const getSkillMod = (skillName: string): number => {
    const skillDef = SKILLS_5E.find((s) => s.name === skillName)
    if (!skillDef) return 0
    const abilityKey =
      skillDef.ability === 'STR'
        ? 'strength'
        : skillDef.ability === 'DEX'
          ? 'dexterity'
          : skillDef.ability === 'CON'
            ? 'constitution'
            : skillDef.ability === 'INT'
              ? 'intelligence'
              : skillDef.ability === 'WIS'
                ? 'wisdom'
                : 'charisma'
    const mod = abilityModifier(character.abilityScores[abilityKey as AbilityName])
    const skill = char5e.skills.find((s) => s.name === skillName)
    if (skill?.expertise) return mod + profBonus * 2
    if (skill?.proficient) return mod + profBonus
    return mod
  }

  const getSaveMod = (ability: AbilityName): number => {
    const mod = abilityModifier(character.abilityScores[ability])
    const isProficient = char5e.proficiencies.savingThrows?.includes(ability)
    return isProficient ? mod + profBonus : mod
  }

  // Check if character has tool proficiency that grants advantage on a skill (2024 PHB)
  // TOOL_SKILL_INTERACTIONS defines the full set of tool-skill advantage pairings
  const toolInteractionCount = TOOL_SKILL_INTERACTIONS.length
  const getToolSkillAdvantage = (skillName: string): string | null => {
    const tools = char5e.proficiencies?.tools ?? []
    const interaction = getToolAdvantage(tools, skillName)
    return interaction?.tool ?? null
  }

  const doRoll = (label: string, mod: number, isSkillCheck = false, skillName?: string): void => {
    // 2024 PHB: Exhaustion penalty applies to ALL d20 Tests (ability checks, attack rolls, saving throws)
    const entityConditions = character ? gameConditions.filter((c) => c.entityId === character.id) : []
    const exhaustionCond = entityConditions.find((c) => c.condition.toLowerCase() === 'exhaustion')
    const exhaustionLevel = exhaustionCond?.value ?? 0
    const exhaustionPenalty = exhaustionLevel * -2

    // Auto-fail STR/DEX saves when Paralyzed/Stunned/Unconscious/Petrified
    if (!isSkillCheck && character) {
      const autoFailConditions = ['Paralyzed', 'Stunned', 'Unconscious', 'Petrified']
      const abilityName = label.split(' ')[0] // "STR", "DEX", etc.
      if (
        (abilityName === 'STR' || abilityName === 'DEX') &&
        entityConditions.some((ec) => autoFailConditions.includes(ec.condition))
      ) {
        const failCondition = entityConditions.find((ec) => autoFailConditions.includes(ec.condition))
        onRoll({ formula: `${label}: Auto-FAIL (${failCondition?.condition})`, total: 0, rolls: [0] })
        setOpen(false)
        return
      }
    }

    // Apply exhaustion penalty to the modifier for this d20 Test
    const effectiveMod = mod + exhaustionPenalty

    let effectiveAdvantage = advantage

    // Tool + Skill advantage (E3)
    let toolAdvNote = ''
    if (isSkillCheck && skillName && advantage === 'normal') {
      const charSkill = char5e.skills.find((s) => s.name === skillName)
      if (charSkill?.proficient) {
        const tool = getToolSkillAdvantage(skillName)
        if (tool) {
          effectiveAdvantage = 'advantage'
          toolAdvNote = ` [Tool+Skill: ${tool}]`
        }
      }
    }

    // Restrained: disadvantage on DEX saves
    if (!isSkillCheck && character) {
      const abilityName = label.split(' ')[0]
      if (abilityName === 'DEX' && entityConditions.some((ec) => ec.condition === 'Restrained')) {
        if (effectiveAdvantage === 'normal') effectiveAdvantage = 'disadvantage'
      }
    }

    // Travel pace effects on skill checks
    if (isSkillCheck && travelPace && effectiveAdvantage === 'normal') {
      if (
        travelPace === 'fast' &&
        (skillName === 'Perception' || skillName === 'Survival' || skillName === 'Stealth')
      ) {
        effectiveAdvantage = 'disadvantage'
      } else if (travelPace === 'normal' && skillName === 'Stealth') {
        effectiveAdvantage = 'disadvantage'
      } else if (travelPace === 'slow' && (skillName === 'Perception' || skillName === 'Survival')) {
        effectiveAdvantage = 'advantage'
      }
    }

    let roll: number
    let allRolls: number[]
    let formula: string
    const exhNote = exhaustionPenalty !== 0 ? ` [Exh ${exhaustionLevel}: ${exhaustionPenalty}]` : ''

    if (effectiveAdvantage === 'normal') {
      roll = rollD20()
      allRolls = [roll]
      formula = `1d20${effectiveMod >= 0 ? '+' : ''}${effectiveMod}${exhNote}`
    } else {
      const r1 = rollD20()
      const r2 = rollD20()
      allRolls = [r1, r2]
      roll = effectiveAdvantage === 'advantage' ? Math.max(r1, r2) : Math.min(r1, r2)
      const advLabel = effectiveAdvantage === 'advantage' ? 'Adv' : 'Dis'
      formula = `1d20${effectiveMod >= 0 ? '+' : ''}${effectiveMod} (${advLabel}${toolAdvNote})${exhNote}`
    }

    const total = roll + effectiveMod
    onRoll({ formula: `${label}: ${formula}`, total, rolls: allRolls })
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={!character}
        className={`px-2 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${
          open
            ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50'
            : 'bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200'
        }`}
        title={`Skill & Save Rolls (${toolInteractionCount} tool-skill interactions)`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path
            fillRule="evenodd"
            d="M10 1a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 1zM5.05 3.05a.75.75 0 011.06 0l1.062 1.06A.75.75 0 016.11 5.173L5.05 4.11a.75.75 0 010-1.06zm9.9 0a.75.75 0 010 1.06l-1.06 1.062a.75.75 0 01-1.062-1.061l1.06-1.06a.75.75 0 011.06 0zM10 7a3 3 0 100 6 3 3 0 000-6zm-6.25 3a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5a.75.75 0 01-.75-.75zm12 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5a.75.75 0 01-.75-.75zM5.05 16.95a.75.75 0 011.06-1.06l1.062 1.06a.75.75 0 01-1.061 1.062L5.05 16.95zm9.9 0a.75.75 0 01-1.06-1.06l1.06-1.062a.75.75 0 111.062 1.061l-1.06 1.06zM10 16.25a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-1 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-30 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => setTab('skills')}
              className={`flex-1 px-3 py-2 text-xs font-semibold cursor-pointer ${
                tab === 'skills' ? 'text-amber-400 border-b-2 border-amber-500' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Skills
            </button>
            <button
              onClick={() => setTab('saves')}
              className={`flex-1 px-3 py-2 text-xs font-semibold cursor-pointer ${
                tab === 'saves' ? 'text-amber-400 border-b-2 border-amber-500' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Saves
            </button>
          </div>

          {/* Advantage toggle */}
          <div className="flex gap-1 px-2 pt-2">
            {(['normal', 'advantage', 'disadvantage'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setAdvantage(mode)}
                className={`flex-1 px-1 py-0.5 text-[10px] rounded transition-colors cursor-pointer
                  ${
                    advantage === mode
                      ? mode === 'advantage'
                        ? 'bg-green-600 text-white'
                        : mode === 'disadvantage'
                          ? 'bg-red-600 text-white'
                          : 'bg-amber-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
              >
                {mode === 'normal' ? 'Normal' : mode === 'advantage' ? 'Adv' : 'Dis'}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="max-h-64 overflow-y-auto p-1.5">
            {tab === 'skills' &&
              SKILLS_5E.map((skill) => {
                const mod = getSkillMod(skill.name)
                const charSkill = char5e.skills.find((s) => s.name === skill.name)
                const isProficient = charSkill?.proficient ?? false
                const isExpert = charSkill?.expertise ?? false
                const toolAdvTool = isProficient ? getToolSkillAdvantage(skill.name) : null
                return (
                  <button
                    key={skill.name}
                    onClick={() => doRoll(skill.name, mod, true, skill.name)}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-800 cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${isExpert ? 'bg-amber-400' : isProficient ? 'bg-green-400' : 'bg-gray-600'}`}
                      />
                      <span className="text-xs text-gray-200">{skill.name}</span>
                      <span className="text-[10px] text-gray-500">({skill.ability})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {toolAdvTool && (
                        <span
                          className="text-[8px] text-green-400 bg-green-900/30 px-1 rounded"
                          title={`Advantage from ${toolAdvTool} + ${skill.name}`}
                        >
                          ADV
                        </span>
                      )}
                      <span
                        className={`text-xs font-mono font-semibold ${mod >= 0 ? 'text-green-400' : 'text-red-400'}`}
                      >
                        {formatMod(mod)}
                      </span>
                    </div>
                  </button>
                )
              })}

            {tab === 'saves' &&
              SAVE_ORDER.map((ability) => {
                const mod = getSaveMod(ability)
                const isProficient = char5e.proficiencies.savingThrows?.includes(ability)
                return (
                  <button
                    key={ability}
                    onClick={() => doRoll(`${ABILITY_LABELS[ability]} Save`, mod)}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-800 cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${isProficient ? 'bg-green-400' : 'bg-gray-600'}`} />
                      <span className="text-xs text-gray-200">
                        {ABILITY_LABELS[ability]} ({ability.charAt(0).toUpperCase() + ability.slice(1)})
                      </span>
                    </div>
                    <span className={`text-xs font-mono font-semibold ${mod >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatMod(mod)}
                    </span>
                  </button>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
