import { useCallback, useEffect, useState } from 'react'
import { useT } from '../../../i18n'
import { useDiscordSyncStore } from '../../../stores/use-discord-sync-store'

// PHASE-20 20G (F5): in-app start/stop/status for the Discord DM voice session,
// making the Speak-narration toggle's target observable. Polls bmoDmStatus; never
// auto-starts. `narrationEnabled` drives the "on but no session" hint.
type SessionStatus = 'unknown' | 'botDown' | 'idle' | 'active'

interface Props {
  campaignId: string
  narrationEnabled?: boolean
}

const POLL_MS = 20_000

const btnClass =
  'px-3 py-2 text-xs font-medium rounded-lg bg-surface-2/60 border border-border/50 text-gray-300 hover:bg-amber-600/20 hover:border-amber-500/40 hover:text-amber-300 transition-all cursor-pointer whitespace-nowrap disabled:opacity-50'

const DOT: Record<SessionStatus, string> = {
  unknown: 'bg-gray-500',
  botDown: 'bg-red-500',
  idle: 'bg-yellow-500',
  active: 'bg-emerald-500'
}

export default function DiscordSessionSection({ campaignId, narrationEnabled }: Props): JSX.Element | null {
  const { t } = useT()
  const [status, setStatus] = useState<SessionStatus>('unknown')
  const [players, setPlayers] = useState<string[]>([])
  const [voiceConnected, setVoiceConnected] = useState(false)
  const [lastSessionEnd, setLastSessionEnd] = useState<{ reason: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recap, setRecap] = useState<string | null>(null)
  // PHASE-22 22E: opt-in state push + activity feed.
  const syncToDiscord = useDiscordSyncStore((s) => s.syncToDiscordEnabled)
  const setSyncToDiscord = useDiscordSyncStore((s) => s.setSyncToDiscordEnabled)
  const activity = useDiscordSyncStore((s) => s.activity)
  const [activityOpen, setActivityOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (!window.api?.bmoDmStatus) return
    const res = await window.api.bmoDmStatus()
    if (res?.ok === false || res?.running === false) {
      setStatus('botDown')
      return
    }
    setStatus(res?.active ? 'active' : 'idle')
    setPlayers(res?.players ?? [])
    setVoiceConnected(!!res?.voice_connected)
    setLastSessionEnd(res?.last_session_end ?? null)
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  const errorText = (res: { error?: string; reason?: string }): string => {
    switch (res.error) {
      case 'channel_not_found':
        return t('game.discordSession.channelNotFound', { channel: 'Dungeon' })
      case 'join_failed':
        return t('game.discordSession.joinFailed', { reason: res.reason ?? '?' })
      case 'session_active':
        return t('game.discordSession.sessionActive')
      case 'DM bot not running':
        return t('game.discordSession.botDown')
      default:
        return res.error ?? t('game.discordSession.genericError')
    }
  }

  const onStart = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setRecap(null)
    try {
      const res = await window.api.bmoStartDm(campaignId)
      if (res?.ok === false || res?.error) setError(errorText(res))
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  const onStop = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.bmoStopDm()
      if (res?.ok === false || res?.error) setError(errorText(res))
      else if (res?.recap) setRecap(res.recap)
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  const statusLabel =
    status === 'botDown'
      ? t('game.discordSession.statusBotDown')
      : status === 'active'
        ? t('game.discordSession.statusActive')
        : status === 'idle'
          ? t('game.discordSession.statusIdle')
          : t('game.discordSession.statusUnknown')

  return (
    <div className="w-full mt-2 p-2 rounded-lg border border-border/50 bg-surface-2/40">
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-block w-2 h-2 rounded-full ${DOT[status]}`} aria-hidden="true" />
        <span className="text-xs font-medium text-gray-300">{t('game.discordSession.heading')}</span>
        <span className="text-xs text-gray-400">· {statusLabel}</span>
        {status === 'active' && (
          <span className="text-xs text-gray-400">
            ·{' '}
            {voiceConnected
              ? `🎙 ${t('game.discordSession.voiceConnected')}`
              : `🔇 ${t('game.discordSession.voiceDropped')}`}
          </span>
        )}
      </div>

      {status === 'active' && players.length > 0 && (
        <div className="text-xs text-gray-400 mb-2">
          {t('game.discordSession.players')}: {players.join(', ')}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {status !== 'active' && (
          <button className={btnClass} disabled={busy} onClick={() => void onStart()}>
            {busy ? t('game.discordSession.starting') : t('game.discordSession.start')}
          </button>
        )}
        {status === 'active' && (
          <button className={btnClass} disabled={busy} onClick={() => void onStop()}>
            {busy ? t('game.discordSession.stopping') : t('game.discordSession.stop')}
          </button>
        )}
      </div>

      {status === 'idle' && lastSessionEnd?.reason === 'auto_leave_empty' && (
        <div className="text-xs text-gray-500 mt-2">{t('game.discordSession.autoEnded')}</div>
      )}
      {narrationEnabled && status !== 'active' && (
        <div className="text-xs text-amber-400/80 mt-2">{t('game.discordSession.noSessionHint')}</div>
      )}
      {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
      {recap && (
        <div className="text-xs text-gray-300 mt-2">
          <button className="underline text-gray-400 mb-1" onClick={() => setRecap(null)}>
            {t('game.discordSession.recapTitle')} ✕
          </button>
          <div className="text-gray-400">{recap}</div>
        </div>
      )}

      {/* PHASE-22 22E: opt-in state push + Discord activity feed. */}
      <label className="flex items-center gap-2 mt-3 text-xs text-gray-300 cursor-pointer">
        <input type="checkbox" checked={syncToDiscord} onChange={(e) => setSyncToDiscord(e.target.checked)} />
        {t('game.discordSync.syncToggle')}
      </label>
      <div className="text-xs text-gray-500 mb-1">{t('game.discordSync.syncToggleDesc')}</div>

      <button className="text-xs text-gray-400 underline mt-1" onClick={() => setActivityOpen((o) => !o)}>
        {t('game.discordSync.activityTitle')} {activityOpen ? '▾' : '▸'}
      </button>
      {activityOpen && (
        <div className="mt-1 max-h-40 overflow-y-auto text-xs text-gray-400 font-mono">
          {activity.length === 0 ? (
            <div className="text-gray-500">{t('game.discordSync.activityEmpty')}</div>
          ) : (
            activity.slice(0, 20).map((a) => (
              <div key={a.id} className="truncate">
                {new Date(a.at).toLocaleTimeString()} · {a.summary}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
