import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { rollFormula } from '../../../../services/dice/dice-engine'
import { useCampaignStore } from '../../../../stores/use-campaign-store'
import { useLobbyStore } from '../../../../stores/use-lobby-store'

interface RollTableModalProps {
  onClose: () => void
}

interface RollTableEntry {
  min: number
  max: number
  text: string
  weight?: number
  subtable?: string
}

interface RollTable {
  id: string
  name: string
  diceFormula: string
  entries: RollTableEntry[]
  builtIn?: boolean
}

interface RollHistoryItem {
  id: string
  tableName: string
  roll: number
  result: string
  timestamp: number
}

// ---- Built-in tables from data files ----------------------------------------

const BUILT_IN_TABLES: RollTable[] = [
  {
    id: 'builtin-npc-appearance',
    name: 'NPC Appearance',
    diceFormula: '1d13',
    builtIn: true,
    entries: [
      { min: 1, max: 1, text: 'Scar across face' },
      { min: 2, max: 2, text: 'Tattoo on arm' },
      { min: 3, max: 3, text: 'Missing finger' },
      { min: 4, max: 4, text: 'Eyepatch' },
      { min: 5, max: 5, text: 'Birthmark on cheek' },
      { min: 6, max: 6, text: 'Gold tooth' },
      { min: 7, max: 7, text: 'Unusual eye color' },
      { min: 8, max: 8, text: 'Crooked nose' },
      { min: 9, max: 9, text: 'Burns on hands' },
      { min: 10, max: 10, text: 'Pointed ears (non-elf)' },
      { min: 11, max: 11, text: 'Extremely pale' },
      { min: 12, max: 12, text: 'Deeply tanned' },
      { min: 13, max: 13, text: 'Freckled' }
    ]
  },
  {
    id: 'builtin-npc-mannerism',
    name: 'NPC Mannerism',
    diceFormula: '1d12',
    builtIn: true,
    entries: [
      { min: 1, max: 1, text: 'Fidgets constantly' },
      { min: 2, max: 2, text: 'Never makes eye contact' },
      { min: 3, max: 3, text: 'Always smiling' },
      { min: 4, max: 4, text: 'Taps fingers' },
      { min: 5, max: 5, text: 'Paces while talking' },
      { min: 6, max: 6, text: 'Strokes beard' },
      { min: 7, max: 7, text: 'Adjusts glasses' },
      { min: 8, max: 8, text: 'Cracks knuckles' },
      { min: 9, max: 9, text: 'Hums softly' },
      { min: 10, max: 10, text: 'Squints when listening' },
      { min: 11, max: 11, text: 'Crosses arms defensively' },
      { min: 12, max: 12, text: 'Leans in too close' }
    ]
  },
  {
    id: 'builtin-npc-voice',
    name: 'NPC Voice',
    diceFormula: '1d12',
    builtIn: true,
    entries: [
      { min: 1, max: 1, text: 'Gruff' },
      { min: 2, max: 2, text: 'Squeaky' },
      { min: 3, max: 3, text: 'Monotone' },
      { min: 4, max: 4, text: 'Singsong' },
      { min: 5, max: 5, text: 'Whispers' },
      { min: 6, max: 6, text: 'Booming' },
      { min: 7, max: 7, text: 'Stutters' },
      { min: 8, max: 8, text: 'Formal' },
      { min: 9, max: 9, text: 'Slang-heavy' },
      { min: 10, max: 10, text: 'Raspy' },
      { min: 11, max: 11, text: 'Melodic' },
      { min: 12, max: 12, text: 'Nasally' }
    ]
  },
  {
    id: 'builtin-weather',
    name: 'Weather (d20)',
    diceFormula: '1d20',
    builtIn: true,
    entries: [
      { min: 1, max: 3, text: 'Clear skies, calm winds' },
      { min: 4, max: 6, text: 'Partly cloudy, light breeze' },
      { min: 7, max: 9, text: 'Overcast, moderate winds' },
      { min: 10, max: 12, text: 'Light rain or drizzle' },
      { min: 13, max: 14, text: 'Heavy rain or downpour' },
      { min: 15, max: 16, text: 'Thunderstorm' },
      { min: 17, max: 17, text: 'Fog (lightly obscured, disadvantage on Perception relying on sight)' },
      { min: 18, max: 18, text: 'Extreme heat (DC 5 CON save/hr or Exhaustion)' },
      { min: 19, max: 19, text: 'Extreme cold (DC 10 CON save/hr or Exhaustion)' },
      { min: 20, max: 20, text: 'Severe gale (disadvantage on ranged attacks, Perception hearing)' }
    ]
  },
  {
    id: 'builtin-tavern-event',
    name: 'Tavern Event (d12)',
    diceFormula: '1d12',
    builtIn: true,
    entries: [
      { min: 1, max: 1, text: 'Bar fight breaks out between two patrons' },
      { min: 2, max: 2, text: 'A mysterious stranger offers a quest' },
      { min: 3, max: 3, text: 'A bard starts a lively performance' },
      { min: 4, max: 4, text: 'A pickpocket is caught red-handed' },
      { min: 5, max: 5, text: 'A local guard comes in asking questions' },
      { min: 6, max: 6, text: 'The food is unusually terrible tonight' },
      { min: 7, max: 7, text: 'A merchant shows off rare wares' },
      { min: 8, max: 8, text: 'An arm-wrestling contest is announced' },
      { min: 9, max: 9, text: 'A drunk patron shares a wild rumor' },
      { min: 10, max: 10, text: "A wanted poster catches someone's eye" },
      { min: 11, max: 11, text: 'The tavern dog takes a liking to a PC' },
      { min: 12, max: 12, text: 'A secret door is discovered behind the bar' }
    ]
  },
  {
    id: 'builtin-wild-magic',
    name: 'Wild Magic Surge (d10)',
    diceFormula: '1d10',
    builtIn: true,
    entries: [
      { min: 1, max: 1, text: 'You cast Fireball centered on yourself (3rd level)' },
      { min: 2, max: 2, text: 'You turn into a potted plant until the start of your next turn' },
      { min: 3, max: 3, text: 'You cast Fog Cloud centered on yourself' },
      { min: 4, max: 4, text: 'You gain a fly speed of 30 ft for 1 minute' },
      { min: 5, max: 5, text: 'You become invisible for 1 minute or until you attack/cast a spell' },
      {
        min: 6,
        max: 6,
        text: 'Each creature within 30 ft takes 1d10 necrotic damage; you regain HP equal to the total'
      },
      { min: 7, max: 7, text: 'You cast Grease centered on yourself' },
      { min: 8, max: 8, text: 'Your skin turns blue for 24 hours' },
      { min: 9, max: 9, text: 'A unicorn appears within 5 ft, controlled by the DM' },
      { min: 10, max: 10, text: 'You regain all expended spell slots' }
    ]
  },
  {
    id: 'builtin-personality-high',
    name: 'High Ability Personality',
    diceFormula: '1d6',
    builtIn: true,
    entries: [
      { min: 1, max: 1, text: 'STR: Muscular / DEX: Lithe / CON: Energetic' },
      { min: 2, max: 2, text: 'STR: Sinewy / DEX: Dynamic / CON: Hale' },
      { min: 3, max: 3, text: 'STR: Protective / DEX: Fidgety / CON: Hearty' },
      { min: 4, max: 4, text: 'STR: Direct / DEX: Poised / CON: Stable' },
      { min: 5, max: 5, text: 'INT: Decisive / WIS: Serene / CHA: Charming' },
      { min: 6, max: 6, text: 'INT: Curious / WIS: Wary / CHA: Inspiring' }
    ]
  }
]

