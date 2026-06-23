import { lazy, Suspense, useRef, useState } from 'react'
import { useT } from '../../../i18n'
import type { SidebarCategory, SidebarEntry, SidebarEntryStatBlock } from '../../../types/game-state'
import { sidebarToDisplay } from '../../../utils/stat-block-converter'
import StatBlockForm from './StatBlockForm'

const UnifiedStatBlock = lazy(() => import('../UnifiedStatBlock'))

const CATEGORY_LABEL_KEYS: Record<SidebarCategory, string> = {
  allies: 'game.entryCard.categoryAllies',
  enemies: 'game.entryCard.categoryEnemies',
  places: 'game.entryCard.categoryPlaces'
}

interface EntryCardProps {
  entry: SidebarEntry
  category: SidebarCategory
  isDM: boolean
  isEditing: boolean
  editName: string
  editDesc: string
  editNotes: string
  editStatBlock: SidebarEntryStatBlock | undefined
  showStatBlock: boolean
  onEditNameChange: (v: string) => void
  onEditDescChange: (v: string) => void
  onEditNotesChange: (v: string) => void
  onEditStatBlockChange: (v: SidebarEntryStatBlock | undefined) => void
  onToggleStatBlock: () => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onRemove: () => void
  onToggleVisibility: () => void
  onMoveTo: (target: SidebarCategory) => void
  onAddToInitiative?: () => void
  onReadAloud?: (text: string, style: 'chat' | 'dramatic') => void
  onOpenCreatureSearch: () => void
}

