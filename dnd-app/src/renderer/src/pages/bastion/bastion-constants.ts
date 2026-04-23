import type { BastionOrderType } from '../../types/bastion'

export type TabId = 'overview' | 'basic' | 'special' | 'turns' | 'defenders' | 'events'

export const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'basic', label: 'Basic Facilities' },
  { id: 'special', label: 'Special Facilities' },
  { id: 'turns', label: 'Bastion Turns' },
  { id: 'defenders', label: 'Defenders' },
  { id: 'events', label: 'Events Log' }
]

export const ORDER_LABELS: Record<BastionOrderType, string> = {
  craft: 'Craft',
  empower: 'Empower',
  harvest: 'Harvest',
  maintain: 'Maintain',
  recruit: 'Recruit',
  research: 'Research',
  trade: 'Trade'
}

export const ORDER_COLORS: Record<BastionOrderType, string> = {
  craft: 'bg-blue-900/40 text-blue-300 border-blue-700',
  empower: 'bg-purple-900/40 text-purple-300 border-purple-700',
  harvest: 'bg-green-900/40 text-green-300 border-green-700',
  maintain: 'bg-gray-800 text-gray-300 border-gray-600',
  recruit: 'bg-red-900/40 text-red-300 border-red-700',
  research: 'bg-cyan-900/40 text-cyan-300 border-cyan-700',
  trade: 'bg-yellow-900/40 text-yellow-300 border-yellow-700'
}

export const SETTING_LABELS: Record<string, string> = {
  core: 'Core',
  fr: 'Forgotten Realms',
  eberron: 'Eberron'
}
