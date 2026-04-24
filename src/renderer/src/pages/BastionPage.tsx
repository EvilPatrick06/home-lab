import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ConfirmDialog } from '../components/ui'
import { addToast } from '../hooks/use-toast'
import { load5eBastionFacilities } from '../services/data-provider'
import { exportEntities, importEntities, reIdItems } from '../services/io/entity-io'
import { type BastionState, useBastionStore } from '../stores/use-bastion-store'
import { useCharacterStore } from '../stores/use-character-store'
import type { BasicFacilityDef, Bastion, BastionFacilitiesData, SpecialFacilityDef } from '../types/bastion'
import { getAvailableFacilityLevel, getMaxSpecialFacilities } from '../types/bastion'
import { is5eCharacter } from '../types/character'
import type { Character5e } from '../types/character-5e'
import BastionModals, { type BastionModalsProps } from './bastion/BastionModals'

type _BastionState = BastionState
type _BastionFacilitiesData = BastionFacilitiesData
type _BastionModalsProps = BastionModalsProps

import {
  BasicTab,
  DefendersTab,
  EventsTab,
  OverviewTab,
  SpecialTab,
  SummaryCard,
  TurnsTab
} from './bastion/BastionTabs'
import { TABS, type TabId } from './bastion/bastion-constants'