const MAX_HISTORY = 10

export default function RollTableModal({ onClose }: RollTableModalProps): JSX.Element {
  const [tab, setTab] = useState<'builtin' | 'custom' | 'create'>('builtin')
  const [editingTable, setEditingTable] = useState<RollTable | null>(null)
  const [rollHistory, setRollHistory] = useState<RollHistoryItem[]>([])
  const [highlightedEntry, setHighlightedEntry] = useState<{ tableId: string; entryIndex: number } | null>(null)
  const [animatingTableId, setAnimatingTableId] = useState<string | null>(null)

  // Create form state
  const [tableName, setTableName] = useState('')
  const [diceFormula, setDiceFormula] = useState('1d6')
  const [entries, setEntries] = useState<RollTableEntry[]>([{ min: 1, max: 1, text: '' }])

  // Subscribe to both stores reactively — switching campaigns mid-session
  // would otherwise leave this modal pointing at the previous campaign.
  const lobbyCampaignId = useLobbyStore((s) => s.campaignId)
  const campaign = useCampaignStore((s) => s.campaigns.find((c) => c.id === lobbyCampaignId))
  const saveCampaign = useCampaignStore((s) => s.saveCampaign)
  const addChatMessage = useLobbyStore((s) => s.addChatMessage)

  const animTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

  const customTables: RollTable[] = useMemo(
    () =>
      (campaign?.customRollTables ?? []).map((t) => ({
        ...t,
        entries: t.entries.map((e) => ({ ...e }))
      })),
    [campaign?.customRollTables]
  )

  // Combine all tables for sub-table lookups
  const allTables = useMemo(() => [...BUILT_IN_TABLES, ...customTables], [customTables])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Cleanup animation timeout
  useEffect(() => {
    return () => {
      if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current)
    }
  }, [])

  const resolveSubtables = useCallback(
    (text: string): string => {
      // Resolve {{TableName}} references in result text
      return text.replace(/\{\{(.+?)\}\}/g, (_match, tableName: string) => {
        const subTable = allTables.find((t) => t.name.toLowerCase() === tableName.toLowerCase())
        if (!subTable) return `[${tableName}?]`

        const subResult = rollFormula(subTable.diceFormula)
        if (!subResult) return `[${tableName}?]`

        const matchedEntry = subTable.entries.find((e) => subResult.total >= e.min && subResult.total <= e.max)
        if (!matchedEntry) return `[${tableName}: no match]`

        // Recursively resolve nested sub-tables
        return resolveSubtables(matchedEntry.text)
      })
    },
    [allTables]
  )

  const handleRoll = useCallback(
    (table: RollTable): void => {
      // Weighted entry support: if any entry has a weight, use weighted random
      const hasWeights = table.entries.some((e) => e.weight !== undefined && e.weight > 0)

      let resultTotal: number
      let matchedEntry: RollTableEntry | undefined
      let matchedIndex = -1

      if (hasWeights) {
        // Weighted pick
        const totalWeight = table.entries.reduce((sum, e) => sum + (e.weight ?? 1), 0)
        let r = Math.random() * totalWeight
        for (let i = 0; i < table.entries.length; i++) {
          r -= table.entries[i].weight ?? 1
          if (r <= 0) {
            matchedEntry = table.entries[i]
            matchedIndex = i
            resultTotal = matchedEntry.min
            break
          }
        }
        if (!matchedEntry) {
          matchedEntry = table.entries[table.entries.length - 1]
          matchedIndex = table.entries.length - 1
          resultTotal = matchedEntry.min
        }
      } else {
        const result = rollFormula(table.diceFormula)
        if (!result) {
          addChatMessage({
            id: crypto.randomUUID(),
            senderId: 'system',
            senderName: 'System',
            content: `[Roll Table] Invalid formula: ${table.diceFormula}`,
            timestamp: Date.now(),
            isSystem: true
          })
          return
        }
        resultTotal = result.total
        matchedIndex = table.entries.findIndex((e) => resultTotal >= e.min && resultTotal <= e.max)
        matchedEntry = matchedIndex >= 0 ? table.entries[matchedIndex] : undefined
      }

      let resultText = matchedEntry?.text ?? 'No matching entry'

      // Resolve sub-table references
      resultText = resolveSubtables(resultText)

      // Animate highlight
      setAnimatingTableId(table.id)
      setHighlightedEntry(null)

      // Quick cycling animation
      let animStep = 0
      const totalSteps = 8
      const stepDelay = 60

      const cycleInterval = setInterval(() => {
        setHighlightedEntry({
          tableId: table.id,
          entryIndex: animStep % table.entries.length
        })
        animStep++
        if (animStep >= totalSteps) {
          clearInterval(cycleInterval)
          // Land on the actual result
          setHighlightedEntry(matchedIndex >= 0 ? { tableId: table.id, entryIndex: matchedIndex } : null)
          setAnimatingTableId(null)

          // Clear highlight after a few seconds
          if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current)
          animTimeoutRef.current = setTimeout(() => {
            setHighlightedEntry(null)
          }, 4000)
        }
      }, stepDelay)

      // Add to history
      const historyItem: RollHistoryItem = {
        id: crypto.randomUUID(),
        tableName: table.name,
        roll: resultTotal!,
        result: resultText,
        timestamp: Date.now()
      }
      setRollHistory((prev) => [historyItem, ...prev].slice(0, MAX_HISTORY))
    },
    [addChatMessage, resolveSubtables]
  )

  const handleShareResult = useCallback(
    (item: RollHistoryItem): void => {
      addChatMessage({
        id: crypto.randomUUID(),
        senderId: 'system',
        senderName: 'System',
        content: `[${item.tableName}] Rolled ${item.roll} -- ${item.result}`,
        timestamp: Date.now(),
        isSystem: true
      })
    },
    [addChatMessage]
  )

  const handleSave = async (): Promise<void> => {
    if (!campaign || !tableName.trim()) return

    const newTable: RollTable = {
      id: editingTable?.id ?? crypto.randomUUID(),
      name: tableName.trim(),
      diceFormula: diceFormula.trim(),
      entries: entries.filter((e) => e.text.trim())
    }

    const existingTables = campaign.customRollTables ?? []
    const updatedTables = editingTable
      ? existingTables.map((t) => (t.id === editingTable.id ? newTable : t))
      : [...existingTables, newTable]

    await saveCampaign({
      ...campaign,
      customRollTables: updatedTables,
      updatedAt: new Date().toISOString()
    })

    // Reset form
    setTableName('')
    setDiceFormula('1d6')
    setEntries([{ min: 1, max: 1, text: '' }])
    setEditingTable(null)
    setTab('custom')
  }

  const handleDelete = async (tableId: string): Promise<void> => {
    if (!campaign) return
    const updatedTables = (campaign.customRollTables ?? []).filter((t) => t.id !== tableId)
    await saveCampaign({
      ...campaign,
      customRollTables: updatedTables,
      updatedAt: new Date().toISOString()
    })
  }

  const handleEdit = (table: RollTable): void => {
    setEditingTable(table)
    setTableName(table.name)
    setDiceFormula(table.diceFormula)
    setEntries(table.entries.length > 0 ? [...table.entries] : [{ min: 1, max: 1, text: '' }])
    setTab('create')
  }

  const addEntry = (): void => {
    const lastMax = entries.length > 0 ? entries[entries.length - 1].max : 0
    setEntries([...entries, { min: lastMax + 1, max: lastMax + 1, text: '' }])
  }

  const updateEntry = (index: number, field: keyof RollTableEntry, value: string | number): void => {
    const updated = [...entries]
    updated[index] = { ...updated[index], [field]: value }
    setEntries(updated)
  }

  const updateEntryWeight = (index: number, value: number | undefined): void => {
    const updated = [...entries]
    updated[index] = { ...updated[index], weight: value }
    setEntries(updated)
  }

  const removeEntry = (index: number): void => {
    setEntries(entries.filter((_, i) => i !== index))
  }

  const renderTableCard = (table: RollTable, showControls: boolean): JSX.Element => {
    const isAnimating = animatingTableId === table.id
    return (
      <div key={table.id} className="bg-gray-800 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-xs font-semibold text-gray-200">{table.name}</span>
            <span className="text-[10px] text-gray-500 ml-2">({table.diceFormula})</span>
            {table.builtIn && (
              <span className="text-[9px] text-amber-500/70 ml-2 uppercase tracking-wider">Built-in</span>
            )}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => handleRoll(table)}
              disabled={isAnimating}
              className="px-2 py-1 text-[10px] font-semibold bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 disabled:cursor-wait text-white rounded cursor-pointer"
            >
              {isAnimating ? 'Rolling...' : 'Roll'}
            </button>
            {showControls && (
              <>
                <button
                  onClick={() => handleEdit(table)}
                  className="px-2 py-1 text-[10px] font-semibold bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(table.id)}
                  className="px-2 py-1 text-[10px] font-semibold bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white rounded cursor-pointer"
                >
                  Del
                </button>
              </>
            )}
          </div>
        </div>
        <div className="space-y-0.5">
          {table.entries.map((entry, i) => {
            const isHighlighted = highlightedEntry?.tableId === table.id && highlightedEntry.entryIndex === i
            return (
              <div
                key={i}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-all duration-150 ${
                  isHighlighted ? 'bg-amber-500/30 text-amber-200 font-medium' : 'text-gray-400'
                }`}
              >
                <span className="text-gray-500 font-mono">
                  {entry.min === entry.max ? entry.min : `${entry.min}-${entry.max}`}
                </span>{' '}
                {entry.text}
                {entry.weight !== undefined && <span className="text-gray-600 ml-1">(w:{entry.weight})</span>}
                {entry.subtable && <span className="text-cyan-500/70 ml-1">-&gt; {`{{${entry.subtable}}}`}</span>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[600px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-sm font-bold text-amber-400">Roll Tables</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 cursor-pointer"
          >
            X
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => {
              setTab('builtin')
              setEditingTable(null)
            }}
            className={`flex-1 px-4 py-2 text-xs font-semibold cursor-pointer ${
              tab === 'builtin' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Built-in Tables
          </button>
          <button
            onClick={() => {
              setTab('custom')
              setEditingTable(null)
            }}
            className={`flex-1 px-4 py-2 text-xs font-semibold cursor-pointer ${
              tab === 'custom' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            My Tables
          </button>
          <button
            onClick={() => setTab('create')}
            className={`flex-1 px-4 py-2 text-xs font-semibold cursor-pointer ${
              tab === 'create' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {editingTable ? 'Edit Table' : 'Create Table'}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Built-in Tables */}
          {tab === 'builtin' && (
            <div className="space-y-3">{BUILT_IN_TABLES.map((table) => renderTableCard(table, false))}</div>
          )}

          {/* Custom Tables */}
          {tab === 'custom' && (
            <div className="space-y-3">
              {customTables.length === 0 && (
                <p className="text-xs text-gray-500 italic text-center py-6">
                  No custom roll tables yet. Create one to get started.
                </p>
              )}
              {customTables.map((table) => renderTableCard(table, true))}
            </div>
          )}

          {/* Create / Edit Table */}
          {tab === 'create' && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Table Name</label>
                <input
                  type="text"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="e.g., Random Encounter"
                  className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Dice Formula</label>
                <input
                  type="text"
                  value={diceFormula}
                  onChange={(e) => setDiceFormula(e.target.value)}
                  placeholder="e.g., 1d6, 1d100"
                  className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-gray-400">Entries</label>
                  <div className="flex gap-1">
                    <button
                      onClick={addEntry}
                      className="px-2 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
                    >
                      + Add Entry
                    </button>
                  </div>
                </div>
                <p className="text-[9px] text-gray-600 mb-1.5">
                  Tip: Use {`{{Table Name}}`} in result text for nested sub-table rolls. Add optional weight for
                  weighted entries.
                </p>
                <div className="space-y-1.5 max-h-[30vh] overflow-y-auto">
                  {entries.map((entry, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="number"
                        value={entry.min}
                        onChange={(e) => updateEntry(i, 'min', parseInt(e.target.value, 10) || 0)}
                        className="w-12 bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-[10px] text-gray-100 text-center focus:outline-none focus:border-amber-500"
                        title="Min"
                      />
                      <span className="text-[10px] text-gray-500">-</span>
                      <input
                        type="number"
                        value={entry.max}
                        onChange={(e) => updateEntry(i, 'max', parseInt(e.target.value, 10) || 0)}
                        className="w-12 bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-[10px] text-gray-100 text-center focus:outline-none focus:border-amber-500"
                        title="Max"
                      />
                      <input
                        type="text"
                        value={entry.text}
                        onChange={(e) => updateEntry(i, 'text', e.target.value)}
                        placeholder="Result text..."
                        className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-[10px] text-gray-100 focus:outline-none focus:border-amber-500"
                      />
                      <input
                        type="number"
                        value={entry.weight ?? ''}
                        onChange={(e) => {
                          const val = e.target.value.trim()
                          updateEntryWeight(i, val === '' ? undefined : parseInt(val, 10) || 0)
                        }}
                        placeholder="Wt"
                        title="Weight (optional)"
                        className="w-10 bg-gray-800 border border-gray-600 rounded px-1 py-1 text-[10px] text-gray-100 text-center focus:outline-none focus:border-amber-500"
                      />
                      <button
                        onClick={() => removeEntry(i)}
                        className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-red-400 cursor-pointer"
                      >
                        X
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={handleSave}
                disabled={!tableName.trim()}
                className="w-full py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg cursor-pointer disabled:cursor-not-allowed"
              >
                {editingTable ? 'Update Table' : 'Save Table'}
              </button>
            </div>
          )}

          {/* Roll History */}
          {rollHistory.length > 0 && (
            <div className="border-t border-gray-700 pt-3">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1.5 block">
                Roll History (last {MAX_HISTORY})
              </span>
              <div className="space-y-1">
                {rollHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between bg-gray-800/60 rounded px-2 py-1 text-[10px]"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-amber-400 font-semibold">[{item.tableName}]</span>{' '}
                      <span className="text-gray-500">Rolled {item.roll}:</span>{' '}
                      <span className="text-gray-300 truncate">{item.result}</span>
                    </div>
                    <button
                      onClick={() => handleShareResult(item)}
                      className="ml-2 px-1.5 py-0.5 text-[9px] bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white rounded cursor-pointer whitespace-nowrap"
                      title="Share to chat"
                    >
                      Share
                    </button>
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
