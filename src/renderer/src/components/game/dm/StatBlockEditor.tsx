import creatureTypesJson from '@data/5e/dm/npcs/creature-types.json'
import { useState } from 'react'
import type { MonsterSpeed, MonsterSpellcasting, MonsterTrait } from '../../../services/data-provider'
import { load5eCreatureTypes } from '../../../services/data-provider'
import type { CreatureSize, CreatureType, MonsterAction, MonsterStatBlock } from '../../../types/monster'
import type { SpellcastingSection as SidebarSpellcastingSection } from '../sidebar/StatBlockForm'

type _MonsterSpeed = MonsterSpeed
type _MonsterSpellcasting = MonsterSpellcasting

/** Re-imported sidebar SpellcastingSection for potential reuse in stat block editing workflows. */
type _SidebarSpellcastingSection = typeof SidebarSpellcastingSection

interface StatBlockEditorProps {
  value: Partial<MonsterStatBlock>
  onChange: (stats: Partial<MonsterStatBlock>) => void
}

const SIZES = creatureTypesJson.sizes as CreatureSize[]
const TYPES = creatureTypesJson.types as CreatureType[]

/** Load creature types from the data store (includes homebrew creature types). */
export async function loadCreatureTypeData(): Promise<unknown> {
  return load5eCreatureTypes()
}

const COMMON_SKILLS = [
  'Acrobatics',
  'Animal Handling',
  'Arcana',
  'Athletics',
  'Deception',
  'History',
  'Insight',
  'Intimidation',
  'Investigation',
  'Medicine',
  'Nature',
  'Perception',
  'Performance',
  'Persuasion',
  'Religion',
  'Sleight of Hand',
  'Stealth',
  'Survival'
]

function CollapsibleSection({
  title,
  children,
  defaultOpen = false
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-700/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/50 hover:bg-gray-800 text-xs font-semibold text-gray-300 cursor-pointer"
      >
        <span>{title}</span>
        <span className="text-gray-500">{open ? '\u25BC' : '\u25B6'}</span>
      </button>
      {open && <div className="p-3 space-y-2">{children}</div>}
    </div>
  )
}

function ActionListEditor({
  label,
  actions,
  onChange
}: {
  label: string
  actions: MonsterAction[]
  onChange: (actions: MonsterAction[]) => void
}): JSX.Element {
  const addAction = (): void => {
    onChange([...actions, { name: '', description: '' }])
  }
  const updateAction = (i: number, updates: Partial<MonsterAction>): void => {
    onChange(actions.map((a, idx) => (idx === i ? { ...a, ...updates } : a)))
  }
  const removeAction = (i: number): void => {
    onChange(actions.filter((_, idx) => idx !== i))
  }

  return (
    <CollapsibleSection title={`${label} (${actions.length})`}>
      {actions.map((action, i) => (
        <div key={i} className="space-y-1 bg-gray-800/30 rounded p-2">
          <div className="flex gap-1">
            <input
              type="text"
              value={action.name}
              onChange={(e) => updateAction(i, { name: e.target.value })}
              placeholder="Action name"
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
            />
            <button
              onClick={() => removeAction(i)}
              className="text-red-400 hover:text-red-300 text-xs px-1 cursor-pointer"
            >
              &times;
            </button>
          </div>
          <textarea
            value={action.description}
            onChange={(e) => updateAction(i, { description: e.target.value })}
            placeholder="Description"
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 h-16 resize-none"
          />
          <div className="flex gap-1">
            <select
              value={action.attackType ?? ''}
              onChange={(e) =>
                updateAction(i, { attackType: (e.target.value as MonsterAction['attackType']) || undefined })
              }
              className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-200"
            >
              <option value="">No attack</option>
              <option value="melee">Melee</option>
              <option value="ranged">Ranged</option>
              <option value="melee-or-ranged">Melee/Ranged</option>
            </select>
            {action.attackType && (
              <>
                <input
                  type="number"
                  value={action.toHit ?? ''}
                  onChange={(e) =>
                    updateAction(i, { toHit: e.target.value ? parseInt(e.target.value, 10) : undefined })
                  }
                  placeholder="+Hit"
                  className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-100 text-center"
                />
                <input
                  type="text"
                  value={action.damageDice ?? ''}
                  onChange={(e) => updateAction(i, { damageDice: e.target.value || undefined })}
                  placeholder="Damage dice"
                  className="w-20 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-100"
                />
                <input
                  type="text"
                  value={action.damageType ?? ''}
                  onChange={(e) => updateAction(i, { damageType: e.target.value || undefined })}
                  placeholder="Type"
                  className="w-16 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-100"
                />
              </>
            )}
          </div>
        </div>
      ))}
      <button onClick={addAction} className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer">
        + Add {label.replace(/s$/, '')}
      </button>
    </CollapsibleSection>
  )
}

