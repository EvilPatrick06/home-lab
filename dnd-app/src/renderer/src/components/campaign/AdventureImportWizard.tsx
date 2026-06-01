import { useState } from 'react'
import { useT } from '../../i18n'
import { type AdventureImportResult, importAdventure } from '../../services/io/adventure-io'
import { Button, Modal } from '../ui'

interface AdventureImportWizardProps {
  open: boolean
  onClose: () => void
  onImport: (result: AdventureImportResult) => void
}

type WizardStep = 'select' | 'preview' | 'confirm'

export default function AdventureImportWizard({ open, onClose, onImport }: AdventureImportWizardProps): JSX.Element {
  const { t } = useT()
  const [step, setStep] = useState<WizardStep>('select')
  const [importData, setImportData] = useState<AdventureImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [includeEncounters, setIncludeEncounters] = useState(true)
  const [includeNpcs, setIncludeNpcs] = useState(true)

  const handleSelectFile = async (): Promise<void> => {
    try {
      setError(null)
      const result = await importAdventure()
      if (!result) {
        setError(t('campaign.adventureImportWizard.errorInvalid'))
        return
      }
      setImportData(result)
      setStep('preview')
    } catch {
      setError(t('campaign.adventureImportWizard.errorRead'))
    }
  }

  const handleConfirm = (): void => {
    if (!importData) return
    onImport({
      adventure: importData.adventure,
      encounters: includeEncounters ? importData.encounters : [],
      npcs: includeNpcs ? importData.npcs : []
    })
    handleClose()
  }

  const handleClose = (): void => {
    setStep('select')
    setImportData(null)
    setError(null)
    setIncludeEncounters(true)
    setIncludeNpcs(true)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title={t('campaign.adventureImportWizard.title')}>
      <div className="space-y-4">
        {step === 'select' && (
          <>
            <p className="text-sm text-muted">{t('campaign.adventureImportWizard.selectPrompt')}</p>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button onClick={handleSelectFile}>{t('campaign.adventureImportWizard.chooseFile')}</Button>
          </>
        )}

        {step === 'preview' && importData && (
          <>
            <div className="bg-surface-2/50 rounded-lg p-3">
              <h4 className="text-sm font-semibold text-accent">{importData.adventure.title}</h4>
              <p className="text-xs text-muted mt-1">
                {t('campaign.adventureImportWizard.levelLabel', { level: importData.adventure.levelTier })}
              </p>
              <p className="text-xs text-muted">{importData.adventure.premise}</p>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={includeEncounters}
                  onChange={(e) => setIncludeEncounters(e.target.checked)}
                  className="accent-amber-500"
                />
                {t('campaign.adventureImportWizard.includeEncounters', { count: importData.encounters.length })}
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={includeNpcs}
                  onChange={(e) => setIncludeNpcs(e.target.checked)}
                  className="accent-amber-500"
                />
                {t('campaign.adventureImportWizard.includeNpcs', { count: importData.npcs.length })}
              </label>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setStep('select')}>
                {t('campaign.adventureImportWizard.back')}
              </Button>
              <Button onClick={() => setStep('confirm')}>{t('campaign.adventureImportWizard.review')}</Button>
            </div>
          </>
        )}

        {step === 'confirm' && importData && (
          <>
            <p className="text-sm text-muted">
              {t('campaign.adventureImportWizard.readyToImport')}{' '}
              <span className="text-accent font-medium">{importData.adventure.title}</span>
              {includeEncounters &&
                importData.encounters.length > 0 &&
                t('campaign.adventureImportWizard.withEncounters', { count: importData.encounters.length })}
              {includeNpcs &&
                importData.npcs.length > 0 &&
                t('campaign.adventureImportWizard.andNpcs', { count: importData.npcs.length })}
              {'.'}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setStep('preview')}>
                {t('campaign.adventureImportWizard.back')}
              </Button>
              <Button onClick={handleConfirm}>{t('campaign.adventureImportWizard.import')}</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
