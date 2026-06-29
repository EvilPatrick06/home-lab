import { memo } from 'react'
import { useT } from '../../../i18n'
import { type ExtractedCondition, extractConditionsFromDescription } from '../../../services/combat/condition-extractor'
import type { MonsterAction } from '../../../services/data-provider'
import type { MonsterStatBlock } from '../../../types/monster'
import { abilityModifier } from '../../../types/monster'
import { renderInlineMarkdown } from '../../../utils/markdown'

interface MonsterStatBlockViewProps {
  monster: MonsterStatBlock
  compact?: boolean
}

function formatModifier(score: number): string {
  const mod = abilityModifier(score)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

function AbilityRow({ label, score }: { label: string; score: number }): JSX.Element {
  return (
    <div className="text-center">
      <div className="text-xs text-gray-500 uppercase">{label}</div>
      <div className="text-sm font-semibold text-gray-200">{score}</div>
      <div className="text-xs text-accent">{formatModifier(score)}</div>
    </div>
  )
}

function ActionQuickRef({ action }: { action: MonsterAction }): JSX.Element {
  const parts: string[] = []
  if (action.toHit !== undefined) parts.push(`+${action.toHit}`)
  if (action.saveDC) parts.push(`DC ${action.saveDC}`)
  if (action.damageDice) parts.push(action.damageDice)
  if (action.damageType) parts.push(action.damageType)
  if (action.recharge) parts.push(`R:${action.recharge}`)
  const summary = parts.join(' | ')
  const conditions: ExtractedCondition[] = extractConditionsFromDescription(action.description)

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-300 truncate">{action.name}</span>
      <div className="flex items-center gap-1 ms-1 shrink-0">
        {conditions.length > 0 && (
          <span className="text-red-400/80" title={conditions.map((c) => c.condition).join(', ')}>
            {conditions.map((c) => c.condition.slice(0, 3)).join('/')}
          </span>
        )}
        {summary && <span className="text-accent/80">{summary}</span>}
      </div>
    </div>
  )
}

