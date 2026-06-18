import { useEffect, useState } from 'react'
import { addToast } from '../../hooks/use-toast'
import { useT } from '../../i18n'
import { loadBuiltInSeedPacks } from '../../services/seed-packs/built-in-packs'
import { importSeedPackFromFile } from '../../services/seed-packs/seed-pack-io'
import type { SeedPack } from '../../services/seed-packs/seed-pack-schema'
import SeedPackBrowser from './SeedPackBrowser'

interface SeedPackStepProps {
  selectedPack: SeedPack | null
  onSelect: (pack: SeedPack | null) => void
}

/**
 * PHASE-37 37E — optional wizard step: browse the bundled starter packs (plus any imported from file)
 * and pick one to seed the new campaign, or choose "No seed pack" (the default). Non-blocking.
 */
export default function SeedPackStep({ selectedPack, onSelect }: SeedPackStepProps): JSX.Element {
  const { t } = useT()
  const [builtIns, setBuiltIns] = useState<SeedPack[]>([])
  const [imported, setImported] = useState<SeedPack[]>([])

  useEffect(() => {
    let alive = true
    loadBuiltInSeedPacks().then((packs) => {
      if (alive) setBuiltIns(packs)
    })
    return () => {
      alive = false
    }
  }, [])

  const handleImport = async (): Promise<void> => {
    try {
      const pack = await importSeedPackFromFile()
      if (!pack) return
      setImported((prev) => [...prev.filter((p) => p.id !== pack.id), pack])
      onSelect(pack)
    } catch (err) {
      addToast((err as Error).message, 'error')
    }
  }

  const allPacks = [...builtIns, ...imported.filter((p) => !builtIns.some((b) => b.id === p.id))]
  const systemMismatch = selectedPack && selectedPack.system !== 'dnd5e'

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-fg">{t('campaign.seedPacks.stepTitle')}</h2>
      <p className="text-sm text-muted">{t('campaign.seedPacks.stepIntro')}</p>

      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`px-3 py-1.5 rounded border text-sm cursor-pointer ${selectedPack === null ? 'bg-accent-strong/30 border-accent-strong text-accent-strong' : 'bg-surface-2 border-border text-gray-300'}`}
      >
        {t('campaign.seedPacks.none')}
      </button>

      <SeedPackBrowser
        packs={allPacks}
        selectedId={selectedPack?.id ?? null}
        onSelect={onSelect}
        onImportFile={handleImport}
      />

      {systemMismatch && (
        <p className="text-xs text-amber-400">
          {t('campaign.seedPacks.systemMismatch', { system: selectedPack.system })}
        </p>
      )}
    </div>
  )
}
