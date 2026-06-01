import { useState } from 'react'
import { useT } from '../../../../i18n'
import { useGameStore } from '../../../../stores/use-game-store'

const MOON_PHASE_NAMES = [
  'New Moon',
  'Waxing Crescent',
  'First Quarter',
  'Waxing Gibbous',
  'Full Moon',
  'Waning Gibbous',
  'Last Quarter',
  'Waning Crescent'
] as const

const MOON_PHASE_EMOJIS: Record<string, string> = {
  'New Moon': '\uD83C\uDF11',
  'Waxing Crescent': '\uD83C\uDF12',
  'First Quarter': '\uD83C\uDF13',
  'Waxing Gibbous': '\uD83C\uDF14',
  'Full Moon': '\uD83C\uDF15',
  'Waning Gibbous': '\uD83C\uDF16',
  'Last Quarter': '\uD83C\uDF17',
  'Waning Crescent': '\uD83C\uDF18'
}

export default function MoonOverridePanel(): JSX.Element {
  const { t } = useT()
  const moonOverride = useGameStore((s) => s.moonOverride)
  const setMoonOverride = useGameStore((s) => s.setMoonOverride)

  const [moonMode, setMoonMode] = useState<'auto' | 'manual'>(moonOverride ? 'manual' : 'auto')
  const [selectedMoonPhase, setSelectedMoonPhase] = useState(moonOverride ?? 'Full Moon')

  function applyMoonOverride(): void {
    if (moonMode === 'auto') {
      setMoonOverride(null)
    } else {
      setMoonOverride(selectedMoonPhase)
    }
  }

  return (
    <div className="border-t border-gray-800 pt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-gray-300">{t('game.moonOverridePanel.title')}</div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setMoonMode('auto')
              setMoonOverride(null)
            }}
            className={`px-2 py-0.5 text-xs rounded cursor-pointer ${
              moonMode === 'auto'
                ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40'
                : 'bg-surface-2 text-muted border border-border hover:bg-gray-700'
            }`}
          >
            {t('game.moonOverridePanel.auto')}
          </button>
          <button
            onClick={() => setMoonMode('manual')}
            className={`px-2 py-0.5 text-xs rounded cursor-pointer ${
              moonMode === 'manual'
                ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40'
                : 'bg-surface-2 text-muted border border-border hover:bg-gray-700'
            }`}
          >
            {t('game.moonOverridePanel.manual')}
          </button>
        </div>
      </div>

      {moonMode === 'manual' && (
        <div className="bg-surface-2/50 rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-4 gap-1.5">
            {MOON_PHASE_NAMES.map((phaseName) => (
              <button
                key={phaseName}
                onClick={() => setSelectedMoonPhase(phaseName)}
                className={`flex flex-col items-center gap-0.5 p-2 rounded cursor-pointer border transition-colors ${
                  selectedMoonPhase === phaseName
                    ? 'bg-amber-600/20 border-amber-500/40 text-amber-300'
                    : 'bg-surface-2 border-border text-muted hover:bg-gray-700 hover:text-gray-300'
                }`}
              >
                <span className="text-lg">{MOON_PHASE_EMOJIS[phaseName]}</span>
                <span className="text-[9px] leading-tight text-center">{phaseName}</span>
              </button>
            ))}
          </div>
          <button
            onClick={applyMoonOverride}
            className="px-3 py-1.5 text-xs bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 rounded text-amber-300 cursor-pointer"
          >
            {t('game.moonOverridePanel.apply')}
          </button>
        </div>
      )}
    </div>
  )
}
