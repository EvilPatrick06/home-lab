import type { GameSystem } from '../../types/game-system'
import { GAME_SYSTEMS } from '../../types/game-system'

interface SystemStepProps {
  selected: GameSystem | null
  onSelect: (system: GameSystem) => void
}

export default function SystemStep({ selected, onSelect }: SystemStepProps): JSX.Element {
  const systems = Object.values(GAME_SYSTEMS)

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Choose a Game System</h2>
      <p className="text-gray-400 text-sm mb-6">
        Select the rule system for your campaign. This determines available adventures, rules, and character options.
      </p>

      <div
        className="grid gap-4 max-w-2xl"
        style={{ gridTemplateColumns: `repeat(${Math.min(systems.length, 3)}, 1fr)` }}
      >
        {systems.map((sys) => (
          <button
            key={sys.id}
            onClick={() => onSelect(sys.id)}
            className={`p-6 rounded-lg border text-left transition-all cursor-pointer
              ${
                selected === sys.id
                  ? 'border-amber-500 bg-amber-900/20'
                  : 'border-gray-800 bg-gray-900/50 hover:border-gray-600'
              }`}
          >
            <div className="text-3xl mb-3">{sys.id === 'dnd5e' ? '\u2694' : '\uD83C\uDFB2'}</div>
            <div className="font-semibold text-lg mb-1">{sys.name}</div>
            <div className="text-sm text-gray-400">
              {sys.shortName} &middot; {sys.referenceLabel}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
