import adventureSeedsJson from '@data/5e/world/adventure-seeds.json'
import { useState } from 'react'
import { useT } from '../../i18n'
import { load5eAdventureSeeds } from '../../services/data-provider'
import { cryptoRandom } from '../../utils/crypto-random'

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
  const { t } = useT()
  const [step, setStep] = useState(0)
  const [data, setData] = useState<AdventureData>({ ...EMPTY_ADVENTURE })

  const update = (field: keyof AdventureData, value: string): void => {
    setData((prev) => ({ ...prev, [field]: value }))
  }

  const rollSeed = (): void => {
    const seeds = ADVENTURE_SEEDS[data.levelTier]
    const seed = seeds[Math.floor(cryptoRandom() * seeds.length)]
    update('premise', seed)
  }

  const steps = [
    {
      title: t('campaign.adventureWizard.step1Title'),
      description: t('campaign.adventureWizard.step1Desc'),
      content: (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">
              {t('campaign.adventureWizard.adventureTitle')}
            </label>
            <input
              value={data.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder={t('campaign.adventureWizard.adventureTitlePlaceholder')}
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">
              {t('campaign.adventureWizard.levelTier')}
            </label>
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
                  {t('campaign.adventureWizard.levelTierOption', { tier })}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500 uppercase tracking-wide">
                {t('campaign.adventureWizard.premise')}
              </label>
              <button onClick={rollSeed} className="text-xs text-purple-400 hover:text-purple-300 cursor-pointer">
                {t('campaign.adventureWizard.rollRandomSeed')}
              </button>
            </div>
            <textarea
              value={data.premise}
              onChange={(e) => update('premise', e.target.value)}
              placeholder={t('campaign.adventureWizard.premisePlaceholder')}
              rows={3}
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">
              {t('campaign.adventureWizard.villain')}
            </label>
            <input
              value={data.villain}
              onChange={(e) => update('villain', e.target.value)}
              placeholder={t('campaign.adventureWizard.villainPlaceholder')}
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">
              {t('campaign.adventureWizard.setting')}
            </label>
            <input
              value={data.setting}
              onChange={(e) => update('setting', e.target.value)}
              placeholder={t('campaign.adventureWizard.settingPlaceholder')}
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200"
            />
          </div>
        </div>
      )
    },
    {
      title: t('campaign.adventureWizard.step2Title'),
      description: t('campaign.adventureWizard.step2Desc'),
      content: (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">
              {t('campaign.adventureWizard.adventureHook')}
            </label>
            <textarea
              value={data.hook}
              onChange={(e) => update('hook', e.target.value)}
              placeholder={t('campaign.adventureWizard.adventureHookPlaceholder')}
              rows={3}
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">
              {t('campaign.adventureWizard.personalStakes')}
            </label>
            <textarea
              value={data.playerStakes}
              onChange={(e) => update('playerStakes', e.target.value)}
              placeholder={t('campaign.adventureWizard.personalStakesPlaceholder')}
              rows={3}
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 resize-none"
            />
          </div>
        </div>
      )
    },
    {
      title: t('campaign.adventureWizard.step3Title'),
      description: t('campaign.adventureWizard.step3Desc'),
      content: (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">
              {t('campaign.adventureWizard.keyEncounters')}
            </label>
            <textarea
              value={data.encounters}
              onChange={(e) => update('encounters', e.target.value)}
              placeholder={t('campaign.adventureWizard.keyEncountersPlaceholder')}
              rows={6}
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 resize-none"
            />
          </div>
          <div className="text-xs text-gray-500 bg-gray-800/50 rounded p-2">
            {t('campaign.adventureWizard.encountersHint')}
          </div>
        </div>
      )
    },
    {
      title: t('campaign.adventureWizard.step4Title'),
      description: t('campaign.adventureWizard.step4Desc'),
      content: (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">
              {t('campaign.adventureWizard.climax')}
            </label>
            <textarea
              value={data.climax}
              onChange={(e) => update('climax', e.target.value)}
              placeholder={t('campaign.adventureWizard.climaxPlaceholder')}
              rows={3}
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">
              {t('campaign.adventureWizard.resolution')}
            </label>
            <textarea
              value={data.resolution}
              onChange={(e) => update('resolution', e.target.value)}
              placeholder={t('campaign.adventureWizard.resolutionPlaceholder')}
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
        {steps.map((_s, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            className={`flex-1 py-1 text-xs rounded cursor-pointer border transition-colors ${
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
          {step === 0 ? t('common.actions.cancel') : t('campaign.adventureWizard.back')}
        </button>
        {step < steps.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed}
            className="px-4 py-1.5 text-xs bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 rounded text-amber-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('campaign.adventureWizard.next')}
          </button>
        ) : (
          <button
            onClick={() => onSave(data)}
            className="px-4 py-1.5 text-xs bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 rounded text-green-300 cursor-pointer"
          >
            {t('campaign.adventureWizard.saveAdventure')}
          </button>
        )}
      </div>
    </div>
  )
}

export type { AdventureData }
