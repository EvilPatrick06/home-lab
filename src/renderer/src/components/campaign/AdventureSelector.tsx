import { useEffect, useState } from 'react'
import { type Adventure, type AdventureChapter, loadAdventures } from '../../services/adventure-loader'
import type { CampaignType } from '../../types/campaign'
import type { GameSystem } from '../../types/game-system'
import { Card } from '../ui'

interface AdventureSelectorProps {
  system: GameSystem
  campaignType: CampaignType
  selectedAdventureId: string | null
  onSelectType: (type: CampaignType) => void
  onSelectAdventure: (adventureId: string | null) => void
  excludedNpcIds: string[]
  onExcludedNpcsChange: (ids: string[]) => void
  excludedLoreIds: string[]
  onExcludedLoreChange: (ids: string[]) => void
  excludedEncounterIds: string[]
  onExcludedEncounterChange: (ids: string[]) => void
  excludedMapIds: string[]
  onExcludedMapsChange: (ids: string[]) => void
}

const ADVENTURE_ICONS: Record<string, string> = {
  pick: '\u26CF',
  scroll: '\uD83D\uDCDC',
  sword: '\u2694',
  shield: '\uD83D\uDEE1',
  dragon: '\uD83D\uDC09',
  skull: '\uD83D\uDC80',
  fortress: '\uD83C\uDFF0',
  lighthouse: '\uD83C\uDF2C',
  potion: '\uD83E\uDDEA'
}

const ROLE_COLORS: Record<string, string> = {
  ally: 'bg-emerald-700/60 text-emerald-200',
  enemy: 'bg-red-700/60 text-red-200',
  neutral: 'bg-gray-600/60 text-gray-200',
  patron: 'bg-purple-700/60 text-purple-200',
  shopkeeper: 'bg-amber-700/60 text-amber-200'
}

const LORE_CATEGORY_COLORS: Record<string, string> = {
  location: 'bg-blue-700/60 text-blue-200',
  faction: 'bg-purple-700/60 text-purple-200',
  item: 'bg-amber-700/60 text-amber-200',
  world: 'bg-emerald-700/60 text-emerald-200',
  other: 'bg-gray-600/60 text-gray-200'
}

function CollapsibleSection({
  title,
  count,
  children,
  defaultOpen = false
}: {
  title: string
  count: number
  children: React.ReactNode
  defaultOpen?: boolean
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 bg-gray-900/60 hover:bg-gray-900/80 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-sm">{open ? '\u25BC' : '\u25B6'}</span>
          <span className="font-semibold text-sm">{title}</span>
          <span className="text-xs text-gray-500">({count})</span>
        </div>
      </button>
      {open && <div className="p-3 space-y-2 border-t border-gray-800">{children}</div>}
    </div>
  )
}

