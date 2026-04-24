import { useMemo, useState } from 'react'
import Modal from '../../components/ui/Modal'
import type {
  BasicFacilityDef,
  BasicFacilityType,
  Bastion,
  FacilitySpace,
  SpecialFacilityDef,
  SpecialFacilityType
} from '../../types/bastion'
import { BASIC_FACILITY_COSTS, SPECIAL_FACILITY_COSTS } from '../../types/bastion'
import type { Character5e } from '../../types/character-5e'
import { getFacilityEligibility } from '../../utils/bastion-prerequisites'
import { ORDER_COLORS, ORDER_LABELS, SETTING_LABELS } from './bastion-constants'
import type { BastionModalsProps } from './bastion-modal-types'

export function AddBasicFacilityModal({
  open,
  onClose,
  selectedBastion,
  basicFacilityDefs,
  startConstruction
}: {
  open: boolean
  onClose: () => void
  selectedBastion: Bastion | undefined
  basicFacilityDefs: BasicFacilityDef[]
  startConstruction: BastionModalsProps['startConstruction']
}): JSX.Element {
  const [basicType, setBasicType] = useState<BasicFacilityType>('bedroom')
  const [basicSpace, setBasicSpace] = useState<FacilitySpace>('roomy')

  const handleAddBasic = (): void => {
    if (!selectedBastion) return
    const cost = BASIC_FACILITY_COSTS[basicSpace]
    startConstruction(selectedBastion.id, {
      projectType: 'add-basic',
      facilityType: basicType,
      targetSpace: basicSpace,
      cost: cost.gp,
      daysRequired: cost.days
    })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Basic Facility">
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Type</label>
          <select
            value={basicType}
            onChange={(e) => setBasicType(e.target.value as BasicFacilityType)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
          >
            {basicFacilityDefs.map((d) => (
              <option key={d.type} value={d.type}>
                {d.name}
              </option>
            ))}
          </select>
          {basicFacilityDefs.find((d) => d.type === basicType) && (
            <p className="text-xs text-gray-500 mt-1">
              {basicFacilityDefs.find((d) => d.type === basicType)?.description}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Size</label>
          <select
            value={basicSpace}
            onChange={(e) => setBasicSpace(e.target.value as FacilitySpace)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500"
          >
            <option value="cramped">
              Cramped ({BASIC_FACILITY_COSTS.cramped.gp} GP, {BASIC_FACILITY_COSTS.cramped.days} days)
            </option>
            <option value="roomy">
              Roomy ({BASIC_FACILITY_COSTS.roomy.gp} GP, {BASIC_FACILITY_COSTS.roomy.days} days)
            </option>
            <option value="vast">
              Vast ({BASIC_FACILITY_COSTS.vast.gp} GP, {BASIC_FACILITY_COSTS.vast.days} days)
            </option>
          </select>
        </div>
        <div className="text-xs text-gray-400">
          Cost: {BASIC_FACILITY_COSTS[basicSpace].gp} GP &middot; Construction: {BASIC_FACILITY_COSTS[basicSpace].days}{' '}
          days
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAddBasic}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded font-semibold transition-colors"
          >
            Build ({BASIC_FACILITY_COSTS[basicSpace].gp} GP)
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function AddSpecialFacilityModal({
  open,
  onClose,
  selectedBastion,
  facilityDefs,
  maxSpecial,
  maxFacilityLevel,
  owner5e,
  addSpecialFacility
}: {
  open: boolean
  onClose: () => void
  selectedBastion: Bastion | undefined
  facilityDefs: SpecialFacilityDef[]
  maxSpecial: number
  maxFacilityLevel: number
  owner5e: Character5e | null
  addSpecialFacility: BastionModalsProps['addSpecialFacility']
}): JSX.Element {
  const [settingFilter, setSettingFilter] = useState<'all' | 'core' | 'fr' | 'eberron'>('all')
  const [selectedSpecialType, setSelectedSpecialType] = useState<SpecialFacilityType | null>(null)
  const [factionOverride, setFactionOverride] = useState(false)

  const filteredFacilities = useMemo(() => {
    let list = facilityDefs.filter((f) => f.level <= maxFacilityLevel)
    if (settingFilter !== 'all') {
      list = list.filter((f) => f.setting === settingFilter)
    }
    return list
  }, [facilityDefs, maxFacilityLevel, settingFilter])

  const selectedSpecialDef = selectedSpecialType
    ? (facilityDefs.find((f) => f.type === selectedSpecialType) ?? null)
    : null

  const handleClose = (): void => {
    onClose()
    setSelectedSpecialType(null)
    setFactionOverride(false)
  }

  const handleAddSpecial = (): void => {
    if (!selectedBastion || !selectedSpecialDef) return
    addSpecialFacility(
      selectedBastion.id,
      selectedSpecialDef.type,
      selectedSpecialDef.name,
      selectedSpecialDef.defaultSpace
    )
    handleClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Special Facility">
      <div className="space-y-4">
        {selectedBastion &&
          selectedBastion.specialFacilities.length +
            selectedBastion.construction.filter((p) => p.projectType === 'add-special').length >=
            maxSpecial && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-2">
              Maximum special facilities reached ({maxSpecial}). Remove or swap one first.
            </div>
          )}
        {/* Setting filter */}
        <div className="flex gap-1">
          {(['all', 'core', 'fr', 'eberron'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSettingFilter(s)}
              className={`px-2 py-1 text-xs rounded transition-colors ${settingFilter === s ? 'bg-amber-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
            >
              {s === 'all' ? 'All' : SETTING_LABELS[s]}
            </button>
          ))}
        </div>
        {/* Facility list */}
        <div className="max-h-72 overflow-y-auto space-y-2">
          {filteredFacilities.map((def) => {
            const eligibility = owner5e ? getFacilityEligibility(owner5e, def) : { eligible: true }
            const isFaction = def.prerequisite?.type === 'faction-renown'
            const canSelect = eligibility.eligible || (isFaction && factionOverride)
            const isSelected = selectedSpecialType === def.type
            return (
              <button
                key={def.type}
                onClick={() => canSelect && setSelectedSpecialType(def.type)}
                disabled={!canSelect}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  isSelected
                    ? 'bg-amber-900/30 border-amber-700'
                    : canSelect
                      ? 'bg-gray-800 border-gray-700 hover:border-gray-600'
                      : 'bg-gray-900/50 border-gray-800 opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-100">{def.name}</span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded border ${
                        def.setting === 'core'
                          ? 'bg-gray-800 text-gray-400 border-gray-700'
                          : def.setting === 'fr'
                            ? 'bg-emerald-900/30 text-emerald-400 border-emerald-700'
                            : 'bg-orange-900/30 text-orange-400 border-orange-700'
                      }`}
                    >
                      {SETTING_LABELS[def.setting]}
                    </span>
                    <span className="text-xs text-gray-600">Lv {def.level}</span>
                  </div>
                  {eligibility.eligible ? (
                    <span className="text-xs text-green-400">Eligible</span>
                  ) : isFaction ? (
                    <span className="text-xs text-yellow-400">Faction</span>
                  ) : (
                    <span className="text-xs text-red-400">Ineligible</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{def.description}</p>
                {!eligibility.eligible && eligibility.reason && (
                  <p className="text-xs text-red-400 mt-1">Requires: {eligibility.reason}</p>
                )}
                <div className="flex gap-2 mt-1">
                  {def.orders.map((o) => (
                    <span key={o} className={`text-xs px-1.5 py-0.5 rounded border ${ORDER_COLORS[o]}`}>
                      {ORDER_LABELS[o]}
                    </span>
                  ))}
                  {def.charm && (
                    <span className="text-xs px-1.5 py-0.5 rounded border bg-purple-900/30 text-purple-300 border-purple-700">
                      Charm
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
        {/* Faction override */}
        <label className="flex items-center gap-2 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={factionOverride}
            onChange={(e) => setFactionOverride(e.target.checked)}
            className="rounded bg-gray-800 border-gray-600"
          />
          Override faction requirement (I meet this faction prerequisite)
        </label>
        {/* Selected facility detail */}
        {selectedSpecialDef &&
          (() => {
            const costs = SPECIAL_FACILITY_COSTS[selectedSpecialDef.level] ?? SPECIAL_FACILITY_COSTS[5]
            const canAfford = selectedBastion ? selectedBastion.treasury >= costs.gp : false
            return (
              <div className="bg-gray-800/50 rounded p-3 border border-gray-700">
                <h4 className="font-medium text-sm text-gray-100">{selectedSpecialDef.name}</h4>
                <p className="text-xs text-gray-400 mt-1">{selectedSpecialDef.description}</p>
                {selectedSpecialDef.charm && (
                  <div className="mt-2 text-xs text-purple-300">
                    Charm: {selectedSpecialDef.charm.description} ({selectedSpecialDef.charm.duration})
                  </div>
                )}
                {selectedSpecialDef.permanentBenefit && (
                  <div className="mt-1 text-xs text-amber-300">Benefit: {selectedSpecialDef.permanentBenefit}</div>
                )}
                <div className="mt-2 text-xs text-gray-400">
                  Cost: <span className={canAfford ? 'text-yellow-400' : 'text-red-400'}>{costs.gp} GP</span> &middot;
                  Construction: {costs.days} days
                </div>
                {!canAfford && (
                  <div className="mt-1 text-xs text-red-400">
                    Not enough gold (have {selectedBastion?.treasury ?? 0} GP, need {costs.gp} GP)
                  </div>
                )}
              </div>
            )
          })()}
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => {
              handleClose()
            }}
            className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAddSpecial}
            disabled={
              !selectedSpecialType ||
              (selectedBastion != null &&
                selectedBastion.specialFacilities.length +
                  selectedBastion.construction.filter((p) => p.projectType === 'add-special').length >=
                  maxSpecial) ||
              (selectedSpecialDef != null &&
                selectedBastion != null &&
                selectedBastion.treasury <
                  (SPECIAL_FACILITY_COSTS[selectedSpecialDef.level]?.gp ?? SPECIAL_FACILITY_COSTS[5].gp))
            }
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-semibold transition-colors"
          >
            Build Facility
            {selectedSpecialDef
              ? ` (${(SPECIAL_FACILITY_COSTS[selectedSpecialDef.level] ?? SPECIAL_FACILITY_COSTS[5]).gp} GP)`
              : ''}
          </button>
        </div>
      </div>
    </Modal>
  )
}
