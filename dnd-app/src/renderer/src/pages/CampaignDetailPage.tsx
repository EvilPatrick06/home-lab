import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { BackButton, Button, Card, ConfirmDialog } from '../components/ui'
import { addToast } from '../hooks/use-toast'
import { configureForCloud } from '../network'
import { exportCampaignToFile } from '../services/io/campaign-io'
import { exportEntities, importEntities, reIdItems } from '../services/io/entity-io'
import { useCampaignStore } from '../stores/use-campaign-store'
import { useNetworkStore } from '../stores/network-store'
import type { Campaign } from '../types/campaign'
import { GAME_SYSTEMS } from '../types/game-system'
import type { MonsterStatBlock } from '../types/monster'
import { logger } from '../utils/logger'
import AdventureManager from './campaign-detail/AdventureManager'
import LoreManager from './campaign-detail/LoreManager'
import NPCManager from './campaign-detail/NPCManager'
import RuleManager from './campaign-detail/RuleManager'

const AiDmCard = lazy(() => import('./campaign-detail/AiDmCard'))
const AudioManager = lazy(() => import('./campaign-detail/AudioManager'))
const MonsterLinker = lazy(() => import('./campaign-detail/MonsterLinker'))
const JournalEntryModal = lazy(() => import('../components/campaign/JournalEntryModal'))
const CalendarCard = lazy(() => import('./campaign-detail/CalendarCard'))
const MapManager = lazy(() => import('./campaign-detail/MapManager'))
const MetricsCard = lazy(() => import('./campaign-detail/MetricsCard'))
const OverviewCard = lazy(() => import('./campaign-detail/OverviewCard'))
const SessionZeroCard = lazy(() => import('./campaign-detail/SessionZeroCard'))
const TimelineCard = lazy(() => import('./campaign-detail/TimelineCard'))

