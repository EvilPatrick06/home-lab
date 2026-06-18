import { useState } from 'react';
import { Gift, ChevronRight, Library, Wand2, Copy, Hash, Upload, Scroll, BookMarked, Check, X, Star, Share2, Tag, Edit2, Trash2 } from 'lucide-react';
import RichContent from '../../components/RichContent.jsx';
import { blankTomeProgress } from '../../game/tome.js';

function LibraryScreen({ playerState, onSwitch, onDelete, onRename, onDuplicate, onShare, onEditMetadata, onTogglePin, onImport, onPaste, onImportCode, onShowPrompt, setScreen, claimableQuestCount = 0 }) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const startRename = (tome) => {
    setRenamingId(tome.id);
    setRenameValue(tome.data.metadata.title);
  };

  const submitRename = (id) => {
    if (renameValue.trim()) {
      onRename(id, renameValue.trim());
    }
    setRenamingId(null);
  };

  // Phase 38d round-3 suggestion: pinned tomes float to the top; remaining
  // tomes keep the lastOpened recency sort.
  const sorted = [...playerState.library].sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return (b.lastOpened || 0) - (a.lastOpened || 0);
  });

  return (
    <div className="space-y-6">
      {/* Claimable quests banner — sums daily, weekly, and story-chain rewards */}
      {claimableQuestCount > 0 && (
        <button
          onClick={() => setScreen('quests')}
          className="w-full p-4 rounded-sm relative flex items-center justify-between transition hover:scale-[1.01] text-left"
          style={{
            background: 'linear-gradient(135deg, rgba(120, 53, 15, 0.6) 0%, rgba(41, 24, 12, 0.95) 100%)',
            border: '3px double rgba(245, 158, 11, 0.7)',
            boxShadow: '0 0 30px rgba(245, 158, 11, 0.4), inset 0 0 20px rgba(0,0,0,0.5)',
          }}
        >
          <div className="flex items-center gap-3">
            <Gift className="w-8 h-8 text-amber-300 animate-pulse" style={{ filter: 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.8))' }} />
            <div>
              <div className="font-bold text-amber-200 italic text-lg" style={{ textShadow: '0 0 8px rgba(245, 158, 11, 0.4)' }}>
                ⚜ Quest Rewards Await ⚜
              </div>
              <div className="text-xs text-amber-100/70 italic">
                {claimableQuestCount} reward{claimableQuestCount === 1 ? '' : 's'} ready to claim — visit the Quest Board
              </div>
            </div>
          </div>
          <ChevronRight className="w-6 h-6 text-amber-400" />
        </button>
      )}

      <div className="p-6 rounded-sm relative" style={{
        background: 'linear-gradient(135deg, rgba(120, 53, 15, 0.4) 0%, rgba(41, 24, 12, 0.9) 100%)',
        border: '3px double rgba(245, 158, 11, 0.6)',
        boxShadow: '0 0 30px rgba(245, 158, 11, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
      }}>
        <div className="absolute top-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-amber-500 text-sm">⚜</div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Library className="w-10 h-10 text-amber-400" style={{ filter: 'drop-shadow(0 0 10px rgba(245, 158, 11, 0.6))' }} />
            <div>
              <h2 className="text-2xl font-bold text-amber-200 italic" style={{ textShadow: '0 0 12px rgba(245, 158, 11, 0.4)' }}>
                The Grand Library
              </h2>
              <div className="text-xs text-amber-700 tracking-[0.2em] italic">
                ⚜ {playerState.library.length} tome{playerState.library.length === 1 ? '' : 's'} in your collection ⚜
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={onShowPrompt}
              className="px-4 py-2 rounded-sm text-sm border-2 border-amber-700 text-amber-200 flex items-center gap-2 hover:bg-amber-900/30 italic"
              style={{ background: 'rgba(41, 24, 12, 0.7)' }}
            >
              <Wand2 className="w-4 h-4" /> Forge with Magic
            </button>
            <button
              onClick={onPaste}
              className="px-4 py-2 rounded-sm text-sm border-2 border-amber-700 text-amber-200 flex items-center gap-2 hover:bg-amber-900/30 italic"
              style={{ background: 'rgba(41, 24, 12, 0.7)' }}
            >
              <Copy className="w-4 h-4" /> Paste Tome Text
            </button>
            <button
              onClick={onImportCode}
              className="px-4 py-2 rounded-sm text-sm border-2 border-purple-700 text-purple-200 flex items-center gap-2 hover:bg-purple-900/30 italic"
              style={{ background: 'rgba(31, 12, 41, 0.7)' }}
            >
              <Hash className="w-4 h-4" /> Import Share Code
            </button>
            <button
              onClick={onImport}
              className="px-4 py-2 rounded-sm text-sm font-bold text-amber-950 border-2 border-amber-300 flex items-center gap-2 italic"
              style={{
                background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                boxShadow: '0 0 15px rgba(245, 158, 11, 0.4)',
              }}
            >
              <Upload className="w-4 h-4" /> Inscribe a Tome
            </button>
          </div>
        </div>
      </div>

      {playerState.library.length === 0 && (
        <div className="text-center py-12 px-6 rounded-sm relative" style={{
          background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.7) 0%, rgba(10, 6, 4, 0.9) 100%)',
          border: '3px double rgba(180, 83, 9, 0.5)',
          boxShadow: '0 0 40px rgba(180, 83, 9, 0.2), inset 0 0 30px rgba(0,0,0,0.6)',
        }}>
          <Scroll className="w-20 h-20 mx-auto text-amber-500 mb-4" style={{ filter: 'drop-shadow(0 0 12px rgba(245, 158, 11, 0.6))' }} />
          <h3 className="text-2xl font-bold text-amber-300 italic mb-3" style={{ textShadow: '0 0 12px rgba(245, 158, 11, 0.4)' }}>
            ~ The Shelves Stand Empty ~
          </h3>
          <p className="text-amber-100/80 italic max-w-md mx-auto">
            "No tomes grace these ancient halls, brave scholar. Inscribe your first sacred text to begin your saga..."
          </p>
          {/* 19E (L17): inline CTAs so the empty card isn't a dead-end (the toolbar above also has these). */}
          <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center max-w-md mx-auto">
            <button onClick={() => onShowPrompt?.()}
              className="flex-1 py-3 px-4 rounded-sm italic border-2 border-amber-700 text-amber-200"
              style={{ background: 'rgba(41, 24, 12, 0.7)' }}>
              ✦ Open the Spell of Tome Creation
            </button>
            <button onClick={() => onImport?.()}
              className="flex-1 py-3 px-4 rounded-sm italic border-2 border-amber-700 text-amber-200"
              style={{ background: 'rgba(41, 24, 12, 0.7)' }}>
              Inscribe a Tome (import JSON)
            </button>
          </div>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {sorted.map(tome => {
            const isActive = tome.id === playerState.activeTomeId;
            const meta = tome.data.metadata || {};
            const cardCount = tome.data.flashcards?.length || 0;
            const quizCount = tome.data.quiz?.length || 0;
            const labCount = tome.data.labs?.length || 0;
            const progress = tome.progress || blankTomeProgress();
            const totalItems = cardCount + quizCount + labCount;
            const studied = (progress.cardsReviewed || 0) + (progress.quizAnswered || 0) + (progress.labsCompleted || 0);
            const tags = meta.tags || [];
            const subject = meta.subject;
            const author = meta.author;
            const difficulty = meta.difficulty; // 1-5

            return (
              <div
                key={tome.id}
                className="rounded-sm p-5 relative transition"
                style={{
                  background: isActive
                    ? 'linear-gradient(135deg, rgba(120, 53, 15, 0.6) 0%, rgba(41, 24, 12, 0.95) 100%)'
                    : 'linear-gradient(135deg, rgba(41, 24, 12, 0.85) 0%, rgba(10, 6, 4, 0.95) 100%)',
                  border: isActive ? '3px double rgba(245, 158, 11, 0.9)' : '2px solid rgba(180, 83, 9, 0.5)',
                  boxShadow: isActive
                    ? '0 0 30px rgba(245, 158, 11, 0.4), inset 0 0 20px rgba(0,0,0,0.5)'
                    : '0 0 15px rgba(180, 83, 9, 0.15), inset 0 0 20px rgba(0,0,0,0.5)',
                }}
              >
                <div className="absolute top-1 left-1 text-amber-700/60 text-xs">⚜</div>
                <div className="absolute top-1 right-1 text-amber-700/60 text-xs">⚜</div>
                <div className="absolute bottom-1 left-1 text-amber-700/60 text-xs">⚜</div>
                <div className="absolute bottom-1 right-1 text-amber-700/60 text-xs">⚜</div>

                {isActive && (
                  <div className="absolute top-3 right-3 text-xs px-3 py-1 rounded-sm text-amber-950 font-bold tracking-wider" style={{
                    background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                    boxShadow: '0 0 10px rgba(245, 158, 11, 0.5)',
                    border: '1px solid #92400e',
                  }}>
                    ★ ACTIVE
                  </div>
                )}

                <div className="flex items-start gap-3 mb-3">
                  <BookMarked className="w-8 h-8 text-amber-400 shrink-0 mt-1" style={{ filter: 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.5))' }} />
                  <div className="flex-1 min-w-0">
                    {renamingId === tome.id ? (
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename(tome.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className="flex-1 p-1 rounded-sm border-2 text-sm italic text-amber-50"
                          style={{ background: 'rgba(20, 12, 6, 0.7)', borderColor: 'rgba(245, 158, 11, 0.6)' }}
                          autoFocus
                        />
                        <button onClick={() => submitRename(tome.id)} className="px-2 text-emerald-400">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setRenamingId(null)} className="px-2 text-red-400">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <h3
                        className={`text-lg font-bold text-amber-200 italic truncate ${isActive ? 'pr-20' : ''}`}
                        style={{ textShadow: '0 0 8px rgba(245, 158, 11, 0.3)' }}
                        title={meta.title || 'Untitled Tome'}
                      >
                        {meta.title || 'Untitled Tome'}
                      </h3>
                    )}
                    {meta.description && (
                      /* Phase 34a QA P11: render rich content (backticks +
                         fenced code) instead of literal raw text. */
                      <RichContent
                        text={meta.description}
                        className="text-xs text-amber-100/60 italic mt-1 line-clamp-2"
                      />
                    )}
                  </div>
                </div>

                {/* Metadata row */}
                {(subject || author || difficulty) && (
                  <div className="flex flex-wrap gap-2 mb-3 text-xs">
                    {subject && (
                      <span className="px-2 py-0.5 rounded-sm italic" style={{
                        background: 'rgba(31, 12, 41, 0.7)', border: '1px solid rgba(126, 34, 206, 0.5)', color: '#d8b4fe',
                      }}>📚 {subject}</span>
                    )}
                    {author && (
                      <span className="px-2 py-0.5 rounded-sm italic" style={{
                        background: 'rgba(12, 24, 41, 0.7)', border: '1px solid rgba(29, 78, 216, 0.5)', color: '#93c5fd',
                      }}>✒️ {author}</span>
                    )}
                    {difficulty && (
                      <span className="px-2 py-0.5 rounded-sm italic" style={{
                        background: 'rgba(41, 12, 12, 0.7)', border: '1px solid rgba(185, 28, 28, 0.5)', color: '#fca5a5',
                      }}>{'★'.repeat(difficulty)}{'☆'.repeat(5 - difficulty)}</span>
                    )}
                  </div>
                )}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {tags.map((tag, ti) => (
                      <span key={ti} className="px-2 py-0.5 rounded-sm text-[10px] italic" style={{
                        background: 'rgba(120, 53, 15, 0.4)', border: '1px solid rgba(245, 158, 11, 0.4)', color: '#fcd34d',
                      }}>#{tag}</span>
                    ))}
                  </div>
                )}

                <div className="flex gap-3 text-xs text-amber-300/80 mb-3 italic">
                  <span>📜 {cardCount}</span>
                  <span>🎯 {quizCount}</span>
                  <span>⚗️ {labCount}</span>
                  {progress.runsCompleted > 0 && <span>⚔️ {progress.runsCompleted} runs</span>}
                </div>

                {totalItems > 0 && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-amber-700 mb-1">
                      <span className="italic">Progress</span>
                      <span>{studied} interactions</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden border border-amber-800" style={{ background: 'rgba(10, 6, 4, 0.7)' }}>
                      <div className="h-full transition-all" style={{
                        width: `${Math.min(100, (studied / Math.max(totalItems, 1)) * 100)}%`,
                        background: 'linear-gradient(to right, #f59e0b, #fde047)',
                      }} />
                    </div>
                  </div>
                )}

                {confirmDelete === tome.id ? (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => { onDelete(tome.id); setConfirmDelete(null); }}
                      className="flex-1 py-2 rounded-sm text-sm font-bold border-2 border-red-400 text-red-100 italic"
                      style={{ background: 'linear-gradient(to bottom, #dc2626 0%, #991b1b 100%)' }}
                    >
                      Confirm Banishment
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="px-4 py-2 rounded-sm text-sm border-2 border-amber-700 text-amber-200 italic"
                      style={{ background: 'rgba(41, 24, 12, 0.7)' }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {!isActive && (
                      <button
                        onClick={() => onSwitch(tome.id)}
                        className="flex-1 min-w-[120px] py-2 rounded-sm text-sm font-bold text-amber-950 border-2 border-amber-300 italic"
                        style={{
                          background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                          boxShadow: '0 0 12px rgba(245, 158, 11, 0.4)',
                        }}
                      >
                        ⚔ Open Tome
                      </button>
                    )}
                    {isActive && (
                      <button
                        onClick={() => setScreen('home')}
                        className="flex-1 min-w-[120px] py-2 rounded-sm text-sm font-bold text-amber-950 border-2 border-amber-300 italic"
                        style={{
                          background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                          boxShadow: '0 0 12px rgba(245, 158, 11, 0.4)',
                        }}
                      >
                        ⚔ Continue Studying
                      </button>
                    )}
                    {/* Phase 33d QA P4: every icon-only button gets an
                        aria-label that names the action AND the tome it
                        targets, so screen-reader users can distinguish them
                        across multiple cards. `title=` stays for sighted
                        mouse-hover tooltip. */}
                    {/* Phase 38d / 41b: pin/unpin toggle with an inline text
                        label so users discover the feature without inspecting
                        the icon's state. Title= still appears on mouse hover. */}
                    <button
                      onClick={() => onTogglePin?.(tome.id)}
                      className={`px-3 py-2 rounded-sm text-sm border-2 hover:bg-amber-900/30 flex items-center gap-1.5 ${tome.pinned ? 'border-amber-400 text-amber-200' : 'border-amber-700 text-amber-400'}`}
                      style={{ background: tome.pinned ? 'rgba(120, 53, 15, 0.7)' : 'rgba(41, 24, 12, 0.7)' }}
                      title={tome.pinned ? `Unpin "${meta.title || 'this tome'}" from top` : `Pin "${meta.title || 'this tome'}" to top`}
                      aria-label={tome.pinned ? `Unpin tome "${meta.title || 'untitled'}" from the top` : `Pin tome "${meta.title || 'untitled'}" to the top`}
                      aria-pressed={!!tome.pinned}
                    >
                      <Star className="w-4 h-4" aria-hidden="true" style={{ fill: tome.pinned ? '#fde047' : 'transparent' }} />
                      <span className="text-[10px] italic">{tome.pinned ? 'Pinned' : 'Pin'}</span>
                    </button>
                    <button
                      onClick={() => onShare(tome.id)}
                      className="px-3 py-2 rounded-sm text-sm border-2 border-purple-700 text-purple-300 hover:bg-purple-900/30"
                      style={{ background: 'rgba(31, 12, 41, 0.7)' }}
                      title={`Share "${meta.title || 'this tome'}"`}
                      aria-label={`Share tome "${meta.title || 'untitled'}"`}
                    >
                      <Share2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => onEditMetadata(tome.id)}
                      className="px-3 py-2 rounded-sm text-sm border-2 border-amber-700 text-amber-300 hover:bg-amber-900/30"
                      style={{ background: 'rgba(41, 24, 12, 0.7)' }}
                      title={`Edit metadata for "${meta.title || 'this tome'}"`}
                      aria-label={`Edit metadata for tome "${meta.title || 'untitled'}"`}
                    >
                      <Tag className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => startRename(tome)}
                      className="px-3 py-2 rounded-sm text-sm border-2 border-amber-700 text-amber-300 hover:bg-amber-900/30"
                      style={{ background: 'rgba(41, 24, 12, 0.7)' }}
                      title={`Rename "${meta.title || 'this tome'}"`}
                      aria-label={`Rename tome "${meta.title || 'untitled'}"`}
                    >
                      <Edit2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => onDuplicate(tome.id)}
                      className="px-3 py-2 rounded-sm text-sm border-2 border-emerald-700 text-emerald-300 hover:bg-emerald-900/30"
                      style={{ background: 'rgba(12, 41, 27, 0.7)' }}
                      title={`Duplicate "${meta.title || 'this tome'}" with fresh progress`}
                      aria-label={`Duplicate tome "${meta.title || 'untitled'}" with fresh progress`}
                    >
                      <Copy className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(tome.id)}
                      className="px-3 py-2 rounded-sm text-sm border-2 border-red-800 text-red-300 hover:bg-red-900/30"
                      style={{ background: 'rgba(41, 12, 12, 0.6)' }}
                      title={`Banish "${meta.title || 'this tome'}"`}
                      aria-label={`Banish tome "${meta.title || 'untitled'}"`}
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default LibraryScreen;
