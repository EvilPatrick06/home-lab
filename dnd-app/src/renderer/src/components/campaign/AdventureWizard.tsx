import adventureSeedsJson from '@data/5e/world/adventure-seeds.json'
import { useState } from 'react'
import { load5eAdventureSeeds } from '../../services/data-provider'

const ADVENTURE_SEEDS: Record<string, string[]> = adventureSeedsJson

/** Load adventure seeds from the data store (includes plugin seeds). */
export async function loadAdventureSeedData(): Promise<unknown> {
  return load5eAdventureSeeds()
}

interface AdventureData {
  title: string
  levelTier: string
  premise: string
  hook: string
  villain: string
  setting: string
  playerStakes: string
  encounters: string
  climax: string
  resolution: string
}

const EMPTY_ADVENTURE: AdventureData = {
  title: '',
  levelTier: '1-4',
  premise: '',
  hook: '',
  villain: '',
  setting: '',
  playerStakes: '',
  encounters: '',
  climax: '',
  resolution: ''
}

interface AdventureWizardProps {
  onSave: (adventure: AdventureData) => void
  onCancel: () => void
}

export default function AdventureWizard({ onSave, onCancel }: AdventureWizardProps): JSX.Element {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<AdventureData>({ ...EMPTY_ADVENTURE })

  const update = (field: keyof AdventureData, value: string): void => {
    setData((prev) => ({ ...prev, [field]: value }))
  }

  const rollSeed = (): void => {
    const seeds = ADVENTURE_SEEDS[data.levelTier]
    const seed = seeds[Math.floor(Math.random() * seeds.length)]
    update('premise', seed)
  }

  const steps = [
    {
      title: 'Step 1: Lay Out the Premise',
      description: 'Define the adventure hook, villain or situation, and setting.',
      content: (
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">Adventure Title</label>
            <input
              value={data.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="The Lost Mine of..."
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">Level Tier</label>
            <div className="flex gap-1.5">
              {Object.keys(ADVENTURE_SEEDS).map((tier) => (
                <button
                  key={tier}
                  onClick={() => update('levelTier', tier)}
                  className={`flex-1 py-1.5 text-xs rounded cursor-pointer border transition-colors ${
                    data.levelTier === tier
                      ? 'bg-amber-600/20 border-amber-500/40 text-amber-300'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  Lvl {tier}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-gray-500 uppercase tracking-wide">Premise / Situation</label>
              <button onClick={rollSeed} className="text-[10px] text-purple-400 hover:text-purple-300 cursor-pointer">
                Roll Random Seed
              </button>
            </div>
            <textarea
              value={data.premise}
              onChange={(e) => update('premise', e.target.value)}
              placeholder="What is going on? What situation will the characters encounter?"
              rows={3}
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 resize-none"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">Villain / Antagonist</label>
            <input
              value={data.villain}
              onChange={(e) => update('villain', e.target.value)}
              placeholder="Who or what is the primary threat?"
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">Setting / Location</label>
            <input
              value={data.setting}
              onChange={(e) => update('setting', e.target.value)}
              placeholder="Where does this adventure take place?"
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200"
            />
          </div>
        </div>
      )
    },
    {
      title: 'Step 2: Draw In the Players',
      description: 'Define personal stakes and connections to backstories.',
      content: (
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">Adventure Hook</label>
            <textarea
              value={data.hook}
              onChange={(e) => update('hook', e.target.value)}
              placeholder="How do the characters learn about this adventure? A patron, a rumor, a supernatural omen?"
              rows={3}
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 resize-none"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">Personal Stakes</label>
            <textarea
              value={data.playerStakes}
              onChange={(e) => update('playerStakes', e.target.value)}
              placeholder="What connections do the characters have to this situation? How does it affect people they care about?"
              rows={3}
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 resize-none"
            />
          </div>
        </div>
      )
    },
    {
      title: 'Step 3: Plan Encounters',
      description: 'Outline the combat, social, and exploration encounters.',
      content: (
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">
              Key Encounters (combat, social, exploration)
            </label>
            <textarea
              value={data.encounters}
              onChange={(e) => update('encounters', e.target.value)}
              placeholder={
                "1. (Exploration) The party investigates the abandoned mine...\n2. (Social) They negotiate with the miners' guild...\n3. (Combat) Ambush by kobolds in the tunnels..."
              }
              rows={6}
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 resize-none"
            />
          </div>
          <div className="text-[10px] text-gray-500 bg-gray-800/50 rounded p-2">
            Mix encounter types for variety. Use a blend of combat, social interaction, and exploration. Successive
            encounters should build tension toward the climax.
          </div>
        </div>
      )
    },
    {
      title: 'Step 4: Bring It to an End',
      description: 'Define the climax, resolution, and consequences.',
      content: (
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">Climax</label>
            <textarea
              value={data.climax}
              onChange={(e) => update('climax', e.target.value)}
              placeholder="What is the final confrontation or challenge? How does tension peak?"
              rows={3}
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 resize-none"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">
              Resolution & Consequences
            </label>
            <textarea
              value={data.resolution}
              onChange={(e) => update('resolution', e.target.value)}
              placeholder="What happens after the climax? What are the consequences for success or failure? What seeds does this plant for future adventures?"
              rows={3}
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 resize-none"
            />
          </div>
        </div>
      )
    }
  ]

  const canProceed = step === 0 ? data.title.trim().length > 0 : true

  return (
    <div className="space-y-4">
      {/* Step Indicator */}
      <div className="flex items-center gap-1">
        {steps.map((s, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            className={`flex-1 py-1 text-[10px] rounded cursor-pointer border transition-colors ${
              i === step
                ? 'bg-amber-600/20 border-amber-500/40 text-amber-300'
                : i < step
                  ? 'bg-green-900/20 border-green-500/30 text-green-400'
                  : 'bg-gray-800 border-gray-700 text-gray-500'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Step Content */}
      <div>
        <h4 className="text-sm font-semibold text-gray-200">{steps[step].title}</h4>
        <p className="text-[11px] text-gray-500 mb-3">{steps[step].description}</p>
        {steps[step].content}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-800">
        <button
          onClick={step === 0 ? onCancel : () => setStep(step - 1)}
          className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded text-gray-300 cursor-pointer"
        >
          {step === 0 ? 'Cancel' : 'Back'}
        </button>
        {step < steps.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed}
            className="px-4 py-1.5 text-xs bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 rounded text-amber-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        ) : (
          <button
            onClick={() => onSave(data)}
            className="px-4 py-1.5 text-xs bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 rounded text-green-300 cursor-pointer"
          >
            Save Adventure
          </button>
        )}
      </div>
    </div>
  )
}

export type { AdventureData }
