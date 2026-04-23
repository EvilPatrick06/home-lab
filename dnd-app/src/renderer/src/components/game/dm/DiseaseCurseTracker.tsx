import { useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { load5eCurses, load5eDiseases } from '../../../services/data-provider'
import { useGameStore } from '../../../stores/use-game-store'
import type { ActiveCurse, ActiveDisease, Curse, Disease } from '../../../types/dm-toolbox'

interface DiseaseCurseTrackerProps {
  onBroadcastResult: (message: string) => void
}

export default function DiseaseCurseTracker({ onBroadcastResult }: DiseaseCurseTrackerProps): JSX.Element {
  const { activeDiseases, addDisease, updateDisease, removeDisease, activeCurses, addCurse, updateCurse, removeCurse } =
    useGameStore(
      useShallow((s) => ({
        activeDiseases: s.activeDiseases,
        addDisease: s.addDisease,
        updateDisease: s.updateDisease,
        removeDisease: s.removeDisease,
        activeCurses: s.activeCurses,
        addCurse: s.addCurse,
        updateCurse: s.updateCurse,
        removeCurse: s.removeCurse
      }))
    )

  const [diseases, setDiseases] = useState<Disease[]>([])
  const [curses, setCurses] = useState<Curse[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedDisease, setExpandedDisease] = useState<string | null>(null)
  const [expandedCurse, setExpandedCurse] = useState<string | null>(null)

  // Add disease form state
  const [addDiseaseTarget, setAddDiseaseTarget] = useState('')
  const [addDiseaseId, setAddDiseaseId] = useState<string>('')
  const [addCurseTarget, setAddCurseTarget] = useState('')
  const [addCurseId, setAddCurseId] = useState<string>('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [diseasesData, cursesData] = await Promise.all([
        load5eDiseases() as Promise<Disease[]>,
        load5eCurses() as Promise<Curse[]>
      ])
      setDiseases(diseasesData)
      setCurses(cursesData)
      if (diseasesData.length > 0 && !addDiseaseId) setAddDiseaseId(diseasesData[0].id)
      if (cursesData.length > 0 && !addCurseId) setAddCurseId(cursesData[0].id)
    } catch {
      setDiseases([])
      setCurses([])
    } finally {
      setLoading(false)
    }
  }, [addCurseId, addDiseaseId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleAddDisease = useCallback(() => {
    const targetName = addDiseaseTarget.trim()
    if (!targetName || !addDiseaseId) return
    const disease = diseases.find((d) => d.id === addDiseaseId)
    if (!disease) return

    const active: ActiveDisease = {
      id: crypto.randomUUID(),
      diseaseId: disease.id,
      name: disease.name,
      targetId: crypto.randomUUID(),
      targetName,
      successCount: 0,
      failCount: 0
    }
    addDisease(active)
    onBroadcastResult(`${targetName} contracted ${disease.name}.`)
    setAddDiseaseTarget('')
  }, [addDiseaseTarget, addDiseaseId, diseases, addDisease, onBroadcastResult])

  const handleAddCurse = useCallback(() => {
    const targetName = addCurseTarget.trim()
    if (!targetName || !addCurseId) return
    const curse = curses.find((c) => c.id === addCurseId)
    if (!curse) return

    const active: ActiveCurse = {
      id: crypto.randomUUID(),
      curseId: curse.id,
      name: curse.name,
      targetId: crypto.randomUUID(),
      targetName,
      source: curse.source
    }
    addCurse(active)
    onBroadcastResult(`${targetName} is afflicted with ${curse.name}.`)
    setAddCurseTarget('')
  }, [addCurseTarget, addCurseId, curses, addCurse, onBroadcastResult])

  const handleRemoveDisease = useCallback(
    (ad: ActiveDisease) => {
      removeDisease(ad.id)
      onBroadcastResult(`${ad.targetName} was cured of ${ad.name}.`)
    },
    [removeDisease, onBroadcastResult]
  )

  const handleRemoveCurse = useCallback(
    (ac: ActiveCurse) => {
      removeCurse(ac.id)
      onBroadcastResult(`${ac.targetName} was freed from ${ac.name}.`)
    },
    [removeCurse, onBroadcastResult]
  )

  if (loading) {
    return <div className="text-xs text-gray-500 p-2">Loading diseases and curses...</div>
  }

  return (
    <div className="space-y-4 w-full">
      {/* Active Diseases */}
      <section>
        <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
          Active Diseases
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-700/60 text-gray-300">
            {activeDiseases.length}
          </span>
        </h3>

        <div className="space-y-2 mt-1.5">
          {activeDiseases.map((ad) => {
            const def = diseases.find((d) => d.id === ad.diseaseId)
            const isExpanded = expandedDisease === ad.id
            return (
              <div key={ad.id} className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => setExpandedDisease(isExpanded ? null : ad.id)}
                      className="flex items-center gap-1.5 text-left w-full"
                    >
                      <span className={`text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                      <span className="font-medium text-gray-200 truncate">{ad.name}</span>
                      <span className="text-gray-500 text-[10px] truncate">— {ad.targetName}</span>
                    </button>

                    {/* Success/Fail counters */}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-gray-500">Saves:</span>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            updateDisease(ad.id, {
                              successCount: Math.max(0, ad.successCount - 1)
                            })
                          }
                          className="w-5 h-5 rounded text-[10px] bg-green-900/50 text-green-400 border border-green-700/50 hover:bg-green-800/50"
                        >
                          −
                        </button>
                        <span className="w-5 text-center text-xs text-green-400">{ad.successCount}</span>
                        <button
                          type="button"
                          onClick={() =>
                            updateDisease(ad.id, {
                              successCount: ad.successCount + 1
                            })
                          }
                          className="w-5 h-5 rounded text-[10px] bg-green-900/50 text-green-400 border border-green-700/50 hover:bg-green-800/50"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-gray-600">|</span>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            updateDisease(ad.id, {
                              failCount: Math.max(0, ad.failCount - 1)
                            })
                          }
                          className="w-5 h-5 rounded text-[10px] bg-red-900/50 text-red-400 border border-red-700/50 hover:bg-red-800/50"
                        >
                          −
                        </button>
                        <span className="w-5 text-center text-xs text-red-400">{ad.failCount}</span>
                        <button
                          type="button"
                          onClick={() =>
                            updateDisease(ad.id, {
                              failCount: ad.failCount + 1
                            })
                          }
                          className="w-5 h-5 rounded text-[10px] bg-red-900/50 text-red-400 border border-red-700/50 hover:bg-red-800/50"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {isExpanded && def && (
                      <div className="mt-2 pt-2 border-t border-gray-700 space-y-1 text-[10px] text-gray-400">
                        <p>
                          <span className="text-gray-500">Symptoms:</span> {def.symptoms}
                        </p>
                        <p>
                          <span className="text-gray-500">DC:</span> {def.saveDC} {def.saveAbility}
                        </p>
                        <p className="text-amber-600/90">
                          <span className="text-amber-500/80">Cure:</span> {def.cure}
                        </p>
                        {ad.notes && (
                          <p>
                            <span className="text-gray-500">Notes:</span> {ad.notes}
                          </p>
                        )}
                        <input
                          type="text"
                          placeholder="Add notes..."
                          value={ad.notes ?? ''}
                          onChange={(e) => updateDisease(ad.id, { notes: e.target.value })}
                          className="w-full mt-1 px-2 py-1 text-[10px] bg-gray-900/60 border border-gray-600 rounded text-gray-300 placeholder-gray-500"
                        />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveDisease(ad)}
                    className="shrink-0 w-6 h-6 rounded text-red-400 hover:bg-red-900/40 hover:text-red-300 text-xs font-bold"
                    title="Remove (cured)"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Add Disease */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          <select
            value={addDiseaseId}
            onChange={(e) => setAddDiseaseId(e.target.value)}
            className="px-2 py-1 text-[10px] bg-gray-800 border border-gray-600 rounded text-gray-300"
          >
            {diseases.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Target name"
            value={addDiseaseTarget}
            onChange={(e) => setAddDiseaseTarget(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddDisease()}
            className="px-2 py-1 text-[10px] w-24 bg-gray-800 border border-gray-600 rounded text-gray-300 placeholder-gray-500"
          />
          <button
            type="button"
            onClick={handleAddDisease}
            disabled={!addDiseaseTarget.trim()}
            className="px-2 py-1 text-[10px] font-medium rounded bg-amber-600/30 border border-amber-500/50 text-amber-300 hover:bg-amber-600/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Disease
          </button>
        </div>
      </section>

      {/* Active Curses */}
      <section>
        <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
          Active Curses
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-700/60 text-gray-300">{activeCurses.length}</span>
        </h3>

        <div className="space-y-2 mt-1.5">
          {activeCurses.map((ac) => {
            const def = curses.find((c) => c.id === ac.curseId)
            const isExpanded = expandedCurse === ac.id
            return (
              <div key={ac.id} className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => setExpandedCurse(isExpanded ? null : ac.id)}
                      className="flex items-center gap-1.5 text-left w-full"
                    >
                      <span className={`text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                      <span className="font-medium text-gray-200 truncate">{ac.name}</span>
                      <span className="text-gray-500 text-[10px] truncate">— {ac.targetName}</span>
                    </button>

                    {isExpanded && def && (
                      <div className="mt-2 pt-2 border-t border-gray-700 space-y-1 text-[10px] text-gray-400">
                        <p>
                          <span className="text-gray-500">Effect:</span> {def.effect}
                        </p>
                        <p className="text-amber-600/90">
                          <span className="text-amber-500/80">Removal:</span> {def.removal}
                        </p>
                        {def.saveDC != null && (
                          <p>
                            <span className="text-gray-500">DC:</span> {def.saveDC} {def.saveAbility ?? ''}
                          </p>
                        )}
                        {ac.notes && (
                          <p>
                            <span className="text-gray-500">Notes:</span> {ac.notes}
                          </p>
                        )}
                        <input
                          type="text"
                          placeholder="Add notes..."
                          value={ac.notes ?? ''}
                          onChange={(e) => updateCurse(ac.id, { notes: e.target.value })}
                          className="w-full mt-1 px-2 py-1 text-[10px] bg-gray-900/60 border border-gray-600 rounded text-gray-300 placeholder-gray-500"
                        />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveCurse(ac)}
                    className="shrink-0 w-6 h-6 rounded text-red-400 hover:bg-red-900/40 hover:text-red-300 text-xs font-bold"
                    title="Remove (cured)"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Add Curse */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          <select
            value={addCurseId}
            onChange={(e) => setAddCurseId(e.target.value)}
            className="px-2 py-1 text-[10px] bg-gray-800 border border-gray-600 rounded text-gray-300"
          >
            {curses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Target name"
            value={addCurseTarget}
            onChange={(e) => setAddCurseTarget(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCurse()}
            className="px-2 py-1 text-[10px] w-24 bg-gray-800 border border-gray-600 rounded text-gray-300 placeholder-gray-500"
          />
          <button
            type="button"
            onClick={handleAddCurse}
            disabled={!addCurseTarget.trim()}
            className="px-2 py-1 text-[10px] font-medium rounded bg-amber-600/30 border border-amber-500/50 text-amber-300 hover:bg-amber-600/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Curse
          </button>
        </div>
      </section>
    </div>
  )
}
