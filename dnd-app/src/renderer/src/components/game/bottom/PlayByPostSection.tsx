import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '../../../i18n'
import { useCharacterStore } from '../../../stores/use-character-store'
import { usePbpStore } from '../../../stores/use-pbp-store'
import type { Campaign } from '../../../types/campaign'

interface PlayByPostSectionProps {
  campaign: Campaign
}

interface ParticipantRow {
  name: string
  character?: string
}

interface PbpSessionShape {
  active: boolean
  scene: string
  participants: Array<{ name: string; character?: string | null; discord_user_id?: string | null }>
  turn_index: number
  round: number
  reminder_hours: number
  auto_skip: boolean
}

const btnClass =
  'px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-2/60 border border-border/50 text-gray-300 hover:bg-amber-600/20 hover:border-amber-500/40 hover:text-amber-300 transition-all cursor-pointer'
const CADENCES = [12, 24, 48, 72]

/**
 * PHASE-36 36E — DM-only play-by-post control surface. Idle: compose + start a queue (seeded from
 * the campaign roster). Active: inspect the queue (claim/overdue markers), end/skip/re-scene/stop, and
 * toggle opt-in auto-advance. DM-side only; nothing renders for players.
 */
export default function PlayByPostSection({ campaign }: PlayByPostSectionProps): JSX.Element {
  const { t } = useT()
  const characters = useCharacterStore((s) => s.characters)
  const autoAdvance = usePbpStore((s) => s.autoAdvance)
  const setAutoAdvance = usePbpStore((s) => s.setAutoAdvance)
  const setLastStatus = usePbpStore((s) => s.setLastStatus)

  const [expanded, setExpanded] = useState(false)
  const [session, setSession] = useState<PbpSessionShape | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scene, setScene] = useState('')
  const [reminderHours, setReminderHours] = useState(24)
  const [autoSkip, setAutoSkip] = useState(false)
  const [participants, setParticipants] = useState<ParticipantRow[]>([])
  const seededRef = useRef(false)

  // Seed participants once from the campaign roster (displayName + resolved character name).
  useEffect(() => {
    if (seededRef.current) return
    seededRef.current = true
    const rows: ParticipantRow[] = campaign.players.map((p) => ({
      name: p.displayName,
      character: p.characterId ? characters.find((c) => c.id === p.characterId)?.name : undefined
    }))
    setParticipants(rows)
  }, [campaign.players, characters])

  const applyStatus = useCallback(
    (s: PbpSessionShape | null) => {
      setSession(s)
      setLastStatus(
        s
          ? { active: s.active, turnIndex: s.turn_index, round: s.round, scene: s.scene, campaignId: campaign.id }
          : null
      )
    },
    [campaign.id, setLastStatus]
  )

  const poll = useCallback(async () => {
    const res = await window.api.bmoPbpStatus({ campaignId: campaign.id })
    if (res?.session) applyStatus(res.session as PbpSessionShape)
    else applyStatus(null)
  }, [campaign.id, applyStatus])

  // Poll on expand + every 30s while expanded.
  useEffect(() => {
    if (!expanded) return
    void poll()
    const id = setInterval(() => void poll(), 30_000)
    return () => clearInterval(id)
  }, [expanded, poll])

  const handleStart = async (): Promise<void> => {
    setError(null)
    const res = await window.api.bmoPbpStart({
      campaignId: campaign.id,
      scene: scene.trim() || 'Scene',
      participants: participants.filter((p) => p.name.trim()),
      reminderHours,
      autoSkip
    })
    if (res?.ok && res.session) applyStatus(res.session as PbpSessionShape)
    else setError(res?.error ?? 'error')
  }

  const handleEndTurn = async (): Promise<void> => {
    const res = await window.api.bmoPbpAdvance({ campaignId: campaign.id, expectedTurnIndex: session?.turn_index })
    if (res?.session) applyStatus(res.session as PbpSessionShape)
    else void poll() // stale_turn / no session → reconcile from the Pi
  }

  const handleSkip = async (): Promise<void> => {
    const res = await window.api.bmoPbpSkip({ campaignId: campaign.id, expectedTurnIndex: session?.turn_index })
    if (res?.session) applyStatus(res.session as PbpSessionShape)
    else void poll()
  }

  const handleStop = async (): Promise<void> => {
    await window.api.bmoPbpStop({ campaignId: campaign.id })
    applyStatus(null)
  }

  const move = (i: number, delta: number): void => {
    setParticipants((rows) => {
      const next = [...rows]
      const j = i + delta
      if (j < 0 || j >= next.length) return rows
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const errorText = (code: string): string => {
    if (code === 'channel_not_found') return t('game.pbp.channelNotFound')
    if (code === 'already_active') return t('game.pbp.alreadyActive')
    if (code === 'DM bot not running') return t('game.pbp.botDown')
    return code
  }

  const anyUnclaimed = session?.participants.some((p) => !p.discord_user_id)

  return (
    <div className="w-full border-t border-border/40 pt-2 mt-1">
      <button className={btnClass} onClick={() => setExpanded((v) => !v)}>
        {expanded ? '▾' : '▸'} {t('game.pbp.title')}
        {session?.active ? ` · ${t('game.pbp.activeBadge')}` : ''}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 text-xs text-gray-300">
          {error && <p className="text-red-400">{errorText(error)}</p>}

          {!session?.active ? (
            <>
              <input
                className="w-full bg-surface-2 border border-border rounded px-2 py-1"
                placeholder={t('game.pbp.scenePlaceholder')}
                value={scene}
                onChange={(e) => setScene(e.target.value)}
              />
              <div className="space-y-1">
                {participants.map((p, i) => (
                  <div key={`${p.name}-${i}`} className="flex items-center gap-1">
                    <span className="flex-1 truncate">
                      {p.name}
                      {p.character ? ` (${p.character})` : ''}
                    </span>
                    <button className={btnClass} onClick={() => move(i, -1)} aria-label="up">
                      ▲
                    </button>
                    <button className={btnClass} onClick={() => move(i, 1)} aria-label="down">
                      ▼
                    </button>
                    <button
                      className={btnClass}
                      onClick={() => setParticipants((rows) => rows.filter((_, j) => j !== i))}
                      aria-label="remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  className={btnClass}
                  onClick={() => setParticipants((rows) => [...rows, { name: `Player ${rows.length + 1}` }])}
                >
                  {t('game.pbp.addParticipant')}
                </button>
              </div>
              <label className="flex items-center gap-2">
                {t('game.pbp.cadence')}
                <select
                  className="bg-surface-2 border border-border rounded px-1 py-0.5"
                  value={reminderHours}
                  onChange={(e) => setReminderHours(Number.parseInt(e.target.value, 10))}
                >
                  {CADENCES.map((h) => (
                    <option key={h} value={h}>
                      {h}h
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={autoSkip} onChange={(e) => setAutoSkip(e.target.checked)} />
                {t('game.pbp.autoSkip')}
              </label>
              <p className="text-[11px] text-gray-500">{t('game.pbp.autoSkipHint')}</p>
              <button className={btnClass} onClick={handleStart} disabled={participants.length === 0}>
                {t('game.pbp.start')}
              </button>
            </>
          ) : (
            <>
              <p className="text-amber-300">
                {session.scene} · {t('game.pbp.round')} {session.round}
              </p>
              <ul className="space-y-0.5">
                {session.participants.map((p, i) => (
                  <li key={`${p.name}-${i}`}>
                    {i === session.turn_index ? '▶ ' : '　'}
                    {p.discord_user_id ? '✅' : '⬜'} {p.character || p.name}
                  </li>
                ))}
              </ul>
              {anyUnclaimed && <p className="text-[11px] text-gray-500">{t('game.pbp.unclaimedHint')}</p>}
              <div className="flex flex-wrap gap-1">
                <button className={btnClass} onClick={handleEndTurn}>
                  {t('game.pbp.endTurn')}
                </button>
                <button className={btnClass} onClick={handleSkip}>
                  {t('game.pbp.skip')}
                </button>
                <button className={btnClass} onClick={handleStop}>
                  {t('game.pbp.stop')}
                </button>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} />
                {t('game.pbp.autoAdvance')}
              </label>
            </>
          )}
        </div>
      )}
    </div>
  )
}
