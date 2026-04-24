// ============================================================================
// Calendar Utility Service
// Sunrise/sunset, moon phases, weather generation based on in-game time.
// All functions are pure — no imports from other project files needed.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SunPosition {
  sunrise: number // hour of day (e.g., 6.5 = 6:30 AM)
  sunset: number // hour of day (e.g., 18.5 = 6:30 PM)
  isDaytime: boolean
  lightLevel: 'bright' | 'dim' | 'darkness' // based on current hour
}

interface MoonPhase {
  name: string // "New Moon", "Waxing Crescent", etc.
  illumination: number // 0-1
  emoji: string // moon phase emoji
}

export type WeatherCondition =
  | 'clear'
  | 'clouds'
  | 'overcast'
  | 'rain'
  | 'heavy-rain'
  | 'thunderstorm'
  | 'snow'
  | 'blizzard'
  | 'fog'
  | 'wind'

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

export interface Weather {
  condition: WeatherCondition
  temperature: string // e.g., "Warm (75\u00b0F)", "Cold (20\u00b0F)"
  windSpeed: 'calm' | 'light' | 'moderate' | 'strong' | 'gale'
  description: string // Human-readable: "A light rain falls under overcast skies"
  mechanicalEffects: string[] // e.g., ["Heavy rain: disadvantage on Perception checks relying on sight"]
}

export interface TimeBreakdown {
  totalDays: number
  dayOfYear: number
  hour: number
  minute: number
  second: number
}

// ---------------------------------------------------------------------------
// Deterministic hash (Knuth multiplicative + Murmur-style mixing)
// Returns a value in [0, 1).
// ---------------------------------------------------------------------------

function simpleHash(n: number): number {
  let h = Math.imul(n, 2654435761)
  h = Math.imul((h >>> 16) ^ h, 0x45d9f3b)
  h = Math.imul((h >>> 16) ^ h, 0x45d9f3b)
  h = (h >>> 16) ^ h
  return (h >>> 0) / 0xffffffff
}

// ---------------------------------------------------------------------------
// Sun position
// ---------------------------------------------------------------------------

/**
 * Determine sunrise/sunset based on day of year using a sinusoidal model.
 *
 * Summer solstice (longest day): sunrise ~5:30, sunset ~20:30 (15 h daylight)
 * Winter solstice (shortest day): sunrise ~7:30, sunset ~16:30 (9 h daylight)
 *
 * The cycle peaks at ~25% of the year (summer solstice) for a northern-
 * hemisphere feel: cos peaks when dayOfYear/daysPerYear ~ 0.25.
 *
 * @param dayOfYear  1-based day within the current year
 * @param currentHour  fractional hour of day (0-23.999)
 * @param daysPerYear  total days in the calendar year (0 treated as 365)
 */
export function getSunPosition(dayOfYear: number, currentHour: number, daysPerYear: number): SunPosition {
  const effectiveDays = daysPerYear > 0 ? daysPerYear : 365

  // Fraction through the year, shifted so summer solstice peaks at ~25%
  const yearFraction = ((dayOfYear - 1) / effectiveDays) * 2 * Math.PI
  // cos(yearFraction - PI/2) peaks when dayOfYear ~ 25% of year
  const seasonal = Math.cos(yearFraction - Math.PI / 2)

  // seasonal ranges from -1 (winter solstice) to +1 (summer solstice)
  // Sunrise midpoint = 6.5h, amplitude = 1.0h
  //   summer (seasonal=+1): sunrise = 5.5  (5:30 AM)
  //   winter (seasonal=-1): sunrise = 7.5  (7:30 AM)
  // Sunset midpoint = 18.5h, amplitude = 2.0h
  //   summer (seasonal=+1): sunset = 20.5  (8:30 PM)
  //   winter (seasonal=-1): sunset = 16.5  (4:30 PM)
  const sunriseHour = 6.5 - seasonal * 1.0
  const sunsetHour = 18.5 + seasonal * 2.0

  // Dawn: dim light 30 min before sunrise
  // Dusk: dim light 30 min after sunset
  const dawnStart = sunriseHour - 0.5
  const duskEnd = sunsetHour + 0.5

  const isDaytime = currentHour >= sunriseHour && currentHour < sunsetHour

  let lightLevel: SunPosition['lightLevel']
  if (currentHour >= sunriseHour && currentHour < sunsetHour) {
    lightLevel = 'bright'
  } else if (
    (currentHour >= dawnStart && currentHour < sunriseHour) ||
    (currentHour >= sunsetHour && currentHour < duskEnd)
  ) {
    lightLevel = 'dim'
  } else {
    lightLevel = 'darkness'
  }

  return {
    sunrise: Math.round(sunriseHour * 100) / 100,
    sunset: Math.round(sunsetHour * 100) / 100,
    isDaytime,
    lightLevel
  }
}

