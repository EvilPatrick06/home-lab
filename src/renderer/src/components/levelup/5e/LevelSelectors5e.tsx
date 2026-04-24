import type { Character5e } from '../../../types/character-5e'
import type { BuildSlot } from '../../../types/character-common'

// Re-exports from split files
export { AsiAbilityPicker5e as AsiSelector5e, AsiOrFeatSelector5e, GeneralFeatPicker } from './AsiSelector5e'
export { EpicBoonSelector5e, FightingStyleSelector5e } from './FeatSelector5e'
export { DivineOrderSelector5e, ElementalFurySelector5e, PrimalOrderSelector5e } from './SpellSelector5e'
export { SubclassSelector5e } from './SubclassSelector5e'

export function ExpertiseSelector5e({
  slot,
  character,
  grant,
  selection,
  allExpertiseSelections,
  onSelect
}: {
  slot: BuildSlot
  character: Character5e
  grant: { count: number; restrictedSkills?: string[]; includeThievesTools?: boolean } | undefined
  selection: string[]
  allExpertiseSelections: Record<string, string[]>
  onSelect: (skills: string[]) => void
}): JSX.Element {
  if (!grant) return <></>

  // Gather already-expertise skills (from character + other slots in this level-up)
  const alreadyExpertise = new Set<string>()
  for (const skill of character.skills) {
    if (skill.expertise) alreadyExpertise.add(skill.name)
  }
  for (const [slotId, skills] of Object.entries(allExpertiseSelections)) {
    if (slotId !== slot.id) {
      for (const s of skills) alreadyExpertise.add(s)
    }
  }

  // Available options: proficient skills not already expertise, optionally restricted
  let options = character.skills.filter((s) => s.proficient && !alreadyExpertise.has(s.name)).map((s) => s.name)

  if (grant.restrictedSkills) {
    options = options.filter((s) => grant.restrictedSkills?.includes(s))
  }

  // Rogue: include Thieves' Tools option
  const toolOptions: string[] = []
  if (grant.includeThievesTools && character.proficiencies.tools.some((t) => t.toLowerCase().includes('thieves'))) {
    if (!alreadyExpertise.has("Thieves' Tools")) {
      toolOptions.push("Thieves' Tools")
    }
  }

  const allOptions = [...options, ...toolOptions]

  const handleToggle = (skill: string): void => {
    if (selection.includes(skill)) {
      onSelect(selection.filter((s) => s !== skill))
    } else if (selection.length < grant.count) {
      onSelect([...selection, skill])
    }
  }

  const label = grant.restrictedSkills ? 'Scholar (Expertise)' : 'Expertise'
  const isIncomplete = selection.length < grant.count

  return (
    <div className={`rounded ${isIncomplete ? 'ring-1 ring-amber-600/50 p-1 -m-1' : ''}`}>
      <div className="text-sm text-gray-400 mb-1 flex items-center gap-2">
        <span>
          {label}: Choose {grant.count} skill{grant.count > 1 ? 's' : ''}
        </span>
        <span className={isIncomplete ? 'text-amber-400' : 'text-green-400'}>
          ({selection.length}/{grant.count})
        </span>
        {isIncomplete && <span className="text-[10px] text-amber-500 font-semibold uppercase">Required</span>}
      </div>
      <div className="flex flex-wrap gap-1">
        {allOptions.map((skill) => {
          const isSelected = selection.includes(skill)
          return (
            <button
              key={skill}
              onClick={() => handleToggle(skill)}
              className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-cyan-600 text-white'
                  : selection.length >= grant.count
                    ? 'border border-gray-700 text-gray-600 cursor-not-allowed'
                    : 'border border-gray-600 text-gray-300 hover:border-cyan-500 hover:text-cyan-400'
              }`}
            >
              {skill}
            </button>
          )
        })}
        {allOptions.length === 0 && (
          <p className="text-xs text-gray-500 italic">No eligible skills available for expertise.</p>
        )}
      </div>
    </div>
  )
}

export function ordinal(n: number): string {
  if (n === 1) return 'st'
  if (n === 2) return 'nd'
  if (n === 3) return 'rd'
  return 'th'
}
