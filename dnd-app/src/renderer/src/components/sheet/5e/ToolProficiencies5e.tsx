import { useState } from 'react'
import { useCharacterEditor } from '../../../hooks/use-character-editor'
import { useT } from '../../../i18n'
import { roll } from '../../../services/dice/dice-service'
import type { Character5e } from '../../../types/character-5e'
import { type AbilityName, abilityModifier, formatMod } from '../../../types/character-common'

import {
  GENERIC_TOOL_VARIANTS,
  getGenericToolBase,
  isGenericTool,
  type ToolData,
  useToolDescriptions
} from './defense-utils'

type _ToolData = ToolData

interface ToolProficiencies5eProps {
  character: Character5e
  readonly?: boolean
}

export default function ToolProficiencies5e({ character, readonly }: ToolProficiencies5eProps): JSX.Element {
  const { t } = useT()
  const { getLatest, saveAndBroadcast } = useCharacterEditor(character.id)
  const [expandedTool, setExpandedTool] = useState<string | null>(null)
  const [showToolVariantPicker, setShowToolVariantPicker] = useState<string | null>(null)
  const [showAddArmorProf, setShowAddArmorProf] = useState(false)
  const [showAddToolProf, setShowAddToolProf] = useState(false)
  const [customProfInput, setCustomProfInput] = useState('')

  const toolDescriptions = useToolDescriptions()
  const profBonus = Math.ceil(character.level / 4) + 1

  // Phase 23h — roll a tool check: 1d20 + proficiency + the tool's governing
  // ability modifier. Broadcasts to chat + 3D dice via the shared dice service.
  const rollToolCheck = (toolName: string, ability: string | undefined): void => {
    const key = (ability ?? 'intelligence').toLowerCase() as AbilityName
    const score = character.abilityScores[key] ?? 10
    const mod = abilityModifier(score) + profBonus
    roll(`1d20${mod >= 0 ? '+' : ''}${mod}`, { label: t('sheet.toolProficiencies.toolCheckLabel', { tool: toolName }) })
  }

  const addProficiency = (field: 'armor' | 'tools', value: string): void => {
    const latest = getLatest()
    if (latest?.gameSystem !== 'dnd5e') return
    const l = latest as Character5e
    if (l.proficiencies[field].includes(value)) return
    const updated = {
      ...l,
      proficiencies: { ...l.proficiencies, [field]: [...l.proficiencies[field], value] },
      updatedAt: new Date().toISOString()
    }
    saveAndBroadcast(updated)
  }

  return (
    <div className="space-y-1 text-sm text-muted">
      {character.proficiencies.armor.length > 0 && (
        <div>
          <span className="text-gray-500">{t('sheet.toolProficiencies.armorLabel')} </span>
          {character.proficiencies.armor.map((prof, idx) => {
            const armorDescriptions: Record<string, string> = {
              'light armor': t('sheet.toolProficiencies.lightArmorDesc'),
              'medium armor': t('sheet.toolProficiencies.mediumArmorDesc'),
              'heavy armor': t('sheet.toolProficiencies.heavyArmorDesc'),
              shields: t('sheet.toolProficiencies.shieldsDesc')
            }
            const desc = armorDescriptions[prof.toLowerCase()]
            return (
              <span key={prof} className="inline">
                {idx > 0 && ', '}
                {desc ? (
                  <span className="group relative text-accent cursor-help underline decoration-dotted underline-offset-2">
                    {prof}
                    <span className="absolute bottom-full left-0 mb-1 hidden group-hover:block bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-300 w-72 z-10 shadow-lg">
                      {desc}
                    </span>
                  </span>
                ) : (
                  <span>{prof}</span>
                )}
              </span>
            )
          })}
          {!readonly && !showAddArmorProf && (
            <button
              onClick={() => setShowAddArmorProf(true)}
              className="text-xs text-accent hover:text-amber-300 cursor-pointer ml-2"
            >
              {t('sheet.toolProficiencies.add')}
            </button>
          )}
          {!readonly && showAddArmorProf && (
            <div className="flex flex-wrap gap-1 mt-1">
              {['Light armor', 'Medium armor', 'Heavy armor', 'Shields']
                .filter((p) => !character.proficiencies.armor.some((a) => a.toLowerCase() === p.toLowerCase()))
                .map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      addProficiency('armor', p)
                      setShowAddArmorProf(false)
                    }}
                    className="px-2 py-0.5 text-[11px] rounded border border-amber-700/50 text-amber-300 hover:bg-amber-900/40 cursor-pointer"
                  >
                    {p}
                  </button>
                ))}
              <input
                aria-label={t('sheet.toolProficiencies.customPlaceholder')}
                name="custom-armor-proficiency"
                type="text"
                placeholder={t('sheet.toolProficiencies.customPlaceholder')}
                value={customProfInput}
                onChange={(e) => setCustomProfInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customProfInput.trim()) {
                    addProficiency('armor', customProfInput.trim())
                    setCustomProfInput('')
                    setShowAddArmorProf(false)
                  }
                }}
                className="bg-surface-2 border border-border rounded px-2 py-0.5 text-xs text-fg w-28 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={() => setShowAddArmorProf(false)}
                className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer"
              >
                {t('common.actions.cancel')}
              </button>
            </div>
          )}
        </div>
      )}
      {character.proficiencies.tools.length > 0 && (
        <div>
          <span className="text-gray-500">{t('sheet.toolProficiencies.toolsLabel')} </span>
          <div className="inline">
            {character.proficiencies.tools.map((tool, idx) => {
              const normalizedTool = tool
                .toLowerCase()
                .replace(/\s*\(.*\)/, '')
                .trim()
              const toolData =
                toolDescriptions.find((t) => t.name.toLowerCase() === tool.toLowerCase()) ||
                toolDescriptions.find((t) => t.name.toLowerCase() === normalizedTool) ||
                toolDescriptions.find(
                  (t) =>
                    t.name
                      .toLowerCase()
                      .replace(/\s*\(.*\)/, '')
                      .trim() === normalizedTool
                )
              const isExpanded = expandedTool === tool
              const generic = isGenericTool(tool)
              const genericBase = getGenericToolBase(tool)
              const showingVariants = showToolVariantPicker === tool
              return (
                <span key={tool} className="inline">
                  {idx > 0 && ', '}
                  <button
                    onClick={() => {
                      if (isExpanded || showingVariants) {
                        setExpandedTool(null)
                        setShowToolVariantPicker(null)
                      } else {
                        setExpandedTool(tool)
                        if (generic && !readonly) setShowToolVariantPicker(tool)
                      }
                    }}
                    className={`${toolData || generic ? 'text-accent hover:text-amber-300 cursor-pointer underline decoration-dotted underline-offset-2' : 'text-muted'}`}
                  >
                    {tool}
                  </button>
                  {!readonly && (
                    <button
                      onClick={() => rollToolCheck(tool, toolData?.ability)}
                      className="ml-1 text-[11px] text-accent-strong hover:text-amber-300 cursor-pointer"
                      title={t('sheet.toolProficiencies.rollToolCheckTitle', {
                        tool,
                        ability: (toolData?.ability ?? 'INT').slice(0, 3).toUpperCase()
                      })}
                      aria-label={t('sheet.toolProficiencies.rollToolCheckAria', { tool })}
                    >
                      🎲
                      {toolData?.ability
                        ? ` ${formatMod(abilityModifier(character.abilityScores[toolData.ability.toLowerCase() as AbilityName] ?? 10) + profBonus)}`
                        : ''}
                    </button>
                  )}
                  {(isExpanded || showingVariants) && toolData?.description && (
                    <div className="text-xs text-gray-500 bg-surface-2/50 rounded px-2 py-1 mt-1 mb-1">
                      {toolData.description}
                      {toolData.ability && <span className="text-gray-600 ml-1">({toolData.ability})</span>}
                    </div>
                  )}
                  {showingVariants && generic && genericBase && (
                    <div className="text-xs bg-surface-2/50 rounded px-2 py-1 mt-1 mb-1">
                      <div className="text-gray-500 mb-1">
                        {t('sheet.toolProficiencies.chooseSpecific', { base: genericBase })}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {GENERIC_TOOL_VARIANTS[genericBase]?.map((variant) => (
                          <button
                            key={variant}
                            onClick={() => {
                              const latest = getLatest()
                              if (latest?.gameSystem !== 'dnd5e') return
                              const l = latest as Character5e
                              const updated = {
                                ...l,
                                proficiencies: {
                                  ...l.proficiencies,
                                  tools: l.proficiencies.tools.map((t) => (t === tool ? variant : t))
                                },
                                equipment: l.equipment.map((e) =>
                                  e.name.toLowerCase() === tool.toLowerCase() ? { ...e, name: variant } : e
                                ),
                                updatedAt: new Date().toISOString()
                              }
                              saveAndBroadcast(updated)
                              setShowToolVariantPicker(null)
                            }}
                            className="px-2 py-0.5 text-[11px] rounded border border-amber-700/50 text-amber-300 hover:bg-amber-900/40 cursor-pointer transition-colors"
                          >
                            {variant}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </span>
              )
            })}
          </div>
          {!readonly && !showAddToolProf && (
            <button
              onClick={() => setShowAddToolProf(true)}
              className="text-xs text-accent hover:text-amber-300 cursor-pointer ml-2"
            >
              {t('sheet.toolProficiencies.add')}
            </button>
          )}
          {!readonly && showAddToolProf && (
            <div className="mt-1.5 space-y-1.5">
              <div className="flex flex-wrap gap-1">
                {[
                  "Alchemist's Supplies",
                  "Brewer's Supplies",
                  "Calligrapher's Supplies",
                  "Carpenter's Tools",
                  "Cartographer's Tools",
                  "Cobbler's Tools",
                  "Cook's Utensils",
                  "Glassblower's Tools",
                  'Herbalism Kit',
                  "Jeweler's Tools",
                  "Leatherworker's Tools",
                  "Mason's Tools",
                  "Navigator's Tools",
                  "Painter's Supplies",
                  "Poisoner's Kit",
                  "Potter's Tools",
                  "Smith's Tools",
                  "Thieves' Tools",
                  "Tinker's Tools",
                  "Weaver's Tools",
                  "Woodcarver's Tools",
                  'Disguise Kit',
                  'Forgery Kit',
                  'Gaming Set (Dice)',
                  'Gaming Set (Dragonchess)',
                  'Gaming Set (Playing Cards)',
                  'Gaming Set (Three-Dragon Ante)',
                  'Bagpipes',
                  'Drum',
                  'Dulcimer',
                  'Flute',
                  'Horn',
                  'Lute',
                  'Lyre',
                  'Pan Flute',
                  'Shawm',
                  'Viol'
                ]
                  .filter(
                    (t) => !character.proficiencies.tools.some((existing) => existing.toLowerCase() === t.toLowerCase())
                  )
                  .map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        addProficiency('tools', t)
                        setShowAddToolProf(false)
                      }}
                      className="px-2 py-0.5 text-[11px] rounded border border-amber-700/50 text-amber-300 hover:bg-amber-900/40 cursor-pointer"
                    >
                      {t}
                    </button>
                  ))}
              </div>
              <div className="flex items-center gap-1">
                <input
                  aria-label={t('sheet.toolProficiencies.customToolPlaceholder')}
                  name="custom-tool-proficiency"
                  type="text"
                  placeholder={t('sheet.toolProficiencies.customToolPlaceholder')}
                  value={customProfInput}
                  onChange={(e) => setCustomProfInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customProfInput.trim()) {
                      addProficiency('tools', customProfInput.trim())
                      setCustomProfInput('')
                      setShowAddToolProf(false)
                    }
                  }}
                  className="bg-surface-2 border border-border rounded px-2 py-0.5 text-xs text-fg w-40 focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={() => {
                    if (customProfInput.trim()) {
                      addProficiency('tools', customProfInput.trim())
                      setCustomProfInput('')
                      setShowAddToolProf(false)
                    }
                  }}
                  disabled={!customProfInput.trim()}
                  className="px-2 py-0.5 text-xs bg-amber-600 hover:bg-accent-strong disabled:opacity-50 rounded text-white cursor-pointer"
                >
                  {t('sheet.toolProficiencies.addConfirm')}
                </button>
                <button
                  onClick={() => {
                    setShowAddToolProf(false)
                    setCustomProfInput('')
                  }}
                  className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer"
                >
                  {t('common.actions.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
