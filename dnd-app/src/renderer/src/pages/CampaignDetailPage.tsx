import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import HostNamePrompt from '../components/campaign/HostNamePrompt'
import SeedPackApplyModal from '../components/campaign/SeedPackApplyModal'
import { BackButton, Button, Card, ConfirmDialog } from '../components/ui'
import { addToast } from '../hooks/use-toast'
import { useT } from '../i18n'
import { configureForCloud } from '../network'
import { exportCampaignToFile } from '../services/io/campaign-io'
import { exportEntities, importEntities, reIdItems } from '../services/io/entity-io'
import { useNetworkStore } from '../stores/network-store'
import { useCampaignStore } from '../stores/use-campaign-store'
import type { Campaign } from '../types/campaign'
import { GAME_SYSTEMS } from '../types/game-system'
import type { MonsterStatBlock } from '../types/monster'
import { logger } from '../utils/logger'
import AdventureManager from './campaign-detail/AdventureManager'
import NPCManager from './campaign-detail/CampaignNpcManager'
import LoreManager from './campaign-detail/LoreManager'
import RuleManager from './campaign-detail/RuleManager'

const PermissionsEditor = lazy(() => import('../components/campaign/PermissionsEditor'))
const PlayerOverridesPanel = lazy(() => import('../components/campaign/PlayerOverridesPanel'))
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
  const { t } = useT()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { campaigns, loading, loadCampaigns, deleteCampaign, saveCampaign } = useCampaignStore()
  const { hostGame } = useNetworkStore()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showCloudFallback, setShowCloudFallback] = useState(false)
  const [showHostNamePrompt, setShowHostNamePrompt] = useState(false)
  const [hostNameDefault, setHostNameDefault] = useState('')
  const [exporting, setExporting] = useState(false)
  const [showSeedPackApply, setShowSeedPackApply] = useState(false) // PHASE-37
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

  // Pre-load host displayName from settings so the Host Name prompt is one-click for repeat hosts.
  useEffect(() => {
    window.api
      .loadSettings()
      .then((settings) => {
        const name = settings.userProfile?.displayName?.trim()
        if (name) setHostNameDefault(name)
      })
      .catch((err) => logger.warn('[CampaignDetail] settings load failed:', err))
  }, [])

  const handleDelete = async (): Promise<void> => {
    if (!id) return
    await deleteCampaign(id)
    addToast(t('pages.campaignDetailPage.toastDeleted'), 'success')
    navigate('/')
  }

  const persistHostDisplayName = (name: string): void => {
    // Per-session host label only. Do NOT overwrite the Settings profile
    // displayName (the user's identity) — doing so made Join Game prefill the
    // last host name ("Dungeon Master") instead of the profile name (2.4.0 QA).
    // The host-name prompt still one-clicks the profile name via its mount load.
    setHostNameDefault(name)
  }

  const handleStartGame = (): void => {
    if (!campaign) return
    setShowHostNamePrompt(true)
  }

  const handleConfirmHostName = async (hostName: string): Promise<void> => {
    if (!campaign) return
    setShowHostNamePrompt(false)
    persistHostDisplayName(hostName)

    setStarting(true)
    try {
      const networkState = useNetworkStore.getState()
      if (networkState.role !== 'none') {
        networkState.disconnect()
      }
      // MP-4 — honor the host's explicit choice EXACTLY: "self-host" hosts the game
      // ON THIS DEVICE via the P2P mesh; "cloud" hosts ONLY on the Pi relay. We no
      // longer silently force cloud when off-LAN. (Off-LAN P2P relies on public
      // PeerJS signaling + STUN/TURN; symmetric-NAT players may fail to connect P2P
      // without reachable TURN — if hosting throws, the catch below offers the
      // cloud fallback, so the choice is honored first and degrades gracefully.)
      const mode = campaign.hostingMode === 'cloud' ? 'cloud' : 'p2p'
      if (mode === 'cloud') configureForCloud()
      await hostGame(hostName, campaign.inviteCode, mode)
      navigate(`/lobby/${campaign.id}`)
    } catch (error) {
      logger.error('Failed to start game:', error)
      addToast(t('pages.campaignDetailPage.toastLocalServerFailed'), 'error')
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
      addToast(t('pages.campaignDetailPage.toastConnectingCloud'), 'info')
      const fallbackName = hostNameDefault || t('pages.campaignDetailPage.defaultHostName')
      await hostGame(fallbackName, campaign.inviteCode)
      navigate(`/lobby/${campaign.id}`)
    } catch (error) {
      logger.error('Failed to start game via cloud:', error)
      addToast(t('pages.campaignDetailPage.toastCloudFailed'), 'error')
      setStarting(false)
    }
  }

  const handleStartSolo = (): void => {
    if (!campaign) return
    const networkState = useNetworkStore.getState()
    if (networkState.role !== 'none') {
      networkState.disconnect()
    }
    // AI-DM solo campaigns go through the scene-prep screen first (load the model +
    // set the opening scene, then enter the game with the scene in chat). A non-AI
    // campaign has nothing to prepare, so go straight in.
    navigate(campaign.aiDm?.enabled ? `/prepare/${campaign.id}` : `/game/${campaign.id}`)
  }

  const handleExport = async (): Promise<void> => {
    if (!campaign) return
    setExporting(true)
    try {
      await exportCampaignToFile(campaign)
      addToast(t('pages.campaignDetailPage.toastExported'), 'success')
    } catch (error) {
      logger.error('Failed to export campaign:', error)
      addToast(t('pages.campaignDetailPage.toastExportFailed'), 'error')
    } finally {
      setExporting(false)
    }
  }

  // PHASE-37 — export this campaign as a shareable seed pack (no play-state, no secrets).
  const handleExportSeedPack = async (): Promise<void> => {
    if (!campaign) return
    try {
      const { extractSeedPackFromCampaign } = await import('../services/seed-packs/seed-pack-apply')
      const { exportSeedPackToFile } = await import('../services/seed-packs/seed-pack-io')
      const pack = extractSeedPackFromCampaign(campaign)
      // Feature-detect the PHASE-28 quest log; fold non-completed quests into the pack.
      if (typeof window.api.ai?.getQuestLog === 'function') {
        try {
          const res = await window.api.ai.getQuestLog(campaign.id)
          const quests = (res?.data as { quests?: Array<Record<string, unknown>> } | undefined)?.quests
          if (Array.isArray(quests)) {
            pack.quests = quests
              .filter((q) => q.status !== 'completed')
              .map((q) => ({
                name: String(q.name ?? ''),
                description: String(q.description ?? ''),
                objectives: Array.isArray(q.objectives)
                  ? (q.objectives as Array<{ text?: string }>).map((o) => String(o.text ?? '')).filter(Boolean)
                  : [],
                chapterQuest: Boolean(q.chapterQuest)
              }))
              .filter((q) => q.name)
          }
        } catch {
          /* quest log unavailable — export without quests */
        }
      }
      const ok = await exportSeedPackToFile(pack)
      if (ok) addToast(t('pages.campaignDetailPage.toastSeedExported'), 'success')
    } catch (error) {
      logger.error('Failed to export seed pack:', error)
      addToast(t('pages.campaignDetailPage.toastSeedExportFailed'), 'error')
    }
  }

  // --- Journal import/export ---
  const handleExportJournal = async (entries: import('../types/campaign').JournalEntry[]): Promise<void> => {
    if (!entries.length) return
    try {
      const ok = await exportEntities('journal', entries)
      if (ok) addToast(t('pages.campaignDetailPage.toastJournalExported', { count: entries.length }), 'success')
    } catch {
      addToast(t('pages.campaignDetailPage.toastJournalExportFailed'), 'error')
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
      addToast(t('pages.campaignDetailPage.toastJournalImported', { count: items.length }), 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('pages.campaignDetailPage.toastJournalImportFailed'), 'error')
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
    addToast(
      editingEntry ? t('pages.campaignDetailPage.toastEntryUpdated') : t('pages.campaignDetailPage.toastEntryCreated'),
      'success'
    )
  }

  const handleDeleteJournalEntry = async (entryId: string) => {
    if (!campaign) return
    const entries = campaign.journal.entries.filter((e) => e.id !== entryId)
    await saveCampaign({ ...campaign, journal: { entries }, updatedAt: new Date().toISOString() })
    addToast(t('pages.campaignDetailPage.toastEntryDeleted'), 'success')
  }

  if (loading) {
    return (
      <div className="p-8 h-screen overflow-y-auto">
        <BackButton to="/" />
        <div className="text-center text-gray-500 py-12">{t('pages.campaignDetailPage.loadingCampaign')}</div>
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="p-8 h-screen overflow-y-auto">
        <BackButton to="/" />
        <div className="text-center text-gray-500 py-12">
          <p className="text-xl mb-2">{t('pages.campaignDetailPage.campaignNotFound')}</p>
          <p className="text-sm">{t('pages.campaignDetailPage.campaignDeleted')}</p>
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
          <div className="flex items-center gap-3 text-sm text-muted">
            <span>{systemConfig.name}</span>
            <span className="text-gray-600">|</span>
            <span className="capitalize">{t('pages.campaignDetailPage.typeCampaign', { type: campaign.type })}</span>
            <span className="text-gray-600">|</span>
            <span>
              {t('pages.campaignDetailPage.invite')}{' '}
              <span className="text-accent font-mono">{campaign.inviteCode}</span>
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => navigate(`/library?from=/campaign/${id}`)}>
            {t('pages.campaignDetailPage.library')}
          </Button>
          <Button variant="secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? t('pages.campaignDetailPage.exporting') : t('pages.campaignDetailPage.export')}
          </Button>
          <Button variant="secondary" onClick={handleExportSeedPack}>
            {t('pages.campaignDetailPage.exportSeedPack')}
          </Button>
          <Button variant="secondary" onClick={() => setShowSeedPackApply(true)}>
            {t('pages.campaignDetailPage.applySeedPack')}
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              if (campaign.archived) {
                await useCampaignStore.getState().unarchiveCampaign(campaign.id)
                addToast(t('pages.campaignDetailPage.toastUnarchived'), 'success')
              } else {
                await useCampaignStore.getState().archiveCampaign(campaign.id)
                addToast(t('pages.campaignDetailPage.toastArchived'), 'success')
                navigate('/')
              }
            }}
          >
            {campaign.archived ? t('pages.campaignDetailPage.unarchive') : t('pages.campaignDetailPage.archive')}
          </Button>
          <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>
            {t('common.actions.delete')}
          </Button>
          {/* Solo "Play" only on a solo campaign; multiplayer "Host Game" only otherwise —
              the two are mutually exclusive based on the campaign's chosen hosting mode. */}
          {campaign.hostingMode === 'solo' ? (
            <Button onClick={handleStartSolo}>{t('pages.campaignDetailPage.soloPlay')}</Button>
          ) : (
            <Button onClick={handleStartGame} disabled={starting}>
              {starting ? t('pages.campaignDetailPage.starting') : t('pages.campaignDetailPage.hostGame')}
            </Button>
          )}
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
        <Card title={t('pages.campaignDetailPage.previousPlayersTitle', { count: campaign.players.length })}>
          <p className="text-gray-500 text-sm mb-3">{t('pages.campaignDetailPage.playersJoinHint')}</p>
          {campaign.players.length > 0 && (
            <div className="space-y-2">
              {campaign.players.map((player) => (
                <div key={player.userId} className="flex items-center justify-between bg-surface-2/50 rounded-lg p-3">
                  <div>
                    <span className="font-semibold text-sm">{player.displayName}</span>
                    <span className="text-gray-500 text-xs ml-2">
                      {t('pages.campaignDetailPage.joined', { date: new Date(player.joinedAt).toLocaleDateString() })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Permissions (Phase 29g) */}
        <Card title={t('pages.campaignDetailPage.permissionsTitle')}>
          <p className="text-gray-500 text-sm mb-3">{t('pages.campaignDetailPage.permissionsHint')}</p>
          <Suspense fallback={<p className="text-gray-500 text-sm">{t('pages.campaignDetailPage.loading')}</p>}>
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-gray-200 mb-2">{t('pages.campaignDetailPage.roles')}</h3>
                <PermissionsEditor campaign={campaign} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-200 mb-2">
                  {t('pages.campaignDetailPage.playerOverrides')}
                </h3>
                <PlayerOverridesPanel campaign={campaign} />
              </div>
            </div>
          </Suspense>
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
            <h3 className="text-lg font-semibold">
              {t('pages.campaignDetailPage.lootHistoryTitle', { count: campaign.lootHistory?.length ?? 0 })}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const desc = window.prompt(t('pages.campaignDetailPage.promptLootDescription'))
                  if (!desc) return
                  const val = window.prompt(t('pages.campaignDetailPage.promptLootValue')) || undefined
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
                  addToast(t('pages.campaignDetailPage.toastLootAdded'), 'success')
                }}
                className="text-xs bg-amber-600/20 text-accent hover:bg-amber-600/40 px-2 py-1 rounded cursor-pointer transition-colors"
              >
                {t('pages.campaignDetailPage.addLoot')}
              </button>
            </div>
          </div>
          {!campaign.lootHistory || campaign.lootHistory.length === 0 ? (
            <p className="text-gray-500 text-sm">{t('pages.campaignDetailPage.noLoot')}</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
              {campaign.lootHistory
                .slice()
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((entry) => (
                  <div key={entry.id} className="bg-surface-2/50 rounded-lg p-3 group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{entry.description}</span>
                      <div className="flex items-center gap-3">
                        {entry.valueFormatted && (
                          <span className="text-accent font-mono text-xs">{entry.valueFormatted}</span>
                        )}
                        <button
                          onClick={() => {
                            if (window.confirm(t('pages.campaignDetailPage.confirmDeleteLoot'))) {
                              saveCampaign({
                                ...campaign,
                                lootHistory: campaign.lootHistory!.filter((l) => l.id !== entry.id),
                                updatedAt: new Date().toISOString()
                              })
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-300 cursor-pointer transition-opacity"
                        >
                          {t('common.actions.delete')}
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span>{t('pages.campaignDetailPage.session', { number: entry.sessionNumber })}</span>
                      <span>&middot;</span>
                      <span>{new Date(entry.date).toLocaleDateString()}</span>
                      {entry.awardedTo && (
                        <>
                          <span>&middot;</span>
                          <span className="capitalize">
                            {t('pages.campaignDetailPage.awardedTo', { target: entry.awardedTo })}
                          </span>
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
        <Card title={t('pages.campaignDetailPage.monsterLinkerTitle')}>
          <Suspense fallback={null}>
            <MonsterLinker onSelect={setLinkedMonster} selectedId={linkedMonster?.id} showPreview />
          </Suspense>
        </Card>

        {/* Journal */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">
              {t('pages.campaignDetailPage.sessionJournalTitle', { count: campaign.journal.entries.length })}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditingEntry(null)
                  setShowJournalModal(true)
                }}
                className="text-xs bg-amber-600/20 text-accent hover:bg-amber-600/40 px-2 py-1 rounded cursor-pointer transition-colors"
              >
                {t('pages.campaignDetailPage.newEntry')}
              </button>
              <button onClick={handleImportJournal} className="text-xs text-muted hover:text-accent cursor-pointer">
                {t('pages.campaignDetailPage.import')}
              </button>
              {campaign.journal.entries.length > 0 && (
                <button
                  onClick={() => handleExportJournal(campaign.journal.entries)}
                  className="text-xs text-muted hover:text-accent cursor-pointer"
                >
                  {t('pages.campaignDetailPage.exportAll')}
                </button>
              )}
            </div>
          </div>
          {campaign.journal.entries.length === 0 ? (
            <p className="text-gray-500 text-sm">{t('pages.campaignDetailPage.noJournalEntries')}</p>
          ) : (
            <div className="space-y-2">
              {campaign.journal.entries
                .slice()
                .sort((a, b) => b.sessionNumber - a.sessionNumber)
                .map((entry) => (
                  <div key={entry.id} className="bg-surface-2/50 rounded-lg p-3 group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">
                        {t('pages.campaignDetailPage.journalEntryTitle', {
                          number: entry.sessionNumber,
                          title: entry.title
                        })}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500 text-xs">{new Date(entry.date).toLocaleDateString()}</span>
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-2 transition-opacity">
                          <button
                            onClick={() => {
                              setEditingEntry(entry)
                              setShowJournalModal(true)
                            }}
                            className="text-xs text-accent hover:text-amber-300 cursor-pointer"
                          >
                            {t('pages.campaignDetailPage.edit')}
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(t('pages.campaignDetailPage.confirmDeleteJournal'))) {
                                handleDeleteJournalEntry(entry.id)
                              }
                            }}
                            className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
                          >
                            {t('common.actions.delete')}
                          </button>
                        </div>
                      </div>
                    </div>
                    <p className="text-muted text-xs line-clamp-2">{entry.content}</p>
                    {entry.isPrivate && (
                      <span className="text-xs text-yellow-400 mt-1 inline-block">
                        {t('pages.campaignDetailPage.dmOnly')}
                      </span>
                    )}
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

      <SeedPackApplyModal
        open={showSeedPackApply}
        onClose={() => setShowSeedPackApply(false)}
        campaign={campaign}
        onApplied={() => loadCampaigns()}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        title={t('pages.campaignDetailPage.deleteTitle')}
        message={t('pages.campaignDetailPage.deleteMessage', { name: campaign.name })}
        confirmLabel={t('common.actions.delete')}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={showCloudFallback}
        title={t('pages.campaignDetailPage.cloudFallbackTitle')}
        message={t('pages.campaignDetailPage.cloudFallbackMessage')}
        confirmLabel={t('pages.campaignDetailPage.useCloud')}
        cancelLabel={t('common.actions.cancel')}
        variant="warning"
        onConfirm={handleCloudFallback}
        onCancel={() => setShowCloudFallback(false)}
      />

      <HostNamePrompt
        open={showHostNamePrompt}
        defaultName={hostNameDefault || t('pages.campaignDetailPage.defaultHostName')}
        onSubmit={handleConfirmHostName}
        onCancel={() => setShowHostNamePrompt(false)}
      />
    </div>
  )
}
