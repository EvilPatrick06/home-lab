import { useEffect, useState } from 'react'
import { getSteedForms } from '../../../../services/character/companion-service'
import { load5eMonsters } from '../../../../services/data-provider'
import type { Companion5e } from '../../../../types/companion'
import type { MonsterStatBlock } from '../../../../types/monster'
import { MonsterStatBlockView } from '../../dm'
import CompanionStatusBanner from '../shared/CompanionStatusBanner'

interface SteedSelectorModalProps {
  onClose: () => void
  onSummon: (companion: Omit<Companion5e, 'id' | 'tokenId' | 'createdAt'>) => void
  characterId: string
  existingSteed?: Companion5e | null
  onDismiss?: () => void
  onResummon?: () => void
}

export default function SteedSelectorModal({
  onClose,
  onSummon,
  characterId,
  existingSteed,
  onDismiss,
  onResummon
}: SteedSelectorModalProps): JSX.Element {
  const [forms, setForms] = useState<MonsterStatBlock[]>([])
  const [selected, setSelected] = useState<MonsterStatBlock | null>(null)

  useEffect(() => {
    load5eMonsters().then((all) => {
      setForms(getSteedForms(all))
    })
  }, [])

  const handleSummon = (): void => {
    if (!selected) return
    onSummon({
      type: 'steed',
      name: selected.name,
      monsterStatBlockId: selected.id,
      currentHP: selected.hp,
      maxHP: selected.hp,
      ownerId: characterId,
      dismissed: false,
      sourceSpell: 'find-steed'
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-[700px] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-blue-400">Find Steed</h2>
            <span className="text-xs text-gray-500">Summon a spirit in the form of a steed</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl cursor-pointer">
            x
          </button>
        </div>

        {/* Existing steed status */}
        {existingSteed && (
          <CompanionStatusBanner
            companion={existingSteed}
            activeColor="bg-blue-900/50 text-blue-400"
            resummonColor="bg-blue-700 hover:bg-blue-600"
            onDismiss={onDismiss}
            onResummon={onResummon}
          />
        )}

        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Steed list */}
          <div className="w-48 overflow-y-auto border-r border-gray-700/50 p-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 px-1">Available Steeds</div>
            <div className="space-y-1">
              {forms.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelected(m)}
                  className={`w-full p-2 rounded-lg text-left cursor-pointer transition-all ${
                    selected?.id === m.id
                      ? 'bg-blue-600/20 border border-blue-500/50'
                      : 'bg-gray-800/60 border border-gray-700/50 hover:bg-gray-700/60'
                  }`}
                >
                  <div className="text-xs text-gray-200 font-medium">{m.name}</div>
                  <div className="text-[9px] text-gray-500">
                    {m.size} — CR {m.cr} — HP {m.hp}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Stat block preview */}
          <div className="flex-1 overflow-y-auto p-4">
            {selected ? (
              <div className="space-y-3">
                <MonsterStatBlockView monster={selected} />
                <div className="text-[10px] text-gray-500 bg-gray-800/50 rounded p-2">
                  Your steed shares your initiative and acts on your turn. It can move and use its reaction on its own,
                  but the only action it takes on its turn is the Dodge action, unless you take a Bonus Action to
                  command it to take another action.
                </div>
                <button
                  onClick={handleSummon}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Summon {selected.name}
                </button>
              </div>
            ) : (
              <div className="text-gray-500 text-sm text-center mt-20">Select a steed to view its stat block</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
