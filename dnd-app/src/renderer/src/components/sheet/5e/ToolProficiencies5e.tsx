import { useState } from 'react'
import { useCharacterEditor } from '../../../hooks/use-character-editor'
import type { Character5e } from '../../../types/character-5e'

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
  const { getLatest, saveAndBroadcast } = useCharacterEditor(character.id)
  const [expandedTool, setExpandedTool] = useState<string | null>(null)
  const [showToolVariantPicker, setShowToolVariantPicker] = useState<string | null>(null)
  const [showAddArmorProf, setShowAddArmorProf] = useState(false)
  const [showAddToolProf, setShowAddToolProf] = useState(false)
  const [customProfInput, setCustomProfInput] = useState('')

  const toolDescriptions = useToolDescriptions()

  const addProficiency = (field: 'armor' | 'tools', value: string): void => {
    const latest = getLatest()
    if (!latest || latest.gameSystem !== 'dnd5e') return
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
    <div className="space-y-1 text-sm text-gray-400">
      {character.proficiencies.armor.length > 0 && (
        <div>
          <span className="text-gray-500">Armor: </span>
          {character.proficiencies.armor.map((prof, idx) => {
            const armorDescriptions: Record<string, string> = {
              'light armor':
                'Made from supple materials, light armor lets agile adventurers keep their full DEX modifier to AC. Examples: Padded (AC 11), Leather (AC 11), Studded Leather (AC 12).',
              'medium armor':
                'Offers more protection but limits mobility. Add DEX modifier to AC (max +2). Examples: Hide (AC 12), Chain Shirt (AC 13), Breastplate (AC 14), Half Plate (AC 15).',
              'heavy armor':
                'The best protection at the cost of mobility. No DEX modifier added to AC. Some impose stealth disadvantage. Examples: Ring Mail (AC 14), Chain Mail (AC 16), Splint (AC 17), Plate (AC 18).',
              shields:
                'A shield is carried in one hand. Wielding a shield increases your AC by 2. You can benefit from only one shield at a time.'
            }
            const desc = armorDescriptions[prof.toLowerCase()]
            return (
              <span key={prof} className="inline">
                {idx > 0 && ', '}
                {desc ? (
                  <span className="group relative text-amber-400 cursor-help underline decoration-dotted underline-offset-2">
                    {prof}
                    <span className="absolute bottom-full left-0 mb-1 hidden group-hover:block bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 w-72 z-10 shadow-lg">
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
              className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer ml-2"
            >
              + Add
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
                type="text"
                placeholder="Custom..."
                value={customProfInput}
                onChange={(e) => setCustomProfInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customProfInput.trim()) {
                    addProficiency('armor', customProfInput.trim())
                    setCustomProfInput('')
                    setShowAddArmorProf(false)
                  }
                }}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-100 w-28 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={() => setShowAddArmorProf(false)}
                className="text-[10px] text-gray-500 hover:text-gray-300 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
      {character.proficiencies.tools.length > 0 && (
        <div>
          <span className="text-gray-500">Tools: </span>
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
                    className={`${toolData || generic ? 'text-amber-400 hover:text-amber-300 cursor-pointer underline decoration-dotted underline-offset-2' : 'text-gray-400'}`}
                  >
                    {tool}
                  </button>
                  {(isExpanded || showingVariants) && toolData?.description && (
                    <div className="text-xs text-gray-500 bg-gray-800/50 rounded px-2 py-1 mt-1 mb-1">
                      {toolData.description}
                      {toolData.ability && <span className="text-gray-600 ml-1">({toolData.ability})</span>}
                    </div>
                  )}
                  {showingVariants && generic && genericBase && (
                    <div className="text-xs bg-gray-800/50 rounded px-2 py-1 mt-1 mb-1">
                      <div className="text-gray-500 mb-1">Choose a specific {genericBase}:</div>
                      <div className="flex flex-wrap gap-1">
                        {GENERIC_TOOL_VARIANTS[genericBase]?.map((variant) => (
                          <button
                            key={variant}
                            onClick={() => {
                              const latest = getLatest()
                              if (!latest || latest.gameSystem !== 'dnd5e') return
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
              className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer ml-2"
            >
              + Add
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
                  type="text"
                  placeholder="Custom tool..."
                  value={customProfInput}
                  onChange={(e) => setCustomProfInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customProfInput.trim()) {
                      addProficiency('tools', customProfInput.trim())
                      setCustomProfInput('')
                      setShowAddToolProf(false)
                    }
                  }}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-100 w-40 focus:outline-none focus:border-amber-500"
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
                  className="px-2 py-0.5 text-[10px] bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded text-white cursor-pointer"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setShowAddToolProf(false)
                    setCustomProfInput('')
                  }}
                  className="text-[10px] text-gray-500 hover:text-gray-300 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
