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
  if (!preset || preset === 'clear') return null
  const effects = getWeatherEffects(preset)
  const mechanics: string[] = []
  if (effects.disadvantageRanged) mechanics.push('Disadv. on ranged attacks')
  if (effects.speedModifier < 1) mechanics.push(`Speed x${effects.speedModifier}`)
  if (effects.disadvantagePerception) mechanics.push('Disadv. on Perception')
  return (
    <div className="absolute top-12 left-1/2 -translate-x-1/2 z-[2] px-3 py-1.5 bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-lg shadow-lg pointer-events-none max-w-md text-center">
      <span className="text-xs font-semibold text-amber-300">{effects.description}</span>
      {mechanics.length > 0 && <span className="text-xs text-gray-400 ml-2">{mechanics.join(' · ')}</span>}
    </div>
  )
}
