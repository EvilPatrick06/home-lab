import { useEffect, useState } from 'react'
import { useCharacterEditor } from '../../../hooks/use-character-editor'
import { load5eMonsterById } from '../../../services/data-provider'
import type { Character5e } from '../../../types/character-5e'
import type { Companion5e, CompanionType, WildShapeTier } from '../../../types/companion'

type _WildShapeTier = WildShapeTier

import type { MonsterStatBlock } from '../../../types/monster'
import SheetSectionWrapper from '../shared/SheetSectionWrapper'

interface CompanionsSection5eProps {
  character: Character5e
  readonly?: boolean
}

const TYPE_LABELS: Record<CompanionType, string> = {
  familiar: 'Familiar',
  wildShape: 'Wild Shape',
  steed: 'Steed',
  summoned: 'Summoned'
}

const TYPE_COLORS: Record<CompanionType, string> = {
  familiar: 'text-amber-400 bg-amber-900/30 border-amber-700/50',
  wildShape: 'text-green-400 bg-green-900/30 border-green-700/50',
  steed: 'text-blue-400 bg-blue-900/30 border-blue-700/50',
  summoned: 'text-purple-400 bg-purple-900/30 border-purple-700/50'
}

export default function CompanionsSection5e({ character, readonly }: CompanionsSection5eProps): JSX.Element {
  const { getLatest, saveAndBroadcast } = useCharacterEditor(character.id)
  const companions = character.companions ?? []
  const pets = character.pets ?? []
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [statBlocks, setStatBlocks] = useState<Record<string, MonsterStatBlock>>({})

  // Load stat blocks for companions
  useEffect(() => {
    const ids = companions.map((c) => c.monsterStatBlockId).filter((id) => !statBlocks[id])
    if (ids.length === 0) return
    Promise.all(ids.map((id) => load5eMonsterById(id))).then((results) => {
      const newBlocks: Record<string, MonsterStatBlock> = { ...statBlocks }
      for (const block of results) {
        if (block) newBlocks[block.id] = block
      }
      setStatBlocks(newBlocks)
    })
  }, [companions, statBlocks])

  const updateCompanion = (companionId: string, updates: Partial<Companion5e>): void => {
    const latest = getLatest() as Character5e | undefined
    if (!latest) return
    const updated: Character5e = {
      ...latest,
      companions: (latest.companions ?? []).map((c) => (c.id === companionId ? { ...c, ...updates } : c)),
      updatedAt: new Date().toISOString()
    }
    saveAndBroadcast(updated)
  }

  const removeCompanion = (companionId: string): void => {
    const latest = getLatest() as Character5e | undefined
    if (!latest) return
    const updated: Character5e = {
      ...latest,
      companions: (latest.companions ?? []).filter((c) => c.id !== companionId),
      updatedAt: new Date().toISOString()
    }
    saveAndBroadcast(updated)
  }

  if (companions.length === 0 && pets.length === 0) {
    return <></>
  }

  return (
    <SheetSectionWrapper title="Companions">
      {companions.length > 0 && (
        <div className="space-y-2">
          {companions.map((comp) => {
            const block = statBlocks[comp.monsterStatBlockId]
            const isExpanded = expandedId === comp.id
            const hpPct = comp.maxHP > 0 ? (comp.currentHP / comp.maxHP) * 100 : 0
            const hpColor = hpPct > 50 ? 'bg-green-500' : hpPct > 25 ? 'bg-amber-500' : 'bg-red-500'

            return (
              <div key={comp.id} className={`rounded-lg border p-2 ${TYPE_COLORS[comp.type]}`}>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : comp.id)}
                    className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                  >
                    <span className="text-sm font-medium truncate">{comp.name}</span>
                    <span className="text-[10px] opacity-70 shrink-0">{TYPE_LABELS[comp.type]}</span>
                    {comp.dismissed && (
                      <span className="text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded-full shrink-0">
                        Dismissed
                      </span>
                    )}
                    <span className="text-[10px] opacity-50">{isExpanded ? '\u25BE' : '\u25B8'}</span>
                  </button>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {/* HP bar */}
                    <div className="w-16 flex items-center gap-1">
                      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full ${hpColor} transition-all`} style={{ width: `${hpPct}%` }} />
                      </div>
                      <span className="text-[10px] font-medium w-10 text-right">
                        {comp.currentHP}/{comp.maxHP}
                      </span>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-2 space-y-2">
                    {/* HP adjustment */}
                    {!readonly && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400">HP:</span>
                        <button
                          onClick={() => updateCompanion(comp.id, { currentHP: Math.max(0, comp.currentHP - 1) })}
                          className="w-5 h-5 rounded bg-gray-700 text-gray-300 hover:bg-red-700 text-xs cursor-pointer"
                        >
                          -
                        </button>
                        <span className="text-xs font-semibold w-12 text-center">
                          {comp.currentHP}/{comp.maxHP}
                        </span>
                        <button
                          onClick={() =>
                            updateCompanion(comp.id, { currentHP: Math.min(comp.maxHP, comp.currentHP + 1) })
                          }
                          className="w-5 h-5 rounded bg-gray-700 text-gray-300 hover:bg-green-700 text-xs cursor-pointer"
                        >
                          +
                        </button>

                        {comp.type === 'familiar' && !comp.dismissed && (
                          <button
                            onClick={() => updateCompanion(comp.id, { dismissed: true })}
                            className="ml-auto px-2 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer"
                          >
                            Dismiss
                          </button>
                        )}
                        {comp.type === 'familiar' && comp.dismissed && (
                          <button
                            onClick={() => updateCompanion(comp.id, { dismissed: false })}
                            className="ml-auto px-2 py-0.5 text-[10px] bg-amber-700 hover:bg-amber-600 rounded text-white cursor-pointer"
                          >
                            Resummon
                          </button>
                        )}
                        <button
                          onClick={() => removeCompanion(comp.id)}
                          className="px-2 py-0.5 text-[10px] bg-red-900/50 hover:bg-red-800 rounded text-red-300 cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    )}

                    {/* Stat block summary */}
                    {block && (
                      <div className="text-[10px] text-gray-400 bg-gray-900/50 rounded p-2 space-y-0.5">
                        <div>
                          AC {block.ac}
                          {block.acType ? ` (${block.acType})` : ''} | HP {block.hp} ({block.hitDice})
                        </div>
                        <div>
                          Speed: {block.speed.walk ?? 0} ft.
                          {block.speed.fly ? `, fly ${block.speed.fly} ft.` : ''}
                          {block.speed.swim ? `, swim ${block.speed.swim} ft.` : ''}
                          {block.speed.climb ? `, climb ${block.speed.climb} ft.` : ''}
                        </div>
                        {block.abilityScores && (
                          <div>
                            STR {block.abilityScores.str} | DEX {block.abilityScores.dex} | CON{' '}
                            {block.abilityScores.con} | INT {block.abilityScores.int} | WIS {block.abilityScores.wis} |
                            CHA {block.abilityScores.cha}
                          </div>
                        )}
                        {(block.traits?.length ?? 0) > 0 && (
                          <div className="mt-1">
                            {block.traits?.map((t, i) => (
                              <div key={i}>
                                <strong>{t.name}.</strong> {t.description}
                              </div>
                            ))}
                          </div>
                        )}
                        {block.actions.length > 0 && (
                          <div className="mt-1">
                            {block.actions.map((a, i) => (
                              <div key={i}>
                                <strong>{a.name}.</strong> {a.description}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {comp.sourceSpell && (
                      <div className="text-[10px] text-gray-500">Source: {comp.sourceSpell.replace(/-/g, ' ')}</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Simple Pets */}
      {pets.length > 0 && (
        <div className={companions.length > 0 ? 'mt-3' : ''}>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Simple Pets</div>
          <div className="space-y-1">
            {pets.map((pet, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-800/50 rounded px-2 py-1 text-sm">
                <div>
                  <span className="text-gray-300 font-medium">{pet.name}</span>
                  {pet.type && <span className="text-gray-500 text-xs ml-1.5">({pet.type})</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SheetSectionWrapper>
  )
}
