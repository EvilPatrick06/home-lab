import { useT } from '../../i18n'
import type { SeedPack } from '../../services/seed-packs/seed-pack-schema'
import { Card } from '../ui'

interface SeedPackBrowserProps {
  packs: SeedPack[]
  selectedId: string | null
  onSelect: (pack: SeedPack | null) => void
  onImportFile: () => void
}

/**
 * PHASE-37 37E — shared dumb component: a card grid of seed packs with per-section counts, an expanded
 * preview for the selected pack, and an "import from file" button. Used by both the wizard step and the
 * campaign-detail apply modal.
 */
export default function SeedPackBrowser({
  packs,
  selectedId,
  onSelect,
  onImportFile
}: SeedPackBrowserProps): JSX.Element {
  const { t } = useT()
  const selected = packs.find((p) => p.id === selectedId) ?? null

  const counts = (p: SeedPack): string =>
    [
      p.lore?.length && `${p.lore.length} ${t('campaign.seedPacks.countLore')}`,
      p.npcs?.length && `${p.npcs.length} ${t('campaign.seedPacks.countNpcs')}`,
      p.quests?.length && `${p.quests.length} ${t('campaign.seedPacks.countQuests')}`,
      p.encounterTables?.length && `${p.encounterTables.length} ${t('campaign.seedPacks.countTables')}`
    ]
      .filter(Boolean)
      .join(' · ')

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {packs.map((pack) => {
          const isSel = pack.id === selectedId
          return (
            <Card
              key={pack.id}
              className={`cursor-pointer transition-colors ${isSel ? 'border-accent-strong ring-1 ring-accent-strong' : 'hover:border-border-strong'}`}
              onClick={() => onSelect(isSel ? null : pack)}
            >
              <div className="p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold text-fg">{pack.name}</h4>
                  {pack.levelRange && (
                    <span className="text-xs text-muted whitespace-nowrap">
                      {t('campaign.seedPacks.levels', { min: pack.levelRange.min, max: pack.levelRange.max })}
                    </span>
                  )}
                </div>
                {pack.tags?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {pack.tags.map((tag) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-muted">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className="text-xs text-muted line-clamp-2">{pack.description}</p>
                <p className="text-[11px] text-gray-500">{counts(pack)}</p>
              </div>
            </Card>
          )
        })}
      </div>

      {selected && (
        <Card className="border-accent-strong/40">
          <div className="p-3 space-y-2 text-sm">
            {selected.toneInstructions && (
              <p className="text-xs text-muted">
                <span className="text-gray-400">{t('campaign.seedPacks.tone')}:</span>{' '}
                {selected.toneInstructions.slice(0, 200)}
                {selected.toneInstructions.length > 200 ? '…' : ''}
              </p>
            )}
            {selected.openingScene && (
              <p className="text-xs text-muted">
                <span className="text-gray-400">{t('campaign.seedPacks.opening')}:</span>{' '}
                {selected.openingScene.title ? `${selected.openingScene.title} — ` : ''}
                {selected.openingScene.readAloud.slice(0, 120)}…
              </p>
            )}
            {selected.quests?.length ? (
              <p className="text-xs text-muted">
                <span className="text-gray-400">{t('campaign.seedPacks.countQuests')}:</span>{' '}
                {selected.quests.map((q) => q.name).join(', ')}
              </p>
            ) : null}
          </div>
        </Card>
      )}

      <button
        type="button"
        onClick={onImportFile}
        className="text-sm text-accent-strong hover:underline cursor-pointer"
      >
        {t('campaign.seedPacks.importFile')}
      </button>
    </div>
  )
}
