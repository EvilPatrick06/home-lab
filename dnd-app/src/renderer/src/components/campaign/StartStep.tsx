import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { AUTO_REJOIN_KEY, JOINED_SESSIONS_KEY, LAST_SESSION_KEY } from '../../constants'
import { addToast } from '../../hooks/use-toast'
import { i18n, useT } from '../../i18n'
import { exportCampaignToFile } from '../../services/io/campaign-io'
import { useCampaignStore } from '../../stores/use-campaign-store'
import type { Campaign } from '../../types/campaign'
import { ConfirmDialog } from '../ui'

interface JoinedSession {
  inviteCode: string
  displayName: string
  campaignId: string
  campaignName: string
  // The transport this session was joined with, so an on-LAN auto-rejoin of a
  // CLOUD game doesn't fall back to p2p. Optional for legacy stored sessions.
  connectionMode?: 'p2p' | 'cloud'
  timestamp: number
}

function loadLastSession(): JoinedSession | null {
  try {
    const raw = localStorage.getItem(LAST_SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw)
    if (!session.inviteCode || !session.displayName || !session.campaignId || typeof session.timestamp !== 'number')
      return null
    return session as JoinedSession
  } catch {
    return null
  }
}

function loadJoinedSessions(): JoinedSession[] {
  try {
    const raw = localStorage.getItem(JOINED_SESSIONS_KEY)
    if (!raw) return []
    const sessions = JSON.parse(raw) as JoinedSession[]
    return sessions.filter((s) => s.inviteCode && s.displayName && s.campaignId && typeof s.timestamp === 'number')
  } catch {
    return []
  }
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return i18n.t('campaign.startStep.justNow')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return i18n.t('campaign.startStep.minutesAgo', { minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return i18n.t('campaign.startStep.hoursAgo', { hours })
  const days = Math.floor(hours / 24)
  if (days === 1) return i18n.t('campaign.startStep.yesterday')
  return i18n.t('campaign.startStep.daysAgo', { days })
}

function maskInviteCode(code: string): string {
  if (code.length <= 3) return code
  return code[0] + code[1] + '*'.repeat(code.length - 3) + code[code.length - 1]
}

interface StartStepProps {
  onNewCampaign: () => void
}

export default function StartStep({ onNewCampaign }: StartStepProps): JSX.Element {
  const { t } = useT()
  const navigate = useNavigate()
  const allCampaigns = useCampaignStore((s) => s.campaigns)
  const campaigns = allCampaigns.filter((c) => !c.archived)
  const archivedCampaigns = allCampaigns.filter((c) => c.archived)
  const loadCampaigns = useCampaignStore((s) => s.loadCampaigns)
  const deleteCampaign = useCampaignStore((s) => s.deleteCampaign)
  const deleteAllCampaigns = useCampaignStore((s) => s.deleteAllCampaigns)

  const [showHosted, setShowHosted] = useState(false)
  const [showJoined, setShowJoined] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)
  const [joinedSessionsList, setJoinedSessionsList] = useState<JoinedSession[]>(loadJoinedSessions)

  useEffect(() => {
    loadCampaigns()
  }, [loadCampaigns])

  const lastSession = loadLastSession()

  const lastHostedCampaign =
    campaigns.length > 0
      ? [...campaigns].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
      : null

  const lastHostedTime = lastHostedCampaign ? new Date(lastHostedCampaign.updatedAt).getTime() : 0
  const lastJoinedTime = lastSession?.timestamp ?? 0

  const quickResumeTarget: { type: 'hosted'; campaign: Campaign } | { type: 'joined'; session: JoinedSession } | null =
    (() => {
      if (lastHostedTime >= lastJoinedTime && lastHostedCampaign) {
        return { type: 'hosted', campaign: lastHostedCampaign }
      }
      if (lastSession) {
        return { type: 'joined', session: lastSession }
      }
      if (lastHostedCampaign) {
        return { type: 'hosted', campaign: lastHostedCampaign }
      }
      return null
    })()

  const handleQuickResume = (): void => {
    if (!quickResumeTarget) return
    if (quickResumeTarget.type === 'hosted') {
      navigate(`/campaign/${quickResumeTarget.campaign.id}`)
    } else {
      localStorage.setItem(AUTO_REJOIN_KEY, 'true')
      navigate('/join')
    }
  }

  const handleRejoinSession = (session: JoinedSession): void => {
    localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(session))
    localStorage.setItem(AUTO_REJOIN_KEY, 'true')
    navigate('/join')
  }

  const handleRemoveJoinedSession = (campaignId: string): void => {
    const updated = joinedSessionsList.filter((s) => s.campaignId !== campaignId)
    localStorage.setItem(JOINED_SESSIONS_KEY, JSON.stringify(updated))
    setJoinedSessionsList(updated)
  }

  const handleExport = async (campaign: Campaign): Promise<void> => {
    try {
      await exportCampaignToFile(campaign)
    } catch {
      addToast(t('campaign.startStep.exportFailed'), 'error')
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await deleteCampaign(id)
      setConfirmDelete(null)
    } catch {
      addToast(t('campaign.startStep.deleteFailed'), 'error')
      setConfirmDelete(null)
    }
  }

  const handleDeleteAll = async (): Promise<void> => {
    try {
      await deleteAllCampaigns()
      setShowDeleteAllConfirm(false)
      addToast(t('campaign.startStep.allDeleted'), 'success')
    } catch {
      setShowDeleteAllConfirm(false)
      addToast(t('campaign.startStep.deleteAllFailed'), 'error')
    }
  }

  const formatDate = (dateStr: string): string => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-fg mb-2">{t('campaign.startStep.title')}</h2>
      <p className="text-muted text-sm mb-8">{t('campaign.startStep.subtitle')}</p>

      {/* Quick Resume */}
      {quickResumeTarget && (
        <div className="mb-6 p-4 rounded-xl border border-amber-700/50 bg-amber-900/15 flex items-center gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-amber-800/40 flex items-center justify-center text-accent text-lg">
            &#9889;
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-accent-strong/70 font-semibold mb-0.5">
              {t('campaign.startStep.quickResume')}
            </p>
            <h3 className="text-sm font-semibold text-fg truncate">
              {quickResumeTarget.type === 'hosted'
                ? quickResumeTarget.campaign.name
                : quickResumeTarget.session.campaignName || t('campaign.startStep.unknownCampaign')}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {quickResumeTarget.type === 'hosted' ? (
                <>
                  <span className="text-accent/70">{t('campaign.startStep.hosted')}</span>
                  <span className="mx-1.5">&middot;</span>
                  {t('campaign.startStep.updated', {
                    when: formatTimeAgo(new Date(quickResumeTarget.campaign.updatedAt).getTime())
                  })}
                </>
              ) : (
                <>
                  <span className="text-emerald-400/70">{t('campaign.startStep.joined')}</span>
                  <span className="mx-1.5">&middot;</span>
                  {t('campaign.startStep.asPlayer', { name: quickResumeTarget.session.displayName })}
                  <span className="mx-1.5">&middot;</span>
                  {formatTimeAgo(quickResumeTarget.session.timestamp)}
                </>
              )}
            </p>
          </div>
          <button
            onClick={handleQuickResume}
            className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-amber-600 hover:bg-accent-strong
              text-white transition-colors cursor-pointer flex-shrink-0"
          >
            {t('campaign.startStep.resume')}
          </button>
        </div>
      )}

      {/* Action cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Create New Campaign */}
        <button
          onClick={onNewCampaign}
          className="group p-6 rounded-xl border-2 border-border hover:border-amber-500
            bg-surface-2/50 hover:bg-amber-600/10 transition-all cursor-pointer text-start"
        >
          <div className="text-3xl mb-3">&#10010;</div>
          <h3 className="text-lg font-semibold text-fg group-hover:text-accent transition-colors">
            {t('campaign.startStep.createNew')}
          </h3>
          <p className="text-xs text-gray-500 mt-1">{t('campaign.startStep.createNewDesc')}</p>
        </button>

        {/* Your Campaigns (hosted) */}
        <button
          onClick={() => setShowHosted(!showHosted)}
          className={`group p-6 rounded-xl border-2 transition-all cursor-pointer text-start ${
            showHosted
              ? 'border-amber-500 bg-amber-600/10'
              : 'border-border hover:border-amber-500 bg-surface-2/50 hover:bg-amber-600/10'
          }`}
        >
          <div className="text-3xl mb-3">&#128193;</div>
          <h3 className="text-lg font-semibold text-fg group-hover:text-accent transition-colors">
            {t('campaign.startStep.yourCampaigns')}
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            {campaigns.length > 0
              ? t('campaign.startStep.activeCampaignsFound', { count: campaigns.length })
              : t('campaign.startStep.noActiveCampaigns')}
          </p>
        </button>
      </div>

      {archivedCampaigns.length > 0 && (
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowHosted(!showHosted)}
            className="text-xs text-gray-500 hover:text-accent transition-colors underline"
          >
            {showHosted && campaigns.length === 0
              ? t('campaign.startStep.showArchived', { count: archivedCampaigns.length })
              : ''}
          </button>
        </div>
      )}

      {/* Joined Games section */}
      {joinedSessionsList.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowJoined(!showJoined)}
            className={`w-full p-4 rounded-xl border-2 transition-all cursor-pointer text-start flex items-center gap-3 ${
              showJoined
                ? 'border-emerald-500 bg-emerald-600/10'
                : 'border-border hover:border-emerald-500 bg-surface-2/50 hover:bg-emerald-600/10'
            }`}
          >
            <div className="flex-shrink-0 text-2xl">&#8634;</div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-fg">{t('campaign.startStep.joinedGames')}</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('campaign.startStep.joinedGamesCount', { count: joinedSessionsList.length })}
              </p>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`w-5 h-5 text-gray-500 transition-transform ${showJoined ? 'rotate-180' : ''}`}
            >
              <path
                fillRule="evenodd"
                d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {showJoined && (
            <div className="mt-2 border border-border rounded-xl overflow-hidden divide-y divide-gray-800">
              {joinedSessionsList.map((session) => (
                <div key={session.campaignId} className="px-4 py-3 flex items-center gap-3 hover:bg-surface-2/50">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-fg truncate block">
                      {session.campaignName || t('campaign.startStep.unknownCampaign')}
                    </span>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {t('campaign.startStep.code')}{' '}
                      <span className="font-mono text-muted">{maskInviteCode(session.inviteCode)}</span>
                      <span className="mx-1.5">&middot;</span>
                      {t('campaign.startStep.asPlayer', { name: session.displayName })}
                      <span className="mx-1.5">&middot;</span>
                      {formatTimeAgo(session.timestamp)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRejoinSession(session)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500
                      text-white transition-colors cursor-pointer flex-shrink-0"
                  >
                    {t('campaign.startStep.rejoin')}
                  </button>
                  <button
                    onClick={() => handleRemoveJoinedSession(session.campaignId)}
                    className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-gray-700/50
                      transition-colors cursor-pointer flex-shrink-0"
                    title={t('campaign.startStep.remove')}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-3.5 h-3.5"
                    >
                      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Hosted campaign list */}
      {showHosted && (
        <div className="space-y-6 mb-6">
          <div className="border border-border rounded-xl overflow-hidden">
            {campaigns.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500 text-sm">
                {t('campaign.startStep.noHostedCampaigns')}
              </div>
            ) : (
              <div>
                <div className="px-4 py-2 flex justify-between items-center border-b border-gray-800 bg-surface-2/30">
                  <h4 className="text-sm font-semibold text-gray-300">{t('campaign.startStep.activeCampaigns')}</h4>
                  <button
                    onClick={() => setShowDeleteAllConfirm(true)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-700 hover:bg-red-600/30
                      text-muted hover:text-red-400 transition-colors cursor-pointer"
                  >
                    {t('campaign.startStep.deleteAll')}
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-gray-800">
                  {campaigns.map((c) => (
                    <div key={c.id} className="px-4 py-3 flex items-center gap-3 hover:bg-surface-2/50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-fg truncate">{c.name}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold bg-red-900/40 text-red-400">
                            {c.system ?? '5e'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {t('campaign.startStep.updated', { when: formatDate(c.updatedAt) })}
                          {c.maps?.length > 0 && (
                            <> &middot; {t('campaign.startStep.mapCount', { count: c.maps.length })}</>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => navigate(`/campaign/${c.id}`)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-accent-strong
                            text-white transition-colors cursor-pointer"
                        >
                          {t('campaign.startStep.open')}
                        </button>
                        <button
                          onClick={() => handleExport(c)}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-gray-700 hover:bg-gray-600
                            text-gray-300 transition-colors cursor-pointer"
                          title={t('campaign.startStep.exportToFile')}
                        >
                          {t('campaign.startStep.export')}
                        </button>
                        {confirmDelete === c.id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleDelete(c.id)}
                              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500
                                text-white transition-colors cursor-pointer"
                            >
                              {t('common.actions.confirm')}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="px-2 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600
                                text-gray-300 transition-colors cursor-pointer"
                            >
                              {t('common.actions.cancel')}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(c.id)}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-gray-700 hover:bg-red-600/30
                              text-muted hover:text-red-400 transition-colors cursor-pointer"
                            title={t('campaign.startStep.deleteCampaign')}
                          >
                            {t('common.actions.delete')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {archivedCampaigns.length > 0 && (
            <div className="border border-border rounded-xl overflow-hidden opacity-80 hover:opacity-100 transition-opacity">
              <div className="px-4 py-2 border-b border-gray-800 bg-surface-2/30">
                <h4 className="text-sm font-semibold text-muted">{t('campaign.startStep.archivedCampaigns')}</h4>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-800">
                {archivedCampaigns.map((c) => (
                  <div key={c.id} className="px-4 py-3 flex items-center gap-3 hover:bg-surface-2/50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-muted truncate">{c.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold bg-gray-700 text-gray-300">
                          {t('campaign.startStep.archivedBadge')}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {t('campaign.startStep.updated', { when: formatDate(c.updatedAt) })}
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={async () => {
                          await useCampaignStore.getState().unarchiveCampaign(c.id)
                          addToast(t('campaign.startStep.campaignUnarchived'), 'success')
                        }}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-700 hover:bg-gray-600
                          text-gray-300 transition-colors cursor-pointer"
                      >
                        {t('campaign.startStep.unarchive')}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(c.id)}
                        className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-gray-700 hover:bg-red-600/30
                          text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                        title={t('campaign.startStep.deleteCampaign')}
                      >
                        {t('common.actions.delete')}
                      </button>
                    </div>
                    {confirmDelete === c.id && (
                      <div className="absolute end-4 flex gap-1 bg-surface-2 p-1 rounded-lg border border-border shadow-lg">
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500
                            text-white transition-colors cursor-pointer"
                        >
                          {t('common.actions.confirm')}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-2 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600
                            text-gray-300 transition-colors cursor-pointer"
                        >
                          {t('common.actions.cancel')}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={showDeleteAllConfirm}
        title={t('campaign.startStep.deleteAllTitle')}
        message={t('campaign.startStep.deleteAllMessage', { count: campaigns.length })}
        confirmLabel={t('campaign.startStep.deleteAll')}
        variant="danger"
        onConfirm={handleDeleteAll}
        onCancel={() => setShowDeleteAllConfirm(false)}
      />
    </div>
  )
}
