import type { DisplayStatBlock } from '../../utils/stat-block-converter'

interface UnifiedStatBlockProps {
  statBlock: DisplayStatBlock
}

function formatModifier(score: number): string {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

function AbilityRow({ label, score }: { label: string; score: number }): JSX.Element {
  return (
    <div className="text-center">
      <div className="text-[10px] text-gray-500 uppercase font-semibold">{label}</div>
      <div className="text-sm font-semibold text-gray-200">{score}</div>
      <div className="text-xs text-amber-400">{formatModifier(score)}</div>
    </div>
  )
}

function SectionDivider(): JSX.Element {
  return <div className="border-t border-amber-800/30" />
}

function TraitBlock({
  items,
  heading
}: {
  items: { name: string; description: string }[]
  heading: string
}): JSX.Element | null {
  if (!items || items.length === 0) return null
  return (
    <>
      <SectionDivider />
      <div className="space-y-1.5">
        <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">{heading}</h4>
        {items.map((item, i) => (
          <div key={i} className="text-xs">
            <span className="text-amber-400 font-semibold italic">{item.name}. </span>
            <span className="text-gray-300">{item.description}</span>
          </div>
        ))}
      </div>
    </>
  )
}

export default function UnifiedStatBlock({ statBlock }: UnifiedStatBlockProps): JSX.Element {
  const sb = statBlock

  return (
    <div className="bg-gray-900 border border-amber-800/40 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-amber-900/30 border-b border-amber-800/40 px-3 py-2">
        <h3 className="text-base font-bold text-amber-400">{sb.name}</h3>
        <p className="text-xs text-gray-400">
          {sb.size} {sb.type}, {sb.alignment}
        </p>
      </div>

      <div className="px-3 py-2 space-y-2">
        {/* AC, HP, Speed */}
        <div className="space-y-0.5 text-sm">
          <div className="flex gap-1">
            <span className="text-amber-500 font-semibold">AC</span>
            <span className="text-gray-300">
              {sb.ac}
              {sb.acSource ? ` (${sb.acSource})` : ''}
            </span>
          </div>
          <div className="flex gap-1">
            <span className="text-amber-500 font-semibold">HP</span>
            <span className="text-gray-300">
              {sb.hp}
              {sb.hpFormula ? ` (${sb.hpFormula})` : ''}
            </span>
          </div>
          <div className="flex gap-1">
            <span className="text-amber-500 font-semibold">Speed</span>
            <span className="text-gray-300">{sb.speed}</span>
          </div>
        </div>

        <SectionDivider />

        {/* Ability Scores */}
        <div className="grid grid-cols-6 gap-1">
          <AbilityRow label="STR" score={sb.abilities.str} />
          <AbilityRow label="DEX" score={sb.abilities.dex} />
          <AbilityRow label="CON" score={sb.abilities.con} />
          <AbilityRow label="INT" score={sb.abilities.int} />
          <AbilityRow label="WIS" score={sb.abilities.wis} />
          <AbilityRow label="CHA" score={sb.abilities.cha} />
        </div>

        <SectionDivider />

        {/* Detail lines */}
        <div className="space-y-0.5 text-xs">
          {sb.savingThrows && (
            <div>
              <span className="text-amber-500 font-semibold">Saving Throws </span>
              <span className="text-gray-300">{sb.savingThrows}</span>
            </div>
          )}
          {sb.skills && (
            <div>
              <span className="text-amber-500 font-semibold">Skills </span>
              <span className="text-gray-300">{sb.skills}</span>
            </div>
          )}
          {sb.damageResistances && (
            <div>
              <span className="text-amber-500 font-semibold">Damage Resistances </span>
              <span className="text-gray-300">{sb.damageResistances}</span>
            </div>
          )}
          {sb.damageImmunities && (
            <div>
              <span className="text-amber-500 font-semibold">Damage Immunities </span>
              <span className="text-gray-300">{sb.damageImmunities}</span>
            </div>
          )}
          {sb.conditionImmunities && (
            <div>
              <span className="text-amber-500 font-semibold">Condition Immunities </span>
              <span className="text-gray-300">{sb.conditionImmunities}</span>
            </div>
          )}
          {sb.senses && (
            <div>
              <span className="text-amber-500 font-semibold">Senses </span>
              <span className="text-gray-300">{sb.senses}</span>
            </div>
          )}
          {sb.languages && (
            <div>
              <span className="text-amber-500 font-semibold">Languages </span>
              <span className="text-gray-300">{sb.languages}</span>
            </div>
          )}
          {(sb.cr || sb.proficiencyBonus) && (
            <div className="flex gap-4">
              {sb.cr && (
                <div>
                  <span className="text-amber-500 font-semibold">CR </span>
                  <span className="text-gray-300">
                    {sb.cr}
                    {sb.xp !== undefined ? ` (${sb.xp.toLocaleString()} XP)` : ''}
                  </span>
                </div>
              )}
              {sb.proficiencyBonus && (
                <div>
                  <span className="text-amber-500 font-semibold">PB </span>
                  <span className="text-gray-300">+{sb.proficiencyBonus}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Traits */}
        {sb.traits && sb.traits.length > 0 && (
          <>
            <SectionDivider />
            <div className="space-y-1.5">
              {sb.traits.map((trait, i) => (
                <div key={i} className="text-xs">
                  <span className="text-amber-400 font-semibold italic">{trait.name}. </span>
                  <span className="text-gray-300">{trait.description}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Spellcasting */}
        {sb.spellcasting && (
          <>
            <SectionDivider />
            <div className="text-xs">
              <span className="text-amber-400 font-semibold italic">Spellcasting. </span>
              <span className="text-gray-300">
                {sb.spellcasting.description ??
                  `Spell save DC ${sb.spellcasting.dc}, +${sb.spellcasting.attackBonus} to hit with spell attacks (${sb.spellcasting.ability})`}
              </span>
            </div>
          </>
        )}

        {/* Actions */}
        <TraitBlock items={sb.actions ?? []} heading="Actions" />

        {/* Bonus Actions */}
        <TraitBlock items={sb.bonusActions ?? []} heading="Bonus Actions" />

        {/* Reactions */}
        <TraitBlock items={sb.reactions ?? []} heading="Reactions" />

        {/* Legendary Actions */}
        <TraitBlock items={sb.legendaryActions ?? []} heading="Legendary Actions" />

        {/* Lair Actions */}
        <TraitBlock items={sb.lairActions ?? []} heading="Lair Actions" />
      </div>
    </div>
  )
}
