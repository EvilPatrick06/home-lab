export type WeatherType = 'clear' | 'rain' | 'heavy-rain' | 'fog' | 'snow' | 'blizzard' | 'sandstorm'

interface WeatherEffect {
  weather: WeatherType
  visibilityRadius: number // in grid squares, -1 = unlimited
  speedModifier: number // multiplier (1 = normal, 0.5 = half speed)
  disadvantageRanged: boolean
  disadvantagePerception: boolean
  description: string
}

const WEATHER_EFFECTS: Record<WeatherType, WeatherEffect> = {
  clear: {
    weather: 'clear',
    visibilityRadius: -1,
    speedModifier: 1,
    disadvantageRanged: false,
    disadvantagePerception: false,
    description: 'Clear weather. No mechanical effects.'
  },
  rain: {
    weather: 'rain',
    visibilityRadius: -1,
    speedModifier: 1,
    disadvantageRanged: false,
    disadvantagePerception: true,
    description: 'Light rain. Disadvantage on Perception checks that rely on hearing.'
  },
  'heavy-rain': {
    weather: 'heavy-rain',
    visibilityRadius: 12,
    speedModifier: 1,
    disadvantageRanged: true,
    disadvantagePerception: true,
    description: 'Heavy rain. Lightly obscured area. Disadvantage on ranged attacks and Perception checks.'
  },
  fog: {
    weather: 'fog',
    visibilityRadius: 6,
    speedModifier: 1,
    disadvantageRanged: true,
    disadvantagePerception: true,
    description: 'Dense fog. Heavily obscured beyond 30 ft. Disadvantage on ranged attacks and Perception.'
  },
  snow: {
    weather: 'snow',
    visibilityRadius: 12,
    speedModifier: 0.5,
    disadvantageRanged: false,
    disadvantagePerception: true,
    description: 'Snowfall. Difficult terrain. Disadvantage on Perception checks.'
  },
  blizzard: {
    weather: 'blizzard',
    visibilityRadius: 4,
    speedModifier: 0.5,
    disadvantageRanged: true,
    disadvantagePerception: true,
    description: 'Blizzard. Heavily obscured. Difficult terrain. Disadvantage on ranged attacks and Perception.'
  },
  sandstorm: {
    weather: 'sandstorm',
    visibilityRadius: 4,
    speedModifier: 0.5,
    disadvantageRanged: true,
    disadvantagePerception: true,
    description: 'Sandstorm. Heavily obscured. Difficult terrain. Disadvantage on ranged attacks and Perception.'
  }
}

/**
 * Get the mechanical effects for a given weather type.
 */
export function getWeatherEffects(weather: WeatherType): WeatherEffect {
  return WEATHER_EFFECTS[weather]
}

/**
 * Get the visibility radius in grid squares for a weather type.
 * Returns -1 for unlimited visibility.
 */
export function getVisibilityRadius(weather: WeatherType): number {
  return WEATHER_EFFECTS[weather].visibilityRadius
}

/**
 * Get all available weather types.
 */
export function getWeatherTypes(): WeatherType[] {
  return Object.keys(WEATHER_EFFECTS) as WeatherType[]
}
