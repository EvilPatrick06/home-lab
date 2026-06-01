import { useT } from '../../../i18n'
import { getEffectiveMagicItems } from '../../../services/character/effective-character-5e'
import type { Character5e } from '../../../types/character-5e'

interface AttunementTracker5eProps {
  character: Character5e
  readonly?: boolean
  getLatest: () => Character5e | undefined
  saveAndBroadcast: (updated: Character5e) => void
}

/**
 * Phase 23f — single attunement source. Attunement is the set of attuned magic
 * items (canonical `state.magicItemAttuned[instanceId]`, projected onto
 * `mi.attuned` by getEffectiveMagicItems and read by the mechanics layer).
 * Both this tracker and MagicItemsPanel now derive their count from that one
 * source. Attune/unattune happens on the magic-item card; this is a read-only
 * 3-slot summary. (The legacy free-text `character.attunement[]` array is no
 * longer the source — migrate any entries into magic items.)
 */
export default function AttunementTracker5e({ character }: AttunementTracker5eProps): JSX.Element {
  const { t } = useT()
  const attunedItems = getEffectiveMagicItems(character).filter((mi) => mi.attuned)

  return (
    <div className="mb-3">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
        {t('sheet.attunementTracker.attunement', { count: attunedItems.length })}
      </div>
      <div className="flex gap-2">
        {[0, 1, 2].map((slotIdx) => {
          const item = attunedItems[slotIdx]
          return (
            <div
              key={slotIdx}
              className={`flex-1 rounded-lg border p-2 text-center text-xs ${
                item
                  ? 'border-purple-700/50 bg-purple-900/20 text-purple-300'
                  : 'border-border bg-surface/30 text-gray-600'
              }`}
            >
              {item ? (
                <div className="font-medium truncate" title={item.description}>
                  {item.name}
                </div>
              ) : (
                <span>{t('sheet.attunementTracker.empty')}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