// ---------------------------------------------------------------------------
// Moon phase
// ---------------------------------------------------------------------------

const MOON_PHASES: { name: string; emoji: string }[] = [
  { name: 'New Moon', emoji: '\uD83C\uDF11' },
  { name: 'Waxing Crescent', emoji: '\uD83C\uDF12' },
  { name: 'First Quarter', emoji: '\uD83C\uDF13' },
  { name: 'Waxing Gibbous', emoji: '\uD83C\uDF14' },
  { name: 'Full Moon', emoji: '\uD83C\uDF15' },
  { name: 'Waning Gibbous', emoji: '\uD83C\uDF16' },
  { name: 'Last Quarter', emoji: '\uD83C\uDF17' },
  { name: 'Waning Crescent', emoji: '\uD83C\uDF18' }
]

/**
 * Calculate moon phase based on a total day count.
 * Uses a 29.5-day synodic cycle divided into 8 phases.
 */
export function getMoonPhase(totalDays: number): MoonPhase {
  const SYNODIC_PERIOD = 29.5
  const cyclePosition = ((totalDays % SYNODIC_PERIOD) + SYNODIC_PERIOD) % SYNODIC_PERIOD
  const phaseFraction = cyclePosition / SYNODIC_PERIOD // 0-1

  // 8 equal phases, each spanning 1/8 of the cycle
  const phaseIndex = Math.floor(phaseFraction * 8) % 8
  const phase = MOON_PHASES[phaseIndex]

  // Illumination: 0 at new moon (phase 0), peaks at 1 at full moon (phase 4)
  // Use a cosine curve: illumination = (1 - cos(phaseFraction * 2 * PI)) / 2
  const illumination = Math.round(((1 - Math.cos(phaseFraction * 2 * Math.PI)) / 2) * 100) / 100

  return {
    name: phase.name,
    illumination,
    emoji: phase.emoji
  }
}

// ---------------------------------------------------------------------------
// Season
// ---------------------------------------------------------------------------

/**
 * Determine the season based on day of year.
 * Divides the year into 4 equal quarters:
 *   0-25%   spring
 *   25-50%  summer
 *   50-75%  autumn
 *   75-100% winter
 *
 * For daysPerYear = 0 (day counter mode), always returns 'summer'.
 */
export function getSeason(dayOfYear: number, daysPerYear: number): Season {
  if (daysPerYear <= 0) return 'summer'

  const fraction = ((dayOfYear - 1) / daysPerYear) % 1
  if (fraction < 0.25) return 'spring'
  if (fraction < 0.5) return 'summer'
  if (fraction < 0.75) return 'autumn'
  return 'winter'
}

// ---------------------------------------------------------------------------
// Weather generation
// ---------------------------------------------------------------------------

interface WeatherWeights {
  condition: WeatherCondition
  weight: number
}

const SEASON_WEATHER: Record<Season, WeatherWeights[]> = {
  spring: [
    { condition: 'clear', weight: 30 },
    { condition: 'clouds', weight: 20 },
    { condition: 'rain', weight: 15 },
    { condition: 'fog', weight: 15 },
    { condition: 'overcast', weight: 10 },
    { condition: 'wind', weight: 10 }
  ],
  summer: [
    { condition: 'clear', weight: 40 },
    { condition: 'clouds', weight: 20 },
    { condition: 'overcast', weight: 15 },
    { condition: 'thunderstorm', weight: 10 },
    { condition: 'wind', weight: 10 },
    { condition: 'rain', weight: 5 }
  ],
  autumn: [
    { condition: 'clear', weight: 20 },
    { condition: 'clouds', weight: 20 },
    { condition: 'overcast', weight: 20 },
    { condition: 'rain', weight: 20 },
    { condition: 'fog', weight: 10 },
    { condition: 'wind', weight: 10 }
  ],
  winter: [
    { condition: 'clear', weight: 15 },
    { condition: 'clouds', weight: 15 },
    { condition: 'overcast', weight: 20 },
    { condition: 'snow', weight: 15 },
    { condition: 'wind', weight: 15 },
    { condition: 'blizzard', weight: 10 },
    { condition: 'fog', weight: 10 }
  ]
}

