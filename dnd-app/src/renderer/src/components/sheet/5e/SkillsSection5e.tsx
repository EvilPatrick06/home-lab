import { useState } from 'react'
import { getSkillDescription } from '../../../data/skills'
import type { Character5e } from '../../../types/character-5e'
import { abilityModifier, formatMod } from '../../../types/character-common'
import SheetSectionWrapper from '../shared/SheetSectionWrapper'
import ProficiencyIndicator5e from './ProficiencyIndicator5e'

interface SkillsSection5eProps {
  character: Character5e
  readonly?: boolean
}

export default function SkillsSection5e({ character, readonly: _readonly }: SkillsSection5eProps): JSX.Element {
  const profBonus = Math.ceil(character.level / 4) + 1
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)

  return (
    <SheetSectionWrapper title="Skills">
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {character.skills.map((skill) => {
          const abMod = abilityModifier(character.abilityScores[skill.ability])
          const desc = getSkillDescription(skill.name)
          const isExpanded = expandedSkill === skill.name

          const prof = skill.proficient ? profBonus : 0
          const exp = skill.expertise ? profBonus : 0
          const total = abMod + prof + exp
          const abLabel = skill.ability.slice(0, 3).toUpperCase()
          return (
            <div key={skill.name}>
              <button
                onClick={() => setExpandedSkill(isExpanded ? null : skill.name)}
                className="w-full flex items-center gap-2 text-sm py-0.5 cursor-pointer hover:bg-gray-800/30 rounded px-1 -mx-1 transition-colors"
              >
                <ProficiencyIndicator5e proficient={!!skill.proficient} expertise={!!skill.expertise} />
                <span className={skill.proficient ? 'text-gray-200' : 'text-gray-500'}>{skill.name}</span>
                <span className="text-gray-600 text-[10px] ml-0.5">{isExpanded ? '\u25BE' : '\u25B8'}</span>
                <span className="ml-auto font-mono text-xs">{formatMod(total)}</span>
              </button>
              {isExpanded && (
                <div className="ml-6 mb-1 text-xs text-gray-500 bg-gray-800/30 rounded p-1.5">
                  <div className="text-amber-400/80 font-mono mb-0.5">
                    {formatMod(total)} = {abLabel}({formatMod(abMod)})
                    {skill.proficient && <> + Prof({formatMod(profBonus)})</>}
                    {skill.expertise && <> + Expertise({formatMod(profBonus)})</>}
                  </div>
                  {desc && (
                    <>
                      <div className="text-gray-400">{desc.description}</div>
                      <div className="text-gray-600 mt-0.5">{desc.uses}</div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </SheetSectionWrapper>
  )
}
