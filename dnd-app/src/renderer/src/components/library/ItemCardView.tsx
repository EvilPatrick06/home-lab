import type { LibraryCategory } from '../../types/library'

const RARITY_COLORS: Record<string, string> = {
  common: 'text-gray-400',
  uncommon: 'text-green-400',
  rare: 'text-blue-400',
  'very rare': 'text-purple-400',
  legendary: 'text-amber-400',
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
      <span className="text-amber-500 font-semibold">{label}</span>
      <span className="text-gray-300">{String(value)}</span>
    </div>
  )
}

function WeaponCard({ item }: { item: Record<string, unknown> }): JSX.Element {
  const properties = Array.isArray(item.properties) ? item.properties : []
  return (
    <div className="space-y-0.5 text-sm">
      <Stat label="Category" value={item.category} />
      <Stat label="Damage" value={item.damage ? `${item.damage} ${item.damageType ?? ''}` : item.damageType} />
      {properties.length > 0 && (
        <div className="flex gap-1">
          <span className="text-amber-500 font-semibold">Properties</span>
          <span className="text-gray-300">{properties.join(', ')}</span>
        </div>
      )}
      {item.mastery && <Stat label="Mastery" value={item.mastery} />}
      <Stat label="Weight" value={item.weight ? `${item.weight} lb.` : undefined} />
      <Stat label="Cost" value={item.cost} />
    </div>
  )
}

function ArmorCard({ item }: { item: Record<string, unknown> }): JSX.Element {
  return (
    <div className="space-y-0.5 text-sm">
      <Stat label="Category" value={item.category} />
      <Stat label="AC" value={item.baseAC ?? item.ac} />
      {item.dexCap !== undefined && item.dexCap !== null && (
        <Stat label="DEX Cap" value={item.dexCap === 0 ? 'None' : `+${item.dexCap}`} />
      )}
      {item.stealthDisadvantage && (
        <div className="flex gap-1">
          <span className="text-amber-500 font-semibold">Stealth</span>
          <span className="text-red-400">Disadvantage</span>
        </div>
      )}
      <Stat label="Strength Req." value={item.strengthReq} />
      <Stat label="Weight" value={item.weight ? `${item.weight} lb.` : undefined} />
      <Stat label="Cost" value={item.cost} />
    </div>
  )
}

function GearCard({ item }: { item: Record<string, unknown> }): JSX.Element {
  return (
    <div className="space-y-0.5 text-sm">
      <Stat label="Weight" value={item.weight ? `${item.weight} lb.` : undefined} />
      <Stat label="Cost" value={item.cost} />
      {item.description && (
        <>
          <div className="border-t border-amber-800/30 mt-2" />
          <div className="text-xs text-gray-300 mt-1">{String(item.description)}</div>
        </>
      )}
    </div>
  )
}

function MagicItemCard({ item }: { item: Record<string, unknown> }): JSX.Element {
  const rarity = String(item.rarity ?? 'common').toLowerCase()
  const rarityColor = RARITY_COLORS[rarity] ?? 'text-gray-400'

  return (
    <div className="space-y-0.5 text-sm">
      <div className="flex gap-1">
        <span className="text-amber-500 font-semibold">Rarity</span>
        <span className={`${rarityColor} capitalize`}>{rarity}</span>
      </div>
      <Stat label="Type" value={item.type} />
      {item.attunement && (
        <div className="flex gap-1">
          <span className="text-amber-500 font-semibold">Attunement</span>
          <span className="text-purple-400">Required</span>
        </div>
      )}
      {item.description && (
        <>
          <div className="border-t border-amber-800/30 mt-2" />
          <div className="text-xs text-gray-300 mt-1 whitespace-pre-wrap">{String(item.description)}</div>
        </>
      )}
    </div>
  )
}

export default function ItemCardView({ item, category }: ItemCardViewProps): JSX.Element {
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
  const headerColor = rarityColor || 'text-amber-400'

  return (
    <div className="bg-gray-900 border border-amber-800/40 rounded-lg overflow-hidden">
      <div className="bg-amber-900/30 border-b border-amber-800/40 px-3 py-2">
        <h3 className={`text-base font-bold ${headerColor}`}>{String(item.name ?? 'Unknown Item')}</h3>
        <p className="text-xs text-gray-400 italic capitalize">{category.replace(/-/g, ' ')}</p>
      </div>
      <div className="px-3 py-2">{content}</div>
    </div>
  )
}
