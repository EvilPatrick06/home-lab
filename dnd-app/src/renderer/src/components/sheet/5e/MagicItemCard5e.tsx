import { getMagicItemEffects } from '../../../data/effect-definitions'
import type { Character5e } from '../../../types/character-5e'

interface MagicItemCard5eProps {
  item: NonNullable<Character5e['magicItems']>[number]
  index: number
  character: Character5e
  readonly?: boolean
  getLatest: () => Character5e | undefined
  saveAndBroadcast: (updated: Character5e) => void
  setBuyWarning: (msg: string | null) => void
}

const RARITY_COLOR: Record<string, string> = {
  common: 'border-gray-500 text-gray-300',
  uncommon: 'border-green-600 text-green-400',
  rare: 'border-blue-600 text-blue-400',
  'very-rare': 'border-purple-600 text-purple-400',
  legendary: 'border-orange-500 text-orange-400',
  artifact: 'border-red-500 text-red-400'
}

const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  'very-rare': 'Very Rare',
  legendary: 'Legendary',
  artifact: 'Artifact'
}

export default function MagicItemCard5e({
  item,
  index,
  character,
  readonly,
  getLatest,
  saveAndBroadcast,
  setBuyWarning
}: MagicItemCard5eProps): JSX.Element {
  const i = index
  const isUnidentified = item.identified === false
  const colors = isUnidentified
    ? 'border-gray-600 text-gray-400'
    : (RARITY_COLOR[item.rarity] ?? 'border-gray-600 text-gray-400')
  const hasEffects = !isUnidentified && !!getMagicItemEffects(item.name)
  const isWeaponType = item.type === 'weapon' || /weapon|\+\d.*weapon/i.test(item.name)
  const isArmorType = item.type === 'armor' || /armor|shield|\+\d.*armor/i.test(item.name)
  const weapons = character.weapons ?? []
  const armors = character.armor ?? []

  // Unidentified items: show masked info to players
  if (isUnidentified && readonly) {
    return (
      <div className={`border rounded px-2 py-1.5 ${colors}`}>
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate italic">Unidentified {item.type || 'Magic'} Item</span>
              <span className="text-[10px] text-gray-600 shrink-0">???</span>
            </div>
            <div className="text-[10px] text-gray-600 mt-0.5">This item has not been identified.</div>
          </div>
        </div>
      </div>
    )
  }

  const displayName = isUnidentified ? item.name : item.name
  const displayRarity = isUnidentified
    ? `??? ${RARITY_LABEL[item.rarity] ?? item.rarity}`
    : (RARITY_LABEL[item.rarity] ?? item.rarity)

  return (
    <div className={`border rounded px-2 py-1.5 ${colors}`}>
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{displayName}</span>
            <span className="text-[10px] text-gray-500 shrink-0">{displayRarity}</span>
            {isUnidentified && <span className="text-[10px] text-yellow-500 shrink-0 italic">Unidentified</span>}
            {item.attunement && (
              <button
                disabled={readonly}
                onClick={() => {
                  if (readonly) return
                  const latest = getLatest()
                  if (!latest) return
                  // Enforce 3-item attunement limit
                  if (!item.attuned) {
                    const attunedCount = (latest.magicItems ?? []).filter((mi) => mi.attuned).length
                    if (attunedCount >= 3) {
                      setBuyWarning('Cannot attune — maximum 3 items already attuned.')
                      setTimeout(() => setBuyWarning(null), 3000)
                      return
                    }
                  }
                  const updated = {
                    ...latest,
                    magicItems: (latest.magicItems ?? []).map((mi, idx) =>
                      idx === i ? { ...mi, attuned: !mi.attuned } : mi
                    ),
                    updatedAt: new Date().toISOString()
                  } as Character5e
                  saveAndBroadcast(updated)
                }}
                className={`text-[10px] shrink-0 ${item.attuned ? 'text-purple-400' : 'text-gray-500'} ${!readonly ? 'cursor-pointer hover:text-purple-300' : ''}`}
                title={!readonly ? 'Click to toggle attunement' : undefined}
              >
                {item.attuned ? '(Attuned)' : '(Requires Attunement)'}
              </button>
            )}
            {hasEffects && <span className="text-[9px] text-cyan-500 shrink-0">FX</span>}
          </div>
          {item.description && <div className="text-[10px] text-gray-500 truncate mt-0.5">{item.description}</div>}
        </div>
        {/* Charges */}
        {item.charges && (
          <div className="flex items-center gap-1 mr-2 shrink-0">
            <span className="text-[10px] text-gray-500">Charges:</span>
            <button
              disabled={readonly || item.charges.current <= 0}
              onClick={() => {
                const latest = getLatest()
                if (!latest) return
                const updated = {
                  ...latest,
                  magicItems: (latest.magicItems ?? []).map((mi, idx) =>
                    idx === i && mi.charges
                      ? {
                          ...mi,
                          charges: { ...mi.charges, current: Math.max(0, mi.charges.current - 1) }
                        }
                      : mi
                  ),
                  updatedAt: new Date().toISOString()
                } as Character5e
                saveAndBroadcast(updated)
              }}
              className="w-4 h-4 text-[10px] bg-gray-700 rounded text-gray-300 hover:bg-gray-600 disabled:opacity-40 cursor-pointer"
            >
              -
            </button>
            <span className="text-xs font-mono text-amber-400">
              {item.charges.current}/{item.charges.max}
            </span>
            <button
              disabled={readonly || item.charges.current >= item.charges.max}
              onClick={() => {
                const latest = getLatest()
                if (!latest) return
                const updated = {
                  ...latest,
                  magicItems: (latest.magicItems ?? []).map((mi, idx) =>
                    idx === i && mi.charges
                      ? {
                          ...mi,
                          charges: {
                            ...mi.charges,
                            current: Math.min(mi.charges.max, mi.charges.current + 1)
                          }
                        }
                      : mi
                  ),
                  updatedAt: new Date().toISOString()
                } as Character5e
                saveAndBroadcast(updated)
              }}
              className="w-4 h-4 text-[10px] bg-gray-700 rounded text-gray-300 hover:bg-gray-600 disabled:opacity-40 cursor-pointer"
            >
              +
            </button>
          </div>
        )}
        {!readonly && (
          <button
            onClick={() => {
              const latest = getLatest()
              if (!latest) return
              const updated = {
                ...latest,
                magicItems: (latest.magicItems ?? []).filter((_, idx) => idx !== i),
                updatedAt: new Date().toISOString()
              } as Character5e
              saveAndBroadcast(updated)
            }}
            className="text-gray-600 hover:text-red-400 cursor-pointer text-xs ml-2 shrink-0"
            title="Remove magic item"
          >
            &#x2715;
          </button>
        )}
        {!readonly && isUnidentified && (
          <button
            onClick={() => {
              const latest = getLatest()
              if (!latest) return
              const updated = {
                ...latest,
                magicItems: (latest.magicItems ?? []).map((mi, idx) => (idx === i ? { ...mi, identified: true } : mi)),
                updatedAt: new Date().toISOString()
              } as Character5e
              saveAndBroadcast(updated)
            }}
            className="text-[10px] text-green-400 hover:text-green-300 cursor-pointer ml-2 shrink-0 border border-green-600 rounded px-1.5 py-0.5"
            title="Identify this magic item"
          >
            Identify
          </button>
        )}
      </div>
      {/* Weapon/Armor link selector */}
      {!readonly && (isWeaponType || isArmorType) && (
        <div className="mt-1 flex items-center gap-2">
          {isWeaponType && weapons.length > 0 && (
            <select
              value={item.linkedWeaponId ?? ''}
              onChange={(e) => {
                const latest = getLatest()
                if (!latest) return
                const updated = {
                  ...latest,
                  magicItems: (latest.magicItems ?? []).map((mi, idx) =>
                    idx === i ? { ...mi, linkedWeaponId: e.target.value || undefined } : mi
                  ),
                  updatedAt: new Date().toISOString()
                } as Character5e
                saveAndBroadcast(updated)
              }}
              className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-purple-500"
            >
              <option value="">Link to weapon...</option>
              {weapons.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
          {isArmorType && armors.length > 0 && (
            <select
              value={item.linkedArmorId ?? ''}
              onChange={(e) => {
                const latest = getLatest()
                if (!latest) return
                const updated = {
                  ...latest,
                  magicItems: (latest.magicItems ?? []).map((mi, idx) =>
                    idx === i ? { ...mi, linkedArmorId: e.target.value || undefined } : mi
                  ),
                  updatedAt: new Date().toISOString()
                } as Character5e
                saveAndBroadcast(updated)
              }}
              className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-300 focus:outline-none focus:border-purple-500"
            >
              <option value="">Link to armor...</option>
              {armors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          {item.linkedWeaponId && (
            <span className="text-[9px] text-cyan-400">
              Linked: {weapons.find((w) => w.id === item.linkedWeaponId)?.name ?? 'Unknown'}
            </span>
          )}
          {item.linkedArmorId && (
            <span className="text-[9px] text-cyan-400">
              Linked: {armors.find((a) => a.id === item.linkedArmorId)?.name ?? 'Unknown'}
            </span>
          )}
        </div>
      )}
      {/* Show linked info in readonly mode */}
      {readonly && (item.linkedWeaponId || item.linkedArmorId) && (
        <div className="mt-0.5">
          {item.linkedWeaponId && (
            <span className="text-[9px] text-cyan-400">
              Linked: {weapons.find((w) => w.id === item.linkedWeaponId)?.name ?? 'Unknown weapon'}
            </span>
          )}
          {item.linkedArmorId && (
            <span className="text-[9px] text-cyan-400">
              Linked: {armors.find((a) => a.id === item.linkedArmorId)?.name ?? 'Unknown armor'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
