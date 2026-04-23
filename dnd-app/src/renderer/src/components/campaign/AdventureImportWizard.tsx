import { useState } from 'react'
import { type AdventureImportResult, importAdventure } from '../../services/io/adventure-io'
import { Button, Modal } from '../ui'

interface AdventureImportWizardProps {
  open: boolean
  onClose: () => void
  onImport: (result: AdventureImportResult) => void
}

type WizardStep = 'select' | 'preview' | 'confirm'

export default function AdventureImportWizard({ open, onClose, onImport }: AdventureImportWizardProps): JSX.Element {
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
        setError('Invalid adventure file or import cancelled.')
        return
      }
      setImportData(result)
      setStep('preview')
    } catch {
      setError('Failed to read adventure file.')
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
    <Modal open={open} onClose={handleClose} title="Import Adventure">
      <div className="space-y-4">
        {step === 'select' && (
          <>
            <p className="text-sm text-gray-400">Select a .dndadv file to import an adventure module.</p>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button onClick={handleSelectFile}>Choose File</Button>
          </>
        )}

        {step === 'preview' && importData && (
          <>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <h4 className="text-sm font-semibold text-amber-400">{importData.adventure.title}</h4>
              <p className="text-xs text-gray-400 mt-1">Level: {importData.adventure.levelTier}</p>
              <p className="text-xs text-gray-400">{importData.adventure.premise}</p>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={includeEncounters}
                  onChange={(e) => setIncludeEncounters(e.target.checked)}
                  className="accent-amber-500"
                />
                Include {importData.encounters.length} encounter(s)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={includeNpcs}
                  onChange={(e) => setIncludeNpcs(e.target.checked)}
                  className="accent-amber-500"
                />
                Include {importData.npcs.length} NPC(s)
              </label>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setStep('select')}>
                Back
              </Button>
              <Button onClick={() => setStep('confirm')}>Review</Button>
            </div>
          </>
        )}

        {step === 'confirm' && importData && (
          <>
            <p className="text-sm text-gray-400">
              Ready to import <span className="text-amber-400 font-medium">{importData.adventure.title}</span>
              {includeEncounters &&
                importData.encounters.length > 0 &&
                ` with ${importData.encounters.length} encounter(s)`}
              {includeNpcs && importData.npcs.length > 0 && ` and ${importData.npcs.length} NPC(s)`}.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setStep('preview')}>
                Back
              </Button>
              <Button onClick={handleConfirm}>Import</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
