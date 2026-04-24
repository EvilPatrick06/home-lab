import type { WeatherCondition } from './calendar-service'

export interface SunPosition {
  sunrise: number // hour of day (e.g., 6.5 = 6:30 AM)
  sunset: number // hour of day (e.g., 18.5 = 6:30 PM)
  isDaytime: boolean
  lightLevel: 'bright' | 'dim' | 'darkness' // based on current hour
}

export interface MoonPhase {
  name: string // "New Moon", "Waxing Crescent", etc.
  illumination: number // 0-1
  emoji: string // moon phase emoji
}

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
