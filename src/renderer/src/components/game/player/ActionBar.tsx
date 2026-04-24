import { useEffect, useState } from 'react'

interface ActionBarProps {
  isMyTurn: boolean
  onAction?: (action: string) => void
}

interface Actions5e {
  action: boolean
  bonusAction: boolean
  reaction: boolean
}

// D&D 5e 2024 PHB actions
const ACTIONS_5E = [
  { id: 'attack', label: 'Attack', type: 'action' as const, tooltip: 'Make a melee or ranged attack' },
  { id: 'dash', label: 'Dash', type: 'action' as const, tooltip: 'Double your movement for this turn' },
  {
    id: 'disengage',
    label: 'Disengage',
    type: 'action' as const,
    tooltip: 'Move without provoking Opportunity Attacks'
  },
  {
    id: 'dodge',
    label: 'Dodge',
    type: 'action' as const,
    tooltip:
      'Until your next turn: attacks against you have Disadvantage, DEX saves have Advantage. Lost if Incapacitated or Speed is 0.'
  },
  {
    id: 'help',
    label: 'Help',
    type: 'action' as const,
    tooltip:
      'Assist Check (requires proficiency), Assist Attack (must be within 5 ft of enemy), or Administer First Aid (DC 10 Medicine to stabilize)'
  },
  { id: 'hide', label: 'Hide', type: 'action' as const, tooltip: 'Make a Stealth check to become Hidden' },
  {
    id: 'influence',
    label: 'Influence',
    type: 'action' as const,
    tooltip: 'CHA (Deception/Intimidation/Performance/Persuasion) or WIS (Animal Handling)'
  },
  {
    id: 'magic',
    label: 'Magic',
    type: 'action' as const,
    tooltip: 'Cast a spell, use a magic item, or use a magical feature'
  },
  {
    id: 'ready',
    label: 'Ready',
    type: 'action' as const,
    tooltip: 'Prepare an action with a trigger (uses your Reaction)'
  },
  { id: 'search', label: 'Search', type: 'action' as const, tooltip: 'WIS (Insight/Medicine/Perception/Survival)' },
  {
    id: 'study',
    label: 'Study',
    type: 'action' as const,
    tooltip: 'INT (Arcana/History/Investigation/Nature/Religion)'
  },
  {
    id: 'utilize',
    label: 'Utilize',
    type: 'action' as const,
    tooltip: 'Use a nonmagical object or interact with an object'
  }
]

export default function ActionBar({ isMyTurn, onAction }: ActionBarProps): JSX.Element {
  const [actions5e, setActions5e] = useState<Actions5e>({
    action: false,
    bonusAction: false,
    reaction: false
  })

  // Reset on new turn
  useEffect(() => {
    if (isMyTurn) {
      setActions5e({ action: false, bonusAction: false, reaction: false })
    }
  }, [isMyTurn])

  const handleAction5e = (actionId: string, type: string): void => {
    if (type === 'action' && actions5e.action) return
    if (type === 'bonusAction' && actions5e.bonusAction) return
    if (type === 'reaction' && actions5e.reaction) return

    setActions5e((prev) => ({
      ...prev,
      [type]: true
    }))
    onAction?.(actionId)
  }

  return (
    <div className="flex items-center gap-3">
      {/* Action economy indicators */}
      <div className="flex items-center gap-2 pr-3 border-r border-gray-700">
        <div className="flex flex-col items-center">
          <div
            className={`w-4 h-4 rounded-full border-2 ${
              actions5e.action ? 'bg-gray-600 border-gray-600' : 'bg-amber-600 border-amber-500'
            }`}
          />
          <span className="text-[9px] text-gray-500 mt-0.5">Act</span>
        </div>
        <div className="flex flex-col items-center">
          <div
            className={`w-4 h-4 rounded-full border-2 ${
              actions5e.bonusAction ? 'bg-gray-600 border-gray-600' : 'bg-green-600 border-green-500'
            }`}
          />
          <span className="text-[9px] text-gray-500 mt-0.5">Bonus</span>
        </div>
        <div className="flex flex-col items-center">
          <div
            className={`w-4 h-4 rounded-full border-2 ${
              actions5e.reaction ? 'bg-gray-600 border-gray-600' : 'bg-blue-600 border-blue-500'
            }`}
          />
          <span className="text-[9px] text-gray-500 mt-0.5">React</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-1 flex-wrap">
        {ACTIONS_5E.map((action) => {
          const spent = action.type === 'action' && actions5e.action
          return (
            <button
              key={action.id}
              onClick={() => handleAction5e(action.id, action.type)}
              disabled={spent || !isMyTurn}
              title={!isMyTurn ? 'Not your turn' : spent ? 'Action already used this turn' : action.tooltip}
              className={`px-2.5 py-1 text-xs rounded-lg transition-colors cursor-pointer
                ${
                  spent
                    ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                    : 'bg-gray-800 text-gray-300 hover:bg-amber-600 hover:text-white'
                }
                disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {action.label}
            </button>
          )
        })}
        {/* Mount/Dismount - uses movement, not action */}
        <button
          onClick={() => onAction?.('mount')}
          disabled={!isMyTurn}
          title="Mount or dismount a creature (costs half your speed)"
          className="px-2.5 py-1 text-xs rounded-lg transition-colors cursor-pointer bg-gray-800/50 text-gray-400 hover:bg-green-700 hover:text-white border border-gray-700 border-dashed disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Mount
        </button>
      </div>
    </div>
  )
}