export default function EntryCard({
  entry,
  category,
  isDM,
  isEditing,
  editName,
  editDesc,
  editNotes,
  editStatBlock,
  showStatBlock,
  onEditNameChange,
  onEditDescChange,
  onEditNotesChange,
  onEditStatBlockChange,
  onToggleStatBlock,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onRemove,
  onToggleVisibility,
  onMoveTo,
  onAddToInitiative,
  onReadAloud,
  onOpenCreatureSearch
}: EntryCardProps): JSX.Element {
  const { t } = useT()
  const [viewStatBlockId, setViewStatBlockId] = useState(false)
  const [readAloudMenuOpen, setReadAloudMenuOpen] = useState(false)
  const readAloudMenuRef = useRef<HTMLDivElement>(null)

  return (
    <div
      className={`bg-surface-2/50 border rounded-lg p-2.5 ${
        !entry.visibleToPlayers && isDM ? 'border-border/50 opacity-60' : 'border-border/30'
      }`}
    >
      {isEditing ? (
        <div className="space-y-2">
          <input
            type="text"
            name="edit-name"
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            className="w-full px-2 py-1 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
            placeholder={t('game.entryCard.namePlaceholder')}
          />
          <textarea
            name="edit-desc"
            value={editDesc}
            onChange={(e) => onEditDescChange(e.target.value)}
            className="w-full px-2 py-1 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500 resize-none"
            rows={2}
            placeholder={t('game.entryCard.descriptionPlaceholder')}
          />
          <textarea
            name="edit-notes"
            value={editNotes}
            onChange={(e) => onEditNotesChange(e.target.value)}
            className="w-full px-2 py-1 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500 resize-none"
            rows={2}
            placeholder={t('game.entryCard.dmNotesPlaceholder')}
          />
          {/* Stat Block section */}
          <div className="border border-border/40 rounded">
            <button
              type="button"
              onClick={onToggleStatBlock}
              className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold text-gray-300 hover:text-accent transition-colors cursor-pointer"
            >
              <span>
                {t('game.entryCard.statBlock')} {editStatBlock ? t('game.entryCard.configured') : ''}
              </span>
              <span className="text-gray-500 text-xs">{showStatBlock ? '\u25B2' : '\u25BC'}</span>
            </button>
            {showStatBlock && (
              <div className="px-2 pb-2">
                <StatBlockForm statBlock={editStatBlock} onChange={onEditStatBlockChange} />
              </div>
            )}
          </div>
          <div className="flex gap-1">
            <button
              onClick={onSaveEdit}
              className="px-2 py-0.5 text-xs bg-amber-600 hover:bg-accent-strong text-white rounded cursor-pointer"
            >
              {t('common.actions.save')}
            </button>
            <button
              onClick={onCancelEdit}
              className="px-2 py-0.5 text-xs text-muted hover:text-gray-200 cursor-pointer"
            >
              {t('common.actions.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-gray-200 truncate">{entry.name}</span>
                {/* Category badge with click-to-cycle (DM only, allies/enemies only) */}
                {isDM && (category === 'allies' || category === 'enemies') && (
                  <button
                    onClick={() => {
                      const target: SidebarCategory = category === 'allies' ? 'enemies' : 'allies'
                      onMoveTo(target)
                    }}
                    title={t('game.entryCard.moveTo', {
                      target: t(CATEGORY_LABEL_KEYS[category === 'allies' ? 'enemies' : 'allies'])
                    })}
                    className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer transition-colors shrink-0 ${
                      category === 'allies'
                        ? 'text-green-400 bg-green-400/10 hover:bg-red-400/10 hover:text-red-400'
                        : 'text-red-400 bg-red-400/10 hover:bg-green-400/10 hover:text-green-400'
                    }`}
                  >
                    {t(CATEGORY_LABEL_KEYS[category])}
                  </button>
                )}
              </div>
              {entry.description && <p className="text-[11px] text-muted mt-0.5 line-clamp-2">{entry.description}</p>}
              {isDM && entry.notes && <p className="text-xs text-accent/70 mt-1 italic">{entry.notes}</p>}
            </div>

            {isDM && (
              <div className="flex items-center gap-0.5 shrink-0">
                {onAddToInitiative && (
                  <button
                    onClick={onAddToInitiative}
                    title={t('game.entryCard.addToInitiative')}
                    className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-accent cursor-pointer text-xs font-bold"
                  >
                    +
                  </button>
                )}
                {entry.description && onReadAloud && (
                  <div className="relative">
                    <button
                      onClick={() => setReadAloudMenuOpen(!readAloudMenuOpen)}
                      title={t('game.entryCard.readAloud')}
                      className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-accent cursor-pointer text-xs"
                    >
                      &#x1F4D6;
                    </button>
                    {readAloudMenuOpen && (
                      <div
                        ref={readAloudMenuRef}
                        className="absolute right-0 top-7 bg-surface border border-border rounded-lg shadow-xl z-50 py-1 min-w-[140px]"
                      >
                        <button
                          onClick={() => {
                            onReadAloud(entry.description!, 'chat')
                            setReadAloudMenuOpen(false)
                          }}
                          className="w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-surface-2 hover:text-fg cursor-pointer"
                        >
                          {t('game.entryCard.sendToChat')}
                        </button>
                        <button
                          onClick={() => {
                            onReadAloud(entry.description!, 'dramatic')
                            setReadAloudMenuOpen(false)
                          }}
                          className="w-full px-3 py-1.5 text-left text-xs text-accent hover:bg-surface-2 hover:text-amber-300 cursor-pointer"
                        >
                          {t('game.entryCard.dramaticReveal')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={onToggleVisibility}
                  title={
                    entry.visibleToPlayers ? t('game.entryCard.hideFromPlayers') : t('game.entryCard.showToPlayers')
                  }
                  className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 cursor-pointer text-xs"
                >
                  {entry.visibleToPlayers ? '\u{1F441}' : '\u{1F441}\u{200D}\u{1F5E8}'}
                </button>
                <button
                  onClick={onStartEdit}
                  className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-accent cursor-pointer text-xs"
                  title={t('game.entryCard.edit')}
                >
                  &#9998;
                </button>
                {!entry.isAutoPopulated && (
                  <button
                    onClick={onRemove}
                    className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-red-400 cursor-pointer text-xs"
                    title={t('common.actions.delete')}
                  >
                    &#10005;
                  </button>
                )}
              </div>
            )}
          </div>
          {entry.isAutoPopulated && isDM && (
            <span className="text-[9px] text-gray-600 mt-1 block">{t('game.entryCard.autoPopulated')}</span>
          )}
          {/* Stat block quick actions (DM only, allies/enemies) */}
          {isDM && (
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              {entry.statBlock && (
                <button
                  onClick={() => setViewStatBlockId(!viewStatBlockId)}
                  className="text-xs text-gray-500 hover:text-accent cursor-pointer"
                >
                  {viewStatBlockId ? t('game.entryCard.hideStatBlock') : t('game.entryCard.viewStatBlock')}
                </button>
              )}
              <button onClick={onOpenCreatureSearch} className="text-xs text-gray-500 hover:text-accent cursor-pointer">
                {t('game.entryCard.linkFromCreatureDb')}
              </button>
              {entry.monsterStatBlockId && (
                <span className="text-[9px] text-gray-600">
                  {t('game.entryCard.linked', { id: entry.monsterStatBlockId })}
                </span>
              )}
            </div>
          )}
          {/* Inline unified stat block view */}
          {viewStatBlockId && entry.statBlock && (
            <div className="mt-2">
              <Suspense fallback={<div className="text-xs text-gray-500">{t('common.states.loading')}</div>}>
                <UnifiedStatBlock statBlock={sidebarToDisplay(entry.statBlock, entry.name)} />
              </Suspense>
            </div>
          )}
        </>
      )}
    </div>
  )
}
