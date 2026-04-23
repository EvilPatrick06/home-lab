import { useEffect, useState } from 'react'
import { load5eMonsterById } from '../../../services/data-provider'
import { useGameStore } from '../../../stores/use-game-store'
import type { NPC } from '../../../types/campaign'
import type { SidebarCategory, SidebarEntry } from '../../../types/game-state'
import type { MonsterStatBlock } from '../../../types/monster'
import MonsterStatBlockView from './MonsterStatBlockView'

type NewNpcCategory = 'ally' | 'enemy' | 'npc'

interface NPCManagerProps {
  npcs: NPC[]
  onAddToInitiative: (npc: NPC) => void
  onPlaceOnMap: (npc: NPC) => void
  isDM?: boolean
  onUpdateNpc?: (npcId: string, updates: Partial<NPC>) => void
}

export default function NPCManager({
  npcs,
  onAddToInitiative,
  onPlaceOnMap,
  isDM = true,
  onUpdateNpc
}: NPCManagerProps): JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [statBlocks, setStatBlocks] = useState<Record<string, MonsterStatBlock>>({})
  const [showStatBlockId, setShowStatBlockId] = useState<string | null>(null)
  const [roleMenuId, setRoleMenuId] = useState<string | null>(null)

  // New NPC form state
  const [showNewNpcForm, setShowNewNpcForm] = useState(false)
  const [newNpcName, setNewNpcName] = useState('')
  const [newNpcCategory, setNewNpcCategory] = useState<NewNpcCategory>('npc')
  const [newNpcAC, setNewNpcAC] = useState('')
  const [newNpcHP, setNewNpcHP] = useState('')

  const addSidebarEntry = useGameStore((s) => s.addSidebarEntry)

  // Load stat blocks for NPCs that have statBlockId
  useEffect(() => {
    const loadStatBlocks = async (): Promise<void> => {
      const loaded: Record<string, MonsterStatBlock> = {}
      for (const npc of npcs) {
        if (npc.statBlockId && !statBlocks[npc.statBlockId]) {
          const block = await load5eMonsterById(npc.statBlockId)
          if (block) loaded[npc.statBlockId] = block
        }
      }
      if (Object.keys(loaded).length > 0) {
        setStatBlocks((prev) => ({ ...prev, ...loaded }))
      }
    }
    loadStatBlocks()
  }, [npcs, statBlocks]) // eslint-disable-line react-hooks/exhaustive-deps

  // Get effective stat block for an NPC (merge customStats over linked block)
  const getEffectiveStatBlock = (npc: NPC): MonsterStatBlock | undefined => {
    const linked = npc.statBlockId ? statBlocks[npc.statBlockId] : undefined
    if (npc.customStats && linked) return { ...linked, ...npc.customStats } as MonsterStatBlock
    if (npc.customStats) return npc.customStats as MonsterStatBlock
    return linked
  }

  // Create a new NPC as a sidebar entry
  const handleCreateNpc = (): void => {
    if (!newNpcName.trim()) return

    const sidebarCategory: SidebarCategory = newNpcCategory === 'enemy' ? 'enemies' : 'allies'
    const ac = newNpcAC ? parseInt(newNpcAC, 10) : undefined
    const hp = newNpcHP ? parseInt(newNpcHP, 10) : undefined

    const descParts: string[] = []
    if (newNpcCategory === 'npc') descParts.push('NPC')
    if (ac) descParts.push(`AC ${ac}`)
    if (hp) descParts.push(`HP ${hp}/${hp}`)

    const entry: SidebarEntry = {
      id: crypto.randomUUID(),
      name: newNpcName.trim(),
      description: descParts.length > 0 ? descParts.join(' | ') : undefined,
      visibleToPlayers: true,
      isAutoPopulated: false,
      statBlock:
        ac || hp
          ? {
              ...(ac ? { ac } : {}),
              ...(hp ? { hpMax: hp, hpCurrent: hp } : {})
            }
          : undefined
    }

    addSidebarEntry(sidebarCategory, entry)

    // Reset form
    setNewNpcName('')
    setNewNpcCategory('npc')
    setNewNpcAC('')
    setNewNpcHP('')
    setShowNewNpcForm(false)
  }

  // Filter NPCs for player view: only visible ones
  const visibleNpcs = isDM ? npcs : npcs.filter((n) => n.isVisible)

  if (visibleNpcs.length === 0) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">NPCs</h3>
        {isDM && !showNewNpcForm && (
          <button
            onClick={() => setShowNewNpcForm(true)}
            className="w-full py-2 text-xs text-gray-500 hover:text-amber-400 border border-dashed border-gray-700 hover:border-amber-600/50 rounded-lg transition-colors cursor-pointer"
          >
            + New NPC
          </button>
        )}
        {isDM && showNewNpcForm && (
          <div className="bg-gray-800/50 border border-gray-700/30 rounded-lg p-2.5 space-y-2">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">New NPC</span>
            <input
              type="text"
              value={newNpcName}
              onChange={(e) => setNewNpcName(e.target.value)}
              className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
              placeholder="Name"
              autoFocus
            />
            <select
              value={newNpcCategory}
              onChange={(e) => setNewNpcCategory(e.target.value as NewNpcCategory)}
              className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
            >
              <option value="npc">NPC</option>
              <option value="ally">Ally</option>
              <option value="enemy">Enemy</option>
            </select>
            <div className="flex gap-2">
              <input
                type="number"
                value={newNpcAC}
                onChange={(e) => setNewNpcAC(e.target.value)}
                className="w-1/2 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
                placeholder="AC"
                min={0}
              />
              <input
                type="number"
                value={newNpcHP}
                onChange={(e) => setNewNpcHP(e.target.value)}
                className="w-1/2 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
                placeholder="HP"
                min={0}
              />
            </div>
            <div className="flex gap-1">
              <button
                onClick={handleCreateNpc}
                disabled={!newNpcName.trim()}
                className="px-2 py-0.5 text-[10px] bg-amber-600 hover:bg-amber-500 text-white rounded cursor-pointer disabled:opacity-50"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowNewNpcForm(false)
                  setNewNpcName('')
                  setNewNpcCategory('npc')
                  setNewNpcAC('')
                  setNewNpcHP('')
                }}
                className="px-2 py-0.5 text-[10px] text-gray-400 hover:text-gray-200 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {!showNewNpcForm && (
          <p className="text-xs text-gray-500 text-center py-4">
            {isDM ? 'No NPCs in this campaign yet.' : 'No NPCs visible.'}
          </p>
        )}
      </div>
    )
  }

  const toggleRevealField = (npcId: string, field: 'description' | 'role' | 'personality' | 'motivation'): void => {
    if (!onUpdateNpc) return
    const npc = npcs.find((n) => n.id === npcId)
    if (!npc) return
    const current = npc.revealedFields ?? {}
    onUpdateNpc(npcId, {
      revealedFields: { ...current, [field]: !current[field] }
    })
  }

  const revealAllFields = (npcId: string): void => {
    if (!onUpdateNpc) return
    onUpdateNpc(npcId, {
      revealedFields: { description: true, role: true, personality: true, motivation: true }
    })
  }

  const hideAllFields = (npcId: string): void => {
    if (!onUpdateNpc) return
    onUpdateNpc(npcId, {
      revealedFields: { description: false, role: false, personality: false, motivation: false }
    })
  }

  const changeRole = (npcId: string, newRole: NPC['role']): void => {
    if (!onUpdateNpc) return
    onUpdateNpc(npcId, { role: newRole })
    setRoleMenuId(null)
  }

  const isFieldRevealed = (npc: NPC, field: 'description' | 'role' | 'personality' | 'motivation'): boolean => {
    return npc.revealedFields?.[field] ?? false
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">NPCs ({visibleNpcs.length})</h3>

      {/* New NPC button and form */}
      {isDM && !showNewNpcForm && (
        <button
          onClick={() => setShowNewNpcForm(true)}
          className="w-full py-2 text-xs text-gray-500 hover:text-amber-400 border border-dashed border-gray-700 hover:border-amber-600/50 rounded-lg transition-colors cursor-pointer"
        >
          + New NPC
        </button>
      )}
      {isDM && showNewNpcForm && (
        <div className="bg-gray-800/50 border border-gray-700/30 rounded-lg p-2.5 space-y-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">New NPC</span>
          <input
            type="text"
            value={newNpcName}
            onChange={(e) => setNewNpcName(e.target.value)}
            className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
            placeholder="Name"
            autoFocus
          />
          <select
            value={newNpcCategory}
            onChange={(e) => setNewNpcCategory(e.target.value as NewNpcCategory)}
            className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
          >
            <option value="npc">NPC</option>
            <option value="ally">Ally</option>
            <option value="enemy">Enemy</option>
          </select>
          <div className="flex gap-2">
            <input
              type="number"
              value={newNpcAC}
              onChange={(e) => setNewNpcAC(e.target.value)}
              className="w-1/2 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
              placeholder="AC"
              min={0}
            />
            <input
              type="number"
              value={newNpcHP}
              onChange={(e) => setNewNpcHP(e.target.value)}
              className="w-1/2 px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
              placeholder="HP"
              min={0}
            />
          </div>
          <div className="flex gap-1">
            <button
              onClick={handleCreateNpc}
              disabled={!newNpcName.trim()}
              className="px-2 py-0.5 text-[10px] bg-amber-600 hover:bg-amber-500 text-white rounded cursor-pointer disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowNewNpcForm(false)
                setNewNpcName('')
                setNewNpcCategory('npc')
                setNewNpcAC('')
                setNewNpcHP('')
              }}
              className="px-2 py-0.5 text-[10px] text-gray-400 hover:text-gray-200 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {visibleNpcs.map((npc) => {
          const isExpanded = expandedId === npc.id
          const statBlock = getEffectiveStatBlock(npc)
          const showingStats = showStatBlockId === npc.id

          return (
            <div key={npc.id} className="bg-gray-800/50 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : npc.id)}
                className="w-full flex items-center gap-2 p-2 text-sm text-left
                  hover:bg-gray-800 transition-colors cursor-pointer"
              >
                <span className={`text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
                <span className="flex-1 text-gray-200 truncate">{npc.name}</span>
                {/* Role badge — DM always sees, players only if revealed */}
                {npc.role && (isDM || isFieldRevealed(npc, 'role')) && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      npc.role === 'ally'
                        ? 'text-green-400 bg-green-400/10'
                        : npc.role === 'enemy'
                          ? 'text-red-400 bg-red-400/10'
                          : npc.role === 'patron'
                            ? 'text-purple-400 bg-purple-400/10'
                            : npc.role === 'shopkeeper'
                              ? 'text-yellow-400 bg-yellow-400/10'
                              : 'text-gray-400 bg-gray-400/10'
                    }`}
                  >
                    {npc.role}
                  </span>
                )}
                {isDM && npc.isVisible && (
                  <span className="text-[10px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">Visible</span>
                )}
                {isDM && !npc.isVisible && (
                  <span className="text-[10px] text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded">Hidden</span>
                )}
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 space-y-2">
                  {/* DM: Reveal controls */}
                  {isDM && onUpdateNpc && (
                    <div className="flex flex-wrap gap-1 pb-1 border-b border-gray-700/50">
                      <span className="text-[9px] text-gray-500 uppercase mr-1 self-center">Reveal:</span>
                      {(['description', 'role', 'personality', 'motivation'] as const).map((field) => (
                        <button
                          key={field}
                          onClick={() => toggleRevealField(npc.id, field)}
                          className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                            isFieldRevealed(npc, field)
                              ? 'bg-green-600/30 text-green-400 border border-green-500/30'
                              : 'bg-gray-700/50 text-gray-500 border border-gray-600/30'
                          }`}
                        >
                          {field}
                        </button>
                      ))}
                      <button
                        onClick={() => revealAllFields(npc.id)}
                        className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer bg-green-700/30 text-green-400 hover:bg-green-700/50 transition-colors"
                      >
                        All
                      </button>
                      <button
                        onClick={() => hideAllFields(npc.id)}
                        className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer bg-red-700/30 text-red-400 hover:bg-red-700/50 transition-colors"
                      >
                        None
                      </button>
                    </div>
                  )}

                  {/* Description: DM always sees, players only if revealed */}
                  {npc.description && (isDM || isFieldRevealed(npc, 'description')) && (
                    <p className="text-xs text-gray-400">{npc.description}</p>
                  )}
                  {/* Personality: DM always sees, players only if revealed */}
                  {npc.personality && (isDM || isFieldRevealed(npc, 'personality')) && (
                    <p className="text-xs text-gray-500">
                      <span className="text-amber-500 font-semibold">Personality: </span>
                      {npc.personality}
                    </p>
                  )}
                  {/* Motivation: DM always sees, players only if revealed */}
                  {npc.motivation && (isDM || isFieldRevealed(npc, 'motivation')) && (
                    <p className="text-xs text-gray-500">
                      <span className="text-amber-500 font-semibold">Motivation: </span>
                      {npc.motivation}
                    </p>
                  )}
                  {npc.location && (isDM || isFieldRevealed(npc, 'description')) && (
                    <p className="text-xs text-gray-500">
                      Location: <span className="text-gray-400">{npc.location}</span>
                    </p>
                  )}
                  {isDM && npc.notes && <p className="text-xs text-gray-500 italic">{npc.notes}</p>}

                  {/* Stat block summary — DM only */}
                  {isDM && statBlock && (
                    <div className="mt-1">
                      <MonsterStatBlockView monster={statBlock} compact />
                      <button
                        onClick={() => setShowStatBlockId(showingStats ? null : npc.id)}
                        className="text-[10px] text-amber-400 hover:text-amber-300 mt-1 cursor-pointer"
                      >
                        {showingStats ? 'Hide full stat block' : 'Show full stat block'}
                      </button>
                    </div>
                  )}

                  {/* Full stat block — DM only */}
                  {isDM && showingStats && statBlock && (
                    <div className="max-h-80 overflow-y-auto mt-1">
                      <MonsterStatBlockView monster={statBlock} />
                    </div>
                  )}

                  {/* DM role quick-switch */}
                  {isDM && onUpdateNpc && (
                    <div className="relative">
                      <button
                        onClick={() => setRoleMenuId(roleMenuId === npc.id ? null : npc.id)}
                        className="text-[10px] text-gray-400 hover:text-gray-200 cursor-pointer bg-gray-700/50 px-2 py-0.5 rounded"
                      >
                        Change Role...
                      </button>
                      {roleMenuId === npc.id && (
                        <div className="absolute z-10 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 w-32">
                          {(['neutral', 'ally', 'enemy', 'patron', 'shopkeeper'] as const).map((r) => (
                            <button
                              key={r}
                              onClick={() => changeRole(npc.id, r)}
                              className={`w-full text-left px-3 py-1 text-xs hover:bg-gray-700 cursor-pointer capitalize ${
                                npc.role === r ? 'text-amber-400' : 'text-gray-300'
                              }`}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {isDM && (
                    <div className="flex gap-1 pt-1">
                      <button
                        onClick={() => onAddToInitiative(npc)}
                        className="flex-1 py-1 text-[10px] rounded bg-gray-700 text-gray-300
                          hover:bg-amber-600 hover:text-white transition-colors cursor-pointer"
                      >
                        + Initiative
                      </button>
                      <button
                        onClick={() => onPlaceOnMap(npc)}
                        className="flex-1 py-1 text-[10px] rounded bg-gray-700 text-gray-300
                          hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
                      >
                        Place on Map
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
