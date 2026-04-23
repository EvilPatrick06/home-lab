import type { Character5e } from '../../../types/character-5e'
import { ABILITY_NAMES, abilityModifier, formatMod } from '../../../types/character-common'
import SheetSectionWrapper from '../shared/SheetSectionWrapper'
import ProficiencyIndicator5e from './ProficiencyIndicator5e'

interface SavingThrowsSection5eProps {
  character: Character5e
}

export default function SavingThrowsSection5e({ character }: SavingThrowsSection5eProps): JSX.Element {
  const profBonus = Math.ceil(character.level / 4) + 1

  // Compute effective saving throw proficiencies (includes dynamic grants like Slippery Mind)
  const effectiveProficientSaves = (() => {
    const base = [...character.proficiencies.savingThrows]
    // Rogue L15+ Slippery Mind: grants WIS + CHA save proficiency
    const primaryClass = character.classes[0]
    if (primaryClass && primaryClass.name.toLowerCase() === 'rogue' && primaryClass.level >= 15) {
      if (!base.includes('wisdom')) base.push('wisdom')
      if (!base.includes('charisma')) base.push('charisma')
    }
    return base
  })()

  return (
    <SheetSectionWrapper title="Saving Throws">
      <div className="grid grid-cols-3 gap-2">
        {ABILITY_NAMES.map((ab) => {
          const isProficient = effectiveProficientSaves.includes(ab)
          const mod = abilityModifier(character.abilityScores[ab]) + (isProficient ? profBonus : 0)
          return (
            <div key={ab} className="flex items-center gap-2 text-sm">
              <ProficiencyIndicator5e proficient={isProficient} />
              <span className="text-gray-400 capitalize">{ab}</span>
              <span className="ml-auto font-mono">{formatMod(mod)}</span>
            </div>
          )
        })}
      </div>
    </SheetSectionWrapper>
  )
}
