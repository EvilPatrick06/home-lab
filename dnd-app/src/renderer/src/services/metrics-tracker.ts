import type { CampaignMetrics } from '../types/campaign'

export function createEmptyMetrics(): CampaignMetrics {
  return {
    sessionsPlayed: 0,
    totalPlaytimeSeconds: 0,
    encountersCompleted: 0,
    totalDamageDealt: 0,
    totalHealingDone: 0,
    lastSessionDate: null
  }
}

export function incrementSession(m: CampaignMetrics): CampaignMetrics {
  return { ...m, sessionsPlayed: m.sessionsPlayed + 1, lastSessionDate: new Date().toISOString() }
}

export function addPlaytime(m: CampaignMetrics, seconds: number): CampaignMetrics {
  return { ...m, totalPlaytimeSeconds: m.totalPlaytimeSeconds + Math.max(0, seconds) }
}

export function incrementEncounter(m: CampaignMetrics): CampaignMetrics {
  return { ...m, encountersCompleted: m.encountersCompleted + 1 }
}

export function trackDamage(m: CampaignMetrics, amount: number): CampaignMetrics {
  return { ...m, totalDamageDealt: m.totalDamageDealt + Math.max(0, amount) }
}

export function trackHealing(m: CampaignMetrics, amount: number): CampaignMetrics {
  return { ...m, totalHealingDone: m.totalHealingDone + Math.max(0, amount) }
}

export function formatPlaytime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours === 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}
