import { useEffect, useState } from 'react'
import { MonsterStatBlockView } from '../../components/game/dm'
import StatBlockEditor from '../../components/game/dm/StatBlockEditor'
import { Button, Card, Modal } from '../../components/ui'
import { addToast } from '../../hooks/use-toast'
import { load5eMonsterById, loadAllStatBlocks, searchMonsters } from '../../services/data-provider'
import { exportEntities, importEntities, reIdItems } from '../../services/io/entity-io'
import type { Campaign, NPC } from '../../types/campaign'
import type { MonsterStatBlock } from '../../types/monster'

interface NPCManagerProps {
  campaign: Campaign
  saveCampaign: (c: Campaign) => Promise<void>
}

export default function NPCManager({ campaign, saveCampaign }: NPCManagerProps): JSX.Element {
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<NPC | null>(null)
  const [form, setForm] = useState<{
    name: string
    description: string
    location: string
    isVisible: boolean
    notes: string
    role: NPC['role']
    personality: string
    motivation: string
    statBlockId: string
    customStats: Partial<MonsterStatBlock> | undefined
    statBlockMode: 'none' | 'link' | 'custom'
  }>({
    name: '',
    description: '',
    location: '',
    isVisible: true,
    notes: '',
    role: undefined,
    personality: '',
    motivation: '',
    statBlockId: '',
    customStats: undefined,
    statBlockMode: 'none'
  })
  const [monsterSearchQuery, setMonsterSearchQuery] = useState('')
  const [monsterSearchResults, setMonsterSearchResults] = useState<MonsterStatBlock[]>([])
  const [linkedMonsterPreview, setLinkedMonsterPreview] = useState<MonsterStatBlock | null>(null)
  const [allMonsters, setAllMonsters] = useState<MonsterStatBlock[]>([])
  const [npcStatBlocks, setNpcStatBlocks] = useState<Record<string, MonsterStatBlock>>({})
  const [expandedNpcStatBlock, setExpandedNpcStatBlock] = useState<string | null>(null)

  // Load stat blocks for NPCs that have statBlockId
  useEffect(() => {
    const loadNpcStatBlocks = async (): Promise<void> => {
      const loaded: Record<string, MonsterStatBlock> = {}
      for (const npc of campaign.npcs) {
        if (npc.statBlockId && !npcStatBlocks[npc.statBlockId]) {
          const block = await load5eMonsterById(npc.statBlockId)
          if (block) loaded[npc.statBlockId] = block
        }
      }
      if (Object.keys(loaded).length > 0) {
        setNpcStatBlocks((prev) => ({ ...prev, ...loaded }))
      }
    }
    loadNpcStatBlocks()
  }, [campaign.npcs, npcStatBlocks]) // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = (): void => {
    setEditing(null)
    setForm({
      name: '',
      description: '',
      location: '',
      isVisible: true,
      notes: '',
      role: undefined,
      personality: '',
      motivation: '',
      statBlockId: '',
      customStats: undefined,
      statBlockMode: 'none'
    })
    setLinkedMonsterPreview(null)
    setMonsterSearchQuery('')
    setMonsterSearchResults([])
    setShowModal(true)
  }
  const openEdit = (npc: NPC): void => {
    setEditing(npc)
    const mode = npc.customStats ? 'custom' : npc.statBlockId ? 'link' : 'none'
    setForm({
      name: npc.name,
      description: npc.description,
      location: npc.location ?? '',
      isVisible: npc.isVisible,
      notes: npc.notes,
      role: npc.role,
      personality: npc.personality ?? '',
      motivation: npc.motivation ?? '',
      statBlockId: npc.statBlockId ?? '',
      customStats: npc.customStats,
      statBlockMode: mode
    })
    setLinkedMonsterPreview(null)
    if (npc.statBlockId) {
      load5eMonsterById(npc.statBlockId).then((m) => {
        if (m) setLinkedMonsterPreview(m)
      })
    }
    setShowModal(true)
  }

  const handleSave = async (): Promise<void> => {
    if (!form.name.trim()) return
    const npcData: Omit<NPC, 'id'> = {
      name: form.name.trim(),
      description: form.description,
      location: form.location || undefined,
      isVisible: form.isVisible,
      notes: form.notes,
      role: form.role,
      personality: form.personality || undefined,
      motivation: form.motivation || undefined,
      statBlockId: form.statBlockMode === 'link' && form.statBlockId ? form.statBlockId : undefined,
      customStats: form.statBlockMode === 'custom' ? form.customStats : undefined
    }
    let npcs: NPC[]
    if (editing) {
      npcs = campaign.npcs.map((n) => (n.id === editing.id ? { ...n, ...npcData } : n))
    } else {
      npcs = [...campaign.npcs, { id: crypto.randomUUID(), ...npcData }]
    }
    await saveCampaign({ ...campaign, npcs, updatedAt: new Date().toISOString() })
    setShowModal(false)
  }

  const handleMonsterSearch = (query: string): void => {
    setMonsterSearchQuery(query)
    if (query.length < 2) {
      setMonsterSearchResults([])
      return
    }
    if (allMonsters.length === 0) {
      loadAllStatBlocks().then((all) => {
        setAllMonsters(all)
        setMonsterSearchResults(searchMonsters(all, query).slice(0, 10))
      })
    } else {
      setMonsterSearchResults(searchMonsters(allMonsters, query).slice(0, 10))
    }
  }

  const handleDelete = async (npcId: string): Promise<void> => {
    await saveCampaign({
      ...campaign,
      npcs: campaign.npcs.filter((n) => n.id !== npcId),
      updatedAt: new Date().toISOString()
    })
  }

  const handleExport = async (): Promise<void> => {
    if (!campaign.npcs.length) return
    try {
      const ok = await exportEntities('npc', campaign.npcs)
      if (ok) addToast(`Exported ${campaign.npcs.length} NPC(s)`, 'success')
    } catch {
      addToast('NPC export failed', 'error')
    }
  }
  const handleImport = async (): Promise<void> => {
    try {
      const result = await importEntities<NPC>('npc')
      if (!result) return
      const items = reIdItems(result.items)
      const npcs = [...campaign.npcs, ...items]
      await saveCampaign({ ...campaign, npcs, updatedAt: new Date().toISOString() })
      addToast(`Imported ${items.length} NPC(s)`, 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'NPC import failed', 'error')
    }
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">NPCs ({campaign.npcs.length})</h3>
          <div className="flex items-center gap-2">
            <button onClick={handleImport} className="text-[10px] text-gray-400 hover:text-amber-400 cursor-pointer">
              Import
            </button>
            {campaign.npcs.length > 0 && (
              <button onClick={handleExport} className="text-[10px] text-gray-400 hover:text-amber-400 cursor-pointer">
                Export All
              </button>
            )}
          </div>
        </div>
        {campaign.npcs.length === 0 ? (
          <p className="text-gray-500 text-sm">No NPCs added yet.</p>
        ) : (
          <div className="space-y-2">
            {campaign.npcs.map((npc) => {
              const npcLinkedBlock = npc.statBlockId ? npcStatBlocks[npc.statBlockId] : undefined
              const npcBlock = npc.customStats ?? npcLinkedBlock
              const isStatExpanded = expandedNpcStatBlock === npc.id
              return (
                <div key={npc.id} className="bg-gray-800/50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm">{npc.name}</span>
                      {npc.role && <span className="text-[10px] text-gray-400 ml-2 capitalize">{npc.role}</span>}
                      {npc.location && <span className="text-gray-500 text-xs ml-2">{npc.location}</span>}
                      {npc.description && <p className="text-gray-500 text-xs mt-0.5 truncate">{npc.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          npc.isVisible ? 'bg-green-900/40 text-green-300' : 'bg-gray-800 text-gray-500'
                        }`}
                      >
                        {npc.isVisible ? 'Visible' : 'Hidden'}
                      </span>
                      <button
                        onClick={() => openEdit(npc)}
                        className="text-xs text-gray-400 hover:text-amber-400 cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(npc.id)}
                        className="text-xs text-gray-400 hover:text-red-400 cursor-pointer"
                      >
                        Del
                      </button>
                    </div>
                  </div>
                  {/* Expandable stat block */}
                  {npcBlock ? (
                    <div className="mt-2">
                      <button
                        onClick={() => setExpandedNpcStatBlock(isStatExpanded ? null : npc.id)}
                        className="text-[10px] text-amber-400 hover:text-amber-300 cursor-pointer"
                      >
                        {isStatExpanded ? 'Hide Stat Block' : `Show Stat Block (${npcBlock.name ?? npc.name})`}
                      </button>
                      {isStatExpanded && (
                        <div className="mt-1 max-h-80 overflow-y-auto">
                          <MonsterStatBlockView monster={npcBlock as MonsterStatBlock} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-1">
                      <button
                        onClick={() => openEdit(npc)}
                        className="text-[10px] text-gray-500 hover:text-amber-400 cursor-pointer"
                      >
                        No stat block — click Edit to assign
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <button onClick={openAdd} className="mt-3 text-xs text-amber-400 hover:text-amber-300 cursor-pointer">
          + Add NPC
        </button>
      </Card>

      {/* NPC Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit NPC' : 'Add NPC'}>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {/* Quick Add from Bestiary */}
          <div className="border border-amber-800/30 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-amber-900/20">
              <label className="block text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2">
                Quick Add from Bestiary
              </label>
              <input
                type="text"
                value={monsterSearchQuery}
                onChange={(e) => handleMonsterSearch(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
                placeholder="Search monsters by name, type, or tag..."
              />
            </div>
            {monsterSearchResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto border-t border-gray-700">
                {monsterSearchResults.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setForm((f) => ({
                        ...f,
                        name: m.name,
                        role: 'enemy',
                        description: `${m.size} ${m.type}${m.subtype ? ` (${m.subtype})` : ''}, CR ${m.cr}`,
                        statBlockId: m.id,
                        statBlockMode: 'link'
                      }))
                      setLinkedMonsterPreview(m)
                      setMonsterSearchQuery(m.name)
                      setMonsterSearchResults([])
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-gray-700/50 cursor-pointer flex items-center justify-between border-b border-gray-700/30 last:border-b-0"
                  >
                    <span className="text-gray-200 font-medium">{m.name}</span>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="text-gray-500">
                        {m.size} {m.type}
                      </span>
                      <span className="text-amber-400 font-mono">CR {m.cr}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {linkedMonsterPreview && form.statBlockMode === 'link' && monsterSearchResults.length === 0 && (
              <div className="border-t border-gray-700/50 p-2">
                <MonsterStatBlockView monster={linkedMonsterPreview} compact />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-gray-400 text-xs mb-1">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
                placeholder="NPC name"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1">Role</label>
              <select
                value={form.role ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: e.target.value ? (e.target.value as NPC['role']) : undefined }))
                }
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
              >
                <option value="">None</option>
                <option value="ally">Ally</option>
                <option value="enemy">Enemy</option>
                <option value="neutral">Neutral</option>
                <option value="patron">Patron</option>
                <option value="shopkeeper">Shopkeeper</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
                placeholder="Where they can be found"
              />
            </div>
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 h-16 resize-none"
              placeholder="Brief description"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 text-xs mb-1">Personality</label>
              <input
                type="text"
                value={form.personality}
                onChange={(e) => setForm((f) => ({ ...f, personality: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
                placeholder="Gruff but kind-hearted"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1">Motivation</label>
              <input
                type="text"
                value={form.motivation}
                onChange={(e) => setForm((f) => ({ ...f, motivation: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
                placeholder="Protect the village"
              />
            </div>
          </div>
          <div>
            <label className="block text-gray-400 text-xs mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 h-16 resize-none"
              placeholder="DM notes"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={form.isVisible}
              onChange={(e) => setForm((f) => ({ ...f, isVisible: e.target.checked }))}
              className="rounded"
            />
            Visible to players
          </label>

          {/* Stat Block Section */}
          <div className="border-t border-gray-700 pt-3">
            <label className="block text-gray-400 text-xs mb-2 font-semibold uppercase tracking-wider">
              Stat Block
            </label>
            <div className="flex gap-2 mb-2">
              {(['none', 'link', 'custom'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setForm((f) => ({ ...f, statBlockMode: mode }))}
                  className={`px-3 py-1 text-xs rounded-lg cursor-pointer ${
                    form.statBlockMode === mode
                      ? 'bg-amber-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {mode === 'none' ? 'None' : mode === 'link' ? 'Link to Monster' : 'Custom'}
                </button>
              ))}
            </div>

            {form.statBlockMode === 'link' && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={monsterSearchQuery}
                  onChange={(e) => handleMonsterSearch(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
                  placeholder="Search monsters..."
                />
                {monsterSearchResults.length > 0 && (
                  <div className="bg-gray-800 border border-gray-700 rounded max-h-40 overflow-y-auto">
                    {monsterSearchResults.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setForm((f) => ({ ...f, statBlockId: m.id }))
                          setLinkedMonsterPreview(m)
                          setMonsterSearchQuery(m.name)
                          setMonsterSearchResults([])
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 cursor-pointer flex items-center justify-between ${
                          form.statBlockId === m.id ? 'text-amber-400' : 'text-gray-300'
                        }`}
                      >
                        <span>{m.name}</span>
                        <span className="text-gray-500">
                          {m.type} &middot; CR {m.cr}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {linkedMonsterPreview && (
                  <div className="mt-2">
                    <MonsterStatBlockView monster={linkedMonsterPreview} compact />
                  </div>
                )}
              </div>
            )}

            {form.statBlockMode === 'custom' && (
              <StatBlockEditor
                value={form.customStats ?? { name: form.name }}
                onChange={(stats) => setForm((f) => ({ ...f, customStats: stats }))}
              />
            )}
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-4">
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!form.name.trim()}>
            {editing ? 'Save' : 'Add'}
          </Button>
        </div>
      </Modal>
    </>
  )
}
