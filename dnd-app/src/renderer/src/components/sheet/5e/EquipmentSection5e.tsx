import { useCharacterEditor } from '../../../hooks/use-character-editor'
import { useT } from '../../../i18n'
import type { Character } from '../../../types/character'
import type { Character5e } from '../../../types/character-5e'
import {
  type CarryingCapacity,
  calculateTotalWeight,
  type EncumbranceStatus,
  getCarryingCapacity,
  getEncumbranceStatus
} from '../../../utils/weight-calculator'

type _CarryingCapacity = CarryingCapacity
type _EncumbranceStatus = EncumbranceStatus

import SheetSectionWrapper from '../shared/SheetSectionWrapper'

import CharacterTraitsPanel from './CharacterTraitsPanel5e'
import CoinBadge from './CoinBadge5e'
import EquipmentListPanel from './EquipmentListPanel5e'
import MagicItemsPanel from './MagicItemsPanel5e'

interface EquipmentSection5eProps {
  character: Character5e
  readonly?: boolean
}

export default function EquipmentSection5e({ character, readonly }: EquipmentSection5eProps): JSX.Element {
  const { t } = useT()
  const { getLatest, saveAndBroadcast } = useCharacterEditor(character.id)

  const saveCurrencyDenom = (denom: string, newValue: number): void => {
    const latest = getLatest() || character
    const updated = {
      ...latest,
      treasure: { ...latest.treasure, [denom]: newValue },
      updatedAt: new Date().toISOString()
    } as Character
    saveAndBroadcast(updated)
  }

  const currency = character.treasure

  return (
    <SheetSectionWrapper title={t('sheet.equipmentSection.title')}>
      {/* Currency as coins */}
      <div className="flex flex-wrap gap-3 mb-3 justify-center">
        <CoinBadge label="PP" value={currency.pp} readonly={readonly} onSave={(v) => saveCurrencyDenom('pp', v)} />
        <CoinBadge label="GP" value={currency.gp} readonly={readonly} onSave={(v) => saveCurrencyDenom('gp', v)} />
        <CoinBadge
          label="EP"
          value={character.treasure.ep ?? 0}
          readonly={readonly}
          onSave={(v) => saveCurrencyDenom('ep', v)}
        />
        <CoinBadge label="SP" value={currency.sp} readonly={readonly} onSave={(v) => saveCurrencyDenom('sp', v)} />
        <CoinBadge label="CP" value={currency.cp} readonly={readonly} onSave={(v) => saveCurrencyDenom('cp', v)} />
      </div>

      {/* Carrying Capacity Weight Bar */}
      {(() => {
        const strScore = character.abilityScores.strength
        const size = character.size || 'Medium'
        const capacity = getCarryingCapacity(strScore, size)
        const currentWeight = calculateTotalWeight(character)
        const status = getEncumbranceStatus(currentWeight, capacity)
        const pct = capacity.carry > 0 ? Math.min(100, (currentWeight / capacity.carry) * 100) : 0
        const barColor =
          status === 'over-limit'
            ? 'bg-red-500'
            : status === 'encumbered'
              ? 'bg-amber-500'
              : pct >= 75
                ? 'bg-amber-500'
                : 'bg-green-500'
        return (
          <div className="mb-3">
            <div
              className="relative h-5 bg-gray-800 rounded-full overflow-hidden border border-gray-700"
              title={t('sheet.equipmentSection.carryingCapacityTooltip', {
                str: strScore,
                carry: capacity.carry,
                dragLiftPush: capacity.dragLiftPush
              })}
            >
              <div
                className={`absolute inset-y-0 left-0 ${barColor} transition-all`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-[11px] font-medium text-white drop-shadow">
                {currentWeight} / {capacity.carry} lb
              </div>
            </div>
            {status === 'encumbered' && (
              <p className="text-xs text-amber-400 mt-1">{t('sheet.equipmentSection.encumbered')}</p>
            )}
            {status === 'over-limit' && (
              <p className="text-xs text-red-400 mt-1">{t('sheet.equipmentSection.overLimit')}</p>
            )}
          </div>
        )
      })()}

      <MagicItemsPanel character={character} readonly={readonly} />
      <EquipmentListPanel character={character} readonly={readonly} />
      <CharacterTraitsPanel character={character} readonly={readonly} />
    </SheetSectionWrapper>
  )
}
