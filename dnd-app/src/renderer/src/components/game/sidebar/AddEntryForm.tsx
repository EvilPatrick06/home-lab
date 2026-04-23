import { useState } from 'react'
import type { PlaceType, SidebarCategory, SidebarEntry, SidebarEntryStatBlock } from '../../../types/game-state'
import type { GameMap, MapToken } from '../../../types/map'
import type { MonsterStatBlock } from '../../../types/monster'
import { monsterToSidebar } from '../../../utils/stat-block-converter'
import CreatureSearchModal from './CreatureSearchModal'
import { NPC_TEMPLATES } from './npc-templates'
import RandomNpcGenerator from './RandomNpcGenerator'
import StatBlockForm from './StatBlockForm'

const PLACE_TYPES: PlaceType[] = [
  'world',
  'continent',
  'kingdom',
  'province',
  'city',
  'district',
  'building',
  'room',
  'dungeon',
  'landmark'
]

interface AddEntryFormProps {
  category: SidebarCategory
  entries: SidebarEntry[]
  maps: GameMap[]
  boardTokens: MapToken[]
  onAdd: (entry: SidebarEntry) => void
  onCancel: () => void
}

export default function AddEntryForm({
  category,
  entries,
  maps,
  boardTokens,
  onAdd,
  onCancel
}: AddEntryFormProps): JSX.Element {
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newVisible, setNewVisible] = useState(false)
  const [newStatBlock, setNewStatBlock] = useState<SidebarEntryStatBlock | undefined>(undefined)
  const [showNewStatBlock, setShowNewStatBlock] = useState(false)
  const [showNpcGenerator, setShowNpcGenerator] = useState(false)
  const [creatureSearchOpen, setCreatureSearchOpen] = useState(false)

  // Places-specific state
  const [newPlaceType, setNewPlaceType] = useState<PlaceType | ''>('')
  const [newParentId, setNewParentId] = useState<string>('')
  const [newLinkedMapId, setNewLinkedMapId] = useState<string>('')

  const isPlaces = category === 'places'

  // Filter out tokens that already have a sidebar entry with the same entityId
  const existingEntityIds = new Set(entries.map((e) => e.sourceId).filter(Boolean))
  const availableBoardTokens = boardTokens.filter((t) => !existingEntityIds.has(t.id))

  const handleQuickAddFromToken = (token: MapToken): void => {
    const desc = [
      token.entityType ? `Type: ${token.entityType}` : '',
      token.ac ? `AC ${token.ac}` : '',
      token.maxHP ? `HP ${token.currentHP ?? token.maxHP}/${token.maxHP}` : '',
      token.walkSpeed ? `Speed ${token.walkSpeed} ft` : ''
    ]
      .filter(Boolean)
      .join(' | ')
    setNewName(token.label)
    setNewDesc(desc)
  }

  const importCreature = (monster: MonsterStatBlock): void => {
    const sidebarSB = monsterToSidebar(monster)
    setNewName(monster.name)
    setNewDesc(`${monster.size} ${monster.type} | CR ${monster.cr}`)
    setNewStatBlock(sidebarSB)
    setShowNewStatBlock(true)
    setCreatureSearchOpen(false)
  }

  const handleAdd = (): void => {
    if (!newName.trim()) return
    const newEntry: SidebarEntry = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      description: newDesc.trim() || undefined,
      visibleToPlayers: newVisible,
      isAutoPopulated: false,
      statBlock: showNewStatBlock ? newStatBlock : undefined
    }
    if (isPlaces) {
      if (newPlaceType) newEntry.placeType = newPlaceType
      if (newParentId) newEntry.parentId = newParentId
      if (newLinkedMapId) newEntry.linkedMapId = newLinkedMapId
    }
    onAdd(newEntry)
  }

  return (
    <>
      <div className="bg-gray-800/30 border border-gray-700/30 rounded-lg p-2.5 space-y-2">
        {/* Quick Add from Board Tokens (not for places) */}
        {!isPlaces && availableBoardTokens.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
              Quick Add from Board
            </span>
            <div className="max-h-24 overflow-y-auto space-y-0.5">
              {availableBoardTokens.map((token) => (
                <button
                  key={token.id}
                  onClick={() => handleQuickAddFromToken(token)}
                  className="w-full flex items-center gap-1.5 px-2 py-1 rounded bg-gray-900/50 hover:bg-gray-800 text-left transition-colors cursor-pointer"
                >
                  <span
                    className="w-4 h-4 rounded-full shrink-0 border border-gray-600 flex items-center justify-center text-[8px] text-white font-bold"
                    style={{
                      backgroundColor: token.color || (token.entityType === 'enemy' ? '#dc2626' : '#2563eb')
                    }}
                  >
                    {token.label.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-300 truncate">{token.label}</span>
                  {token.ac && <span className="text-[9px] text-gray-500 shrink-0 ml-auto">AC {token.ac}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Import from Creature DB (allies/enemies only) */}
        {!isPlaces && (
          <button
            onClick={() => setCreatureSearchOpen(true)}
            className="w-full py-1.5 text-[10px] text-center text-purple-400 bg-purple-400/10 hover:bg-purple-400/20 border border-purple-500/30 rounded cursor-pointer transition-colors"
          >
            Import from Creature DB
          </button>
        )}

        {/* Use Template dropdown (allies/enemies only) */}
        {!isPlaces && (
          <select
            value=""
            onChange={(e) => {
              const template = NPC_TEMPLATES.find((t) => t.name === e.target.value)
              if (template) {
                setNewName(template.name)
                setNewStatBlock({ ...template.statBlock })
                setShowNewStatBlock(true)
              }
            }}
            className="w-full px-2 py-1.5 rounded bg-gray-900 border border-gray-700 text-[10px] text-gray-400 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="">Use Template...</option>
            {NPC_TEMPLATES.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} (CR {t.statBlock.cr})
              </option>
            ))}
          </select>
        )}

        {/* Generate Random NPC (allies/enemies only) */}
        {!isPlaces && !showNpcGenerator && (
          <button
            onClick={() => setShowNpcGenerator(true)}
            className="w-full py-1.5 text-[10px] text-center text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 border border-emerald-500/30 rounded cursor-pointer transition-colors"
          >
            Generate Random NPC
          </button>
        )}

        {/* Random NPC Generator inline section */}
        {!isPlaces && showNpcGenerator && (
          <RandomNpcGenerator
            onAccept={(name, desc) => {
              setNewName(name)
              setNewDesc(desc)
              setShowNpcGenerator(false)
            }}
            onCancel={() => setShowNpcGenerator(false)}
          />
        )}

        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
          placeholder="Name"
        />

        {/* Places-specific fields */}
        {isPlaces && (
          <>
            <select
              value={newPlaceType}
              onChange={(e) => setNewPlaceType(e.target.value as PlaceType | '')}
              className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
            >
              <option value="">Place type (optional)</option>
              {PLACE_TYPES.map((pt) => (
                <option key={pt} value={pt}>
                  {pt.charAt(0).toUpperCase() + pt.slice(1)}
                </option>
              ))}
            </select>
            <select
              value={newParentId}
              onChange={(e) => setNewParentId(e.target.value)}
              className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
            >
              <option value="">Parent (root level)</option>
              {entries.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <select
              value={newLinkedMapId}
              onChange={(e) => setNewLinkedMapId(e.target.value)}
              className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500"
            >
              <option value="">Linked map (optional)</option>
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </>
        )}

        <textarea
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          className="w-full px-2 py-1 rounded bg-gray-900 border border-gray-700 text-xs text-gray-100 focus:outline-none focus:border-amber-500 resize-none"
          rows={2}
          placeholder="Description (optional)"
        />

        {/* Visibility toggle */}
        <label className="flex items-center gap-1.5 text-[10px] text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={newVisible}
            onChange={(e) => setNewVisible(e.target.checked)}
            className="accent-amber-500"
          />
          Visible to players
        </label>

        {/* Stat Block section (allies/enemies only) */}
        {!isPlaces && (
          <div className="border border-gray-700/40 rounded">
            <button
              type="button"
              onClick={() => setShowNewStatBlock(!showNewStatBlock)}
              className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold text-gray-300 hover:text-amber-400 transition-colors cursor-pointer"
            >
              <span>Stat Block {newStatBlock ? '(configured)' : ''}</span>
              <span className="text-gray-500 text-[10px]">{showNewStatBlock ? '\u25B2' : '\u25BC'}</span>
            </button>
            {showNewStatBlock && (
              <div className="px-2 pb-2">
                <StatBlockForm statBlock={newStatBlock} onChange={setNewStatBlock} />
              </div>
            )}
          </div>
        )}

        <div className="flex gap-1">
          <button
            onClick={handleAdd}
            disabled={!newName.trim()}
            className="px-2 py-0.5 text-[10px] bg-amber-600 hover:bg-amber-500 text-white rounded cursor-pointer disabled:opacity-50"
          >
            Add
          </button>
          <button
            onClick={onCancel}
            className="px-2 py-0.5 text-[10px] text-gray-400 hover:text-gray-200 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Creature DB Search Modal for import into add form */}
      <CreatureSearchModal
        open={creatureSearchOpen}
        onClose={() => setCreatureSearchOpen(false)}
        title="Import from Creature DB"
        onSelect={importCreature}
      />
    </>
  )
}
