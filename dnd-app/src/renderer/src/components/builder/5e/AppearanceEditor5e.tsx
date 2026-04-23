import { ALIGNMENT_DESCRIPTIONS } from '../../../data/alignment-descriptions'
import { useBuilderStore } from '../../../stores/use-builder-store'
import SectionBanner from '../shared/SectionBanner'

export default function AppearanceEditor5e(): JSX.Element {
  const characterGender = useBuilderStore((s) => s.characterGender)
  const characterDeity = useBuilderStore((s) => s.characterDeity)
  const characterAge = useBuilderStore((s) => s.characterAge)
  const characterHeight = useBuilderStore((s) => s.characterHeight)
  const characterWeight = useBuilderStore((s) => s.characterWeight)
  const characterEyes = useBuilderStore((s) => s.characterEyes)
  const characterHair = useBuilderStore((s) => s.characterHair)
  const characterSkin = useBuilderStore((s) => s.characterSkin)
  const characterAppearance = useBuilderStore((s) => s.characterAppearance)
  const characterAlignment = useBuilderStore((s) => s.characterAlignment)

  return (
    <>
      <SectionBanner label="CHARACTER DETAILS" />
      <div className="px-4 py-3 space-y-3 border-b border-gray-800">
        <div className="grid grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Gender</label>
            <input
              type="text"
              value={characterGender}
              onChange={(e) => useBuilderStore.setState({ characterGender: e.target.value })}
              placeholder="Not set"
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Deity</label>
            <input
              type="text"
              value={characterDeity}
              onChange={(e) => useBuilderStore.setState({ characterDeity: e.target.value })}
              placeholder="Not set"
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Age</label>
            <input
              type="text"
              value={characterAge}
              onChange={(e) => useBuilderStore.setState({ characterAge: e.target.value })}
              placeholder="Not set"
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Alignment</label>
            <select
              value={characterAlignment}
              onChange={(e) => useBuilderStore.setState({ characterAlignment: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
            >
              <option value="">Not set</option>
              <option value="Lawful Good">Lawful Good</option>
              <option value="Neutral Good">Neutral Good</option>
              <option value="Chaotic Good">Chaotic Good</option>
              <option value="Lawful Neutral">Lawful Neutral</option>
              <option value="Neutral">Neutral</option>
              <option value="Chaotic Neutral">Chaotic Neutral</option>
              <option value="Lawful Evil">Lawful Evil</option>
              <option value="Neutral Evil">Neutral Evil</option>
              <option value="Chaotic Evil">Chaotic Evil</option>
            </select>
            {characterAlignment && ALIGNMENT_DESCRIPTIONS[characterAlignment] && (
              <p className="text-xs text-gray-500 mt-1">{ALIGNMENT_DESCRIPTIONS[characterAlignment]}</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Height</label>
            <input
              type="text"
              value={characterHeight}
              onChange={(e) => useBuilderStore.setState({ characterHeight: e.target.value })}
              placeholder="e.g. 5'10&quot;"
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Weight</label>
            <input
              type="text"
              value={characterWeight}
              onChange={(e) => useBuilderStore.setState({ characterWeight: e.target.value })}
              placeholder="e.g. 180 lbs"
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Eyes</label>
            <input
              type="text"
              value={characterEyes}
              onChange={(e) => useBuilderStore.setState({ characterEyes: e.target.value })}
              placeholder="Not set"
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Hair</label>
            <input
              type="text"
              value={characterHair}
              onChange={(e) => useBuilderStore.setState({ characterHair: e.target.value })}
              placeholder="Not set"
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Skin</label>
            <input
              type="text"
              value={characterSkin}
              onChange={(e) => useBuilderStore.setState({ characterSkin: e.target.value })}
              placeholder="Not set"
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Appearance</label>
          <textarea
            value={characterAppearance}
            onChange={(e) => useBuilderStore.setState({ characterAppearance: e.target.value })}
            placeholder="Describe your character's appearance..."
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-y"
          />
        </div>
      </div>
    </>
  )
}