function ToggleRow({
  included,
  onToggle,
  children
}: {
  included: boolean
  onToggle: () => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <div
      className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
        included ? 'bg-gray-800/40' : 'bg-gray-800/20 opacity-50'
      }`}
    >
      <button
        onClick={onToggle}
        className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
          included ? 'bg-amber-500 border-amber-500 text-black' : 'border-gray-600 bg-gray-800 hover:border-gray-500'
        }`}
      >
        {included && <span className="text-xs font-bold">{'\u2713'}</span>}
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function ChapterDetail({ chapter, index }: { chapter: AdventureChapter; index: number }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-gray-800/30 rounded-lg p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-center gap-2 cursor-pointer"
      >
        <span className="text-gray-500 text-xs">{expanded ? '\u25BC' : '\u25B6'}</span>
        <span className="text-xs text-amber-400 font-mono">Ch. {index + 1}</span>
        <span className="text-sm font-semibold">{chapter.title}</span>
      </button>
      {expanded && (
        <div className="mt-2 ml-6 space-y-2">
          <p className="text-sm text-gray-400">{chapter.description}</p>
          {chapter.maps.length > 0 && <div className="text-xs text-gray-500">Maps: {chapter.maps.join(', ')}</div>}
          {chapter.encounters.length > 0 && (
            <div className="text-xs text-gray-500">Encounters: {chapter.encounters.join(', ')}</div>
          )}
          {chapter.keyEvents && chapter.keyEvents.length > 0 && (
            <div className="text-xs text-gray-500">Key Events: {chapter.keyEvents.join(', ')}</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AdventureSelector({
  system,
  campaignType,
  selectedAdventureId,
  onSelectType,
  onSelectAdventure,
  excludedNpcIds,
  onExcludedNpcsChange,
  excludedLoreIds,
  onExcludedLoreChange,
  excludedEncounterIds,
  onExcludedEncounterChange,
  excludedMapIds,
  onExcludedMapsChange
}: AdventureSelectorProps): JSX.Element {
  const [adventures, setAdventures] = useState<Adventure[]>([])
  const [loadingAdventures, setLoadingAdventures] = useState(false)

  useEffect(() => {
    setLoadingAdventures(true)
    loadAdventures()
      .then((data) => {
        setAdventures(data.filter((a) => a.system === system))
      })
      .finally(() => setLoadingAdventures(false))
  }, [system])

  const selectedAdventure = adventures.find((a) => a.id === selectedAdventureId) ?? null

  const toggleNpc = (id: string): void => {
    onExcludedNpcsChange(excludedNpcIds.includes(id) ? excludedNpcIds.filter((x) => x !== id) : [...excludedNpcIds, id])
  }

  const toggleLore = (id: string): void => {
    onExcludedLoreChange(
      excludedLoreIds.includes(id) ? excludedLoreIds.filter((x) => x !== id) : [...excludedLoreIds, id]
    )
  }

  const toggleEncounter = (id: string): void => {
    onExcludedEncounterChange(
      excludedEncounterIds.includes(id) ? excludedEncounterIds.filter((x) => x !== id) : [...excludedEncounterIds, id]
    )
  }

  const toggleMap = (id: string): void => {
    onExcludedMapsChange(excludedMapIds.includes(id) ? excludedMapIds.filter((x) => x !== id) : [...excludedMapIds, id])
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Campaign Type</h2>
      <p className="text-gray-400 text-sm mb-6">
        Start from a pre-made adventure or build your own world from scratch.
      </p>

      <div className="flex gap-4 max-w-2xl mb-6">
        <button
          onClick={() => {
            onSelectType('preset')
            onSelectAdventure(null)
          }}
          className={`flex-1 p-5 rounded-lg border text-left transition-all cursor-pointer
            ${
              campaignType === 'preset'
                ? 'border-amber-500 bg-amber-900/20'
                : 'border-gray-800 bg-gray-900/50 hover:border-gray-600'
            }`}
        >
          <div className="text-2xl mb-2">{'\uD83D\uDCD6'}</div>
          <div className="font-semibold">Start from Adventure</div>
          <div className="text-sm text-gray-400 mt-1">Choose a pre-built adventure module with maps and encounters</div>
        </button>

        <button
          onClick={() => {
            onSelectType('custom')
            onSelectAdventure(null)
          }}
          className={`flex-1 p-5 rounded-lg border text-left transition-all cursor-pointer
            ${
              campaignType === 'custom'
                ? 'border-amber-500 bg-amber-900/20'
                : 'border-gray-800 bg-gray-900/50 hover:border-gray-600'
            }`}
        >
          <div className="text-2xl mb-2">{'\u2728'}</div>
          <div className="font-semibold">Custom Campaign</div>
          <div className="text-sm text-gray-400 mt-1">Build your own world with custom maps, NPCs, and encounters</div>
        </button>
      </div>

      {campaignType === 'preset' && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Available Adventures</h3>
          {loadingAdventures ? (
            <div className="text-gray-500 py-4">Loading adventures...</div>
          ) : adventures.length === 0 ? (
            <div className="border border-dashed border-gray-700 rounded-lg p-8 text-center text-gray-500">
              <p>No adventures available for this system yet.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                {adventures.map((adventure) => (
                  <button
                    key={adventure.id}
                    onClick={() => onSelectAdventure(adventure.id)}
                    className="text-left cursor-pointer"
                  >
                    <Card
                      className={`transition-all h-full
                        ${
                          selectedAdventureId === adventure.id
                            ? 'border-2 border-amber-500 bg-amber-900/20 ring-2 ring-amber-500/30'
                            : 'hover:border-gray-600'
                        }`}
                    >
                      <div className="text-2xl mb-2">{ADVENTURE_ICONS[adventure.icon] || '\uD83D\uDCDC'}</div>
                      <div className="font-semibold mb-1">{adventure.name}</div>
                      <div className="text-sm text-gray-400 mb-3">{adventure.description}</div>
                      <div className="text-xs text-gray-500 flex gap-3">
                        <span>
                          {adventure.chapters.length} chapter{adventure.chapters.length !== 1 ? 's' : ''}
                        </span>
                        {adventure.npcs && adventure.npcs.length > 0 && (
                          <span>
                            {adventure.npcs.length} NPC{adventure.npcs.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </Card>
                  </button>
                ))}
              </div>

              {/* Detail panel for selected adventure */}
              {selectedAdventure && (
                <div className="max-w-2xl mt-6 border border-amber-500/30 rounded-lg bg-gray-900/60 p-5 space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{ADVENTURE_ICONS[selectedAdventure.icon] || '\uD83D\uDCDC'}</span>
                    <div>
                      <h3 className="text-lg font-bold">{selectedAdventure.name}</h3>
                      {selectedAdventure.levelRange && (
                        <span className="text-xs text-gray-400">
                          Levels {selectedAdventure.levelRange.min}&ndash;{selectedAdventure.levelRange.max}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Chapters */}
                  <CollapsibleSection title="Chapters" count={selectedAdventure.chapters.length} defaultOpen>
                    {selectedAdventure.chapters.map((ch, i) => (
                      <ChapterDetail key={i} chapter={ch} index={i} />
                    ))}
                  </CollapsibleSection>

                  {/* NPCs */}
                  {selectedAdventure.npcs && selectedAdventure.npcs.length > 0 && (
                    <CollapsibleSection title="NPCs" count={selectedAdventure.npcs.length}>
                      {selectedAdventure.npcs.map((npc) => (
                        <ToggleRow
                          key={npc.id}
                          included={!excludedNpcIds.includes(npc.id)}
                          onToggle={() => toggleNpc(npc.id)}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold">{npc.name}</span>
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded ${ROLE_COLORS[npc.role] || ROLE_COLORS.neutral}`}
                            >
                              {npc.role}
                            </span>
                            <span className="text-xs text-gray-500">{npc.location}</span>
                            {npc.statBlockId && (
                              <span className="text-xs text-gray-600 font-mono">[{npc.statBlockId}]</span>
                            )}
                          </div>
                        </ToggleRow>
                      ))}
                    </CollapsibleSection>
                  )}

                  {/* Lore */}
                  {selectedAdventure.lore && selectedAdventure.lore.length > 0 && (
                    <CollapsibleSection title="Lore" count={selectedAdventure.lore.length}>
                      {selectedAdventure.lore.map((lore) => (
                        <ToggleRow
                          key={lore.id}
                          included={!excludedLoreIds.includes(lore.id)}
                          onToggle={() => toggleLore(lore.id)}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">{lore.title}</span>
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded ${LORE_CATEGORY_COLORS[lore.category] || LORE_CATEGORY_COLORS.other}`}
                              >
                                {lore.category}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{lore.content}</p>
                          </div>
                        </ToggleRow>
                      ))}
                    </CollapsibleSection>
                  )}

                  {/* Encounters */}
                  {selectedAdventure.encounters && selectedAdventure.encounters.length > 0 && (
                    <CollapsibleSection title="Encounters" count={selectedAdventure.encounters.length}>
                      {selectedAdventure.encounters.map((enc) => (
                        <ToggleRow
                          key={enc.id}
                          included={!excludedEncounterIds.includes(enc.id)}
                          onToggle={() => toggleEncounter(enc.id)}
                        >
                          <div>
                            <span className="text-sm font-semibold">{enc.name}</span>
                            <span className="text-xs text-gray-500 ml-2">
                              {enc.monsters.map((m) => `${m.monsterId} x${m.count}`).join(', ')}
                            </span>
                          </div>
                        </ToggleRow>
                      ))}
                    </CollapsibleSection>
                  )}

                  {/* Maps */}
                  {selectedAdventure.mapAssignments && selectedAdventure.mapAssignments.length > 0 && (
                    <CollapsibleSection title="Maps" count={selectedAdventure.mapAssignments.length}>
                      {selectedAdventure.mapAssignments.map((assign) => {
                        const chapter = selectedAdventure.chapters[assign.chapterIndex]
                        return (
                          <ToggleRow
                            key={assign.builtInMapId}
                            included={!excludedMapIds.includes(assign.builtInMapId)}
                            onToggle={() => toggleMap(assign.builtInMapId)}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">{assign.builtInMapId}</span>
                              {chapter && (
                                <span className="text-xs text-gray-500">
                                  Ch. {assign.chapterIndex + 1}: {chapter.title}
                                </span>
                              )}
                            </div>
                          </ToggleRow>
                        )
                      })}
                    </CollapsibleSection>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