export default function BastionPage(): JSX.Element {
  const navigate = useNavigate()

  // Store bindings
  const bastions = useBastionStore((s) => s.bastions)
  const loading = useBastionStore((s) => s.loading)
  const loadBastions = useBastionStore((s) => s.loadBastions)
  const saveBastion = useBastionStore((s) => s.saveBastion)
  const deleteBastion = useBastionStore((s) => s.deleteBastion)
  const deleteAllBastions = useBastionStore((s) => s.deleteAllBastions)
  const setFacilityDefs = useBastionStore((s) => s.setFacilityDefs)
  const facilityDefs = useBastionStore((s) => s.facilityDefs)

  const removeBasicFacility = useBastionStore((s) => s.removeBasicFacility)
  const addSpecialFacility = useBastionStore((s) => s.addSpecialFacility)
  const removeSpecialFacility = useBastionStore((s) => s.removeSpecialFacility)
  const configureFacility = useBastionStore((s) => s.configureFacility)

  const advanceTime = useBastionStore((s) => s.advanceTime)
  const startTurn = useBastionStore((s) => s.startTurn)
  const issueOrder = useBastionStore((s) => s.issueOrder)
  const issueMaintainOrder = useBastionStore((s) => s.issueMaintainOrder)
  const rollAndResolveEvent = useBastionStore((s) => s.rollAndResolveEvent)
  const completeTurn = useBastionStore((s) => s.completeTurn)

  const recruitDefenders = useBastionStore((s) => s.recruitDefenders)
  const removeDefenders = useBastionStore((s) => s.removeDefenders)
  const buildDefensiveWalls = useBastionStore((s) => s.buildDefensiveWalls)
  const depositGold = useBastionStore((s) => s.depositGold)
  const withdrawGold = useBastionStore((s) => s.withdrawGold)
  const startConstruction = useBastionStore((s) => s.startConstruction)

  const characters = useCharacterStore((s) => s.characters)
  const loadCharacters = useCharacterStore((s) => s.loadCharacters)

  // Local state
  const [selectedBastionId, setSelectedBastionId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  // Modal visibility
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAddBasic, setShowAddBasic] = useState(false)
  const [showAddSpecial, setShowAddSpecial] = useState(false)
  const [showTurnModal, setShowTurnModal] = useState(false)
  const [showRecruitModal, setShowRecruitModal] = useState(false)
  const [showWallsModal, setShowWallsModal] = useState(false)
  const [showTreasuryModal, setShowTreasuryModal] = useState(false)
  const [showAdvanceTime, setShowAdvanceTime] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)

  // Basic facility defs from JSON
  const [basicFacilityDefs, setBasicFacilityDefs] = useState<BasicFacilityDef[]>([])

  // Load data on mount
  useEffect(() => {
    loadBastions()
    loadCharacters()
    load5eBastionFacilities().then((data) => {
      setFacilityDefs(data.specialFacilities as SpecialFacilityDef[])
      setBasicFacilityDefs(data.basicFacilities)
    })
  }, [loadBastions, loadCharacters, setFacilityDefs]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedBastion = bastions.find((b) => b.id === selectedBastionId)
  const ownerCharacter = selectedBastion ? characters.find((c) => c.id === selectedBastion.ownerId) : null
  const ownerLevel = ownerCharacter?.level ?? 5
  const owner5e = ownerCharacter && is5eCharacter(ownerCharacter) ? (ownerCharacter as Character5e) : null

  const maxSpecial = getMaxSpecialFacilities(ownerLevel)
  const maxFacilityLevel = getAvailableFacilityLevel(ownerLevel)

  if (loading) {
    return (
      <div className="p-8 h-screen flex items-center justify-center bg-gray-950">
        <div className="text-gray-500">Loading bastions...</div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-gray-400 hover:text-gray-200 text-sm flex items-center gap-1 transition-colors"
          >
            &larr; Main Menu
          </button>
          <div className="w-px h-4 bg-gray-700" />
          <span className="text-xs text-gray-500">Bastions (2024 DMG)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              try {
                const result = await importEntities<Bastion>('bastion')
                if (!result) return
                const items = reIdItems(result.items)
                for (const b of items) {
                  await saveBastion(b)
                }
                addToast(`Imported ${items.length} bastion(s)`, 'success')
                await loadBastions()
              } catch (err) {
                addToast(err instanceof Error ? err.message : 'Import failed', 'error')
              }
            }}
            className="px-3 py-1.5 text-sm border border-gray-600 hover:border-amber-600 hover:bg-gray-800
              text-gray-400 hover:text-amber-400 rounded font-semibold transition-colors cursor-pointer"
          >
            Import
          </button>
          {bastions.length > 0 && (
            <>
              <button
                onClick={async () => {
                  const items = selectedBastionId ? bastions.filter((b) => b.id === selectedBastionId) : bastions
                  try {
                    const ok = await exportEntities('bastion', items)
                    if (ok) addToast(`Exported ${items.length} bastion(s)`, 'success')
                  } catch {
                    addToast('Export failed', 'error')
                  }
                }}
                className="px-3 py-1.5 text-sm border border-gray-600 hover:border-amber-600 hover:bg-gray-800
                  text-gray-400 hover:text-amber-400 rounded font-semibold transition-colors cursor-pointer"
              >
                {selectedBastionId ? 'Export Selected' : 'Export All'}
              </button>
              <button
                onClick={() => setShowDeleteAllConfirm(true)}
                className="px-3 py-1.5 text-sm border border-gray-600 hover:border-red-600 hover:bg-gray-800
                  text-gray-400 hover:text-red-400 rounded font-semibold transition-colors cursor-pointer"
              >
                Delete All
              </button>
            </>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 text-white rounded font-semibold transition-colors cursor-pointer"
          >
            + New Bastion
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-gray-800 overflow-y-auto bg-gray-900/50">
          {bastions.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">No bastions yet. Create one to get started.</div>
          ) : (
            bastions.map((bastion) => {
              const owner = characters.find((c) => c.id === bastion.ownerId)
              return (
                <button
                  key={bastion.id}
                  onClick={() => {
                    setSelectedBastionId(bastion.id)
                    setActiveTab('overview')
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-gray-800/50 transition-colors ${
                    selectedBastionId === bastion.id
                      ? 'bg-gray-800 border-l-2 border-l-amber-500'
                      : 'hover:bg-gray-800/50'
                  }`}
                >
                  <div className="text-sm font-medium text-gray-100">{bastion.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {owner?.name ?? 'Unknown'} (Lv {owner?.level ?? '?'})
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    {bastion.basicFacilities.length + bastion.specialFacilities.length} facilities &middot;{' '}
                    {bastion.defenders.length} defenders &middot; {bastion.treasury} GP
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          {!selectedBastion ? (
            <div className="flex flex-col items-center justify-center h-full gap-6">
              <div className="text-gray-500">Select a bastion from the sidebar or create a new one</div>
              {bastions.length > 0 && (
                <div className="grid grid-cols-3 gap-4 max-w-md">
                  <SummaryCard label="Total Bastions" value={bastions.length} />
                  <SummaryCard
                    label="Total Defenders"
                    value={bastions.reduce((sum, b) => sum + b.defenders.length, 0)}
                  />
                  <SummaryCard
                    label="Total Treasury"
                    value={`${bastions.reduce((sum, b) => sum + b.treasury, 0)} GP`}
                    accent
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="px-6 pt-4 pb-3 border-b border-gray-800 bg-gray-900/30">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-100">{selectedBastion.name}</h1>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-sm text-gray-400">
                        {ownerCharacter?.name ?? 'Unknown'} (Lv {ownerLevel})
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-700">
                        Day {selectedBastion.inGameTime.currentDay}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-yellow-900/50 text-yellow-300 border border-yellow-700">
                        Treasury: {selectedBastion.treasury} GP
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                        {selectedBastion.specialFacilities.length +
                          selectedBastion.construction.filter((p) => p.projectType === 'add-special').length}
                        /{maxSpecial} special
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAdvanceTime(true)}
                      className="px-3 py-1.5 text-sm border border-gray-600 hover:border-amber-600 text-gray-300 hover:text-amber-400 rounded transition-colors"
                    >
                      Advance Time
                    </button>
                    <button
                      onClick={() => setShowTreasuryModal(true)}
                      className="px-3 py-1.5 text-sm border border-gray-600 hover:border-yellow-600 text-gray-300 hover:text-yellow-400 rounded transition-colors"
                    >
                      Treasury
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="px-3 py-1.5 text-sm border border-red-800 hover:border-red-600 text-red-400 hover:text-red-300 rounded transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-3">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-3 py-1.5 text-sm rounded-t transition-colors ${
                        activeTab === tab.id
                          ? 'bg-gray-800 text-amber-400 border border-gray-700 border-b-gray-800'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-5xl mx-auto">
                  {activeTab === 'overview' && (
                    <OverviewTab
                      bastion={selectedBastion}
                      ownerLevel={ownerLevel}
                      maxSpecial={maxSpecial}
                      onStartTurn={() => setShowTurnModal(true)}
                    />
                  )}
                  {activeTab === 'basic' && (
                    <BasicTab
                      bastion={selectedBastion}
                      basicDefs={basicFacilityDefs}
                      onAdd={() => setShowAddBasic(true)}
                      onRemove={(id) => removeBasicFacility(selectedBastion.id, id)}
                    />
                  )}
                  {activeTab === 'special' && (
                    <SpecialTab
                      bastion={selectedBastion}
                      facilityDefs={facilityDefs}
                      owner5e={owner5e}
                      maxSpecial={maxSpecial}
                      onAdd={() => setShowAddSpecial(true)}
                      onRemove={(id) => removeSpecialFacility(selectedBastion.id, id)}
                      onConfigure={(id, config) => configureFacility(selectedBastion.id, id, config)}
                    />
                  )}
                  {activeTab === 'turns' && (
                    <TurnsTab bastion={selectedBastion} onStartTurn={() => setShowTurnModal(true)} />
                  )}
                  {activeTab === 'defenders' && (
                    <DefendersTab
                      bastion={selectedBastion}
                      onRecruit={() => setShowRecruitModal(true)}
                      onRemove={(ids) => removeDefenders(selectedBastion.id, ids)}
                      onBuildWalls={() => setShowWallsModal(true)}
                    />
                  )}
                  {activeTab === 'events' && <EventsTab bastion={selectedBastion} />}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---- MODALS ---- */}
      <BastionModals
        showCreateModal={showCreateModal}
        setShowCreateModal={setShowCreateModal}
        showAddBasic={showAddBasic}
        setShowAddBasic={setShowAddBasic}
        showAddSpecial={showAddSpecial}
        setShowAddSpecial={setShowAddSpecial}
        showTurnModal={showTurnModal}
        setShowTurnModal={setShowTurnModal}
        showRecruitModal={showRecruitModal}
        setShowRecruitModal={setShowRecruitModal}
        showWallsModal={showWallsModal}
        setShowWallsModal={setShowWallsModal}
        showTreasuryModal={showTreasuryModal}
        setShowTreasuryModal={setShowTreasuryModal}
        showAdvanceTime={showAdvanceTime}
        setShowAdvanceTime={setShowAdvanceTime}
        showDeleteConfirm={showDeleteConfirm}
        setShowDeleteConfirm={setShowDeleteConfirm}
        selectedBastion={selectedBastion}
        characters={characters}
        facilityDefs={facilityDefs}
        basicFacilityDefs={basicFacilityDefs}
        maxSpecial={maxSpecial}
        maxFacilityLevel={maxFacilityLevel}
        owner5e={owner5e}
        saveBastion={saveBastion}
        setSelectedBastionId={setSelectedBastionId}
        addSpecialFacility={addSpecialFacility}
        startConstruction={startConstruction}
        startTurn={startTurn}
        issueOrder={issueOrder}
        issueMaintainOrder={issueMaintainOrder}
        rollAndResolveEvent={rollAndResolveEvent}
        completeTurn={completeTurn}
        recruitDefenders={recruitDefenders}
        buildDefensiveWalls={buildDefensiveWalls}
        depositGold={depositGold}
        withdrawGold={withdrawGold}
        advanceTime={advanceTime}
        deleteBastion={deleteBastion}
      />

      <ConfirmDialog
        open={showDeleteAllConfirm}
        title="Delete All Bastions?"
        message={`This will permanently delete all ${bastions.length} bastion${bastions.length !== 1 ? 's' : ''} and their data. This action cannot be undone.`}
        confirmLabel="Delete All"
        variant="danger"
        onConfirm={async () => {
          await deleteAllBastions()
          setSelectedBastionId(null)
          setShowDeleteAllConfirm(false)
          addToast('All bastions deleted', 'success')
        }}
        onCancel={() => setShowDeleteAllConfirm(false)}
      />
    </div>
  )
}
