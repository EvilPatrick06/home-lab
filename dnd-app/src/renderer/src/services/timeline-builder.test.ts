import { describe, expect, it } from 'vitest'
import type { JournalEntry, TimelineMilestone } from '../types/campaign'
import { buildTimelineItems, getCategoryColor } from './timeline-builder'

describe('timeline-builder', () => {
  const mockJournal: JournalEntry[] = [
    {
      id: 'j1',
      sessionNumber: 1,
      date: '2024-01-15',
      title: 'Session 1',
      content: 'The party met in a tavern.',
      isPrivate: false,
      authorId: 'dm',
      createdAt: '2024-01-15T00:00:00Z'
    },
    {
      id: 'j2',
      sessionNumber: 2,
      date: '2024-02-01',
      title: 'Session 2',
      content: 'A battle in the forest.',
      isPrivate: false,
      authorId: 'dm',
      createdAt: '2024-02-01T00:00:00Z'
    }
  ]

  const mockMilestones: TimelineMilestone[] = [
    {
      id: 'm1',
      title: 'Defeated the Dragon',
      description: 'The party slew the red dragon.',
      date: '2024-01-20',
      category: 'combat',
      createdAt: '2024-01-20T00:00:00Z'
    }
  ]

  it('merges and sorts journal entries and milestones', () => {
    const items = buildTimelineItems(mockJournal, mockMilestones)
    expect(items).toHaveLength(3)
    expect(items[0].id).toBe('j1')
    expect(items[1].id).toBe('m1')
    expect(items[2].id).toBe('j2')
  })

  it('returns empty array for no inputs', () => {
    expect(buildTimelineItems([], [])).toEqual([])
  })

  it('handles journal-only timeline', () => {
    const items = buildTimelineItems(mockJournal, [])
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.type === 'journal')).toBe(true)
  })

  it('handles milestone-only timeline', () => {
    const items = buildTimelineItems([], mockMilestones)
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('milestone')
  })

  it('truncates journal content to 200 chars', () => {
    const longJournal: JournalEntry[] = [
      {
        id: 'long',
        sessionNumber: 1,
        date: '2024-01-01',
        title: 'Long Session',
        content: 'x'.repeat(500),
        isPrivate: false,
        authorId: 'dm',
        createdAt: '2024-01-01T00:00:00Z'
      }
    ]
    const items = buildTimelineItems(longJournal, [])
    expect(items[0].description!.length).toBe(200)
  })

  describe('getCategoryColor', () => {
    it('returns correct colors', () => {
      expect(getCategoryColor('story')).toBe('bg-blue-500')
      expect(getCategoryColor('combat')).toBe('bg-red-500')
      expect(getCategoryColor('discovery')).toBe('bg-green-500')
      expect(getCategoryColor('achievement')).toBe('bg-amber-500')
      expect(getCategoryColor('session')).toBe('bg-gray-500')
      expect(getCategoryColor('custom')).toBe('bg-purple-500')
    })

    it('returns default for unknown category', () => {
      expect(getCategoryColor('unknown')).toBe('bg-gray-600')
      expect(getCategoryColor(undefined)).toBe('bg-gray-600')
    })
  })
})
