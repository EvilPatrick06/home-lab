import type {
  AttackEventResult,
  BastionEventResult,
  EnclaveCreatureEntry,
  ExpertTrainerEntry,
  ForgeConstructEntry,
  GamblingResult,
  GuildEntry,
  MenagerieCreatureEntry,
  PubSpecialEntry,
  TreasureResult
} from '../../data/bastion-events'
import {
  ALL_IS_WELL_FLAVORS,
  BASTION_EVENTS_TABLE,
  CREATURE_COSTS_BY_CR,
  EMERALD_ENCLAVE_CREATURES,
  EXPERT_TRAINERS,
  FORGE_CONSTRUCTS,
  GAMING_HALL_WINNINGS,
  GUEST_TABLE,
  MENAGERIE_CREATURES,
  PUB_SPECIALS,
  SAMPLE_GUILDS,
  TREASURE_TABLE
} from '../../data/bastion-events'
import type { BasicFacilityDef, Bastion, BastionFacilitiesData, SpecialFacilityDef } from '../../types/bastion'
import { ENLARGE_COSTS, FACILITY_SPACE_SQUARES } from '../../types/bastion'
import type { Character5e } from '../../types/character-5e'
import { ORDER_COLORS, ORDER_LABELS } from './bastion-constants'

/** Type references to satisfy import usage for bastion event result types */
type _EventTypes =
  | BastionEventResult
  | AttackEventResult
  | GamblingResult
  | TreasureResult
  | MenagerieCreatureEntry
  | ExpertTrainerEntry
  | PubSpecialEntry
  | GuildEntry
  | EnclaveCreatureEntry
  | ForgeConstructEntry
  | BastionFacilitiesData

/** Show facility-relevant reference data from bastion event tables */
function FacilityReferenceData({ facilityType }: { facilityType: string }): JSX.Element | null {
  switch (facilityType) {
    case 'gaming-hall':
      return GAMING_HALL_WINNINGS.length > 0 ? (
        <div className="mt-2 text-xs text-gray-500">
          <span className="text-gray-400 font-medium">Winnings table:</span>{' '}
          {GAMING_HALL_WINNINGS.map((w) => w.description).join('; ')}
        </div>
      ) : null

    case 'menagerie':
      return MENAGERIE_CREATURES.length > 0 ? (
        <div className="mt-2 text-xs text-gray-500">
          <span className="text-gray-400 font-medium">Available creatures:</span>{' '}
          {MENAGERIE_CREATURES.map((c) => `${c.name} (CR ${c.cr}, ${c.cost} GP)`).join(', ')}
          {CREATURE_COSTS_BY_CR.length > 0 && (
            <span className="ml-1">
              | Cost by CR: {CREATURE_COSTS_BY_CR.map((e) => `CR ${e.cr}=${e.cost} GP`).join(', ')}
            </span>
          )}
        </div>
      ) : null

    case 'training-area':
      return EXPERT_TRAINERS.length > 0 ? (
        <div className="mt-2 text-xs text-gray-500">
          <span className="text-gray-400 font-medium">Expert trainers:</span>{' '}
          {EXPERT_TRAINERS.map((t) => `${t.name} (${t.type})`).join(', ')}
        </div>
      ) : null

    case 'pub':
      return PUB_SPECIALS.length > 0 ? (
        <div className="mt-2 text-xs text-gray-500">
          <span className="text-gray-400 font-medium">Pub specials:</span> {PUB_SPECIALS.map((p) => p.name).join(', ')}
        </div>
      ) : null

    case 'guildhall':
      return SAMPLE_GUILDS.length > 0 ? (
        <div className="mt-2 text-xs text-gray-500">
          <span className="text-gray-400 font-medium">Sample guilds:</span>{' '}
          {SAMPLE_GUILDS.map((g) => g.guildType).join(', ')}
        </div>
      ) : null

    case 'emerald-enclave-grove':
      return EMERALD_ENCLAVE_CREATURES.length > 0 ? (
        <div className="mt-2 text-xs text-gray-500">
          <span className="text-gray-400 font-medium">Enclave creatures:</span>{' '}
          {EMERALD_ENCLAVE_CREATURES.map((c) => `${c.creatureType} (CR ${c.cr})`).join(', ')}
        </div>
      ) : null

    case 'construct-forge':
    case 'artificers-forge':
      return FORGE_CONSTRUCTS.length > 0 ? (
        <div className="mt-2 text-xs text-gray-500">
          <span className="text-gray-400 font-medium">Constructs:</span>{' '}
          {FORGE_CONSTRUCTS.map((f) => `${f.name} (CR ${f.cr}, ${f.costGP} GP, ${f.timeDays} days)`).join(', ')}
        </div>
      ) : null

    default:
      return null
  }
}

/** Summary of bastion event tables for the events reference tooltip */
function _getEventTablesSummary(): {
  eventCount: number
  flavorCount: number
  guestCount: number
  treasureCount: number
} {
  return {
    eventCount: BASTION_EVENTS_TABLE.length,
    flavorCount: ALL_IS_WELL_FLAVORS.length,
    guestCount: GUEST_TABLE.length,
    treasureCount: TREASURE_TABLE.length
  }
}

