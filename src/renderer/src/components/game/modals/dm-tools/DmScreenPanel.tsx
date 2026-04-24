import { useEffect, useState } from 'react'
import { CONDITIONS_5E } from '../../../../data/conditions'

interface DmScreenPanelProps {
  onClose: () => void
}

const COMBAT_ACTIONS = [
  { name: 'Attack', description: 'Make one melee or ranged attack (or more with Extra Attack).' },
  { name: 'Cast a Spell', description: 'Cast a spell with a casting time of 1 action.' },
  { name: 'Dash', description: 'Gain extra movement equal to your speed for this turn.' },
  { name: 'Disengage', description: "Your movement doesn't provoke opportunity attacks for this turn." },
  { name: 'Dodge', description: 'Attacks against you have disadvantage; Dex saves have advantage.' },
  { name: 'Help', description: 'Give an ally advantage on their next ability check or attack roll.' },
  { name: 'Hide', description: 'Make a Dexterity (Stealth) check to become hidden.' },
  { name: 'Ready', description: 'Prepare an action to trigger in response to a specified event.' },
  { name: 'Search', description: 'Make a Wisdom (Perception) or Intelligence (Investigation) check.' },
  { name: 'Use an Object', description: 'Interact with a second object or use a special object feature.' }
]

const COVER_RULES = [
  { type: 'Half Cover', bonus: '+2 AC, +2 Dex saves', description: 'At least half the target is covered.' },
  {
    type: 'Three-Quarters Cover',
    bonus: '+5 AC, +5 Dex saves',
    description: 'Only a quarter of the target is exposed.'
  },
  { type: 'Total Cover', bonus: "Can't be targeted", description: 'The target is completely concealed.' }
]

const DIFFICULTY_CLASSES = [
  { dc: 5, label: 'Very Easy' },
  { dc: 10, label: 'Easy' },
  { dc: 15, label: 'Medium' },
  { dc: 20, label: 'Hard' },
  { dc: 25, label: 'Very Hard' },
  { dc: 30, label: 'Nearly Impossible' }
]

const TRAVEL_PACES = [
  { pace: 'Fast', speed: '400 ft/min, 4 mph, 30 miles/day', effect: '-5 penalty to passive Perception' },
  { pace: 'Normal', speed: '300 ft/min, 3 mph, 24 miles/day', effect: 'No effect' },
  { pace: 'Slow', speed: '200 ft/min, 2 mph, 18 miles/day', effect: 'Able to use Stealth' }
]

function CollapsibleSection({
  title,
  defaultOpen,
  children
}: {
  title: string
  defaultOpen: boolean
  children: React.ReactNode
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-700/50 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-amber-400 hover:bg-gray-800/50 cursor-pointer"
      >
        <span>{title}</span>
        <span className="text-gray-500">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

export default function DmScreenPanel({ onClose }: DmScreenPanelProps): JSX.Element {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-gray-900 border-l border-gray-700 shadow-2xl z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-900/95">
        <h2 className="text-sm font-bold text-amber-400">DM Screen</h2>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 cursor-pointer"
        >
          X
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <CollapsibleSection title="Conditions" defaultOpen>
          <div className="space-y-1">
            {CONDITIONS_5E.length > 0 ? (
              CONDITIONS_5E.map((c) => (
                <div key={c.name} className="flex gap-2">
                  <span className="text-[10px] font-semibold text-gray-200 min-w-[80px] shrink-0">{c.name}</span>
                  <span className="text-[10px] text-gray-400">{c.description}</span>
                </div>
              ))
            ) : (
              <p className="text-[10px] text-gray-500 italic">Loading conditions...</p>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Actions in Combat" defaultOpen>
          <div className="space-y-1.5">
            {COMBAT_ACTIONS.map((a) => (
              <div key={a.name}>
                <span className="text-[10px] font-semibold text-gray-200">{a.name}: </span>
                <span className="text-[10px] text-gray-400">{a.description}</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Cover Rules" defaultOpen>
          <div className="space-y-1.5">
            {COVER_RULES.map((c) => (
              <div key={c.type}>
                <span className="text-[10px] font-semibold text-gray-200">{c.type} </span>
                <span className="text-[10px] text-amber-400">({c.bonus})</span>
                <span className="text-[10px] text-gray-400"> — {c.description}</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Difficulty Classes" defaultOpen>
          <div className="grid grid-cols-2 gap-1">
            {DIFFICULTY_CLASSES.map((d) => (
              <div key={d.dc} className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-amber-400 w-6 text-right">{d.dc}</span>
                <span className="text-[10px] text-gray-300">{d.label}</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Travel Pace" defaultOpen>
          <div className="space-y-1.5">
            {TRAVEL_PACES.map((p) => (
              <div key={p.pace}>
                <span className="text-[10px] font-semibold text-gray-200">{p.pace}: </span>
                <span className="text-[10px] text-gray-400">{p.speed}</span>
                <div className="text-[10px] text-gray-500 ml-2">{p.effect}</div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      </div>
    </div>
  )
}