/** Temperature ranges per season in Fahrenheit [low, high] */
const SEASON_TEMP_RANGE: Record<Season, [number, number]> = {
  spring: [45, 70],
  summer: [70, 95],
  autumn: [35, 65],
  winter: [5, 35]
}

const TEMP_LABELS: [number, string][] = [
  [0, 'Frigid'],
  [20, 'Bitter Cold'],
  [32, 'Freezing'],
  [50, 'Cool'],
  [65, 'Mild'],
  [75, 'Warm'],
  [85, 'Hot'],
  [100, 'Sweltering']
]

function getTemperatureLabel(tempF: number): string {
  let label = 'Temperate'
  for (const [threshold, name] of TEMP_LABELS) {
    if (tempF >= threshold) label = name
  }
  return label
}

function pickWeightedCondition(weights: WeatherWeights[], roll: number): WeatherCondition {
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0)
  let target = roll * totalWeight
  for (const entry of weights) {
    target -= entry.weight
    if (target <= 0) return entry.condition
  }
  return weights[weights.length - 1].condition
}

function pickWindSpeed(condition: WeatherCondition, roll: number): Weather['windSpeed'] {
  // Wind-heavy conditions guarantee stronger winds
  if (condition === 'wind') {
    return roll < 0.4 ? 'strong' : 'gale'
  }
  if (condition === 'blizzard' || condition === 'thunderstorm') {
    return roll < 0.3 ? 'moderate' : roll < 0.7 ? 'strong' : 'gale'
  }

  // Normal distribution
  if (roll < 0.3) return 'calm'
  if (roll < 0.6) return 'light'
  if (roll < 0.85) return 'moderate'
  if (roll < 0.95) return 'strong'
  return 'gale'
}

function buildDescription(condition: WeatherCondition, windSpeed: Weather['windSpeed'], tempLabel: string): string {
  const conditionText: Record<WeatherCondition, string> = {
    clear: 'Clear skies stretch from horizon to horizon',
    clouds: 'Scattered clouds drift across the sky',
    overcast: 'A thick blanket of grey clouds covers the sky',
    rain: 'A light rain falls steadily',
    'heavy-rain': 'Heavy rain pounds the ground relentlessly',
    thunderstorm: 'Thunder rumbles as lightning splits the darkened sky and rain lashes down',
    snow: 'Soft snowflakes drift down from above',
    blizzard: 'A howling blizzard reduces visibility to near zero as snow whips through the air',
    fog: 'A thick fog hangs low, muffling sound and obscuring the way ahead',
    wind: 'Strong gusts of wind sweep across the land'
  }

  const windText: Record<Weather['windSpeed'], string> = {
    calm: '',
    light: ' with a gentle breeze',
    moderate: ' with a steady wind',
    strong: ' as strong winds gust',
    gale: ' battered by gale-force winds'
  }

  let desc = conditionText[condition]
  // Only append wind text if the condition itself isn't already wind-themed
  if (condition !== 'wind' && condition !== 'blizzard' && condition !== 'thunderstorm') {
    desc += windText[windSpeed]
  }
  desc += `. The air feels ${tempLabel.toLowerCase()}.`
  return desc
}

function getMechanicalEffects(condition: WeatherCondition, windSpeed: Weather['windSpeed'], tempF: number): string[] {
  const effects: string[] = []

  // Precipitation effects
  if (condition === 'heavy-rain' || condition === 'thunderstorm') {
    effects.push('Heavy precipitation: disadvantage on Wisdom (Perception) checks that rely on sight')
    effects.push('Heavy precipitation: disadvantage on ranged attack rolls')
    effects.push('Heavy precipitation: extinguishes open flames and fog-based effects')
  }

  // Fog
  if (condition === 'fog') {
    effects.push('Fog: the area beyond 30 feet is heavily obscured')
  }

  // Blizzard
  if (condition === 'blizzard') {
    effects.push('Blizzard: the area is heavily obscured')
    effects.push('Blizzard: all terrain is difficult terrain')
    effects.push('Blizzard: disadvantage on ranged attack rolls')
  }

  // Strong/gale wind
  if (windSpeed === 'strong' || windSpeed === 'gale') {
    effects.push('Strong wind: disadvantage on ranged attack rolls')
    effects.push('Strong wind: extinguishes open flames (candles, torches, similar)')
  }
  if (windSpeed === 'gale') {
    effects.push('Gale: Small or smaller creatures must succeed on a DC 10 Strength check to move against the wind')
  }

  // Extreme cold (below 0 F)
  if (tempF <= 0) {
    effects.push(
      'Extreme cold: a creature exposed to the cold must succeed on a DC 10 Constitution saving throw at the end of each hour or gain 1 level of Exhaustion. Creatures with resistance or immunity to Cold damage automatically succeed.'
    )
  }

  // Extreme heat (above 100 F)
  if (tempF >= 100) {
    effects.push(
      'Extreme heat: a creature exposed to the heat with no access to drinkable water must succeed on a Constitution saving throw at the end of each hour or gain 1 level of Exhaustion. DC starts at 5 and increases by 1 each hour.'
    )
  }

  return effects
}

