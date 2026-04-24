import type { Character5e } from '../../../../types/character-5e'

interface CharacterInspectModalProps {
  characterData: unknown
  onClose: () => void
}

function abilityMod(score: number): string {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

export default function CharacterInspectModal({ characterData, onClose }: CharacterInspectModalProps): JSX.Element {
  const char = characterData as Character5e
  if (!char || !char.name) {
    return (
      <div className="fixed inset-0 z-20 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-md w-full mx-4 shadow-2xl">
          <p className="text-xs text-gray-400">No character data available.</p>
          <button
            onClick={onClose}
            className="mt-2 px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  const classes = (char.classes ?? []).map((c) => `${c.name} ${c.level}`).join(' / ')
  const abilities = char.abilityScores ?? {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10
  }
  const abilityOrder = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const
  const abilityLabels: Record<string, string> = {
    strength: 'STR',
    dexterity: 'DEX',
    constitution: 'CON',
    intelligence: 'INT',
    wisdom: 'WIS',
    charisma: 'CHA'
  }
  const equipment = char.equipment ?? []
  const spells = char.knownSpells ?? []

  const allProficiencies = [
    ...char.proficiencies.weapons,
    ...char.proficiencies.armor,
    ...char.proficiencies.tools,
    ...char.proficiencies.languages
  ]

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl p-4 max-w-2xl w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-200">{char.name}</h3>
            <p className="text-[10px] text-gray-400">
              {classes} &middot; {char.species ?? 'Unknown Species'} &middot; {char.background ?? ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
          {/* Ability Scores */}
          <div className="grid grid-cols-6 gap-1.5">
            {abilityOrder.map((ab) => {
              const score = abilities[ab] ?? 10
              return (
                <div key={ab} className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-gray-500 uppercase font-semibold">{abilityLabels[ab]}</div>
                  <div className="text-sm font-bold text-gray-200">{score}</div>
                  <div className="text-[10px] text-amber-400">{abilityMod(score)}</div>
                </div>
              )
            })}
          </div>

          {/* HP / AC / Speed / Initiative */}
          <div className="grid grid-cols-4 gap-1.5">
            <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-2 text-center">
              <div className="text-[10px] text-gray-500 uppercase font-semibold">HP</div>
              <div className="text-sm font-bold text-green-400">
                {char.hitPoints?.current ?? '?'} / {char.hitPoints?.maximum ?? '?'}
              </div>
            </div>
            <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-2 text-center">
              <div className="text-[10px] text-gray-500 uppercase font-semibold">AC</div>
              <div className="text-sm font-bold text-blue-400">{char.armorClass ?? '?'}</div>
            </div>
            <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-2 text-center">
              <div className="text-[10px] text-gray-500 uppercase font-semibold">Speed</div>
              <div className="text-sm font-bold text-gray-200">{char.speed ?? 30} ft</div>
            </div>
            <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg p-2 text-center">
              <div className="text-[10px] text-gray-500 uppercase font-semibold">Initiative</div>
              <div className="text-sm font-bold text-gray-200">{abilityMod(abilities.dexterity ?? 10)}</div>
            </div>
          </div>

          {/* Proficiencies */}
          {allProficiencies.length > 0 && (
            <div>
              <h4 className="text-[10px] text-gray-500 uppercase font-semibold mb-1">Proficiencies</h4>
              <p className="text-xs text-gray-300">{allProficiencies.join(', ')}</p>
            </div>
          )}

          {/* Saving Throws */}
          {char.proficiencies.savingThrows.length > 0 && (
            <div>
              <h4 className="text-[10px] text-gray-500 uppercase font-semibold mb-1">Saving Throws</h4>
              <p className="text-xs text-gray-300">{char.proficiencies.savingThrows.join(', ')}</p>
            </div>
          )}

          {/* Skills */}
          {char.skills && char.skills.length > 0 && (
            <div>
              <h4 className="text-[10px] text-gray-500 uppercase font-semibold mb-1">Skills</h4>
              <div className="grid grid-cols-2 gap-0.5">
                {char.skills.map((skill) => (
                  <div key={skill.name} className="text-xs text-gray-300">
                    {skill.name}
                    {skill.proficient ? ' (proficient)' : ''}
                    {skill.expertise ? ' (expertise)' : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Equipment */}
          {equipment.length > 0 && (
            <div>
              <h4 className="text-[10px] text-gray-500 uppercase font-semibold mb-1">Equipment</h4>
              <div className="grid grid-cols-2 gap-0.5">
                {equipment.map((item) => {
                  const name = typeof item === 'string' ? item : item.name
                  const qty = typeof item === 'string' ? 1 : (item.quantity ?? 1)
                  return (
                    <div key={name} className="text-xs text-gray-300">
                      {qty > 1 ? `${qty}x ` : ''}
                      {name}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Spells */}
          {spells.length > 0 && (
            <div>
              <h4 className="text-[10px] text-gray-500 uppercase font-semibold mb-1">Spells</h4>
              <div className="grid grid-cols-2 gap-0.5">
                {spells.map((spell) => (
                  <div key={spell.id} className="text-xs text-gray-300">
                    {spell.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
