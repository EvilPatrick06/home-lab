import type { JournalEntry, TimelineMilestone } from '../types/campaign'

export type TimelineItemType = 'journal' | 'milestone'

export interface TimelineItem {
  id: string
  type: TimelineItemType
  title: string
  description?: string
  date: string
  category?: string
}

/**
 * Merge journal entries and milestones into a single sorted timeline.
 */
export function buildTimelineItems(journal: JournalEntry[], milestones: TimelineMilestone[]): TimelineItem[] {
  const journalItems: TimelineItem[] = journal.map((e) => ({
    id: e.id,
    type: 'journal' as const,
    title: e.title || `Session ${e.sessionNumber}`,
    description: e.content.slice(0, 200),
    date: e.date || e.createdAt,
    category: 'session'
  }))

  const milestoneItems: TimelineItem[] = milestones.map((m) => ({
    id: m.id,
    type: 'milestone' as const,
    title: m.title,
    description: m.description,
    date: m.date,
    category: m.category
  }))

  return [...journalItems, ...milestoneItems].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

/**
 * Get the color class for a timeline item category.
 */
export function getCategoryColor(category?: string): string {
  switch (category) {
    case 'story':
      return 'bg-blue-500'
    case 'combat':
      return 'bg-red-500'
    case 'discovery':
      return 'bg-green-500'
    case 'achievement':
      return 'bg-amber-500'
    case 'session':
      return 'bg-gray-500'
    case 'custom':
      return 'bg-purple-500'
    default:
      return 'bg-gray-600'
  }
}
