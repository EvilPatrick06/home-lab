import { useEffect, useState } from 'react'
import { addToast } from '../../hooks/use-toast'
import { useT } from '../../i18n'
import { loadBuiltInSeedPacks } from '../../services/seed-packs/built-in-packs'
import { type ApplySeedPackOptions, applySeedPackToCampaign } from '../../services/seed-packs/seed-pack-apply'
import { importSeedPackFromFile } from '../../services/seed-packs/seed-pack-io'
import type { SeedPack } from '../../services/seed-packs/seed-pack-schema'
import { seedQuestsFromPack } from '../../services/seed-packs/seed-quests'
import { useCampaignStore } from '../../stores/use-campaign-store'
import type { Campaign } from '../../types/campaign'
import { Button, Modal } from '../ui'
import SeedPackBrowser from './SeedPackBrowser'

interface SeedPackApplyModalProps {
  open: boolean
  onClose: () => void
  campaign: Campaign
  onApplied: (c: Campaign) => void
}

type SectionKey = keyof ApplySeedPackOptions | 'quests'
const SECTION_OF: Array<{ key: SectionKey; has: (p: SeedPack) => boolean }> = [
  { key: 'lore', has: (p) => !!p.lore?.length },
  { key: 'npcs', has: (p) => !!p.npcs?.length },
  { key: 'adventures', has: (p) => !!p.adventures?.length },
  { key: 'quests', has: (p) => !!p.quests?.length },
  { key: 'encounterTables', has: (p) => !!p.encounterTables?.length },
  { key: 'encounters', has: (p) => !!p.encounters?.length },
  { key: 'customRules', has: (p) => !!p.customRules?.length },
  { key: 'tone', has: (p) => !!p.toneInstructions?.trim() },
  { key: 'openingScene', has: (p) => !!p.openingScene?.readAloud?.trim() }
]

/**
 * PHASE-37 37E — apply a seed pack onto an EXISTING campaign: pick a source, choose which sections to
 * merge (defaults all-on; content is APPENDED, tone/opening-scene only fill empty slots), then apply.
 */
export default function SeedPackApplyModal({
  open,
  onClose,
  campaign,
  onApplied
}: SeedPackApplyModalProps): JSX.Element {
  const { t } = useT()
  const saveCampaign = useCampaignStore((s) => s.saveCampaign)
  const [packs, setPacks] = useState<SeedPack[]>([])
  const [selected, setSelected] = useState<SeedPack | null>(null)
  const [opts, setOpts] = useState<Record<string, boolean>>({})
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    if (open) loadBuiltInSeedPacks().then(setPacks)
  }, [open])

  // Reset selection on close.
  useEffect(() => {
    if (!open) {
      setSelected(null)
      setOpts({})
    }
  }, [open])

  const pickPack = (pack: SeedPack | null): void => {
    setSelected(pack)
    if (pack) {
      const next: Record<string, boolean> = {}
      for (const s of SECTION_OF) if (s.has(pack)) next[s.key] = true
      setOpts(next)
    }
  }

  const handleImport = async (): Promise<void> => {
    try {
      const pack = await importSeedPackFromFile()
      if (pack) {
        setPacks((prev) => [...prev.filter((p) => p.id !== pack.id), pack])
        pickPack(pack)
      }
    } catch (err) {
      addToast((err as Error).message, 'error')
    }
  }

  const handleApply = async (): Promise<void> => {
    if (!selected) return
    setApplying(true)
    try {
      const applyOpts: ApplySeedPackOptions = {
        lore: opts.lore,
        npcs: opts.npcs,
        adventures: opts.adventures,
        encounterTables: opts.encounterTables,
        encounters: opts.encounters,
        customRules: opts.customRules,
        tone: opts.tone,
        openingScene: opts.openingScene
      }
      const next = applySeedPackToCampaign(campaign, selected, applyOpts)
      await saveCampaign(next)
      if (opts.quests && selected.quests?.length) {
        const r = await seedQuestsFromPack(campaign.id, selected.quests)
        if (!r.success) addToast(t('campaign.seedPacks.questSeedFailed'), 'error')
      }
      addToast(t('campaign.seedPacks.applied', { name: selected.name }), 'success')
      onApplied(next)
      onClose()
    } finally {
      setApplying(false)
    }
  }

  const presentSections = selected ? SECTION_OF.filter((s) => s.has(selected)) : []

  return (
    <Modal open={open} onClose={onClose} title={t('campaign.seedPacks.applyTitle')}>
      <div className="space-y-4">
        {!selected ? (
          <SeedPackBrowser packs={packs} selectedId={null} onSelect={pickPack} onImportFile={handleImport} />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-fg font-semibold">{selected.name}</p>
            <p className="text-xs text-muted">{t('campaign.seedPacks.applyNote')}</p>
            <div className="space-y-1">
              {presentSections.map((s) => (
                <label key={s.key} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    name="section-enabled"
                    checked={opts[s.key] ?? true}
                    onChange={(e) => setOpts((o) => ({ ...o, [s.key]: e.target.checked }))}
                  />
                  {t(`campaign.seedPacks.section.${s.key}` as Parameters<typeof t>[0])}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="primary" onClick={handleApply} disabled={applying}>
                {t('campaign.seedPacks.apply')}
              </Button>
              <Button variant="secondary" onClick={() => setSelected(null)} disabled={applying}>
                {t('campaign.seedPacks.back')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
