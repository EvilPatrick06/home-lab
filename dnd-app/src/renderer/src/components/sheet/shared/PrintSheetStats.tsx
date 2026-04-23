import type { Character5e, CharacterClass5e, EquipmentItem, SkillProficiency5e } from '../../../types/character-5e'
import {
  ABILITY_NAMES,
  type AbilityName,
  abilityModifier,
  formatMod,
  type WeaponEntry
} from '../../../types/character-common'

const ABILITY_LABELS: Record<AbilityName, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA'
}

interface PrintSheetStatsProps {
  character: Character5e
  proficiencyBonus: number
}

export default function PrintSheetStats({ character, proficiencyBonus: pb }: PrintSheetStatsProps): JSX.Element {
  const hitDiceStr = character.classes.map((c: CharacterClass5e) => `${c.level}d${c.hitDie}`).join(' + ')

  return (
    <>
      {/* Ability Scores */}
      <div className="mb-4">
        <h2
          className="mb-1 text-xs font-bold uppercase tracking-wider border-b border-gray-400 pb-0.5"
          style={{ fontSize: '8pt' }}
        >
          Ability Scores
        </h2>
        <div className="grid grid-cols-6 gap-2 text-center mt-1">
          {ABILITY_NAMES.map((ab) => {
            const score = character.abilityScores[ab]
            const mod = abilityModifier(score)
            return (
              <div key={ab} className="border border-gray-400 rounded px-1 py-1.5">
                <div className="text-[7pt] font-bold uppercase tracking-wide text-gray-600">{ABILITY_LABELS[ab]}</div>
                <div className="text-lg font-bold leading-tight" style={{ fontSize: '14pt' }}>
                  {formatMod(mod)}
                </div>
                <div className="text-[8pt] text-gray-500">{score}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Two-column layout for saving throws + skills and combat stats */}
      <div className="mb-4 grid grid-cols-2 gap-4">
        {/* Left column: Saving Throws + Skills */}
        <div>
          {/* Saving Throws */}
          <div className="mb-3">
            <h2
              className="mb-1 text-xs font-bold uppercase tracking-wider border-b border-gray-400 pb-0.5"
              style={{ fontSize: '8pt' }}
            >
              Saving Throws
            </h2>
            <div className="mt-0.5 space-y-px text-[8.5pt]">
              {ABILITY_NAMES.map((ab) => {
                const prof = character.proficiencies.savingThrows.includes(ab)
                const mod = abilityModifier(character.abilityScores[ab]) + (prof ? pb : 0)
                return (
                  <div key={ab} className="flex items-center gap-1.5">
                    <span className="inline-block w-3 text-center font-bold">{prof ? '+' : '-'}</span>
                    <span className="w-8 font-mono text-right">{formatMod(mod)}</span>
                    <span>{ABILITY_LABELS[ab]}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Skills */}
          <div>
            <h2
              className="mb-1 text-xs font-bold uppercase tracking-wider border-b border-gray-400 pb-0.5"
              style={{ fontSize: '8pt' }}
            >
              Skills
            </h2>
            <div className="mt-0.5 space-y-px text-[8.5pt]">
              {character.skills
                .slice()
                .sort((a: SkillProficiency5e, b: SkillProficiency5e) => a.name.localeCompare(b.name))
                .map((skill: SkillProficiency5e) => {
                  const abMod = abilityModifier(character.abilityScores[skill.ability])
                  let mod = abMod
                  if (skill.proficient) mod += pb
                  if (skill.expertise) mod += pb
                  const marker = skill.expertise ? 'E' : skill.proficient ? '+' : '-'
                  return (
                    <div key={skill.name} className="flex items-center gap-1.5">
                      <span className="inline-block w-3 text-center font-bold">{marker}</span>
                      <span className="w-8 font-mono text-right">{formatMod(mod)}</span>
                      <span>{skill.name}</span>
                      <span className="text-[7pt] text-gray-400 ml-0.5">({ABILITY_LABELS[skill.ability]})</span>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>

        {/* Right column: Combat Stats + Attacks + Proficiencies */}
        <div>
          {/* Combat Stats */}
          <div className="mb-3">
            <h2
              className="mb-1 text-xs font-bold uppercase tracking-wider border-b border-gray-400 pb-0.5"
              style={{ fontSize: '8pt' }}
            >
              Combat
            </h2>
            <div className="mt-1 grid grid-cols-3 gap-2 text-center">
              <div className="border border-gray-400 rounded py-1.5">
                <div className="text-[7pt] font-bold uppercase text-gray-600">AC</div>
                <div className="text-lg font-bold" style={{ fontSize: '14pt' }}>
                  {character.armorClass}
                </div>
              </div>
              <div className="border border-gray-400 rounded py-1.5">
                <div className="text-[7pt] font-bold uppercase text-gray-600">Initiative</div>
                <div className="text-lg font-bold" style={{ fontSize: '14pt' }}>
                  {formatMod(character.initiative)}
                </div>
              </div>
              <div className="border border-gray-400 rounded py-1.5">
                <div className="text-[7pt] font-bold uppercase text-gray-600">Speed</div>
                <div className="text-lg font-bold" style={{ fontSize: '14pt' }}>
                  {character.speed} ft
                </div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-center">
              <div className="border border-gray-400 rounded py-1.5">
                <div className="text-[7pt] font-bold uppercase text-gray-600">Hit Points</div>
                <div className="text-base font-bold" style={{ fontSize: '12pt' }}>
                  {character.hitPoints.current} / {character.hitPoints.maximum}
                </div>
                {character.hitPoints.temporary > 0 && (
                  <div className="text-[7pt] text-gray-500">+{character.hitPoints.temporary} temp</div>
                )}
              </div>
              <div className="border border-gray-400 rounded py-1.5">
                <div className="text-[7pt] font-bold uppercase text-gray-600">Hit Dice</div>
                <div className="text-base font-bold" style={{ fontSize: '12pt' }}>
                  {hitDiceStr}
                </div>
                <div className="text-[7pt] text-gray-500">
                  {character.hitDice.reduce((s, h) => s + h.current, 0)} remaining
                </div>
              </div>
            </div>
            {character.spellcasting && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-center">
                <div className="border border-gray-400 rounded py-1.5">
                  <div className="text-[7pt] font-bold uppercase text-gray-600">Spell Save DC</div>
                  <div className="text-base font-bold" style={{ fontSize: '12pt' }}>
                    {character.spellcasting.spellSaveDC}
                  </div>
                </div>
                <div className="border border-gray-400 rounded py-1.5">
                  <div className="text-[7pt] font-bold uppercase text-gray-600">Spell Attack</div>
                  <div className="text-base font-bold" style={{ fontSize: '12pt' }}>
                    {formatMod(character.spellcasting.spellAttackBonus)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Attacks */}
          {character.weapons.length > 0 && (
            <div className="mb-3">
              <h2
                className="mb-1 text-xs font-bold uppercase tracking-wider border-b border-gray-400 pb-0.5"
                style={{ fontSize: '8pt' }}
              >
                Attacks
              </h2>
              <table className="mt-0.5 w-full text-[8.5pt]">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-left py-0.5 font-semibold">Weapon</th>
                    <th className="text-center py-0.5 font-semibold w-14">Atk</th>
                    <th className="text-center py-0.5 font-semibold">Damage</th>
                  </tr>
                </thead>
                <tbody>
                  {character.weapons.map((w: WeaponEntry) => (
                    <tr key={w.id} className="border-b border-gray-200">
                      <td className="py-0.5">{w.name}</td>
                      <td className="text-center py-0.5 font-mono">{formatMod(w.attackBonus)}</td>
                      <td className="text-center py-0.5">
                        {w.damage} {w.damageType}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Proficiencies summary */}
          <div className="mb-3">
            <h2
              className="mb-1 text-xs font-bold uppercase tracking-wider border-b border-gray-400 pb-0.5"
              style={{ fontSize: '8pt' }}
            >
              Proficiencies
            </h2>
            <div className="mt-0.5 space-y-0.5 text-[8.5pt]">
              {character.proficiencies.armor.length > 0 && (
                <div>
                  <strong>Armor:</strong> {character.proficiencies.armor.join(', ')}
                </div>
              )}
              {character.proficiencies.weapons.length > 0 && (
                <div>
                  <strong>Weapons:</strong> {character.proficiencies.weapons.join(', ')}
                </div>
              )}
              {character.proficiencies.tools.length > 0 && (
                <div>
                  <strong>Tools:</strong> {character.proficiencies.tools.join(', ')}
                </div>
              )}
              {character.proficiencies.languages.length > 0 && (
                <div>
                  <strong>Languages:</strong> {character.proficiencies.languages.join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Equipment */}
      {character.equipment.length > 0 && (
        <div className="mb-4 break-inside-avoid">
          <h2
            className="mb-1 text-xs font-bold uppercase tracking-wider border-b border-gray-400 pb-0.5"
            style={{ fontSize: '8pt' }}
          >
            Equipment
          </h2>
          <div className="mt-0.5 columns-2 gap-4 text-[8.5pt]">
            {character.equipment.map((item: EquipmentItem, i: number) => (
              <div key={`${item.name}-${i}`} className="break-inside-avoid">
                {item.name}
                {item.quantity > 1 && <span className="text-gray-500"> x{item.quantity}</span>}
              </div>
            ))}
          </div>
          <div className="mt-1.5 text-[8.5pt]">
            <strong>Currency:</strong> {character.treasure.pp > 0 && `${character.treasure.pp} pp `}
            {character.treasure.gp > 0 && `${character.treasure.gp} gp `}
            {(character.treasure.ep ?? 0) > 0 && `${character.treasure.ep} ep `}
            {character.treasure.sp > 0 && `${character.treasure.sp} sp `}
            {character.treasure.cp > 0 && `${character.treasure.cp} cp`}
          </div>
        </div>
      )}
    </>
  )
}
