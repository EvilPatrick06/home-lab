import type { TurnMode } from '../../types/campaign'
import { Input } from '../ui'

interface DetailsData {
  name: string
  description: string
  maxPlayers: number
  turnMode: TurnMode
  lobbyMessage: string
}

interface DetailsStepProps {
  data: DetailsData
  onChange: (data: DetailsData) => void
}

export default function DetailsStep({ data, onChange }: DetailsStepProps): JSX.Element {
  const update = <K extends keyof DetailsData>(key: K, value: DetailsData[K]): void => {
    onChange({ ...data, [key]: value })
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Campaign Details</h2>
      <p className="text-gray-400 text-sm mb-6">Give your campaign a name and configure basic settings.</p>

      <div className="max-w-lg space-y-5">
        <Input
          label="Campaign Name"
          placeholder="e.g. The Dragon's Lair"
          value={data.name}
          onChange={(e) => update('name', e.target.value)}
          required
        />

        <div>
          <label className="block text-gray-400 mb-2 text-sm">Description</label>
          <textarea
            className="w-full p-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
              placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors resize-none"
            rows={3}
            placeholder="A brief description of your campaign..."
            value={data.description}
            onChange={(e) => update('description', e.target.value)}
          />
        </div>

        <div>
          <label className="block text-gray-400 mb-2 text-sm">Max Players</label>
          <input
            type="number"
            min={2}
            max={8}
            className="w-24 p-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
              focus:outline-none focus:border-amber-500 transition-colors"
            value={data.maxPlayers}
            onChange={(e) => {
              const val = Math.max(2, Math.min(8, parseInt(e.target.value, 10) || 2))
              update('maxPlayers', val)
            }}
          />
          <span className="text-gray-500 text-sm ml-3">2 - 8 players</span>
        </div>

        <div>
          <label className="block text-gray-400 mb-2 text-sm">Turn Mode</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => update('turnMode', 'initiative')}
              className={`flex-1 p-3 rounded-lg border text-left transition-all cursor-pointer
                ${
                  data.turnMode === 'initiative'
                    ? 'border-amber-500 bg-amber-900/20'
                    : 'border-gray-700 bg-gray-900/50 hover:border-gray-600'
                }`}
            >
              <div className="font-semibold text-sm">Initiative</div>
              <div className="text-xs text-gray-400 mt-1">Turn order based on initiative rolls</div>
            </button>
            <button
              type="button"
              onClick={() => update('turnMode', 'free')}
              className={`flex-1 p-3 rounded-lg border text-left transition-all cursor-pointer
                ${
                  data.turnMode === 'free'
                    ? 'border-amber-500 bg-amber-900/20'
                    : 'border-gray-700 bg-gray-900/50 hover:border-gray-600'
                }`}
            >
              <div className="font-semibold text-sm">Free</div>
              <div className="text-xs text-gray-400 mt-1">Players act in any order</div>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-gray-400 mb-2 text-sm">Lobby Message (optional)</label>
          <textarea
            className="w-full p-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-100
              placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors resize-none"
            rows={2}
            placeholder="A message players see when joining the lobby..."
            value={data.lobbyMessage}
            onChange={(e) => update('lobbyMessage', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}