export default function CampaignDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { campaigns, loading, loadCampaigns, deleteCampaign, saveCampaign } = useCampaignStore()
  const { hostGame } = useNetworkStore()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showCloudFallback, setShowCloudFallback] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [starting, setStarting] = useState(false)
  const [linkedMonster, setLinkedMonster] = useState<MonsterStatBlock | null>(null)

  const [showJournalModal, setShowJournalModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState<import('../types/campaign').JournalEntry | null>(null)

  const campaign: Campaign | undefined = campaigns.find((c) => c.id === id)

  useEffect(() => {
    if (campaigns.length === 0) {
      loadCampaigns()
    }
  }, [campaigns.length, loadCampaigns])

  const handleDelete = async (): Promise<void> => {
    if (!id) return
    await deleteCampaign(id)
    addToast('Campaign deleted', 'success')
    navigate('/')
  }

  const handleStartGame = async (): Promise<void> => {
    if (!campaign) return
    setStarting(true)
    try {
      const networkState = useNetworkStore.getState()
      if (networkState.role !== 'none') {
        networkState.disconnect()
      }
      await hostGame('Dungeon Master', campaign.inviteCode)
      navigate(`/lobby/${campaign.id}`)
    } catch (error) {
      logger.error('Failed to start game:', error)
      addToast('Could not connect to local server', 'error')
      setStarting(false)
      setShowCloudFallback(true)
    }
  }

  const handleCloudFallback = async (): Promise<void> => {
    if (!campaign) return
    setShowCloudFallback(false)
    setStarting(true)
    try {
      const networkState = useNetworkStore.getState()
      if (networkState.role !== 'none') {
        networkState.disconnect()
      }
      configureForCloud()
      addToast('Connecting via cloud servers...', 'info')
      await hostGame('Dungeon Master', campaign.inviteCode)
      navigate(`/lobby/${campaign.id}`)
    } catch (error) {
      logger.error('Failed to start game via cloud:', error)
      addToast('Cloud connection also failed. Check your internet.', 'error')
      setStarting(false)
    }
  }

  const handleStartSolo = (): void => {
    if (!campaign) return
    const networkState = useNetworkStore.getState()
    if (networkState.role !== 'none') {
      networkState.disconnect()
    }
    navigate(`/game/${campaign.id}`)
  }

  const handleExport = async (): Promise<void> => {
    if (!campaign) return
    setExporting(true)
    try {
      await exportCampaignToFile(campaign)
      addToast('Campaign exported', 'success')
    } catch (error) {
      logger.error('Failed to export campaign:', error)
      addToast('Failed to export campaign', 'error')
    } finally {
      setExporting(false)
    }
  }

  // --- Journal import/export ---
  const handleExportJournal = async (entries: import('../types/campaign').JournalEntry[]): Promise<void> => {
    if (!entries.length) return
    try {
      const ok = await exportEntities('journal', entries)
      if (ok) addToast(`Exported ${entries.length} journal entry(ies)`, 'success')
    } catch {
      addToast('Journal export failed', 'error')
    }
  }
  const handleImportJournal = async (): Promise<void> => {
    if (!campaign) return
    try {
      const result = await importEntities<import('../types/campaign').JournalEntry>('journal')
      if (!result) return
      const items = reIdItems(result.items)
      const entries = [...campaign.journal.entries, ...items]
      await saveCampaign({ ...campaign, journal: { entries }, updatedAt: new Date().toISOString() })
      addToast(`Imported ${items.length} journal entry(ies)`, 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Journal import failed', 'error')
    }
  }

  const handleSaveJournalEntry = async (entryData: { title: string; content: string; isPrivate: boolean }) => {
    if (!campaign) return
    const entries = [...campaign.journal.entries]

    if (editingEntry) {
      const idx = entries.findIndex((e) => e.id === editingEntry.id)
      if (idx >= 0) {
        entries[idx] = { ...entries[idx], ...entryData }
      }
    } else {
      const maxSession = entries.reduce((max, e) => Math.max(max, e.sessionNumber), 0)
      entries.push({
        id: crypto.randomUUID(),
        sessionNumber: maxSession + 1,
        date: new Date().toISOString(),
        title: entryData.title,
        content: entryData.content,
        isPrivate: entryData.isPrivate,
        authorId: 'dm',
        createdAt: new Date().toISOString()
      })
    }

    await saveCampaign({ ...campaign, journal: { entries }, updatedAt: new Date().toISOString() })
    setEditingEntry(null)
    setShowJournalModal(false)
    addToast(editingEntry ? 'Entry updated' : 'Entry created', 'success')
  }

  const handleDeleteJournalEntry = async (entryId: string) => {
    if (!campaign) return
    const entries = campaign.journal.entries.filter((e) => e.id !== entryId)
    await saveCampaign({ ...campaign, journal: { entries }, updatedAt: new Date().toISOString() })
    addToast('Entry deleted', 'success')
  }

  if (loading) {
    return (
      <div className="p-8 h-screen overflow-y-auto">
        <BackButton to="/" />
        <div className="text-center text-gray-500 py-12">Loading campaign...</div>
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="p-8 h-screen overflow-y-auto">
        <BackButton to="/" />
        <div className="text-center text-gray-500 py-12">
          <p className="text-xl mb-2">Campaign not found</p>
          <p className="text-sm">This campaign may have been deleted.</p>
        </div>
      </div>
    )
  }

  const systemConfig = GAME_SYSTEMS[campaign.system] ?? {
    id: campaign.system,
    name: campaign.system,
    shortName: campaign.system,
    maxLevel: 20,
    dataPath: '',
    referenceLabel: ''
  }

  return (
    <div className="p-8 h-screen overflow-y-auto">
      <BackButton to="/" />

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-1">{campaign.name}</h1>
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <span>{systemConfig.name}</span>
            <span className="text-gray-600">|</span>
            <span className="capitalize">{campaign.type} campaign</span>
            <span className="text-gray-600">|</span>
            <span>
              Invite: <span className="text-amber-400 font-mono">{campaign.inviteCode}</span>
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => navigate(`/library?from=/campaign/${id}`)}>
            Library
          </Button>
          <Button variant="secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export'}
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              if (campaign.archived) {
                await useCampaignStore.getState().unarchiveCampaign(campaign.id)
                addToast('Campaign unarchived', 'success')
              } else {
                await useCampaignStore.getState().archiveCampaign(campaign.id)
                addToast('Campaign archived', 'success')
                navigate('/')
              }
            }}
          >
            {campaign.archived ? 'Unarchive' : 'Archive'}
          </Button>
          <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>
            Delete
          </Button>
          <Button variant="secondary" onClick={handleStartSolo}>
            Solo Play
          </Button>
          <Button onClick={handleStartGame} disabled={starting}>
            {starting ? 'Starting...' : 'Host Game'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
        <Suspense fallback={null}>
          <OverviewCard campaign={campaign} saveCampaign={saveCampaign} />
        </Suspense>

        <Suspense fallback={null}>
          <MapManager campaign={campaign} saveCampaign={saveCampaign} />
        </Suspense>

        <NPCManager campaign={campaign} saveCampaign={saveCampaign} />

        <RuleManager campaign={campaign} saveCampaign={saveCampaign} />

        <LoreManager campaign={campaign} saveCampaign={saveCampaign} />

        {/* Players */}
        <Card title={`Previous Players (${campaign.players.length})`}>
          <p className="text-gray-500 text-sm mb-3">
            Players join your campaign through the lobby when you host a game.
          </p>
          {campaign.players.length > 0 && (
            <div className="space-y-2">
              {campaign.players.map((player) => (
                <div key={player.userId} className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3">
                  <div>
                    <span className="font-semibold text-sm">{player.displayName}</span>
                    <span className="text-gray-500 text-xs ml-2">
                      Joined {new Date(player.joinedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Suspense fallback={null}>
          <SessionZeroCard campaign={campaign} saveCampaign={saveCampaign} />
        </Suspense>

        <AdventureManager campaign={campaign} saveCampaign={saveCampaign} />

        {/* Campaign Metrics */}
        <Suspense fallback={null}>
          <MetricsCard campaign={campaign} />
        </Suspense>

        {/* Campaign Timeline */}
        <Suspense fallback={null}>
          <TimelineCard campaign={campaign} saveCampaign={saveCampaign} />
        </Suspense>

        {/* Loot History */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">Loot History ({campaign.lootHistory?.length ?? 0})</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const desc = window.prompt('Enter loot description:')
                  if (!desc) return
                  const val = window.prompt('Enter value (optional):') || undefined
                  const maxSession = campaign.journal.entries.reduce((max, e) => Math.max(max, e.sessionNumber), 0)

                  const newEntry = {
                    id: crypto.randomUUID(),
                    date: new Date().toISOString(),
                    sessionNumber: maxSession,
                    description: desc,
                    valueFormatted: val,
                    awardedTo: 'party'
                  }

                  saveCampaign({
                    ...campaign,
                    lootHistory: [...(campaign.lootHistory || []), newEntry],
                    updatedAt: new Date().toISOString()
                  })
                  addToast('Loot added', 'success')
                }}
                className="text-[10px] bg-amber-600/20 text-amber-400 hover:bg-amber-600/40 px-2 py-1 rounded cursor-pointer transition-colors"
              >
                + Add Loot
              </button>
            </div>
          </div>
          {!campaign.lootHistory || campaign.lootHistory.length === 0 ? (
            <p className="text-gray-500 text-sm">No loot recorded yet. Add items and gold awarded to the party.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
              {campaign.lootHistory
                .slice()
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((entry) => (
                  <div key={entry.id} className="bg-gray-800/50 rounded-lg p-3 group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{entry.description}</span>
                      <div className="flex items-center gap-3">
                        {entry.valueFormatted && (
                          <span className="text-amber-400 font-mono text-xs">{entry.valueFormatted}</span>
                        )}
                        <button
                          onClick={() => {
                            if (window.confirm('Delete this loot entry?')) {
                              saveCampaign({
                                ...campaign,
                                lootHistory: campaign.lootHistory!.filter((l) => l.id !== entry.id),
                                updatedAt: new Date().toISOString()
                              })
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 text-[10px] text-red-400 hover:text-red-300 cursor-pointer transition-opacity"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span>Session {entry.sessionNumber}</span>
                      <span>&middot;</span>
                      <span>{new Date(entry.date).toLocaleDateString()}</span>
                      {entry.awardedTo && (
                        <>
                          <span>&middot;</span>
                          <span className="capitalize">To: {entry.awardedTo}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Card>

        <Suspense fallback={null}>
          <AiDmCard campaign={campaign} saveCampaign={saveCampaign} />
        </Suspense>

        <Suspense fallback={null}>
          <CalendarCard campaign={campaign} saveCampaign={saveCampaign} />
        </Suspense>

        <Suspense fallback={null}>
          <AudioManager campaign={campaign} saveCampaign={saveCampaign} />
        </Suspense>

        {/* Monster Linker */}
        <Card title="Monster Linker">
          <Suspense fallback={null}>
            <MonsterLinker onSelect={setLinkedMonster} selectedId={linkedMonster?.id} showPreview />
          </Suspense>
        </Card>

        {/* Journal */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">Session Journal ({campaign.journal.entries.length})</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditingEntry(null)
                  setShowJournalModal(true)
                }}
                className="text-[10px] bg-amber-600/20 text-amber-400 hover:bg-amber-600/40 px-2 py-1 rounded cursor-pointer transition-colors"
              >
                + New Entry
              </button>
              <button
                onClick={handleImportJournal}
                className="text-[10px] text-gray-400 hover:text-amber-400 cursor-pointer"
              >
                Import
              </button>
              {campaign.journal.entries.length > 0 && (
                <button
                  onClick={() => handleExportJournal(campaign.journal.entries)}
                  className="text-[10px] text-gray-400 hover:text-amber-400 cursor-pointer"
                >
                  Export All
                </button>
              )}
            </div>
          </div>
          {campaign.journal.entries.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No journal entries yet. Add session recaps, notes, and story summaries.
            </p>
          ) : (
            <div className="space-y-2">
              {campaign.journal.entries
                .slice()
                .sort((a, b) => b.sessionNumber - a.sessionNumber)
                .map((entry) => (
                  <div key={entry.id} className="bg-gray-800/50 rounded-lg p-3 group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">
                        Session {entry.sessionNumber}: {entry.title}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500 text-xs">{new Date(entry.date).toLocaleDateString()}</span>
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-2 transition-opacity">
                          <button
                            onClick={() => {
                              setEditingEntry(entry)
                              setShowJournalModal(true)
                            }}
                            className="text-[10px] text-amber-400 hover:text-amber-300 cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm('Delete this journal entry?')) {
                                handleDeleteJournalEntry(entry.id)
                              }
                            }}
                            className="text-[10px] text-red-400 hover:text-red-300 cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                    <p className="text-gray-400 text-xs line-clamp-2">{entry.content}</p>
                    {entry.isPrivate && <span className="text-xs text-yellow-400 mt-1 inline-block">DM Only</span>}
                  </div>
                ))}
            </div>
          )}
        </Card>
      </div>

      <Suspense fallback={null}>
        <JournalEntryModal
          open={showJournalModal}
          onClose={() => {
            setShowJournalModal(false)
            setEditingEntry(null)
          }}
          onSave={handleSaveJournalEntry}
          initialData={editingEntry}
        />
      </Suspense>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Campaign?"
        message={`This action cannot be undone. The campaign "${campaign.name}" and all its data will be permanently deleted.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={showCloudFallback}
        title="Local Server Unreachable"
        message="The local relay server could not be reached. Would you like to host using cloud servers instead? Players will connect via the public internet."
        confirmLabel="Use Cloud"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={handleCloudFallback}
        onCancel={() => setShowCloudFallback(false)}
      />
    </div>
  )
}