/**
 * Generate weather for a given day. Deterministic: same dayOfYear + seed
 * always produces the same result so weather doesn't change on page refresh.
 *
 * @param dayOfYear  1-based day within the current year
 * @param season     current season
 * @param seed       optional seed (defaults to 42)
 */
export function generateWeather(dayOfYear: number, season: Season, seed: number = 42): Weather {
  // Generate several deterministic random values from different hash inputs
  const baseSeed = dayOfYear * 1000 + seed
  const conditionRoll = simpleHash(baseSeed)
  const tempRoll = simpleHash(baseSeed + 1)
  const windRoll = simpleHash(baseSeed + 2)

  // Pick condition
  const weights = SEASON_WEATHER[season]
  const condition = pickWeightedCondition(weights, conditionRoll)

  // Upgrade rain to heavy-rain sometimes (30% chance)
  let finalCondition = condition
  if (condition === 'rain' && simpleHash(baseSeed + 3) < 0.3) {
    finalCondition = 'heavy-rain'
  }

  // Temperature
  const [low, high] = SEASON_TEMP_RANGE[season]
  let tempF = Math.round(low + tempRoll * (high - low))
  // Adjust temperature for cold weather types
  if (finalCondition === 'snow' || finalCondition === 'blizzard') {
    tempF = Math.min(tempF, 32)
  }
  const tempLabel = getTemperatureLabel(tempF)
  const temperature = `${tempLabel} (${tempF}\u00b0F)`

  // Wind speed
  const windSpeed = pickWindSpeed(finalCondition, windRoll)

  // Description
  const description = buildDescription(finalCondition, windSpeed, tempLabel)

  // Mechanical effects
  const mechanicalEffects = getMechanicalEffects(finalCondition, windSpeed, tempF)

  return {
    condition: finalCondition,
    temperature,
    windSpeed,
    description,
    mechanicalEffects
  }
}

// ---------------------------------------------------------------------------
// Time breakdown
// ---------------------------------------------------------------------------

/**
 * Convert totalSeconds into a day/hour/minute/second breakdown.
 *
 * @param totalSeconds   total elapsed in-game seconds
 * @param hoursPerDay    hours in one day (typically 24)
 */
export function timeBreakdown(totalSeconds: number, hoursPerDay: number): TimeBreakdown {
  const effectiveHours = hoursPerDay > 0 ? hoursPerDay : 24
  const secondsPerDay = effectiveHours * 3600

  const totalDays = Math.floor(totalSeconds / secondsPerDay)
  const remainingAfterDays = totalSeconds % secondsPerDay

  const hour = Math.floor(remainingAfterDays / 3600)
  const remainingAfterHours = remainingAfterDays % 3600
  const minute = Math.floor(remainingAfterHours / 60)
  const second = Math.floor(remainingAfterHours % 60)

  // dayOfYear is 1-based; for day-counter mode (daysPerYear=0) just use totalDays+1
  const dayOfYear = totalDays + 1

  return { totalDays, dayOfYear, hour, minute, second }
}

// ---------------------------------------------------------------------------
// Rest tracking formatter
// ---------------------------------------------------------------------------

/**
 * Format a human-readable string showing time elapsed since the last rest.
 *
 * @param lastRestSeconds  the totalSeconds timestamp of the last rest (null if never rested)
 * @param currentSeconds   the current totalSeconds value
 * @returns  e.g., "2h 15m ago" or "Never"
 */
