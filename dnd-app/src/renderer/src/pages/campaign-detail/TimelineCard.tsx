import { useMemo, useState } from 'react'
import { Card } from '../../components/ui'
import {
  buildTimelineItems,
  getCategoryColor,
  type TimelineItem,
  type TimelineItemType
} from '../../services/timeline-builder'

type _TimelineItem = TimelineItem
type _TimelineItemType = TimelineItemType

import type { Campaign, TimelineMilestone } from '../../types/campaign'

interface TimelineCardProps {
  campaign: Campaign
  saveCampaign: (c: Campaign) => Promise<void>
}

export default function TimelineCard({ campaign, saveCampaign }: TimelineCardProps): JSX.Element {
  const [showAdd, setShowAdd] = useState(false)
  const [newMilestone, setNewMilestone] = useState({
    title: '',
    description: '',
    date: new Date().toISOString().slice(0, 10),
    category: 'custom' as TimelineMilestone['category']
  })

  const items = useMemo(
    () => buildTimelineItems(campaign.journal?.entries ?? [], campaign.milestones ?? []),
    [campaign.journal?.entries, campaign.milestones]
  )

  const handleAddMilestone = async (): Promise<void> => {
    if (!newMilestone.title.trim()) return
    const milestone: TimelineMilestone = {
      id: crypto.randomUUID(),
      title: newMilestone.title.trim(),
      description: newMilestone.description.trim() || undefined,
      date: newMilestone.date,
      category: newMilestone.category,
      createdAt: new Date().toISOString()
    }
    await saveCampaign({
      ...campaign,
      milestones: [...(campaign.milestones ?? []), milestone],
      updatedAt: new Date().toISOString()
    })
    setNewMilestone({ title: '', description: '', date: new Date().toISOString().slice(0, 10), category: 'custom' })
    setShowAdd(false)
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Timeline</h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-xs text-gray-400 hover:text-amber-400 cursor-pointer"
        >
          {showAdd ? 'Cancel' : '+ Milestone'}
        </button>
      </div>

      {/* Add milestone form */}
      {showAdd && (
        <div className="mb-4 p-3 bg-gray-800/50 rounded-lg space-y-2">
          <input
            type="text"
            placeholder="Milestone title"
            value={newMilestone.title}
            onChange={(e) => setNewMilestone((m) => ({ ...m, title: e.target.value }))}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newMilestone.description}
            onChange={(e) => setNewMilestone((m) => ({ ...m, description: e.target.value }))}
            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={newMilestone.date}
              onChange={(e) => setNewMilestone((m) => ({ ...m, date: e.target.value }))}
              className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            />
            <select
              value={newMilestone.category}
              onChange={(e) =>
                setNewMilestone((m) => ({ ...m, category: e.target.value as TimelineMilestone['category'] }))
              }
              className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            >
              <option value="story">Story</option>
              <option value="combat">Combat</option>
              <option value="discovery">Discovery</option>
              <option value="achievement">Achievement</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <button
            onClick={handleAddMilestone}
            disabled={!newMilestone.title.trim()}
            className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Add
          </button>
        </div>
      )}

      {/* Timeline */}
      {items.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          No timeline entries yet. Add a milestone or create journal entries.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex items-start gap-0 min-w-max py-2">
            {items.map((item, i) => (
              <div key={item.id} className="flex items-start">
                <div className="flex flex-col items-center w-32 flex-shrink-0">
                  <div className={`w-3 h-3 rounded-full ${getCategoryColor(item.category)}`} />
                  <div className="w-px h-2 bg-gray-700" />
                  <div className="text-center px-1">
                    <p className="text-xs font-medium text-gray-200 truncate max-w-[7rem]">{item.title}</p>
                    <p className="text-[10px] text-gray-500">{new Date(item.date).toLocaleDateString()}</p>
                    <span
                      className={`inline-block text-[9px] px-1 py-0.5 rounded mt-0.5 ${
                        item.type === 'milestone' ? 'bg-amber-900/40 text-amber-400' : 'bg-gray-800 text-gray-500'
                      }`}
                    >
                      {item.type}
                    </span>
                  </div>
                </div>
                {i < items.length - 1 && <div className="w-8 h-px bg-gray-700 mt-1.5 flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
