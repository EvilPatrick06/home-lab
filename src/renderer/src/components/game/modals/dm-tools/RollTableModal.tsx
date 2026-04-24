import { useEffect, useState } from 'react'
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
}

interface RollTable {
  id: string
  name: string
  diceFormula: string
  entries: RollTableEntry[]
}

export default function RollTableModal({ onClose }: RollTableModalProps): JSX.Element {
  const [tab, setTab] = useState<'tables' | 'create'>('tables')
  const [editingTable, setEditingTable] = useState<RollTable | null>(null)

  // Create form state
  const [tableName, setTableName] = useState('')
  const [diceFormula, setDiceFormula] = useState('1d6')
  const [entries, setEntries] = useState<RollTableEntry[]>([{ min: 1, max: 1, text: '' }])

  const campaign = useCampaignStore((s) => s.campaigns.find((c) => c.id === useLobbyStore.getState().campaignId))
  const saveCampaign = useCampaignStore((s) => s.saveCampaign)
  const addChatMessage = useLobbyStore((s) => s.addChatMessage)

  const tables: RollTable[] = campaign?.customRollTables ?? []

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleRoll = (table: RollTable): void => {
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

    const matchedEntry = table.entries.find((e) => result.total >= e.min && result.total <= e.max)
    const resultText = matchedEntry?.text ?? 'No matching entry'

    addChatMessage({
      id: crypto.randomUUID(),
      senderId: 'system',
      senderName: 'System',
      content: `[${table.name}] Rolled ${result.formula}: ${result.total} — ${resultText}`,
      timestamp: Date.now(),
      isSystem: true
    })
  }

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
    setTab('tables')
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

  const removeEntry = (index: number): void => {
    setEntries(entries.filter((_, i) => i !== index))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[500px] max-h-[80vh] flex flex-col">
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
              setTab('tables')
              setEditingTable(null)
            }}
            className={`flex-1 px-4 py-2 text-xs font-semibold cursor-pointer ${
              tab === 'tables' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-gray-400 hover:text-gray-200'
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
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'tables' && (
            <div className="space-y-3">
              {tables.length === 0 && (
                <p className="text-xs text-gray-500 italic text-center py-6">
                  No roll tables yet. Create one to get started.
                </p>
              )}
              {tables.map((table) => (
                <div key={table.id} className="bg-gray-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-xs font-semibold text-gray-200">{table.name}</span>
                      <span className="text-[10px] text-gray-500 ml-2">({table.diceFormula})</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleRoll(table)}
                        className="px-2 py-1 text-[10px] font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded cursor-pointer"
                      >
                        Roll
                      </button>
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
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    {table.entries.map((entry, i) => (
                      <div key={i} className="text-[10px] text-gray-400">
                        <span className="text-gray-500 font-mono">
                          {entry.min === entry.max ? entry.min : `${entry.min}-${entry.max}`}
                        </span>{' '}
                        {entry.text}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

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
                  <button
                    onClick={addEntry}
                    className="px-2 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded cursor-pointer"
                  >
                    + Add Entry
                  </button>
                </div>
                <div className="space-y-1.5 max-h-[30vh] overflow-y-auto">
                  {entries.map((entry, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="number"
                        value={entry.min}
                        onChange={(e) => updateEntry(i, 'min', parseInt(e.target.value, 10) || 0)}
                        className="w-12 bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-[10px] text-gray-100 text-center focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-[10px] text-gray-500">-</span>
                      <input
                        type="number"
                        value={entry.max}
                        onChange={(e) => updateEntry(i, 'max', parseInt(e.target.value, 10) || 0)}
                        className="w-12 bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-[10px] text-gray-100 text-center focus:outline-none focus:border-amber-500"
                      />
                      <input
                        type="text"
                        value={entry.text}
                        onChange={(e) => updateEntry(i, 'text', e.target.value)}
                        placeholder="Result text..."
                        className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-[10px] text-gray-100 focus:outline-none focus:border-amber-500"
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
        </div>
      </div>
    </div>
  )
}
