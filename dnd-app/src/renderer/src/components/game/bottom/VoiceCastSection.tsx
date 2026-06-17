import { useCallback, useEffect, useState } from 'react'
import { useT } from '../../../i18n'

// PHASE-21 21C (F): collapsible per-NPC voice-cast manager. On expand it fetches
// the campaign cast + the backend's voice pool, lets the DM override a voice via a
// <select>, and re-roll (delete → deterministic re-cast). List-only, no modal.
interface CastEntry {
  speaker: string
  backend: string
  voice_id: string
  speed: number
  pitch: number
}

interface Props {
  campaignId: string
}

const btnClass =
  'px-2 py-1 text-xs rounded bg-surface-2/60 border border-border/50 text-gray-300 hover:bg-amber-600/20 hover:text-amber-300 transition-all cursor-pointer disabled:opacity-50'

export default function VoiceCastSection({ campaignId }: Props): JSX.Element {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [cast, setCast] = useState<CastEntry[]>([])
  const [pool, setPool] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!window.api?.bmoVoiceCastGet) return
    setLoading(true)
    setError(null)
    const res = await window.api.bmoVoiceCastGet(campaignId)
    if (res?.ok === false || res?.error) {
      setError(res.error ?? t('game.dmTabPanel.voiceCastError'))
    } else {
      setCast((res.cast ?? []) as CastEntry[])
      setPool(res.pool ?? [])
    }
    setLoading(false)
  }, [campaignId, t])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const onSetVoice = async (speaker: string, voiceId: string): Promise<void> => {
    if (!window.api?.bmoVoiceCastSet) return
    await window.api.bmoVoiceCastSet({ campaignId, speaker, voiceId })
    void refresh()
  }

  const onReroll = async (speaker: string): Promise<void> => {
    if (!window.api?.bmoVoiceCastReset) return
    await window.api.bmoVoiceCastReset(campaignId, speaker)
    void refresh()
  }

  return (
    <div className="w-full mt-2">
      <button className={btnClass} onClick={() => setOpen((o) => !o)}>
        {t('game.dmTabPanel.voiceCast')} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="mt-2 p-2 rounded-lg border border-border/50 bg-surface-2/40 flex flex-col gap-1.5">
          {loading && <div className="text-xs text-gray-500">{t('game.dmTabPanel.voiceCastLoading')}</div>}
          {error && <div className="text-xs text-red-400">{error}</div>}
          {!loading && !error && cast.length === 0 && (
            <div className="text-xs text-gray-500">{t('game.dmTabPanel.voiceCastEmpty')}</div>
          )}
          {cast.map((e) => (
            <div key={e.speaker} className="flex items-center gap-2 text-xs">
              <span className="text-gray-300 min-w-20 truncate">{e.speaker}</span>
              {pool.length > 0 ? (
                <select
                  className="bg-surface-2/60 border border-border/50 rounded px-1 py-0.5 text-gray-300"
                  value={e.voice_id}
                  onChange={(ev) => void onSetVoice(e.speaker, ev.target.value)}
                >
                  {!pool.includes(e.voice_id) && <option value={e.voice_id}>{e.voice_id || '—'}</option>}
                  {pool.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-gray-500">{e.voice_id || t('game.dmTabPanel.voiceCastDefaultVoice')}</span>
              )}
              <button className={btnClass} onClick={() => void onReroll(e.speaker)}>
                {t('game.dmTabPanel.voiceCastReroll')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
