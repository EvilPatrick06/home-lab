import { rollPersonalityTraits } from '../../../data/personality-tables'
import { useBuilderStore } from '../../../stores/use-builder-store'
import SectionBanner from '../shared/SectionBanner'

export default function PersonalityEditor5e(): JSX.Element {
  const characterPersonality = useBuilderStore((s) => s.characterPersonality)
  const characterIdeals = useBuilderStore((s) => s.characterIdeals)
  const characterBonds = useBuilderStore((s) => s.characterBonds)
  const characterFlaws = useBuilderStore((s) => s.characterFlaws)
  const characterBackstory = useBuilderStore((s) => s.characterBackstory)
  const characterNotes = useBuilderStore((s) => s.characterNotes)
  const characterAlignment = useBuilderStore((s) => s.characterAlignment)
  const buildSlots = useBuilderStore((s) => s.buildSlots)
  const abilityScores = useBuilderStore((s) => s.abilityScores)
  const backgroundAbilityBonuses = useBuilderStore((s) => s.backgroundAbilityBonuses)

  return (
    <>
      <SectionBanner label="PERSONALITY & BACKSTORY" />
      <div className="px-4 py-3 space-y-3 border-b border-gray-800">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">Personality</label>
            {buildSlots.find((s) => s.id === 'ability-scores')?.selectedId && (
              <button
                onClick={() => {
                  const traits = rollPersonalityTraits(abilityScores, backgroundAbilityBonuses, characterAlignment)
                  if (traits.length === 0) return
                  const result = traits.join(', ')
                  const current = characterPersonality.trim()
                  const updated = current ? `${current}, ${result}` : result
                  useBuilderStore.setState({ characterPersonality: updated })
                }}
                className="text-[10px] px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-gray-900 font-semibold cursor-pointer"
              >
                Roll Personality Ideas
              </button>
            )}
          </div>
          <textarea
            value={characterPersonality}
            onChange={(e) => useBuilderStore.setState({ characterPersonality: e.target.value })}
            placeholder="Describe personality traits..."
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-y"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Ideals</label>
          <textarea
            value={characterIdeals}
            onChange={(e) => useBuilderStore.setState({ characterIdeals: e.target.value })}
            placeholder="What drives this character?"
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-y"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Bonds</label>
          <textarea
            value={characterBonds}
            onChange={(e) => useBuilderStore.setState({ characterBonds: e.target.value })}
            placeholder="Important connections and relationships..."
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-y"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Flaws</label>
          <textarea
            value={characterFlaws}
            onChange={(e) => useBuilderStore.setState({ characterFlaws: e.target.value })}
            placeholder="Weaknesses and vices..."
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-y"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Backstory</label>
          <textarea
            value={characterBackstory}
            onChange={(e) => useBuilderStore.setState({ characterBackstory: e.target.value })}
            placeholder="Write character backstory..."
            rows={4}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-y"
          />
        </div>
      </div>

      {/* NOTES */}
      <SectionBanner label="NOTES" />
      <div className="px-4 py-3 border-b border-gray-800">
        <textarea
          value={characterNotes}
          onChange={(e) => useBuilderStore.setState({ characterNotes: e.target.value })}
          placeholder="Write character notes here..."
          rows={4}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-y"
        />
      </div>
    </>
  )
}