function TraitListEditor({
  traits,
  onChange
}: {
  traits: MonsterTrait[]
  onChange: (traits: MonsterTrait[]) => void
}): JSX.Element {
  return (
    <CollapsibleSection title={`Traits (${traits.length})`}>
      {traits.map((trait, i) => (
        <div key={i} className="flex gap-1">
          <input
            type="text"
            value={trait.name}
            onChange={(e) => onChange(traits.map((t, idx) => (idx === i ? { ...t, name: e.target.value } : t)))}
            placeholder="Name"
            className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
          />
          <input
            type="text"
            value={trait.description}
            onChange={(e) => onChange(traits.map((t, idx) => (idx === i ? { ...t, description: e.target.value } : t)))}
            placeholder="Description"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
          />
          <button
            onClick={() => onChange(traits.filter((_, idx) => idx !== i))}
            className="text-red-400 hover:text-red-300 text-xs px-1 cursor-pointer"
          >
            &times;
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...traits, { name: '', description: '' }])}
        className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
      >
        + Add Trait
      </button>
    </CollapsibleSection>
  )
}

export default function StatBlockEditor({ value, onChange }: StatBlockEditorProps): JSX.Element {
  const update = <K extends keyof MonsterStatBlock>(key: K, val: MonsterStatBlock[K]): void => {
    onChange({ ...value, [key]: val })
  }

  const abilities = value.abilityScores ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
  const speed = value.speed ?? { walk: 30 }

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
      {/* Basic */}
      <CollapsibleSection title="Basic" defaultOpen>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-500">Name</label>
            <input
              type="text"
              value={value.name ?? ''}
              onChange={(e) => update('name', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">Alignment</label>
            <input
              type="text"
              value={value.alignment ?? ''}
              onChange={(e) => update('alignment', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">Size</label>
            <select
              value={value.size ?? 'Medium'}
              onChange={(e) => update('size', e.target.value as CreatureSize)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
            >
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500">Type</label>
            <select
              value={value.type ?? 'Humanoid'}
              onChange={(e) => update('type', e.target.value as CreatureType)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500">CR</label>
            <input
              type="text"
              value={value.cr ?? ''}
              onChange={(e) => update('cr', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
              placeholder="e.g. 1/4"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">XP</label>
            <input
              type="number"
              value={value.xp ?? ''}
              onChange={(e) => update('xp', parseInt(e.target.value, 10) || 0)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Combat */}
      <CollapsibleSection title="Combat" defaultOpen>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-gray-500">AC</label>
            <input
              type="number"
              value={value.ac ?? ''}
              onChange={(e) => update('ac', parseInt(e.target.value, 10) || 0)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">AC Type</label>
            <input
              type="text"
              value={value.acType ?? ''}
              onChange={(e) => update('acType', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
              placeholder="Natural Armor"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">HP</label>
            <input
              type="number"
              value={value.hp ?? ''}
              onChange={(e) => update('hp', parseInt(e.target.value, 10) || 0)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">Hit Dice</label>
            <input
              type="text"
              value={value.hitDice ?? ''}
              onChange={(e) => update('hitDice', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
              placeholder="2d8+4"
            />
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1 mt-2">
          <div>
            <label className="text-[10px] text-gray-500">Walk</label>
            <input
              type="number"
              value={speed.walk ?? 0}
              onChange={(e) => update('speed', { ...speed, walk: parseInt(e.target.value, 10) || 0 })}
              className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-100 text-center"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">Fly</label>
            <input
              type="number"
              value={speed.fly ?? ''}
              onChange={(e) =>
                update('speed', { ...speed, fly: e.target.value ? parseInt(e.target.value, 10) : undefined })
              }
              className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-100 text-center"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">Swim</label>
            <input
              type="number"
              value={speed.swim ?? ''}
              onChange={(e) =>
                update('speed', { ...speed, swim: e.target.value ? parseInt(e.target.value, 10) : undefined })
              }
              className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-100 text-center"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">Climb</label>
            <input
              type="number"
              value={speed.climb ?? ''}
              onChange={(e) =>
                update('speed', { ...speed, climb: e.target.value ? parseInt(e.target.value, 10) : undefined })
              }
              className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-100 text-center"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">Burrow</label>
            <input
              type="number"
              value={speed.burrow ?? ''}
              onChange={(e) =>
                update('speed', { ...speed, burrow: e.target.value ? parseInt(e.target.value, 10) : undefined })
              }
              className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-100 text-center"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Ability Scores */}
      <CollapsibleSection title="Ability Scores">
        <div className="grid grid-cols-6 gap-1">
          {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((ab) => (
            <div key={ab}>
              <label className="text-[10px] text-gray-500 uppercase text-center block">{ab}</label>
              <input
                type="number"
                value={abilities[ab]}
                onChange={(e) => update('abilityScores', { ...abilities, [ab]: parseInt(e.target.value, 10) || 10 })}
                className="w-full bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs text-gray-100 text-center"
              />
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Saving Throws */}
      <CollapsibleSection title="Saving Throws">
        <div className="grid grid-cols-3 gap-2">
          {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((ab) => {
            const saves = value.savingThrows ?? {}
            const isActive = saves[ab] !== undefined
            return (
              <div key={ab} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => {
                    const next = { ...saves }
                    if (e.target.checked) {
                      next[ab] = 0
                    } else {
                      delete next[ab]
                    }
                    onChange({
                      ...value,
                      savingThrows: Object.keys(next).length > 0 ? next : undefined
                    })
                  }}
                  className="rounded"
                />
                <label className="text-[10px] text-gray-500 uppercase w-6">{ab}</label>
                {isActive && (
                  <input
                    type="number"
                    value={saves[ab] ?? 0}
                    onChange={(e) => update('savingThrows', { ...saves, [ab]: parseInt(e.target.value, 10) || 0 })}
                    className="w-10 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-100 text-center"
                  />
                )}
              </div>
            )
          })}
        </div>
      </CollapsibleSection>

      {/* Skills */}
      <CollapsibleSection title={`Skills (${Object.keys(value.skills ?? {}).length})`}>
        <div className="space-y-1">
          {Object.entries(value.skills ?? {}).map(([skill, bonus]) => (
            <div key={skill} className="flex gap-1 items-center">
              <select
                value={skill}
                onChange={(e) => {
                  const next = { ...value.skills }
                  const val = next[skill]
                  delete next[skill]
                  next[e.target.value] = val ?? 0
                  update('skills', next)
                }}
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs text-gray-200"
              >
                {COMMON_SKILLS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={bonus}
                onChange={(e) =>
                  update('skills', {
                    ...value.skills,
                    [skill]: parseInt(e.target.value, 10) || 0
                  })
                }
                className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs text-gray-100 text-center"
              />
              <button
                onClick={() => {
                  const next = { ...value.skills }
                  delete next[skill]
                  onChange({
                    ...value,
                    skills: Object.keys(next).length > 0 ? next : undefined
                  })
                }}
                className="text-red-400 hover:text-red-300 text-xs px-1 cursor-pointer"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => {
            const used = new Set(Object.keys(value.skills ?? {}))
            const available = COMMON_SKILLS.find((s) => !used.has(s)) ?? 'Custom'
            update('skills', { ...value.skills, [available]: 0 })
          }}
          className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer mt-1"
        >
          + Add Skill
        </button>
      </CollapsibleSection>

      {/* Defenses */}
      <CollapsibleSection title="Defenses">
        <div className="space-y-1">
          <div>
            <label className="text-[10px] text-gray-500">Resistances (comma-separated)</label>
            <input
              type="text"
              value={(value.resistances ?? []).join(', ')}
              onChange={(e) =>
                update(
                  'resistances',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">Vulnerabilities</label>
            <input
              type="text"
              value={(value.vulnerabilities ?? []).join(', ')}
              onChange={(e) =>
                update(
                  'vulnerabilities',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">Damage Immunities</label>
            <input
              type="text"
              value={(value.damageImmunities ?? []).join(', ')}
              onChange={(e) =>
                update(
                  'damageImmunities',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">Condition Immunities</label>
            <input
              type="text"
              value={(value.conditionImmunities ?? []).join(', ')}
              onChange={(e) =>
                update(
                  'conditionImmunities',
                  e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Senses & Languages */}
      <CollapsibleSection title="Senses & Languages">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-500">Passive Perception</label>
            <input
              type="number"
              value={value.senses?.passivePerception ?? 10}
              onChange={(e) =>
                update('senses', {
                  ...(value.senses ?? { passivePerception: 10 }),
                  passivePerception: parseInt(e.target.value, 10) || 10
                })
              }
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">Darkvision (ft)</label>
            <input
              type="number"
              value={value.senses?.darkvision ?? ''}
              onChange={(e) =>
                update('senses', {
                  ...(value.senses ?? { passivePerception: 10 }),
                  darkvision: e.target.value ? parseInt(e.target.value, 10) : undefined
                })
              }
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-gray-500">Languages (comma-separated)</label>
          <input
            type="text"
            value={(value.languages ?? []).join(', ')}
            onChange={(e) =>
              update(
                'languages',
                e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
          />
        </div>
      </CollapsibleSection>

      {/* Traits */}
      <TraitListEditor traits={value.traits ?? []} onChange={(t) => update('traits', t)} />

      {/* Actions */}
      <ActionListEditor label="Actions" actions={value.actions ?? []} onChange={(a) => update('actions', a)} />

      {/* Bonus Actions */}
      <ActionListEditor
        label="Bonus Actions"
        actions={value.bonusActions ?? []}
        onChange={(a) => update('bonusActions', a)}
      />

      {/* Reactions */}
      <ActionListEditor label="Reactions" actions={value.reactions ?? []} onChange={(a) => update('reactions', a)} />

      {/* Legendary Actions */}
      <CollapsibleSection title={`Legendary Actions (${value.legendaryActions?.actions.length ?? 0})`}>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-gray-500">Uses per round</label>
            <input
              type="number"
              value={value.legendaryActions?.uses ?? 3}
              onChange={(e) =>
                update('legendaryActions', {
                  uses: parseInt(e.target.value, 10) || 3,
                  actions: value.legendaryActions?.actions ?? []
                })
              }
              className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-100 text-center"
              min={1}
            />
          </div>
          {(value.legendaryActions?.actions ?? []).map((action, i) => (
            <div key={i} className="space-y-1 bg-gray-800/30 rounded p-2">
              <div className="flex gap-1">
                <input
                  type="text"
                  value={action.name}
                  onChange={(e) => {
                    const actions = [...(value.legendaryActions?.actions ?? [])]
                    actions[i] = { ...actions[i], name: e.target.value }
                    update('legendaryActions', { uses: value.legendaryActions?.uses ?? 3, actions })
                  }}
                  placeholder="Action name"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
                />
                <button
                  onClick={() => {
                    const actions = (value.legendaryActions?.actions ?? []).filter((_, idx) => idx !== i)
                    if (actions.length === 0) {
                      onChange({ ...value, legendaryActions: undefined })
                    } else {
                      update('legendaryActions', { uses: value.legendaryActions?.uses ?? 3, actions })
                    }
                  }}
                  className="text-red-400 hover:text-red-300 text-xs px-1 cursor-pointer"
                >
                  &times;
                </button>
              </div>
              <textarea
                value={action.description}
                onChange={(e) => {
                  const actions = [...(value.legendaryActions?.actions ?? [])]
                  actions[i] = { ...actions[i], description: e.target.value }
                  update('legendaryActions', { uses: value.legendaryActions?.uses ?? 3, actions })
                }}
                placeholder="Description"
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 h-12 resize-none"
              />
            </div>
          ))}
          <button
            onClick={() =>
              update('legendaryActions', {
                uses: value.legendaryActions?.uses ?? 3,
                actions: [...(value.legendaryActions?.actions ?? []), { name: '', description: '' }]
              })
            }
            className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
          >
            + Add Legendary Action
          </button>
        </div>
      </CollapsibleSection>
    </div>
  )
}
