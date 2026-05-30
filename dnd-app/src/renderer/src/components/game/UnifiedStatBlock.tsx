import { useT } from '../../i18n'
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
      <div className="text-xs text-gray-500 uppercase font-semibold">{label}</div>
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
  const { t } = useT()
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
            <span className="text-amber-500 font-semibold">{t('game.unifiedStatBlock.ac')}</span>
            <span className="text-gray-300">
              {sb.ac}
              {sb.acSource ? ` (${sb.acSource})` : ''}
            </span>
          </div>
          <div className="flex gap-1">
            <span className="text-amber-500 font-semibold">{t('game.unifiedStatBlock.hp')}</span>
            <span className="text-gray-300">
              {sb.hp}
              {sb.hpFormula ? ` (${sb.hpFormula})` : ''}
            </span>
          </div>
          <div className="flex gap-1">
            <span className="text-amber-500 font-semibold">{t('game.unifiedStatBlock.speed')}</span>
            <span className="text-gray-300">{sb.speed}</span>
          </div>
        </div>

        <SectionDivider />

        {/* Ability Scores */}
        <div className="grid grid-cols-6 gap-1">
          <AbilityRow label={t('game.unifiedStatBlock.str')} score={sb.abilities.str} />
          <AbilityRow label={t('game.unifiedStatBlock.dex')} score={sb.abilities.dex} />
          <AbilityRow label={t('game.unifiedStatBlock.con')} score={sb.abilities.con} />
          <AbilityRow label={t('game.unifiedStatBlock.int')} score={sb.abilities.int} />
          <AbilityRow label={t('game.unifiedStatBlock.wis')} score={sb.abilities.wis} />
          <AbilityRow label={t('game.unifiedStatBlock.cha')} score={sb.abilities.cha} />
        </div>

        <SectionDivider />

        {/* Detail lines */}
        <div className="space-y-0.5 text-xs">
          {sb.savingThrows && (
            <div>
              <span className="text-amber-500 font-semibold">{t('game.unifiedStatBlock.savingThrows')}</span>
              <span className="text-gray-300">{sb.savingThrows}</span>
            </div>
          )}
          {sb.skills && (
            <div>
              <span className="text-amber-500 font-semibold">{t('game.unifiedStatBlock.skills')}</span>
              <span className="text-gray-300">{sb.skills}</span>
            </div>
          )}
          {sb.damageResistances && (
            <div>
              <span className="text-amber-500 font-semibold">{t('game.unifiedStatBlock.damageResistances')}</span>
              <span className="text-gray-300">{sb.damageResistances}</span>
            </div>
          )}
          {sb.damageImmunities && (
            <div>
              <span className="text-amber-500 font-semibold">{t('game.unifiedStatBlock.damageImmunities')}</span>
              <span className="text-gray-300">{sb.damageImmunities}</span>
            </div>
          )}
          {sb.conditionImmunities && (
            <div>
              <span className="text-amber-500 font-semibold">{t('game.unifiedStatBlock.conditionImmunities')}</span>
              <span className="text-gray-300">{sb.conditionImmunities}</span>
            </div>
          )}
          {sb.senses && (
            <div>
              <span className="text-amber-500 font-semibold">{t('game.unifiedStatBlock.senses')}</span>
              <span className="text-gray-300">{sb.senses}</span>
            </div>
          )}
          {sb.languages && (
            <div>
              <span className="text-amber-500 font-semibold">{t('game.unifiedStatBlock.languages')}</span>
              <span className="text-gray-300">{sb.languages}</span>
            </div>
          )}
          {(sb.cr || sb.proficiencyBonus) && (
            <div className="flex gap-4">
              {sb.cr && (
                <div>
                  <span className="text-amber-500 font-semibold">{t('game.unifiedStatBlock.cr')}</span>
                  <span className="text-gray-300">
                    {sb.cr}
                    {sb.xp !== undefined ? t('game.unifiedStatBlock.xp', { xp: sb.xp.toLocaleString() }) : ''}
                  </span>
                </div>
              )}
              {sb.proficiencyBonus && (
                <div>
                  <span className="text-amber-500 font-semibold">{t('game.unifiedStatBlock.pb')}</span>
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
              <span className="text-amber-400 font-semibold italic">{t('game.unifiedStatBlock.spellcasting')}</span>
              <span className="text-gray-300">
                {sb.spellcasting.description ??
                  t('game.unifiedStatBlock.spellcastingFallback', {
                    dc: sb.spellcasting.dc,
                    attackBonus: sb.spellcasting.attackBonus,
                    ability: sb.spellcasting.ability
                  })}
              </span>
            </div>
          </>
        )}

        {/* Actions */}
        <TraitBlock items={sb.actions ?? []} heading={t('game.unifiedStatBlock.actions')} />

        {/* Bonus Actions */}
        <TraitBlock items={sb.bonusActions ?? []} heading={t('game.unifiedStatBlock.bonusActions')} />

        {/* Reactions */}
        <TraitBlock items={sb.reactions ?? []} heading={t('game.unifiedStatBlock.reactions')} />

        {/* Legendary Actions */}
        <TraitBlock items={sb.legendaryActions ?? []} heading={t('game.unifiedStatBlock.legendaryActions')} />

        {/* Lair Actions */}
        <TraitBlock items={sb.lairActions ?? []} heading={t('game.unifiedStatBlock.lairActions')} />
      </div>
    </div>
  )
}
