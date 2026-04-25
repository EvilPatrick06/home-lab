import { useCallback, useEffect, useState } from 'react'
import { load5eRandomTables } from '../../../services/data-provider'
import { rollFormula } from '../../../services/dice/dice-engine'
import { useLobbyStore } from '../../../stores/use-lobby-store'

interface RandomTableData {
  [key: string]: unknown
}

interface TableEntry {
  name: string
  data: unknown
  type: 'array' | 'diceTable' | 'nested'
}

export default function TablesPanel(): JSX.Element {
  const [tables, setTables] = useState<TableEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const addChatMessage = useLobbyStore((s) => s.addChatMessage)

  const loadTables = useCallback(async (): Promise<void> => {
    try {
      setLoading(true)
      const data = await load5eRandomTables()
      const tableEntries: TableEntry[] = []

      // Process the random tables data
      for (const [key, value] of Object.entries(data as RandomTableData)) {
        if (Array.isArray(value)) {
          // Simple array table
          tableEntries.push({
            name: key,
            data: value,
            type: 'array'
          })
        } else if (typeof value === 'object' && value !== null) {
          // Check if it's a dice table with entries
          const objValue = value as Record<string, unknown>
          if (objValue.entries && Array.isArray(objValue.entries)) {
            tableEntries.push({
              name: key,
              data: value,
              type: 'diceTable'
            })
          } else {
            // Nested object (like npcTraits)
            tableEntries.push({
              name: key,
              data: value,
              type: 'nested'
            })
          }
        }
      }

      setTables(tableEntries)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tables')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTables()
  }, [loadTables])

  const rollOnTable = (table: TableEntry): void => {
    let result: string
    let rollInfo = ''

    if (table.type === 'array') {
      const arrayData = table.data as string[]
      if (arrayData.length === 0) {
        result = 'No entries in table'
        return
      }
      const roll = Math.floor(Math.random() * arrayData.length) + 1
      result = arrayData[roll - 1]
      rollInfo = `1d${arrayData.length} = ${roll}`
    } else if (table.type === 'diceTable') {
      const diceTable = table.data as { die: string; entries: Array<{ roll: string; [key: string]: unknown }> }
      const formula = diceTable.die.replace('d', '') // Extract number from "d100"
      const rollResult = rollFormula(`1d${formula}`)
      if (!rollResult) {
        result = 'Invalid dice formula'
        return
      }

      // Find matching entry
      const matchedEntry = diceTable.entries.find((entry) => {
        const rollRange = entry.roll
        if (rollRange.includes('-')) {
          const [min, max] = rollRange.split('-').map(Number)
          return rollResult.total >= min && rollResult.total <= max
        } else {
          return rollResult.total === parseInt(rollRange, 10)
        }
      })

      result = matchedEntry
        ? String(matchedEntry[Object.keys(matchedEntry).find((k) => k !== 'roll')!] || 'Unknown')
        : 'No matching entry'
      rollInfo = `${rollResult.formula}: ${rollResult.total}`
    } else if (table.type === 'nested') {
      // For nested tables like npcTraits, pick a random sub-table and then random entry
      const nestedData = table.data as Record<string, unknown>
      const subKeys = Object.keys(nestedData)
      if (subKeys.length === 0) {
        result = 'No sub-tables available'
        return
      }

      const randomSubKey = subKeys[Math.floor(Math.random() * subKeys.length)]
      const subTable = nestedData[randomSubKey] as unknown[]

      if (!Array.isArray(subTable) || subTable.length === 0) {
        result = 'Invalid sub-table'
        return
      }

      const roll = Math.floor(Math.random() * subTable.length) + 1
      result = String(subTable[roll - 1])
      rollInfo = `${randomSubKey} 1d${subTable.length} = ${roll}`
    } else {
      result = 'Unsupported table type'
      return
    }

    // Add to chat
    addChatMessage({
      id: crypto.randomUUID(),
      senderId: 'system',
      senderName: 'System',
      content: `[${table.name}] ${rollInfo ? `${rollInfo} — ` : ''}${result}`,
      timestamp: Date.now(),
      isSystem: true
    })
  }

  if (loading) {
    return <div className="text-xs text-gray-500 text-center py-4">Loading tables...</div>
  }

  if (error) {
    return <div className="text-xs text-red-400 text-center py-4">{error}</div>
  }

  if (tables.length === 0) {
    return <div className="text-xs text-gray-500 text-center py-4">No tables found</div>
  }

  return (
    <div className="space-y-2">
      {tables.map((table) => (
        <div key={table.name} className="bg-gray-800/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-200 capitalize">{table.name.replace(/([A-Z])/g, ' $1')}</span>
            <button
              onClick={() => rollOnTable(table)}
              className="px-2 py-1 text-[10px] font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded cursor-pointer"
            >
              Roll
            </button>
          </div>
          <div className="text-[10px] text-gray-400">
            {table.type === 'array' && <span>{(table.data as unknown[]).length} entries</span>}
            {table.type === 'diceTable' && <span>Dice table ({(table.data as { die: string }).die})</span>}
            {table.type === 'nested' && (
              <span>Nested table ({Object.keys(table.data as Record<string, unknown>).length} categories)</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
