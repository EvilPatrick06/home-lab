import { useT } from '../../i18n'
import { Button } from '../ui'

interface CharacterStepProps {
  characters: Array<{ id: string; name: string }>
  selectedId: string | null
  onSelect: (id: string) => void
  /** Create a brand-new PC. The wizard persists setup progress, then navigates to the
   *  builder with a returnTo so the player lands back on this step. */
  onCreateNew: () => void
  /** Edit an existing PC (same persist-and-return behavior). */
  onEdit: (id: string) => void
}

export default function CharacterStep({
  characters,
  selectedId,
  onSelect,
  onCreateNew,
  onEdit
}: CharacterStepProps): JSX.Element {
  const { t } = useT()

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">{t('campaign.campaignWizard.characterStep.title')}</h2>
      <p className="text-muted text-sm mb-6">{t('campaign.campaignWizard.characterStep.subtitle')}</p>

      {characters.length === 0 ? (
        <div className="max-w-lg space-y-4">
          <p className="text-muted text-sm">{t('campaign.campaignWizard.characterStep.noCharacters')}</p>
          <Button onClick={onCreateNew}>{t('campaign.campaignWizard.characterStep.createOne')}</Button>
        </div>
      ) : (
        <div className="max-w-2xl space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {characters.map((c) => {
              const selected = c.id === selectedId
              return (
                <div
                  key={c.id}
                  className={`relative rounded-lg border p-3 text-start transition-all ${
                    selected ? 'border-amber-500 bg-amber-900/20' : 'border-border bg-surface/50 hover:border-gray-600'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className="block w-full text-start cursor-pointer"
                  >
                    <div className="truncate font-semibold text-sm">{c.name}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(c.id)}
                    className="mt-2 text-accent text-xs underline hover:no-underline cursor-pointer"
                  >
                    {t('common.actions.edit')}
                  </button>
                </div>
              )
            })}
          </div>

          <Button variant="secondary" onClick={onCreateNew}>
            {t('campaign.campaignWizard.characterStep.createOne')}
          </Button>
        </div>
      )}
    </div>
  )
}
