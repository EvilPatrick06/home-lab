import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { AUTO_REJOIN_KEY, JOINED_SESSIONS_KEY, LAST_SESSION_KEY } from '../../constants'
import { addToast } from '../../hooks/use-toast'
import { exportCampaignToFile } from '../../services/io/campaign-io'
import { useCampaignStore } from '../../stores/use-campaign-store'
import type { Campaign } from '../../types/campaign'
import { ConfirmDialog } from '../ui'

interface JoinedSession {
  inviteCode: string
  displayName: string
  campaignId: string
  campaignName: string
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
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

function maskInviteCode(code: string): string {
  if (code.length <= 3) return code
  return code[0] + code[1] + '*'.repeat(code.length - 3) + code[code.length - 1]
}

interface StartStepProps {
  onNewCampaign: () => void
}

export default function StartStep({ onNewCampaign }: StartStepProps): JSX.Element {
  const navigate = useNavigate()
  const campaigns = useCampaignStore((s) => s.campaigns)
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
      addToast('Failed to export campaign. Please try again.', 'error')
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await deleteCampaign(id)
      setConfirmDelete(null)
    } catch {
      addToast('Failed to delete campaign. Please try again.', 'error')
      setConfirmDelete(null)
    }
  }

  const handleDeleteAll = async (): Promise<void> => {
    try {
      await deleteAllCampaigns()
      setShowDeleteAllConfirm(false)
      addToast('All campaigns deleted', 'success')
    } catch {
      setShowDeleteAllConfirm(false)
      addToast('Failed to delete all campaigns. Please try again.', 'error')
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
      <h2 className="text-2xl font-bold text-gray-100 mb-2">Choose your Campaign</h2>
      <p className="text-gray-400 text-sm mb-8">Pick up where you left off or create something new.</p>

      {/* Quick Resume */}
      {quickResumeTarget && (
        <div className="mb-6 p-4 rounded-xl border border-amber-700/50 bg-amber-900/15 flex items-center gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-amber-800/40 flex items-center justify-center text-amber-400 text-lg">
            &#9889;
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-amber-500/70 font-semibold mb-0.5">Quick Resume</p>
            <h3 className="text-sm font-semibold text-gray-100 truncate">
              {quickResumeTarget.type === 'hosted'
                ? quickResumeTarget.campaign.name
                : quickResumeTarget.session.campaignName || 'Unknown Campaign'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {quickResumeTarget.type === 'hosted' ? (
                <>
                  <span className="text-amber-400/70">Hosted</span>
                  <span className="mx-1.5">&middot;</span>
                  Updated {formatTimeAgo(new Date(quickResumeTarget.campaign.updatedAt).getTime())}
                </>
              ) : (
                <>
                  <span className="text-emerald-400/70">Joined</span>
                  <span className="mx-1.5">&middot;</span>
                  as {quickResumeTarget.session.displayName}
                  <span className="mx-1.5">&middot;</span>
                  {formatTimeAgo(quickResumeTarget.session.timestamp)}
                </>
              )}
            </p>
          </div>
          <button
            onClick={handleQuickResume}
            className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-amber-600 hover:bg-amber-500
              text-white transition-colors cursor-pointer flex-shrink-0"
          >
            Resume
          </button>
        </div>
      )}

      {/* Action cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Create New Campaign */}
        <button
          onClick={onNewCampaign}
          className="group p-6 rounded-xl border-2 border-gray-700 hover:border-amber-500
            bg-gray-800/50 hover:bg-amber-600/10 transition-all cursor-pointer text-left"
        >
          <div className="text-3xl mb-3">&#10010;</div>
          <h3 className="text-lg font-semibold text-gray-100 group-hover:text-amber-400 transition-colors">
            Create New
          </h3>
          <p className="text-xs text-gray-500 mt-1">Start a new campaign with the step-by-step wizard.</p>
        </button>

        {/* Your Campaigns (hosted) */}
        <button
          onClick={() => setShowHosted(!showHosted)}
          className={`group p-6 rounded-xl border-2 transition-all cursor-pointer text-left ${
            showHosted
              ? 'border-amber-500 bg-amber-600/10'
              : 'border-gray-700 hover:border-amber-500 bg-gray-800/50 hover:bg-amber-600/10'
          }`}
        >
          <div className="text-3xl mb-3">&#128193;</div>
          <h3 className="text-lg font-semibold text-gray-100 group-hover:text-amber-400 transition-colors">
            Your Campaigns
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            {campaigns.length > 0
              ? `${campaigns.length} hosted campaign${campaigns.length !== 1 ? 's' : ''} found.`
              : 'No hosted campaigns yet.'}
          </p>
        </button>
      </div>

      {/* Joined Games section */}
      {joinedSessionsList.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowJoined(!showJoined)}
            className={`w-full p-4 rounded-xl border-2 transition-all cursor-pointer text-left flex items-center gap-3 ${
              showJoined
                ? 'border-emerald-500 bg-emerald-600/10'
                : 'border-gray-700 hover:border-emerald-500 bg-gray-800/50 hover:bg-emerald-600/10'
            }`}
          >
            <div className="flex-shrink-0 text-2xl">&#8634;</div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-gray-100">Joined Games</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {joinedSessionsList.length} game{joinedSessionsList.length !== 1 ? 's' : ''} you&apos;ve joined as a
                player.
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
            <div className="mt-2 border border-gray-700 rounded-xl overflow-hidden divide-y divide-gray-800">
              {joinedSessionsList.map((session) => (
                <div key={session.campaignId} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-800/50">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-gray-100 truncate block">
                      {session.campaignName || 'Unknown Campaign'}
                    </span>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      Code: <span className="font-mono text-gray-400">{maskInviteCode(session.inviteCode)}</span>
                      <span className="mx-1.5">&middot;</span>
                      as {session.displayName}
                      <span className="mx-1.5">&middot;</span>
                      {formatTimeAgo(session.timestamp)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRejoinSession(session)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500
                      text-white transition-colors cursor-pointer flex-shrink-0"
                  >
                    Rejoin
                  </button>
                  <button
                    onClick={() => handleRemoveJoinedSession(session.campaignId)}
                    className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-gray-700/50
                      transition-colors cursor-pointer flex-shrink-0"
                    title="Remove"
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
        <div className="border border-gray-700 rounded-xl overflow-hidden mb-6">
          {campaigns.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500 text-sm">No hosted campaigns. Create one first!</div>
          ) : (
            <div>
              <div className="px-4 py-2 flex justify-end border-b border-gray-800">
                <button
                  onClick={() => setShowDeleteAllConfirm(true)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-700 hover:bg-red-600/30
                    text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                >
                  Delete All
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-800">
                {campaigns.map((c) => (
                  <div key={c.id} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-800/50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-100 truncate">{c.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-red-900/40 text-red-400">
                          {c.system ?? '5e'}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        Updated {formatDate(c.updatedAt)}
                        {c.maps?.length > 0 && (
                          <>
                            {' '}
                            &middot; {c.maps.length} map{c.maps.length !== 1 ? 's' : ''}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => navigate(`/campaign/${c.id}`)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500
                          text-white transition-colors cursor-pointer"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => handleExport(c)}
                        className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-gray-700 hover:bg-gray-600
                          text-gray-300 transition-colors cursor-pointer"
                        title="Export to file"
                      >
                        Export
                      </button>
                      {confirmDelete === c.id ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500
                              text-white transition-colors cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="px-2 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600
                              text-gray-300 transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(c.id)}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-gray-700 hover:bg-red-600/30
                            text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                          title="Delete campaign"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={showDeleteAllConfirm}
        title="Delete All Campaigns?"
        message={`This will permanently delete all ${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''} and their data. This action cannot be undone.`}
        confirmLabel="Delete All"
        variant="danger"
        onConfirm={handleDeleteAll}
        onCancel={() => setShowDeleteAllConfirm(false)}
      />
    </div>
  )
}
