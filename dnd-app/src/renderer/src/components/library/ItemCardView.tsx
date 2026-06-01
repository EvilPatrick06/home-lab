import { useT } from '../../i18n'
import type { LibraryCategory } from '../../types/library'

const RARITY_COLORS: Record<string, string> = {
  common: 'text-muted',
  uncommon: 'text-green-400',
  rare: 'text-blue-400',
  'very rare': 'text-purple-400',
  legendary: 'text-accent',
  artifact: 'text-red-400'
}

interface ItemCardViewProps {
  item: Record<string, unknown>
  category: LibraryCategory
}

function Stat({ label, value }: { label: string; value: unknown }): JSX.Element | null {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex gap-1">
      <span className="text-accent-strong font-semibold">{label}</span>
      <span className="text-gray-300">{String(value)}</span>
    </div>
  )
}

function WeaponCard({ item }: { item: Record<string, unknown> }): JSX.Element {
  const { t } = useT()
  const properties = Array.isArray(item.properties) ? item.properties : []
  return (
    <div className="space-y-0.5 text-sm">
      <Stat label={t('library.itemCardView.category')} value={item.category} />
      <Stat
        label={t('library.itemCardView.damage')}
        value={item.damage ? `${item.damage} ${item.damageType ?? ''}` : item.damageType}
      />
      {properties.length > 0 && (
        <div className="flex gap-1">
          <span className="text-accent-strong font-semibold">{t('library.itemCardView.properties')}</span>
          <span className="text-gray-300">{properties.join(', ')}</span>
        </div>
      )}
      {!!item.mastery && <Stat label={t('library.itemCardView.mastery')} value={item.mastery} />}
      <Stat
        label={t('library.itemCardView.weight')}
        value={item.weight ? t('library.itemCardView.weightValue', { weight: item.weight }) : undefined}
      />
      <Stat label={t('library.itemCardView.cost')} value={item.cost} />
    </div>
  )
}

function ArmorCard({ item }: { item: Record<string, unknown> }): JSX.Element {
  const { t } = useT()
  return (
    <div className="space-y-0.5 text-sm">
      <Stat label={t('library.itemCardView.category')} value={item.category} />
      <Stat label={t('library.itemCardView.ac')} value={item.baseAC ?? item.ac} />
      {item.dexCap !== undefined && item.dexCap !== null && (
        <Stat
          label={t('library.itemCardView.dexCap')}
          value={item.dexCap === 0 ? t('library.itemCardView.none') : `+${item.dexCap}`}
        />
      )}
      {!!item.stealthDisadvantage && (
        <div className="flex gap-1">
          <span className="text-accent-strong font-semibold">{t('library.itemCardView.stealth')}</span>
          <span className="text-red-400">{t('library.itemCardView.disadvantage')}</span>
        </div>
      )}
      <Stat label={t('library.itemCardView.strengthReq')} value={item.strengthReq} />
      <Stat
        label={t('library.itemCardView.weight')}
        value={item.weight ? t('library.itemCardView.weightValue', { weight: item.weight }) : undefined}
      />
      <Stat label={t('library.itemCardView.cost')} value={item.cost} />
    </div>
  )
}

function GearCard({ item }: { item: Record<string, unknown> }): JSX.Element {
  const { t } = useT()
  return (
    <div className="space-y-0.5 text-sm">
      <Stat
        label={t('library.itemCardView.weight')}
        value={item.weight ? t('library.itemCardView.weightValue', { weight: item.weight }) : undefined}
      />
      <Stat label={t('library.itemCardView.cost')} value={item.cost} />
      {!!item.description && (
        <>
          <div className="border-t border-amber-800/30 mt-2" />
          <div className="text-xs text-gray-300 mt-1">{String(item.description)}</div>
        </>
      )}
    </div>
  )
}

function MagicItemCard({ item }: { item: Record<string, unknown> }): JSX.Element {
  const { t } = useT()
  const rarity = String(item.rarity ?? 'common').toLowerCase()
  const rarityColor = RARITY_COLORS[rarity] ?? 'text-muted'

  return (
    <div className="space-y-0.5 text-sm">
      <div className="flex gap-1">
        <span className="text-accent-strong font-semibold">{t('library.itemCardView.rarity')}</span>
        <span className={`${rarityColor} capitalize`}>{rarity}</span>
      </div>
      <Stat label={t('library.itemCardView.type')} value={item.type} />
      {!!item.attunement && (
        <div className="flex gap-1">
          <span className="text-accent-strong font-semibold">{t('library.itemCardView.attunement')}</span>
          <span className="text-purple-400">{t('library.itemCardView.required')}</span>
        </div>
      )}
      {!!item.description && (
        <>
          <div className="border-t border-amber-800/30 mt-2" />
          <div className="text-xs text-gray-300 mt-1 whitespace-pre-wrap">{String(item.description)}</div>
        </>
      )}
    </div>
  )
}

export default function ItemCardView({ item, category }: ItemCardViewProps): JSX.Element {
  const { t } = useT()
  let content: JSX.Element
  switch (category) {
    case 'weapons':
      content = <WeaponCard item={item} />
      break
    case 'armor':
      content = <ArmorCard item={item} />
      break
    case 'magic-items':
      content = <MagicItemCard item={item} />
      break
    default:
      content = <GearCard item={item} />
      break
  }

  const rarity = category === 'magic-items' ? String(item.rarity ?? '').toLowerCase() : ''
  const rarityColor = RARITY_COLORS[rarity] ?? ''
  const headerColor = rarityColor || 'text-accent'

  return (
    <div className="bg-surface border border-amber-800/40 rounded-lg overflow-hidden">
      <div className="bg-amber-900/30 border-b border-amber-800/40 px-3 py-2">
        <h3 className={`text-base font-bold ${headerColor}`}>
          {item.name ? String(item.name) : t('library.itemCardView.unknownItem')}
        </h3>
        <p className="text-xs text-muted italic capitalize">{category.replace(/-/g, ' ')}</p>
      </div>
      <div className="px-3 py-2">{content}</div>
    </div>
  )
}
