import { useCallback, useEffect, useState } from 'react'
import { useT } from '../../../i18n'
import { load5eRandomTables } from '../../../services/data-provider'
import { rollFormula } from '../../../services/dice/dice-engine'
import { useLobbyStore } from '../../../stores/use-lobby-store'
import { cryptoRandom, cryptoRollDie } from '../../../utils/crypto-random'

interface RandomTableData {
  [key: string]: unknown
}

interface TableEntry {
  name: string
  data: unknown
  type: 'array' | 'diceTable' | 'nested'
}

export default function TablesPanel(): JSX.Element {
  const { t } = useT()
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
      // boundary cast: concrete RandomTablesFile reinterpreted as an open string-keyed map for generic iteration
      for (const [key, value] of Object.entries(data as unknown as RandomTableData)) {
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
      setError(err instanceof Error ? err.message : t('game.tablesPanel.failedToLoad'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadTables()
  }, [loadTables])

  const rollOnTable = (table: TableEntry): void => {
    // Phase 17af — previously every error branch did `result = '...'; return`
    // which skipped the addChatMessage below, so empty / invalid tables
    // silently did nothing on click (looked "broken"). Now every branch
    // either falls through to write `result` + `rollInfo` and then the
    // shared addChatMessage call below runs, OR sets `result` to an
    // explanatory message and lets the shared call surface it. No more
    // silent no-ops on click.
    let result: string
    let rollInfo = ''

    if (table.type === 'array') {
      const arrayData = table.data as string[]
      if (arrayData.length === 0) {
        result = t('game.tablesPanel.noEntriesInTable')
      } else {
        const roll = cryptoRollDie(arrayData.length)
        result = arrayData[roll - 1]
        rollInfo = `1d${arrayData.length} = ${roll}`
      }
    } else if (table.type === 'diceTable') {
      const diceTable = table.data as { die: string; entries: Array<{ roll: string; [key: string]: unknown }> }
      const formula = diceTable.die.replace('d', '') // Extract number from "d100"
      const rollResult = rollFormula(`1d${formula}`)
      if (!rollResult) {
        result = t('game.tablesPanel.invalidDiceFormula')
      } else {
        // Find matching entry
        const matchedEntry = diceTable.entries.find((entry) => {
          const rollRange = entry.roll
          if (rollRange.includes('-')) {
            const [min, max] = rollRange.split('-').map(Number)
            return rollResult.total >= min && rollResult.total <= max
          }
          return rollResult.total === parseInt(rollRange, 10)
        })

        result = matchedEntry
          ? String(matchedEntry[Object.keys(matchedEntry).find((k) => k !== 'roll')!] || t('game.tablesPanel.unknown'))
          : t('game.tablesPanel.noMatchingEntry')
        rollInfo = `${rollResult.formula}: ${rollResult.total}`
      }
    } else if (table.type === 'nested') {
      // For nested tables like npcTraits, pick a random sub-table and then random entry
      const nestedData = table.data as Record<string, unknown>
      const subKeys = Object.keys(nestedData)
      if (subKeys.length === 0) {
        result = t('game.tablesPanel.noSubTables')
      } else {
        const randomSubKey = subKeys[Math.floor(cryptoRandom() * subKeys.length)]
        const subTable = nestedData[randomSubKey] as unknown[]
        if (!Array.isArray(subTable) || subTable.length === 0) {
          result = t('game.tablesPanel.invalidSubTable')
        } else {
          const roll = cryptoRollDie(subTable.length)
          result = String(subTable[roll - 1])
          rollInfo = `${randomSubKey} 1d${subTable.length} = ${roll}`
        }
      }
    } else {
      result = t('game.tablesPanel.unsupportedTableType')
    }

    // Add to chat — always fires now, so the user gets feedback regardless
    // of which branch produced `result`.
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
    return <div className="text-xs text-gray-500 text-center py-4">{t('game.tablesPanel.loading')}</div>
  }

  if (error) {
    return <div className="text-xs text-red-400 text-center py-4">{error}</div>
  }

  if (tables.length === 0) {
    return <div className="text-xs text-gray-500 text-center py-4">{t('game.tablesPanel.noTablesFound')}</div>
  }

  return (
    <div className="space-y-2">
      {tables.map((table) => (
        <div key={table.name} className="bg-surface-2/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-200 capitalize">{table.name.replace(/([A-Z])/g, ' $1')}</span>
            <button
              onClick={() => rollOnTable(table)}
              className="px-2 py-1 text-xs font-semibold bg-amber-600 hover:bg-accent-strong text-white rounded cursor-pointer"
            >
              {t('game.tablesPanel.roll')}
            </button>
          </div>
          <div className="text-xs text-muted">
            {table.type === 'array' && (
              <span>{t('game.tablesPanel.entries', { count: (table.data as unknown[]).length })}</span>
            )}
            {table.type === 'diceTable' && (
              <span>{t('game.tablesPanel.diceTable', { die: (table.data as { die: string }).die })}</span>
            )}
            {table.type === 'nested' && (
              <span>
                {t('game.tablesPanel.nestedTable', {
                  count: Object.keys(table.data as Record<string, unknown>).length
                })}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
