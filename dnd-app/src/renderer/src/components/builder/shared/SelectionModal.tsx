import { useT } from '../../../i18n'
import { useBuilderStore } from '../../../stores/use-builder-store'
import SelectionDetailPanel from './SelectionDetailPanel'
import SelectionFilterBar from './SelectionFilterBar'
import SelectionOptionList from './SelectionOptionList'

export default function SelectionModal(): JSX.Element | null {
  const { t } = useT()
  const modal = useBuilderStore((s) => s.selectionModal)
  const closeModal = useBuilderStore((s) => s.closeSelectionModal)
  const setRarityFilter = useBuilderStore((s) => s.setModalRarityFilter)
  const setSearchQuery = useBuilderStore((s) => s.setModalSearchQuery)
  const setPreview = useBuilderStore((s) => s.setModalPreviewOption)
  const acceptSelection = useBuilderStore((s) => s.acceptSelection)

  if (!modal) return null

  const previewOption = modal.filteredOptions.find((o) => o.id === modal.previewOptionId) ?? null

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-surface/98 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-lg font-bold text-fg">{modal.title}</h2>
        <button onClick={closeModal} className="text-muted hover:text-gray-200 text-xl leading-none px-2">
          ✕
        </button>
      </div>

      {/* Filter bar */}
      <SelectionFilterBar
        rarityFilter={modal.rarityFilter}
        searchQuery={modal.searchQuery}
        onRarityChange={setRarityFilter}
        onSearchChange={setSearchQuery}
      />

      {/* Split pane: list + detail */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        <div className="w-full md:w-72 border-b md:border-b-0 md:border-e border-border flex flex-col shrink-0 max-h-[45vh] md:max-h-none">
          <SelectionOptionList
            options={modal.filteredOptions}
            previewOptionId={modal.previewOptionId}
            selectedOptionId={modal.selectedOptionId}
            onPreview={setPreview}
          />
        </div>
        <div className="flex-1 flex flex-col">
          <SelectionDetailPanel option={previewOption} />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface">
        <span className="text-xs text-gray-500">
          {t('builder.selectionModal.optionCount', { count: modal.filteredOptions.length })}
        </span>
        <div className="flex gap-2">
          <button
            onClick={closeModal}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
          >
            {t('common.actions.cancel')}
          </button>
          <button
            onClick={() => {
              if (modal.previewOptionId) acceptSelection(modal.previewOptionId)
            }}
            disabled={!modal.previewOptionId}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-accent-strong disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded transition-colors"
          >
            {t('builder.selectionModal.accept')}
          </button>
        </div>
      </div>
    </div>
  )
}
