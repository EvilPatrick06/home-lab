import { useEffect, useState } from 'react'
import { getFamiliarForms } from '../../../../services/character/companion-service'
import { load5eMonsters } from '../../../../services/data-provider'
import type { Companion5e } from '../../../../types/companion'
import type { MonsterStatBlock } from '../../../../types/monster'
import { MonsterStatBlockView } from '../../dm'
import CompanionStatusBanner from '../shared/CompanionStatusBanner'

interface FamiliarSelectorModalProps {
  onClose: () => void
  onSummon: (companion: Omit<Companion5e, 'id' | 'tokenId' | 'createdAt'>) => void
  characterId: string
  hasChainPact?: boolean
  existingFamiliar?: Companion5e | null
  onDismiss?: () => void
  onResummon?: () => void
}

export default function FamiliarSelectorModal({
  onClose,
  onSummon,
  characterId,
  hasChainPact = false,
  existingFamiliar,
  onDismiss,
  onResummon
}: FamiliarSelectorModalProps): JSX.Element {
  const [_monsters, setMonsters] = useState<MonsterStatBlock[]>([])
  const [forms, setForms] = useState<MonsterStatBlock[]>([])
  const [selected, setSelected] = useState<MonsterStatBlock | null>(null)

  useEffect(() => {
    load5eMonsters().then((all) => {
      setMonsters(all)
      setForms(getFamiliarForms(all, hasChainPact))
    })
  }, [hasChainPact])

  const handleSummon = (): void => {
    if (!selected) return
    onSummon({
      type: 'familiar',
      name: selected.name,
      monsterStatBlockId: selected.id,
      currentHP: selected.hp,
      maxHP: selected.hp,
      ownerId: characterId,
      dismissed: false,
      sourceSpell: 'find-familiar'
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
          <h2 className="text-lg font-bold text-amber-400">Find Familiar</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl cursor-pointer">
            x
          </button>
        </div>

        {/* Existing familiar status */}
        {existingFamiliar && (
          <CompanionStatusBanner
            companion={existingFamiliar}
            activeColor="bg-green-900/50 text-green-400"
            resummonColor="bg-green-700 hover:bg-green-600"
            onDismiss={onDismiss}
            onResummon={onResummon}
          />
        )}

        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Form grid */}
          <div className="w-56 overflow-y-auto border-r border-gray-700/50 p-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 px-1">Standard Forms</div>
            <div className="grid grid-cols-2 gap-1.5">
              {forms
                .filter((f) => !f.tags?.includes('chain-pact'))
                .map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelected(m)}
                    className={`p-2 rounded-lg text-center cursor-pointer transition-all ${
                      selected?.id === m.id
                        ? 'bg-amber-600/30 border border-amber-500/50'
                        : 'bg-gray-800/60 border border-gray-700/50 hover:bg-gray-700/60'
                    }`}
                  >
                    <div className="text-xs text-gray-200 font-medium truncate">{m.name}</div>
                    <div className="text-[9px] text-gray-500">CR {m.cr}</div>
                  </button>
                ))}
            </div>
            {hasChainPact && (
              <>
                <div className="text-[10px] text-purple-400 uppercase tracking-wider mt-3 mb-2 px-1">
                  Pact of the Chain
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {forms
                    .filter((f) => f.tags?.includes('chain-pact'))
                    .map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setSelected(m)}
                        className={`p-2 rounded-lg text-center cursor-pointer transition-all ${
                          selected?.id === m.id
                            ? 'bg-purple-600/30 border border-purple-500/50'
                            : 'bg-gray-800/60 border border-gray-700/50 hover:bg-gray-700/60'
                        }`}
                      >
                        <div className="text-xs text-gray-200 font-medium truncate">{m.name}</div>
                        <div className="text-[9px] text-gray-500">CR {m.cr}</div>
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>

          {/* Stat block preview */}
          <div className="flex-1 overflow-y-auto p-4">
            {selected ? (
              <div className="space-y-3">
                <MonsterStatBlockView monster={selected} />
                <button
                  onClick={handleSummon}
                  className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Summon {selected.name}
                </button>
              </div>
            ) : (
              <div className="text-gray-500 text-sm text-center mt-20">Select a form to view its stat block</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
