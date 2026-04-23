import { type ExtractedCondition, extractConditionsFromDescription } from '../../../services/combat/condition-extractor'
import type { MonsterAction } from '../../../services/data-provider'
import type { MonsterStatBlock } from '../../../types/monster'
import { abilityModifier } from '../../../types/monster'

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
      <div className="text-[10px] text-gray-500 uppercase">{label}</div>
      <div className="text-sm font-semibold text-gray-200">{score}</div>
      <div className="text-xs text-amber-400">{formatModifier(score)}</div>
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
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-gray-300 truncate">{action.name}</span>
      <div className="flex items-center gap-1 ml-1 shrink-0">
        {conditions.length > 0 && (
          <span className="text-red-400/80" title={conditions.map((c) => c.condition).join(', ')}>
            {conditions.map((c) => c.condition.slice(0, 3)).join('/')}
          </span>
        )}
        {summary && <span className="text-amber-400/80">{summary}</span>}
      </div>
    </div>
  )
}

export default function MonsterStatBlockView({ monster, compact = false }: MonsterStatBlockViewProps): JSX.Element {
  if (compact) {
    const keyActions = [...monster.actions, ...(monster.bonusActions || []), ...(monster.reactions || [])].filter(
      (a) => a.toHit !== undefined || a.saveDC !== undefined || a.damageDice
    )

    return (
      <div className="bg-gray-800/80 border border-gray-700 rounded-lg p-2 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-amber-400">{monster.name}</span>
          <span className="text-[10px] text-gray-500">CR {monster.cr}</span>
        </div>
        <div className="flex gap-3 text-xs text-gray-400">
          <span>AC {monster.ac}</span>
          <span>HP {monster.hp}</span>
          <span>{monster.speed.walk} ft</span>
        </div>
        {keyActions.length > 0 && (
          <div className="space-y-0.5 border-t border-gray-700/50 pt-1 mt-1">
            {keyActions.slice(0, 4).map((a, i) => (
              <ActionQuickRef key={i} action={a} />
            ))}
          </div>
        )}
        {monster.legendaryActions && (
          <div className="text-[10px] text-purple-400">{monster.legendaryActions.uses} legendary actions</div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-amber-800/40 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-amber-900/30 border-b border-amber-800/40 px-3 py-2">
        <h3 className="text-base font-bold text-amber-400">{monster.name}</h3>
        <p className="text-xs text-gray-400">
          {monster.size} {monster.type}
          {monster.subtype ? ` (${monster.subtype})` : ''}, {monster.alignment}
        </p>
      </div>

      <div className="px-3 py-2 space-y-2">
        {/* AC, HP, Speed */}
        <div className="space-y-0.5 text-sm">
          <div className="flex gap-1">
            <span className="text-amber-500 font-semibold">AC</span>
            <span className="text-gray-300">
              {monster.ac}
              {monster.acType ? ` (${monster.acType})` : ''}
            </span>
          </div>
          <div className="flex gap-1">
            <span className="text-amber-500 font-semibold">HP</span>
            <span className="text-gray-300">
              {monster.hp} ({monster.hitDice})
            </span>
          </div>
          <div className="flex gap-1">
            <span className="text-amber-500 font-semibold">Speed</span>
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
          <AbilityRow label="STR" score={monster.abilityScores.str} />
          <AbilityRow label="DEX" score={monster.abilityScores.dex} />
          <AbilityRow label="CON" score={monster.abilityScores.con} />
          <AbilityRow label="INT" score={monster.abilityScores.int} />
          <AbilityRow label="WIS" score={monster.abilityScores.wis} />
          <AbilityRow label="CHA" score={monster.abilityScores.cha} />
        </div>

        <div className="border-t border-amber-800/30" />

        {/* Details */}
        <div className="space-y-0.5 text-xs">
          {monster.savingThrows && Object.keys(monster.savingThrows).length > 0 && (
            <div>
              <span className="text-amber-500 font-semibold">Saving Throws </span>
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
              <span className="text-amber-500 font-semibold">Skills </span>
              <span className="text-gray-300">
                {Object.entries(monster.skills)
                  .map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v}`)
                  .join(', ')}
              </span>
            </div>
          )}
          {monster.resistances && monster.resistances.length > 0 && (
            <div>
              <span className="text-amber-500 font-semibold">Resistances </span>
              <span className="text-gray-300">{monster.resistances.join(', ')}</span>
            </div>
          )}
          {monster.damageImmunities && monster.damageImmunities.length > 0 && (
            <div>
              <span className="text-amber-500 font-semibold">Damage Immunities </span>
              <span className="text-gray-300">{monster.damageImmunities.join(', ')}</span>
            </div>
          )}
          {monster.conditionImmunities && monster.conditionImmunities.length > 0 && (
            <div>
              <span className="text-amber-500 font-semibold">Condition Immunities </span>
              <span className="text-gray-300">{monster.conditionImmunities.join(', ')}</span>
            </div>
          )}
          <div>
            <span className="text-amber-500 font-semibold">Senses </span>
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
          <div>
            <span className="text-amber-500 font-semibold">Languages </span>
            <span className="text-gray-300">{monster.languages.length > 0 ? monster.languages.join(', ') : '—'}</span>
          </div>
          <div className="flex gap-4">
            <div>
              <span className="text-amber-500 font-semibold">CR </span>
              <span className="text-gray-300">
                {monster.cr} ({monster.xp.toLocaleString()} XP)
              </span>
            </div>
            <div>
              <span className="text-amber-500 font-semibold">PB </span>
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
                  <span className="text-amber-400 font-semibold italic">{trait.name}. </span>
                  <span className="text-gray-300">{trait.description}</span>
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
              <div className="text-amber-400 font-semibold italic">
                Spellcasting.{' '}
                <span className="text-gray-300 font-normal">
                  {monster.spellcasting.notes ??
                    `Spell save DC ${monster.spellcasting.saveDC}, +${monster.spellcasting.attackBonus} to hit`}
                </span>
              </div>
              {monster.spellcasting.atWill && monster.spellcasting.atWill.length > 0 && (
                <div className="text-gray-300 pl-2">
                  <span className="text-gray-500">At will: </span>
                  {monster.spellcasting.atWill.join(', ')}
                </div>
              )}
              {monster.spellcasting.perDay &&
                Object.entries(monster.spellcasting.perDay).map(([uses, spells]) => (
                  <div key={uses} className="text-gray-300 pl-2">
                    <span className="text-gray-500">{uses}/day each: </span>
                    {spells.join(', ')}
                  </div>
                ))}
            </div>
          </>
        )}

        {/* Actions */}
        <div className="border-t border-amber-800/30" />
        <div className="space-y-1.5">
          <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">Actions</h4>
          {monster.actions.map((action, i) => {
            const conditions = extractConditionsFromDescription(action.description)
            return (
              <div key={i} className="text-xs">
                <span className="text-amber-400 font-semibold italic">
                  {action.name}
                  {action.recharge ? ` (Recharge ${action.recharge})` : ''}.{' '}
                </span>
                {(action.toHit !== undefined || action.saveDC) && (
                  <span className="text-cyan-400/70 text-[10px]">
                    [{action.toHit !== undefined ? `+${action.toHit}` : `DC ${action.saveDC}`}
                    {action.damageDice ? ` ${action.damageDice}` : ''}
                    {action.damageType ? ` ${action.damageType}` : ''}]{' '}
                  </span>
                )}
                {conditions.length > 0 && (
                  <span className="text-red-400/80 text-[10px]">
                    [{conditions.map((c) => c.condition).join(', ')}]{' '}
                  </span>
                )}
                <span className="text-gray-300">{action.description}</span>
              </div>
            )
          })}
        </div>

        {/* Bonus Actions */}
        {monster.bonusActions && monster.bonusActions.length > 0 && (
          <>
            <div className="border-t border-amber-800/30" />
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">Bonus Actions</h4>
              {monster.bonusActions.map((action, i) => (
                <div key={i} className="text-xs">
                  <span className="text-amber-400 font-semibold italic">{action.name}. </span>
                  <span className="text-gray-300">{action.description}</span>
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
              <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">Reactions</h4>
              {monster.reactions.map((action, i) => (
                <div key={i} className="text-xs">
                  <span className="text-amber-400 font-semibold italic">{action.name}. </span>
                  <span className="text-gray-300">{action.description}</span>
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
              <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">Legendary Actions</h4>
              <p className="text-[10px] text-gray-500">
                Can take {monster.legendaryActions.uses} legendary actions, choosing from the options below.
              </p>
              {monster.legendaryActions.actions.map((action, i) => (
                <div key={i} className="text-xs">
                  <span className="text-amber-400 font-semibold italic">{action.name}. </span>
                  <span className="text-gray-300">{action.description}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
