import { useT } from '../../../i18n'
import { getWeatherEffects, type WeatherType } from '../../../services/weather-mechanics'

interface WeatherBannerProps {
  /** Active weather preset (from gameStore.weatherOverride). */
  preset: WeatherType | undefined
}

/**
 * Map-overlay banner describing the active weather's mechanical effects.
 * Renders nothing for no preset or 'clear'. Extracted from the inline IIFE
 * in GameLayout — same markup, same effect lookup.
 */
export default function WeatherBanner({ preset }: WeatherBannerProps): JSX.Element | null {
  const { t } = useT()
  if (!preset || preset === 'clear') return null
  const effects = getWeatherEffects(preset)
  const mechanics: string[] = []
  if (effects.disadvantageRanged) mechanics.push(t('game.weatherBanner.disadvRanged'))
  if (effects.speedModifier < 1) mechanics.push(t('game.weatherBanner.speedModifier', { value: effects.speedModifier }))
  if (effects.disadvantagePerception) mechanics.push(t('game.weatherBanner.disadvPerception'))
  return (
    <div className="absolute top-12 start-1/2 -translate-x-1/2 z-[2] px-3 py-1.5 bg-surface/80 backdrop-blur-sm border border-border/50 rounded-lg shadow-lg pointer-events-none max-w-md text-center">
      <span className="text-xs font-semibold text-amber-300">{effects.description}</span>
      {mechanics.length > 0 && <span className="text-xs text-muted ms-2">{mechanics.join(' · ')}</span>}
    </div>
  )
}
