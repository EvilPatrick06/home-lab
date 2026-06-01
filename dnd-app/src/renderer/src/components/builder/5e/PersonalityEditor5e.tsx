import { rollPersonalityTraits } from '../../../data/personality-tables'
import { useT } from '../../../i18n'
import { useBuilderStore } from '../../../stores/use-builder-store'
import SectionBanner from '../shared/SectionBanner'

export default function PersonalityEditor5e(): JSX.Element {
  const { t } = useT()
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
      <SectionBanner label={t('builder.personalityEditor.sectionTitle')} />
      <div className="px-4 py-3 space-y-3 border-b border-gray-800">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">{t('builder.personalityEditor.personality')}</label>
            {buildSlots.find((s) => s.id === 'ability-scores')?.selectedId && (
              <button
                onClick={() => {
                  const traits = rollPersonalityTraits(abilityScores, backgroundAbilityBonuses, characterAlignment)
                  if (traits.length === 0) return
                  // Phase 17l — replace rather than append. The old "current,
                  // result" concat path accumulated duplicates every time
                  // the user clicked Roll. The button reads as "give me
                  // ideas," not "append more text", so we replace; users
                  // who liked an earlier suggestion can hand-edit it.
                  useBuilderStore.setState({ characterPersonality: traits.join(', ') })
                }}
                className="text-xs px-2 py-0.5 rounded bg-amber-600 hover:bg-accent-strong text-gray-900 font-semibold cursor-pointer"
              >
                {t('builder.personalityEditor.rollIdeas')}
              </button>
            )}
          </div>
          <textarea
            value={characterPersonality}
            onChange={(e) => useBuilderStore.setState({ characterPersonality: e.target.value })}
            placeholder={t('builder.personalityEditor.personalityPlaceholder')}
            rows={2}
            className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-y"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">{t('builder.personalityEditor.ideals')}</label>
          <textarea
            value={characterIdeals}
            onChange={(e) => useBuilderStore.setState({ characterIdeals: e.target.value })}
            placeholder={t('builder.personalityEditor.idealsPlaceholder')}
            rows={2}
            className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-y"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">{t('builder.personalityEditor.bonds')}</label>
          <textarea
            value={characterBonds}
            onChange={(e) => useBuilderStore.setState({ characterBonds: e.target.value })}
            placeholder={t('builder.personalityEditor.bondsPlaceholder')}
            rows={2}
            className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-y"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">{t('builder.personalityEditor.flaws')}</label>
          <textarea
            value={characterFlaws}
            onChange={(e) => useBuilderStore.setState({ characterFlaws: e.target.value })}
            placeholder={t('builder.personalityEditor.flawsPlaceholder')}
            rows={2}
            className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-y"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">{t('builder.personalityEditor.backstory')}</label>
          <textarea
            value={characterBackstory}
            onChange={(e) => useBuilderStore.setState({ characterBackstory: e.target.value })}
            placeholder={t('builder.personalityEditor.backstoryPlaceholder')}
            rows={4}
            className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-y"
          />
        </div>
      </div>

      {/* NOTES */}
      <SectionBanner label={t('builder.personalityEditor.sectionNotes')} />
      <div className="px-4 py-3 border-b border-gray-800">
        <textarea
          value={characterNotes}
          onChange={(e) => useBuilderStore.setState({ characterNotes: e.target.value })}
          placeholder={t('builder.personalityEditor.notesPlaceholder')}
          rows={4}
          className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg placeholder-gray-600 focus:outline-none focus:border-amber-500 resize-y"
        />
      </div>
    </>
  )
}