export function BasicTab({
  bastion,
  basicDefs,
  onAdd,
  onRemove
}: {
  bastion: Bastion
  basicDefs: BasicFacilityDef[]
  onAdd: () => void
  onRemove: (id: string) => void
}): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-200">Basic Facilities ({bastion.basicFacilities.length})</h2>
        <button
          onClick={onAdd}
          className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded transition-colors"
        >
          + Add Basic Facility
        </button>
      </div>
      {bastion.basicFacilities.length === 0 ? (
        <div className="text-sm text-gray-500 bg-gray-900 rounded-lg p-4">No basic facilities.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {bastion.basicFacilities.map((f) => {
            const def = basicDefs.find((d) => d.type === f.type)
            return (
              <div key={f.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-100">{f.name}</span>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700 capitalize"
                      title={`${FACILITY_SPACE_SQUARES[f.space]} squares`}
                    >
                      {f.space} ({FACILITY_SPACE_SQUARES[f.space]} sq)
                    </span>
                  </div>
                  <button
                    onClick={() => onRemove(f.id)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove
                  </button>
                </div>
                {def && <p className="text-xs text-gray-500">{def.description}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function SpecialTab({
  bastion,
  facilityDefs,
  owner5e: _owner5e,
  maxSpecial,
  onAdd,
  onRemove,
  onConfigure
}: {
  bastion: Bastion
  facilityDefs: SpecialFacilityDef[]
  owner5e: Character5e | null
  maxSpecial: number
  onAdd: () => void
  onRemove: (id: string) => void
  onConfigure: (id: string, config: Record<string, unknown>) => void
}): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-200">
          Special Facilities ({bastion.specialFacilities.length}/{maxSpecial})
        </h2>
        <button
          onClick={onAdd}
          disabled={bastion.specialFacilities.length >= maxSpecial}
          className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors"
        >
          + Add Special Facility
        </button>
      </div>
      {bastion.specialFacilities.length === 0 ? (
        <div className="text-sm text-gray-500 bg-gray-900 rounded-lg p-4">
          No special facilities. Add one to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {bastion.specialFacilities.map((f) => {
            const def = facilityDefs.find((d) => d.type === f.type)
            return (
              <div key={f.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-100">{f.name}</span>
                    {def && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded border ${
                          def.setting === 'core'
                            ? 'bg-gray-800 text-gray-400 border-gray-700'
                            : def.setting === 'fr'
                              ? 'bg-emerald-900/30 text-emerald-400 border-emerald-700'
                              : 'bg-orange-900/30 text-orange-400 border-orange-700'
                        }`}
                      >
                        Lv {def.level}
                      </span>
                    )}
                    <span
                      className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700 capitalize"
                      title={`${FACILITY_SPACE_SQUARES[f.space]} squares${
                        !f.enlarged && f.space !== 'vast'
                          ? ` | Enlarge: ${ENLARGE_COSTS[f.space === 'cramped' ? 'cramped-roomy' : 'roomy-vast']?.gp ?? '?'} GP, ${ENLARGE_COSTS[f.space === 'cramped' ? 'cramped-roomy' : 'roomy-vast']?.days ?? '?'} days`
                          : ''
                      }`}
                    >
                      {f.space} ({FACILITY_SPACE_SQUARES[f.space]} sq)
                    </span>
                    {f.enlarged && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-300 border border-blue-700">
                        Enlarged
                      </span>
                    )}
                    {f.currentOrder && (
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${ORDER_COLORS[f.currentOrder]}`}>
                        {ORDER_LABELS[f.currentOrder]}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onRemove(f.id)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove
                  </button>
                </div>
                {def && <p className="text-xs text-gray-500 mb-2">{def.description}</p>}
                {def?.charm && (
                  <div className="text-xs text-purple-300 mb-2">
                    Charm: {def.charm.description} ({def.charm.duration})
                  </div>
                )}
                {def?.permanentBenefit && (
                  <div className="text-xs text-amber-300 mb-2">Benefit: {def.permanentBenefit}</div>
                )}
                {/* Order types */}
                {def && def.orders.length > 0 && (
                  <div className="flex gap-1 mb-2">
                    {def.orders.map((o) => (
                      <span key={o} className={`text-xs px-1.5 py-0.5 rounded border ${ORDER_COLORS[o]}`}>
                        {ORDER_LABELS[o]}
                      </span>
                    ))}
                  </div>
                )}
                {/* Hirelings */}
                {def && def.hirelingCount > 0 && (
                  <div className="text-xs text-gray-500">
                    Hirelings:{' '}
                    {f.hirelingNames.length > 0 ? f.hirelingNames.join(', ') : `0/${def.hirelingCount} assigned`}
                  </div>
                )}
                {/* Type-specific config */}
                {f.type === 'garden' && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500">Type:</span>
                    <select
                      value={f.gardenType || 'herb'}
                      onChange={(e) => onConfigure(f.id, { gardenType: e.target.value })}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-300 focus:outline-none focus:border-amber-500"
                    >
                      <option value="decorative">Decorative</option>
                      <option value="food">Food</option>
                      <option value="herb">Herb</option>
                      <option value="poison">Poison</option>
                    </select>
                  </div>
                )}
                {f.type === 'training-area' && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500">Trainer:</span>
                    <select
                      value={f.trainerType || 'battle'}
                      onChange={(e) => onConfigure(f.id, { trainerType: e.target.value })}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-300 focus:outline-none focus:border-amber-500"
                    >
                      <option value="battle">Battle</option>
                      <option value="skills">Skills</option>
                      <option value="tools">Tools</option>
                      <option value="unarmed-combat">Unarmed Combat</option>
                      <option value="weapon">Weapon</option>
                    </select>
                  </div>
                )}
                {/* Creatures (menagerie) */}
                {(f.type === 'menagerie' || f.type === 'emerald-enclave-grove') &&
                  f.creatures &&
                  f.creatures.length > 0 && (
                    <div className="mt-2">
                      <span className="text-xs text-gray-500">Creatures: </span>
                      {f.creatures.map((c, i) => (
                        <span key={i} className="text-xs text-gray-300">
                          {c.name} ({c.size}){i < (f.creatures?.length ?? 0) - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </div>
                  )}
                {/* Facility-specific reference data from event tables */}
                <FacilityReferenceData facilityType={f.type} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
