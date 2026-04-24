import { useCallback, useState } from 'react'
import { VARIANT_ITEMS } from '../../../data/variant-items'
import { DATA_PATHS, loadJson, type TrinketsFile } from '../../../services/data-provider'

type _TrinketsFile = TrinketsFile

import { useBuilderStore } from '../../../stores/use-builder-store'
import SectionBanner from '../shared/SectionBanner'

function TrinketRoller(): JSX.Element {
  const classEquipment = useBuilderStore((s) => s.classEquipment)
  const addEquipmentItem = useBuilderStore((s) => s.addEquipmentItem)

  // Check if a trinket was already rolled (persists across tab switches)
  const existingTrinket = classEquipment.find((e) => e.source === 'trinket')

  const [rollNumber, setRollNumber] = useState<number | null>(null)

  const handleRoll = useCallback(async () => {
    try {
      const trinkets = await loadJson<string[]>(DATA_PATHS.trinkets)
      const idx = Math.floor(Math.random() * trinkets.length)
      setRollNumber(idx + 1)
      addEquipmentItem({ name: trinkets[idx], quantity: 1, source: 'trinket' })
    } catch {
      addEquipmentItem({ name: 'A mysterious trinket', quantity: 1, source: 'trinket' })
      setRollNumber(null)
    }
  }, [addEquipmentItem])

  if (existingTrinket) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-gray-500">Your trinket has been rolled.</p>
        <div className="bg-gray-800/60 border border-gray-700 rounded px-3 py-2">
          {rollNumber && <span className="text-xs text-amber-400 font-mono mr-2">d100: {rollNumber}</span>}
          <span className="text-sm text-gray-200">{existingTrinket.name}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">Roll a random trinket from the d100 table.</p>
      <button
        onClick={handleRoll}
        className="text-xs px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-gray-900 font-semibold cursor-pointer"
      >
        Roll Trinket
      </button>
    </div>
  )
}

interface VariantItem {
  eqIndex: number
  bgItemIdx?: number
  itemName: string
  key: string
  config: { label: string; variants: string[] }
  chosenVariant: string | null
}

export function VariantChoicesSection({
  classEquipment,
  bgEquipment
}: {
  classEquipment: Array<{ name: string; quantity: number; source: string }>
  bgEquipment: Array<{ option: string; items: string[]; source: string }>
}): JSX.Element | null {
  const [rePickKey, setRePickKey] = useState<string | null>(null)

  const variantItems: VariantItem[] = []
  for (let i = 0; i < classEquipment.length; i++) {
    const name = classEquipment[i].name.toLowerCase()
    for (const [key, config] of Object.entries(VARIANT_ITEMS)) {
      const isGeneric = name.includes(key) && !config.variants.some((v) => v.toLowerCase() === name)
      const isChosen = config.variants.some((v) => v.toLowerCase() === name)
      if (isGeneric || isChosen) {
        variantItems.push({
          eqIndex: i,
          itemName: classEquipment[i].name,
          key,
          config,
          chosenVariant: isChosen ? classEquipment[i].name : null
        })
        break
      }
    }
  }
  // Also check background equipment (flatten option groups)
  for (let gi = 0; gi < bgEquipment.length; gi++) {
    for (let ii = 0; ii < bgEquipment[gi].items.length; ii++) {
      const name = bgEquipment[gi].items[ii].toLowerCase()
      for (const [key, config] of Object.entries(VARIANT_ITEMS)) {
        const isGeneric = name.includes(key) && !config.variants.some((v) => v.toLowerCase() === name)
        const isChosen = config.variants.some((v) => v.toLowerCase() === name)
        if (isGeneric || isChosen) {
          variantItems.push({
            eqIndex: -(gi + 1), // negative = bg equipment group
            bgItemIdx: ii,
            itemName: bgEquipment[gi].items[ii],
            key,
            config,
            chosenVariant: isChosen ? bgEquipment[gi].items[ii] : null
          })
          break
        }
      }
    }
  }

  if (variantItems.length === 0) return null

  const handleSelectVariant = (item: VariantItem, variant: string): void => {
    if (item.eqIndex < 0) {
      // Background equipment: update the specific item within the option group
      const groupIdx = -(item.eqIndex + 1)
      const itemIdx = item.bgItemIdx!
      const currentBg = useBuilderStore.getState().bgEquipment
      useBuilderStore.setState({
        bgEquipment: currentBg.map((e, idx) =>
          idx === groupIdx ? { ...e, items: e.items.map((it, i) => (i === itemIdx ? variant : it)) } : e
        )
      })
    } else {
      useBuilderStore.setState({
        classEquipment: classEquipment.map((e, idx) => (idx === item.eqIndex ? { ...e, name: variant } : e))
      })
    }
    setRePickKey(null)
  }

  return (
    <>
      <SectionBanner label="EQUIPMENT CHOICES" />
      <div className="px-4 py-3 border-b border-gray-800 space-y-3">
        {variantItems.map((item) => {
          const showPicker = !item.chosenVariant || rePickKey === `${item.key}-${item.eqIndex}`
          return (
            <div key={`${item.key}-${item.eqIndex}`}>
              {item.chosenVariant && !showPicker ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-green-900/50 text-green-300 border border-green-700">
                    {item.config.label}
                  </span>
                  <span className="text-sm text-gray-200 font-medium">{item.chosenVariant}</span>
                  <button
                    onClick={() => setRePickKey(`${item.key}-${item.eqIndex}`)}
                    className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer underline decoration-dotted underline-offset-2 ml-2"
                  >
                    Choose a different one?
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">Choose a specific {item.config.label}:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {item.config.variants.map((variant) => (
                      <button
                        key={variant}
                        onClick={() => handleSelectVariant(item, variant)}
                        className={`px-2.5 py-1 text-xs rounded border cursor-pointer transition-colors ${
                          item.chosenVariant === variant
                            ? 'bg-amber-900/40 border-amber-600 text-amber-300'
                            : 'border-amber-700/50 text-amber-300 hover:bg-amber-900/40'
                        }`}
                      >
                        {variant}
                      </button>
                    ))}
                  </div>
                  {item.chosenVariant && (
                    <button
                      onClick={() => setRePickKey(null)}
                      className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer mt-1"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

export default function BackstoryEditor5e(): JSX.Element {
  return (
    <>
      <SectionBanner label="TRINKET" />
      <div className="px-4 py-3 border-b border-gray-800">
        <TrinketRoller />
      </div>
    </>
  )
}
