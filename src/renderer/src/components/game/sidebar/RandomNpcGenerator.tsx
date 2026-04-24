import { useState } from 'react'
import { DEFAULT_LOCKS, type GeneratedNpc, type GeneratedNpcLocks, generateRandomNpc } from './npc-templates'

interface RandomNpcGeneratorProps {
  onAccept: (name: string, desc: string) => void
  onCancel: () => void
}

export default function RandomNpcGenerator({ onAccept, onCancel }: RandomNpcGeneratorProps): JSX.Element {
  const [generatedNpc, setGeneratedNpc] = useState<GeneratedNpc>(() => generateRandomNpc())
  const [npcLocks, setNpcLocks] = useState<GeneratedNpcLocks>({ ...DEFAULT_LOCKS })

  const handleAccept = (): void => {
    const npc = generatedNpc
    const appearance = [
      `${npc.species}`,
      `${npc.height}, ${npc.build} build`,
      `${npc.hairColor} ${npc.hairStyle.toLowerCase()} hair`,
      npc.distinguishingFeature,
      `${npc.clothingStyle} clothing`
    ].join('. ')
    const desc = `${appearance}. Voice: ${npc.voice}. ${npc.mannerism}. Personality: ${npc.personalityTrait}.`
    onAccept(npc.name, desc)
  }

  return (
    <div className="bg-gray-900/60 border border-emerald-500/30 rounded-lg p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold">Generated NPC</span>
        <button
          onClick={() => {
            setGeneratedNpc(generateRandomNpc(npcLocks, generatedNpc))
          }}
          className="text-[10px] text-gray-400 hover:text-emerald-400 cursor-pointer"
          title="Re-roll all unlocked fields"
        >
          Re-roll All
        </button>
      </div>

      {/* Generator fields */}
      {(
        [
          ['name', 'Name', generatedNpc.name],
          ['species', 'Species', generatedNpc.species],
          ['height', 'Height', generatedNpc.height],
          ['build', 'Build', generatedNpc.build],
          ['hairColor', 'Hair Color', generatedNpc.hairColor],
          ['hairStyle', 'Hair Style', generatedNpc.hairStyle],
          ['distinguishingFeature', 'Feature', generatedNpc.distinguishingFeature],
          ['clothingStyle', 'Clothing', generatedNpc.clothingStyle],
          ['voice', 'Voice', generatedNpc.voice],
          ['mannerism', 'Mannerism', generatedNpc.mannerism],
          ['personalityTrait', 'Personality', generatedNpc.personalityTrait]
        ] as [keyof GeneratedNpcLocks, string, string][]
      ).map(([field, label, value]) => (
        <div key={field} className="flex items-center gap-1">
          <button
            onClick={() => setNpcLocks((prev) => ({ ...prev, [field]: !prev[field] }))}
            className={`w-5 h-5 flex items-center justify-center text-[10px] shrink-0 cursor-pointer rounded ${
              npcLocks[field] ? 'text-amber-400 bg-amber-400/20' : 'text-gray-600 hover:text-gray-400'
            }`}
            title={npcLocks[field] ? 'Unlock field' : 'Lock field'}
          >
            {npcLocks[field] ? '\u{1F512}' : '\u{1F513}'}
          </button>
          <span className="text-[9px] text-gray-500 w-16 shrink-0">{label}</span>
          <span className="text-[10px] text-gray-200 flex-1 truncate">{value}</span>
          <button
            onClick={() => {
              const singleLock = { ...DEFAULT_LOCKS }
              // Lock everything except this field
              for (const k of Object.keys(singleLock) as (keyof GeneratedNpcLocks)[]) {
                singleLock[k] = k !== field
              }
              setGeneratedNpc(generateRandomNpc(singleLock, generatedNpc))
            }}
            className="w-5 h-5 flex items-center justify-center text-[10px] text-gray-600 hover:text-emerald-400 cursor-pointer shrink-0"
            title={`Re-roll ${label}`}
          >
            &#8635;
          </button>
        </div>
      ))}

      <div className="flex gap-1 pt-1">
        <button
          onClick={handleAccept}
          className="px-2 py-0.5 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer"
        >
          Accept
        </button>
        <button onClick={onCancel} className="px-2 py-0.5 text-[10px] text-gray-400 hover:text-gray-200 cursor-pointer">
          Cancel
        </button>
      </div>
    </div>
  )
}