function MonsterStatBlockView({ monster, compact = false }: MonsterStatBlockViewProps): JSX.Element {
  const { t } = useT()
  if (compact) {
    const keyActions = [...monster.actions, ...(monster.bonusActions || []), ...(monster.reactions || [])].filter(
      (a) => a.toHit !== undefined || a.saveDC !== undefined || a.damageDice
    )

    return (
      <div className="bg-surface-2/80 border border-border rounded-lg p-2 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-accent">{monster.name}</span>
          <span className="text-xs text-gray-500">{t('game.monsterStatBlockView.crValue', { cr: monster.cr })}</span>
        </div>
        <div className="flex gap-3 text-xs text-muted">
          <span>{t('game.monsterStatBlockView.acValue', { ac: monster.ac })}</span>
          <span>{t('game.monsterStatBlockView.hpValue', { hp: monster.hp })}</span>
          <span>{t('game.monsterStatBlockView.feet', { value: monster.speed.walk })}</span>
        </div>
        {keyActions.length > 0 && (
          <div className="space-y-0.5 border-t border-border/50 pt-1 mt-1">
            {keyActions.slice(0, 4).map((a, i) => (
              <ActionQuickRef key={i} action={a} />
            ))}
          </div>
        )}
        {monster.legendaryActions && (
          <div className="text-xs text-purple-400">
            {t('game.monsterStatBlockView.legendaryActionsCount', { count: monster.legendaryActions.uses })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-surface border border-amber-800/40 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-amber-900/30 border-b border-amber-800/40 px-3 py-2">
        <h3 className="text-base font-bold text-accent">{monster.name}</h3>
        <p className="text-xs text-muted">
          {monster.size} {monster.type}
          {monster.subtype ? ` (${monster.subtype})` : ''}, {monster.alignment}
        </p>
      </div>

      <div className="px-3 py-2 space-y-2">
        {/* AC, HP, Speed */}
        <div className="space-y-0.5 text-sm">
          <div className="flex gap-1">
            <span className="text-accent-strong font-semibold">{t('game.monsterStatBlockView.ac')}</span>
            <span className="text-gray-300">
              {monster.ac}
              {monster.acType ? ` (${monster.acType})` : ''}
            </span>
          </div>
          <div className="flex gap-1">
            <span className="text-accent-strong font-semibold">{t('game.monsterStatBlockView.hp')}</span>
            <span className="text-gray-300">
              {monster.hp} ({monster.hitDice})
            </span>
          </div>
          <div className="flex gap-1">
            <span className="text-accent-strong font-semibold">{t('game.monsterStatBlockView.speed')}</span>
            <span className="text-gray-300">
              {monster.speed.walk} ft
              {monster.speed.fly ? `, fly ${monster.speed.fly} ft${monster.speed.hover ? ' (hover)' : ''}` : ''}
              {monster.speed.swim ? `, swim ${monster.speed.swim} ft` : ''}
              {monster.speed.climb ? `, climb ${monster.speed.climb} ft` : ''}
              {monster.speed.burrow ? `, burrow ${monster.speed.burrow} ft` : ''}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-amber-800/30" />

        {/* Ability Scores */}
        <div className="grid grid-cols-6 gap-1">
          <AbilityRow label={t('game.monsterStatBlockView.str')} score={monster.abilityScores.str} />
          <AbilityRow label={t('game.monsterStatBlockView.dex')} score={monster.abilityScores.dex} />
          <AbilityRow label={t('game.monsterStatBlockView.con')} score={monster.abilityScores.con} />
          <AbilityRow label={t('game.monsterStatBlockView.int')} score={monster.abilityScores.int} />
          <AbilityRow label={t('game.monsterStatBlockView.wis')} score={monster.abilityScores.wis} />
          <AbilityRow label={t('game.monsterStatBlockView.cha')} score={monster.abilityScores.cha} />
        </div>

        <div className="border-t border-amber-800/30" />

        {/* Details */}
        <div className="space-y-0.5 text-xs">
          {monster.savingThrows && Object.keys(monster.savingThrows).length > 0 && (
            <div>
              <span className="text-accent-strong font-semibold">{t('game.monsterStatBlockView.savingThrows')}</span>
              <span className="text-gray-300">
                {Object.entries(monster.savingThrows)
                  .filter(([, v]) => v !== undefined)
                  .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} ${v! >= 0 ? '+' : ''}${v}`)
                  .join(', ')}
              </span>
            </div>
          )}
          {monster.skills && Object.keys(monster.skills).length > 0 && (
            <div>
              <span className="text-accent-strong font-semibold">{t('game.monsterStatBlockView.skills')}</span>
              <span className="text-gray-300">
                {Object.entries(monster.skills)
                  .map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v}`)
                  .join(', ')}
              </span>
            </div>
          )}
          {monster.resistances && monster.resistances.length > 0 && (
            <div>
              <span className="text-accent-strong font-semibold">{t('game.monsterStatBlockView.resistances')}</span>
              <span className="text-gray-300">{monster.resistances.join(', ')}</span>
            </div>
          )}
          {monster.damageImmunities && monster.damageImmunities.length > 0 && (
            <div>
              <span className="text-accent-strong font-semibold">
                {t('game.monsterStatBlockView.damageImmunities')}
              </span>
              <span className="text-gray-300">{monster.damageImmunities.join(', ')}</span>
            </div>
          )}
          {monster.conditionImmunities && monster.conditionImmunities.length > 0 && (
            <div>
              <span className="text-accent-strong font-semibold">
                {t('game.monsterStatBlockView.conditionImmunities')}
              </span>
              <span className="text-gray-300">{monster.conditionImmunities.join(', ')}</span>
            </div>
          )}
          {monster.senses && (
            <div>
              <span className="text-accent-strong font-semibold">{t('game.monsterStatBlockView.senses')}</span>
              <span className="text-gray-300">
                {[
                  monster.senses.blindsight ? `Blindsight ${monster.senses.blindsight} ft` : null,
                  monster.senses.darkvision ? `Darkvision ${monster.senses.darkvision} ft` : null,
                  monster.senses.tremorsense ? `Tremorsense ${monster.senses.tremorsense} ft` : null,
                  monster.senses.truesight ? `Truesight ${monster.senses.truesight} ft` : null,
                  `Passive Perception ${monster.senses.passivePerception}`
                ]
                  .filter(Boolean)
                  .join(', ')}
              </span>
            </div>
          )}
          <div>
            <span className="text-accent-strong font-semibold">{t('game.monsterStatBlockView.languages')}</span>
            <span className="text-gray-300">{monster.languages.length > 0 ? monster.languages.join(', ') : '—'}</span>
          </div>
          <div className="flex gap-4">
            <div>
              <span className="text-accent-strong font-semibold">{t('game.monsterStatBlockView.cr')}</span>
              <span className="text-gray-300">
                {t('game.monsterStatBlockView.crXp', { cr: monster.cr, xp: monster.xp.toLocaleString() })}
              </span>
            </div>
            <div>
              <span className="text-accent-strong font-semibold">{t('game.monsterStatBlockView.pb')}</span>
              <span className="text-gray-300">+{monster.proficiencyBonus}</span>
            </div>
          </div>
        </div>

        {/* Traits */}
        {monster.traits && monster.traits.length > 0 && (
          <>
            <div className="border-t border-amber-800/30" />
            <div className="space-y-1.5">
              {monster.traits.map((trait, i) => (
                <div key={i} className="text-xs">
                  <span className="text-accent font-semibold italic">{trait.name}. </span>
                  <span className="text-gray-300">{renderInlineMarkdown(trait.description)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Spellcasting */}
        {monster.spellcasting && (
          <>
            <div className="border-t border-amber-800/30" />
            <div className="text-xs space-y-1">
              <div className="text-accent font-semibold italic">
                {t('game.monsterStatBlockView.spellcasting')}{' '}
                <span className="text-gray-300 font-normal">
                  {monster.spellcasting.notes
                    ? renderInlineMarkdown(monster.spellcasting.notes)
                    : t('game.monsterStatBlockView.spellSave', {
                        dc: monster.spellcasting.saveDC,
                        bonus: monster.spellcasting.attackBonus
                      })}
                </span>
              </div>
              {monster.spellcasting.atWill && monster.spellcasting.atWill.length > 0 && (
                <div className="text-gray-300 ps-2">
                  <span className="text-gray-500">{t('game.monsterStatBlockView.atWill')}</span>
                  {monster.spellcasting.atWill.join(', ')}
                </div>
              )}
              {monster.spellcasting.perDay &&
                Object.entries(monster.spellcasting.perDay).map(([uses, spells]) => (
                  <div key={uses} className="text-gray-300 ps-2">
                    <span className="text-gray-500">{t('game.monsterStatBlockView.perDayEach', { uses })}</span>
                    {spells.join(', ')}
                  </div>
                ))}
            </div>
          </>
        )}

        {/* Actions */}
        <div className="border-t border-amber-800/30" />
        <div className="space-y-1.5">
          <h4 className="text-xs font-bold text-accent-strong uppercase tracking-wider">
            {t('game.monsterStatBlockView.actions')}
          </h4>
          {monster.actions.map((action, i) => {
            const conditions = extractConditionsFromDescription(action.description)
            return (
              <div key={i} className="text-xs">
                <span className="text-accent font-semibold italic">
                  {action.name}
                  {action.recharge ? t('game.monsterStatBlockView.recharge', { recharge: action.recharge }) : ''}.{' '}
                </span>
                {(action.toHit !== undefined || action.saveDC) && (
                  <span className="text-cyan-400/70 text-xs">
                    [{action.toHit !== undefined ? `+${action.toHit}` : `DC ${action.saveDC}`}
                    {action.damageDice ? ` ${action.damageDice}` : ''}
                    {action.damageType ? ` ${action.damageType}` : ''}]{' '}
                  </span>
                )}
                {conditions.length > 0 && (
                  <span className="text-red-400/80 text-xs">[{conditions.map((c) => c.condition).join(', ')}] </span>
                )}
                <span className="text-gray-300">{renderInlineMarkdown(action.description)}</span>
              </div>
            )
          })}
        </div>

        {/* Bonus Actions */}
        {monster.bonusActions && monster.bonusActions.length > 0 && (
          <>
            <div className="border-t border-amber-800/30" />
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-accent-strong uppercase tracking-wider">
                {t('game.monsterStatBlockView.bonusActions')}
              </h4>
              {monster.bonusActions.map((action, i) => (
                <div key={i} className="text-xs">
                  <span className="text-accent font-semibold italic">{action.name}. </span>
                  <span className="text-gray-300">{renderInlineMarkdown(action.description)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Reactions */}
        {monster.reactions && monster.reactions.length > 0 && (
          <>
            <div className="border-t border-amber-800/30" />
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-accent-strong uppercase tracking-wider">
                {t('game.monsterStatBlockView.reactions')}
              </h4>
              {monster.reactions.map((action, i) => (
                <div key={i} className="text-xs">
                  <span className="text-accent font-semibold italic">{action.name}. </span>
                  <span className="text-gray-300">{renderInlineMarkdown(action.description)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Legendary Actions */}
        {monster.legendaryActions && (
          <>
            <div className="border-t border-amber-800/30" />
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-accent-strong uppercase tracking-wider">
                {t('game.monsterStatBlockView.legendaryActions')}
              </h4>
              <p className="text-xs text-gray-500">
                {t('game.monsterStatBlockView.legendaryActionsDesc', { count: monster.legendaryActions.uses })}
              </p>
              {monster.legendaryActions.actions.map((action, i) => (
                <div key={i} className="text-xs">
                  <span className="text-accent font-semibold italic">{action.name}. </span>
                  <span className="text-gray-300">{renderInlineMarkdown(action.description)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default memo(MonsterStatBlockView)
