import { useMemo, useState } from 'react'
import Modal from '../../components/ui/Modal'
import { addToast } from '../../hooks/use-toast'
import { useT } from '../../i18n'
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
  const { t } = useT()
  const [basicType, setBasicType] = useState<BasicFacilityType>('bedroom')
  const [basicSpace, setBasicSpace] = useState<FacilitySpace>('roomy')

  const handleAddBasic = (): void => {
    if (!selectedBastion) return
    const cost = BASIC_FACILITY_COSTS[basicSpace]
    // BAS-1 — the build used to close the modal with no feedback (and silently
    // did nothing at 0 GP, since construction only shows on the Overview tab).
    // Surface the outcome: error toast on insufficient funds (keep the modal
    // open to adjust), success toast confirming the queued project otherwise.
    const result = startConstruction(selectedBastion.id, {
      projectType: 'add-basic',
      facilityType: basicType,
      targetSpace: basicSpace,
      cost: cost.gp,
      daysRequired: cost.days
    })
    if (result === 'insufficient-funds') {
      addToast(
        t('pages.addBasicFacilityModal.insufficientFunds', { need: cost.gp, have: selectedBastion.treasury }),
        'error'
      )
      return
    }
    if (result === 'started') {
      addToast(t('pages.addBasicFacilityModal.queued', { days: cost.days }), 'success')
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={t('pages.addBasicFacilityModal.title')}>
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">{t('pages.addBasicFacilityModal.type')}</label>
          <select
            value={basicType}
            onChange={(e) => setBasicType(e.target.value as BasicFacilityType)}
            className="bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
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
          <label className="text-xs text-gray-500">{t('pages.addBasicFacilityModal.size')}</label>
          <select
            value={basicSpace}
            onChange={(e) => setBasicSpace(e.target.value as FacilitySpace)}
            className="bg-surface-2 border border-border rounded px-3 py-2 text-sm text-fg focus:outline-none focus:border-amber-500"
          >
            <option value="cramped">
              {t('pages.addBasicFacilityModal.cramped', {
                gp: BASIC_FACILITY_COSTS.cramped.gp,
                days: BASIC_FACILITY_COSTS.cramped.days
              })}
            </option>
            <option value="roomy">
              {t('pages.addBasicFacilityModal.roomy', {
                gp: BASIC_FACILITY_COSTS.roomy.gp,
                days: BASIC_FACILITY_COSTS.roomy.days
              })}
            </option>
            <option value="vast">
              {t('pages.addBasicFacilityModal.vast', {
                gp: BASIC_FACILITY_COSTS.vast.gp,
                days: BASIC_FACILITY_COSTS.vast.days
              })}
            </option>
          </select>
        </div>
        <div className="text-xs text-muted">
          {t('pages.addBasicFacilityModal.costConstruction', {
            gp: BASIC_FACILITY_COSTS[basicSpace].gp,
            days: BASIC_FACILITY_COSTS[basicSpace].days
          })}
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-surface-2 transition-colors"
          >
            {t('common.actions.cancel')}
          </button>
          <button
            onClick={handleAddBasic}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-accent-strong text-white rounded font-semibold transition-colors"
          >
            {t('pages.addBasicFacilityModal.build', { gp: BASIC_FACILITY_COSTS[basicSpace].gp })}
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
  const { t } = useT()
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
    <Modal open={open} onClose={handleClose} title={t('pages.addSpecialFacilityModal.title')}>
      <div className="space-y-4">
        {selectedBastion &&
          selectedBastion.specialFacilities.length +
            selectedBastion.construction.filter((p) => p.projectType === 'add-special').length >=
            maxSpecial && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-2">
              {t('pages.addSpecialFacilityModal.maxReached', { max: maxSpecial })}
            </div>
          )}
        {/* Setting filter */}
        <div className="flex gap-1">
          {(['all', 'core', 'fr', 'eberron'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSettingFilter(s)}
              className={`px-2 py-1 text-xs rounded transition-colors ${settingFilter === s ? 'bg-amber-700 text-white' : 'bg-surface-2 text-muted hover:text-gray-200'}`}
            >
              {s === 'all' ? t('pages.addSpecialFacilityModal.all') : SETTING_LABELS[s]}
            </button>
          ))}
        </div>
        {/* Facility list */}
        <div className="max-h-72 overflow-y-auto space-y-2">
          {filteredFacilities.map((def) => {
            const eligibility = owner5e
              ? getFacilityEligibility(owner5e, def, selectedBastion?.factionRenown)
              : { eligible: true }
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
                      ? 'bg-surface-2 border-border hover:border-gray-600'
                      : 'bg-surface/50 border-gray-800 opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-fg">{def.name}</span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded border ${
                        def.setting === 'core'
                          ? 'bg-surface-2 text-muted border-border'
                          : def.setting === 'fr'
                            ? 'bg-emerald-900/30 text-emerald-400 border-emerald-700'
                            : 'bg-orange-900/30 text-orange-400 border-orange-700'
                      }`}
                    >
                      {SETTING_LABELS[def.setting]}
                    </span>
                    <span className="text-xs text-gray-600">
                      Lv {def.level} &mdash; {(SPECIAL_FACILITY_COSTS[def.level] ?? SPECIAL_FACILITY_COSTS[5]).bp} BP
                    </span>
                  </div>
                  {eligibility.eligible ? (
                    <span className="text-xs text-green-400">{t('pages.addSpecialFacilityModal.eligible')}</span>
                  ) : isFaction ? (
                    <span className="text-xs text-yellow-400">{t('pages.addSpecialFacilityModal.faction')}</span>
                  ) : (
                    <span className="text-xs text-red-400">{t('pages.addSpecialFacilityModal.ineligible')}</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{def.description}</p>
                {!eligibility.eligible && eligibility.reason && (
                  <p className="text-xs text-red-400 mt-1">
                    {t('pages.addSpecialFacilityModal.requires', { reason: eligibility.reason })}
                  </p>
                )}
                <div className="flex gap-2 mt-1">
                  {def.orders.map((o) => (
                    <span key={o} className={`text-xs px-1.5 py-0.5 rounded border ${ORDER_COLORS[o]}`}>
                      {ORDER_LABELS[o]}
                    </span>
                  ))}
                  {def.charm && (
                    <span className="text-xs px-1.5 py-0.5 rounded border bg-purple-900/30 text-purple-300 border-purple-700">
                      {t('pages.addSpecialFacilityModal.charm')}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
        {/* Faction override */}
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={factionOverride}
            onChange={(e) => setFactionOverride(e.target.checked)}
            className="rounded bg-surface-2 border-gray-600"
          />
          {t('pages.addSpecialFacilityModal.overrideFaction')}
        </label>
        {/* Selected facility detail */}
        {selectedSpecialDef &&
          (() => {
            const costs = SPECIAL_FACILITY_COSTS[selectedSpecialDef.level] ?? SPECIAL_FACILITY_COSTS[5]
            const canAffordBp = selectedBastion ? selectedBastion.bastionPoints >= costs.bp : false
            const canAffordGp = selectedBastion ? selectedBastion.treasury >= costs.gp : false
            const _canAfford = canAffordBp && canAffordGp
            return (
              <div className="bg-surface-2/50 rounded p-3 border border-border">
                <h4 className="font-medium text-sm text-fg">{selectedSpecialDef.name}</h4>
                <p className="text-xs text-muted mt-1">{selectedSpecialDef.description}</p>
                {selectedSpecialDef.charm && (
                  <div className="mt-2 text-xs text-purple-300">
                    {t('pages.addSpecialFacilityModal.charmDetail', {
                      description: selectedSpecialDef.charm.description,
                      duration: selectedSpecialDef.charm.duration
                    })}
                  </div>
                )}
                {selectedSpecialDef.permanentBenefit && (
                  <div className="mt-1 text-xs text-amber-300">
                    {t('pages.addSpecialFacilityModal.benefit', { benefit: selectedSpecialDef.permanentBenefit })}
                  </div>
                )}
                <div className="mt-2 text-xs text-muted">
                  {t('pages.addSpecialFacilityModal.cost')}{' '}
                  <span className={canAffordBp ? 'text-purple-400' : 'text-red-400'}>{costs.bp} BP</span>
                  {costs.gp > 0 && (
                    <>
                      {' '}
                      &middot; <span className={canAffordGp ? 'text-yellow-400' : 'text-red-400'}>{costs.gp} GP</span>
                    </>
                  )}
                  {costs.days > 0 && <> {t('pages.addSpecialFacilityModal.constructionDays', { days: costs.days })}</>}
                </div>
                {!canAffordBp && (
                  <div className="mt-1 text-xs text-red-400">
                    {t('pages.addSpecialFacilityModal.notEnoughBp', {
                      have: selectedBastion?.bastionPoints ?? 0,
                      need: costs.bp
                    })}
                  </div>
                )}
                {!canAffordGp && costs.gp > 0 && (
                  <div className="mt-1 text-xs text-red-400">
                    {t('pages.addSpecialFacilityModal.notEnoughGold', {
                      have: selectedBastion?.treasury ?? 0,
                      need: costs.gp
                    })}
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
            className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-surface-2 transition-colors"
          >
            {t('common.actions.cancel')}
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
                selectedBastion.bastionPoints <
                  (SPECIAL_FACILITY_COSTS[selectedSpecialDef.level]?.bp ?? SPECIAL_FACILITY_COSTS[5].bp))
            }
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-accent-strong disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-semibold transition-colors"
          >
            {t('pages.addSpecialFacilityModal.buildFacility')}
            {selectedSpecialDef
              ? ` (${(SPECIAL_FACILITY_COSTS[selectedSpecialDef.level] ?? SPECIAL_FACILITY_COSTS[5]).bp} BP)`
              : ''}
          </button>
        </div>
      </div>
    </Modal>
  )
}
