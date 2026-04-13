import { useEffect, useMemo, useRef, useState } from 'react'
import { addToast } from '../../../../hooks/use-toast'
import {
  calculateEncounterDifficulty,
  type EncounterDifficulty,
  getMonsterXP
} from '../../../../services/combat/encounter-cr-calculator'
import { load5eMonsters } from '../../../../services/data-provider'
import { logger } from '../../../../utils/logger'

interface EncounterBuilderModalProps {
  onClose: () => void
  onBroadcastResult: (message: string) => void
}

interface MonsterEntry {
  id: string
  name: string
  cr: string
  xp: number
  count: number
}

interface MonsterData {
  name: string
  cr: string
  xp: number
  [key: string]: unknown
}

const DIFFICULTY_STYLES: Record<EncounterDifficulty, { color: string; bg: string }> = {
  None: { color: 'text-gray-500', bg: 'bg-gray-700' },
  Low: { color: 'text-green-400', bg: 'bg-green-600' },
  Moderate: { color: 'text-amber-400', bg: 'bg-amber-600' },
  High: { color: 'text-orange-400', bg: 'bg-orange-600' },
  'Over Budget': { color: 'text-red-400', bg: 'bg-red-600' }
}

export default function EncounterBuilderModal({ onClose, onBroadcastResult }: EncounterBuilderModalProps): JSX.Element {
  const [partySize, setPartySize] = useState(4)
  const [partyLevel, setPartyLevel] = useState(1)
  const [monsterSearch, setMonsterSearch] = useState('')
  const [searchResults, setSearchResults] = useState<MonsterData[]>([])
  const [selectedMonsters, setSelectedMonsters] = useState<MonsterEntry[]>([])
  const [allMonsters, setAllMonsters] = useState<MonsterData[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [showSavePreset, setShowSavePreset] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    load5eMonsters()
      .then((data) => setAllMonsters(data as unknown as MonsterData[]))
      .catch((err) => {
        logger.error('Failed to load monsters', err)
        addToast('Failed to load monsters', 'error')
        setAllMonsters([])
      })
  }, [])

  useEffect(() => {
    if (monsterSearch.trim().length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }
    const query = monsterSearch.toLowerCase()
    const results = allMonsters.filter((m) => m.name.toLowerCase().includes(query)).slice(0, 15)
    setSearchResults(results)
    setShowDropdown(results.length > 0)
  }, [monsterSearch, allMonsters])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const addMonster = (monster: MonsterData): void => {
    const existing = selectedMonsters.find((m) => m.name === monster.name && m.cr === monster.cr)
    if (existing) {
      setSelectedMonsters((prev) => prev.map((m) => (m.id === existing.id ? { ...m, count: m.count + 1 } : m)))
    } else {
      setSelectedMonsters((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: monster.name,
          cr: monster.cr,
          xp: monster.xp ?? getMonsterXP(monster.cr),
          count: 1
        }
      ])
    }
    setMonsterSearch('')
    setShowDropdown(false)
  }

  const updateCount = (id: string, delta: number): void => {
    setSelectedMonsters((prev) =>
      prev.map((m) => (m.id === id ? { ...m, count: Math.max(0, m.count + delta) } : m)).filter((m) => m.count > 0)
    )
  }

  const removeMonster = (id: string): void => {
    setSelectedMonsters((prev) => prev.filter((m) => m.id !== id))
  }

  // Build the flat CR array and compute encounter difficulty using the service
  const encounter = useMemo(() => {
    const partyLevels = Array.from({ length: partySize }, () => partyLevel)
    const monsterCRs = selectedMonsters.flatMap((m) => Array.from({ length: m.count }, () => m.cr))
    return calculateEncounterDifficulty(partyLevels, monsterCRs)
  }, [partySize, partyLevel, selectedMonsters])

  const totalMonsterCount = encounter.monsterCount
  const diffStyle = DIFFICULTY_STYLES[encounter.difficulty]

  // Budget bar calculations
  const budgetBarMax = encounter.budget.high * 1.3 || 1
  const lowPct = Math.min((encounter.budget.low / budgetBarMax) * 100, 100)
  const modPct = Math.min(((encounter.budget.moderate - encounter.budget.low) / budgetBarMax) * 100, 100 - lowPct)
  const highPct = Math.min(
    ((encounter.budget.high - encounter.budget.moderate) / budgetBarMax) * 100,
    100 - lowPct - modPct
  )
  const xpPct = Math.min((encounter.adjustedXP / budgetBarMax) * 100, 100)

  const handleStartInitiative = (): void => {
    const monsterList = selectedMonsters
      .flatMap((m) => Array.from({ length: m.count }, (_, i) => (m.count > 1 ? `${m.name} ${i + 1}` : m.name)))
      .join(', ')
    onBroadcastResult(
      `Encounter started! Monsters: ${monsterList} (Total XP: ${encounter.totalXP.toLocaleString()}, Adjusted XP: ${encounter.adjustedXP.toLocaleString()}, Difficulty: ${encounter.difficulty})`
    )
    onClose()
  }

  const handleSavePreset = (): void => {
    if (!presetName.trim()) return
    const preset = {
      name: presetName,
      partySize,
      partyLevel,
      monsters: selectedMonsters
    }
    let saved: unknown[] = []
    try {
      saved = JSON.parse(localStorage.getItem('encounter-presets') ?? '[]')
    } catch {
      /* corrupted data, reset */
    }
    saved.push(preset)
    localStorage.setItem('encounter-presets', JSON.stringify(saved))
    setPresetName('')
    setShowSavePreset(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <h2 className="text-lg font-bold text-amber-400">Encounter Builder</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none px-1"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Party Config */}
          <div className="flex gap-4 items-end">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Party Size</label>
              <input
                type="number"
                min={1}
                max={10}
                value={partySize}
                onChange={(e) => setPartySize(Math.max(1, Math.min(10, Number(e.target.value))))}
                className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Party Level</label>
              <input
                type="number"
                min={1}
                max={20}
                value={partyLevel}
                onChange={(e) => setPartyLevel(Math.max(1, Math.min(20, Number(e.target.value))))}
                className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white"
              />
            </div>
            <div className="text-xs text-gray-500 pb-1">
              Budgets: Low {encounter.budget.low.toLocaleString()} / Moderate{' '}
              {encounter.budget.moderate.toLocaleString()} / High {encounter.budget.high.toLocaleString()} XP
            </div>
          </div>

          {/* XP Budget Bar */}
          <div>
            <div className="text-xs text-gray-400 mb-1">XP Budget</div>
            <div className="relative h-6 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
              <div className="absolute top-0 left-0 h-full bg-green-700/60" style={{ width: `${lowPct}%` }} />
              <div
                className="absolute top-0 h-full bg-amber-700/60"
                style={{ left: `${lowPct}%`, width: `${modPct}%` }}
              />
              <div
                className="absolute top-0 h-full bg-red-700/60"
                style={{ left: `${lowPct + modPct}%`, width: `${highPct}%` }}
              />
              {/* XP marker */}
              {encounter.adjustedXP > 0 && (
                <div className="absolute top-0 h-full w-0.5 bg-white shadow-lg" style={{ left: `${xpPct}%` }}>
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-white whitespace-nowrap bg-gray-900 px-1 rounded">
                    {encounter.adjustedXP.toLocaleString()} XP
                  </div>
                </div>
              )}
              {/* Labels */}
              <div className="absolute inset-0 flex items-center text-[10px] text-white/70 pointer-events-none">
                <span className="flex-1 text-center">Low</span>
                <span className="flex-1 text-center">Moderate</span>
                <span className="flex-1 text-center">High</span>
              </div>
            </div>
          </div>

          {/* Monster Search */}
          <div ref={searchRef} className="relative">
            <label className="block text-xs text-gray-400 mb-1">Search Monsters</label>
            <input
              type="text"
              value={monsterSearch}
              onChange={(e) => setMonsterSearch(e.target.value)}
              placeholder="Type monster name..."
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500"
            />
            {showDropdown && (
              <div className="absolute z-10 mt-1 w-full bg-gray-800 border border-gray-600 rounded shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map((m, i) => (
                  <button
                    key={`${m.name}-${i}`}
                    onClick={() => addMonster(m)}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 flex justify-between"
                  >
                    <span>{m.name}</span>
                    <span className="text-gray-500">
                      CR {m.cr} ({(m.xp ?? getMonsterXP(m.cr)).toLocaleString()} XP)
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected Monsters Table */}
          {selectedMonsters.length > 0 && (
            <div className="border border-gray-700 rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800 text-gray-400 text-xs">
                    <th className="text-left px-3 py-2">Monster</th>
                    <th className="text-center px-2 py-2">CR</th>
                    <th className="text-center px-2 py-2">XP</th>
                    <th className="text-center px-2 py-2">Count</th>
                    <th className="text-center px-2 py-2">Total XP</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {selectedMonsters.map((m) => (
                    <tr key={m.id} className="border-t border-gray-700/50 text-gray-200">
                      <td className="px-3 py-1.5">{m.name}</td>
                      <td className="text-center px-2 py-1.5 text-gray-400">{m.cr}</td>
                      <td className="text-center px-2 py-1.5 text-gray-400">{m.xp.toLocaleString()}</td>
                      <td className="text-center px-2 py-1.5">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => updateCount(m.id, -1)}
                            className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs flex items-center justify-center"
                          >
                            -
                          </button>
                          <span className="w-6 text-center">{m.count}</span>
                          <button
                            onClick={() => updateCount(m.id, 1)}
                            className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="text-center px-2 py-1.5 text-amber-400">{(m.xp * m.count).toLocaleString()}</td>
                      <td className="text-center px-2 py-1.5">
                        <button onClick={() => removeMonster(m.id)} className="text-red-500 hover:text-red-400 text-xs">
                          &times;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary with color-coded difficulty indicator */}
          <div className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3 border border-gray-700">
            <div className="text-sm text-gray-300">
              <span className="text-gray-500">Monsters:</span>{' '}
              <span className="text-white font-medium">{totalMonsterCount}</span>
              <span className="mx-2 text-gray-600">|</span>
              <span className="text-gray-500">Raw XP:</span>{' '}
              <span className="text-amber-400 font-bold">{encounter.totalXP.toLocaleString()}</span>
              {encounter.multiplier > 1 && (
                <>
                  <span className="mx-2 text-gray-600">|</span>
                  <span className="text-gray-500">x{encounter.multiplier} =</span>{' '}
                  <span className="text-amber-300 font-bold">{encounter.adjustedXP.toLocaleString()}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${diffStyle.bg}`} />
              <span className={`text-sm font-bold ${diffStyle.color}`}>{encounter.difficulty}</span>
            </div>
          </div>

          {/* Save Preset */}
          {showSavePreset && (
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset name..."
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500"
              />
              <button
                onClick={handleSavePreset}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded"
              >
                Save
              </button>
              <button
                onClick={() => setShowSavePreset(false)}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-700">
          <button
            onClick={() => setShowSavePreset(true)}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded"
          >
            Save Preset
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleStartInitiative}
              disabled={selectedMonsters.length === 0}
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded font-medium"
            >
              Place All &amp; Start Initiative
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