export function formatTimeSinceRest(lastRestSeconds: number | null, currentSeconds: number): string {
  if (lastRestSeconds === null) return 'Never'

  const elapsed = Math.max(0, currentSeconds - lastRestSeconds)

  if (elapsed < 60) {
    return 'Just now'
  }

  const hours = Math.floor(elapsed / 3600)
  const minutes = Math.floor((elapsed % 3600) / 60)

  if (hours === 0) {
    return `${minutes}m ago`
  }
  if (minutes === 0) {
    return `${hours}h ago`
  }
  return `${hours}h ${minutes}m ago`
}

// ---------------------------------------------------------------------------
// Override-aware weather & moon queries
// ---------------------------------------------------------------------------

export interface WeatherOverride {
  description: string
  temperature?: number
  temperatureUnit?: 'F' | 'C'
  windSpeed?: string
  mechanicalEffects?: string[]
  preset?: string
}

/**
 * Map a weather preset name to a WeatherCondition for display.
 */
function presetToCondition(preset: string): WeatherCondition {
  const map: Record<string, WeatherCondition> = {
    Clear: 'clear',
    'Partly Cloudy': 'clouds',
    Overcast: 'overcast',
    'Light Rain': 'rain',
    'Heavy Rain': 'heavy-rain',
    Thunderstorm: 'thunderstorm',
    'Light Snow': 'snow',
    'Heavy Snow': 'snow',
    Blizzard: 'blizzard',
    Fog: 'fog',
    Hail: 'heavy-rain',
    'Extreme Heat': 'clear',
    'Extreme Cold': 'clear',
    Sandstorm: 'wind',
    'Volcanic Ash': 'fog'
  }
  return map[preset] ?? 'clear'
}

/**
 * Map wind speed string to typed wind speed.
 */
function normalizeWindSpeed(ws?: string): Weather['windSpeed'] {
  const map: Record<string, Weather['windSpeed']> = {
    Calm: 'calm',
    'Light Breeze': 'light',
    Moderate: 'moderate',
    Strong: 'strong',
    Gale: 'gale',
    Hurricane: 'gale'
  }
  return (ws && map[ws]) || 'calm'
}

/**
 * Return weather using the DM override if set, otherwise auto-generated.
 */
export function getWeatherWithOverride(
  override: WeatherOverride | null | undefined,
  dayOfYear: number,
  season: Season,
  seed?: number
): Weather {
  if (!override) {
    return generateWeather(dayOfYear, season, seed)
  }

  const condition = override.preset ? presetToCondition(override.preset) : 'clear'
  const windSpeed = normalizeWindSpeed(override.windSpeed)

  let tempF = override.temperature ?? 70
  if (override.temperatureUnit === 'C' && override.temperature != null) {
    tempF = Math.round((override.temperature * 9) / 5 + 32)
  }
  const tempLabel = getTemperatureLabel(tempF)
  const tempUnit = override.temperatureUnit ?? 'F'
  const displayTemp = tempUnit === 'C' ? (override.temperature ?? Math.round(((tempF - 32) * 5) / 9)) : tempF
  const temperature = `${tempLabel} (${displayTemp}\u00b0${tempUnit})`

  const description = override.description || buildDescription(condition, windSpeed, tempLabel)
  const mechanicalEffects =
    override.mechanicalEffects && override.mechanicalEffects.length > 0
      ? override.mechanicalEffects
      : getMechanicalEffects(condition, windSpeed, tempF)

  return {
    condition,
    temperature,
    windSpeed,
    description,
    mechanicalEffects
  }
}

/**
 * Return moon phase using the DM override if set, otherwise auto-generated.
 *
 * @param override  Moon phase name override (e.g. "Full Moon"), or null for auto
 * @param totalDays Total elapsed days for auto calculation
 */
export function getMoonPhaseWithOverride(override: string | null | undefined, totalDays: number): MoonPhase {
  if (!override) {
    return getMoonPhase(totalDays)
  }

  const match = MOON_PHASES.find((p) => p.name === override)
  if (!match) {
    return getMoonPhase(totalDays)
  }

  const idx = MOON_PHASES.indexOf(match)
  const phaseFraction = idx / 8
  const illumination = Math.round(((1 - Math.cos(phaseFraction * 2 * Math.PI)) / 2) * 100) / 100

  return {
    name: match.name,
    illumination,
    emoji: match.emoji
  }
}
