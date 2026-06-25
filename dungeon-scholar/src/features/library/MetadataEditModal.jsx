import { Check, Tag, X } from 'lucide-react';
import { useState } from 'react';
import RichContent from '../../components/RichContent.jsx';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';

function MetadataEditModal({ tome, onSave, onClose }) {
  const panelRef = useDialogA11y({ onClose }); // 19A
  const meta = tome?.data?.metadata || {};
  const [title, setTitle] = useState(meta.title || '');
  const [description, setDescription] = useState(meta.description || '');
  const [subject, setSubject] = useState(meta.subject || '');
  const [author, setAuthor] = useState(meta.author || '');
  const [difficulty, setDifficulty] = useState(meta.difficulty || 0);
  const [tagsText, setTagsText] = useState((meta.tags || []).join(', '));
  // Phase 39d round-7 suggestion: track the original description so we can
  // tell whether a legacy over-limit value was edited or untouched. If the
  // user hasn't touched it, save preserves the original (over-limit) value
  // so they can still update title/subject/author/etc. without being
  // blocked. If they DID edit and it's still over, the existing block stays.
  const [initialDescription] = useState(meta.description || '');
  const descriptionUnchanged = description === initialDescription;
  const descriptionOver = description.length > 600;
  const descriptionBlocksSave = descriptionOver && !descriptionUnchanged;

  if (!tome) return null;

  const submit = () => {
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    // Phase 30c QA #5 / 39d round-7: belt + suspenders on title cap;
    // description preserves legacy length when untouched.
    const cleanTitle = (title.trim() || meta.title || 'Untitled Tome').slice(0, 200);
    const cleanDescription = descriptionUnchanged ? description : description.trim().slice(0, 600);
    onSave({
      title: cleanTitle,
      description: cleanDescription,
      subject: subject.trim(),
      author: author.trim(),
      difficulty: difficulty || undefined,
      tags,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Edit tome details"
        className="rounded-sm max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-amber, 41, 24, 12), 0.97) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.99) 100%)',
          border: '3px double rgba(245, 158, 11, 0.6)',
          boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)',
        }}
      >
        <div className="absolute top-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-amber-500 text-sm">⚜</div>

        <div className="p-4 border-b border-amber-700/50 flex justify-between items-center">
          <h3 className="text-xl font-bold text-amber-300 flex items-center gap-2 italic">
            <Tag className="w-5 h-5" /> ✦ Edit Tome Metadata ✦
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-amber-900/30 rounded-sm text-amber-300"
            aria-label="Close edit metadata dialog"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto overscroll-contain flex-1 flex flex-col gap-3">
          <div>
            <label className="text-xs text-amber-600 tracking-wider italic mb-1 block">⚔ TITLE</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 200))}
              maxLength={200}
              className="w-full p-2 rounded-sm border-2 focus:outline-hidden italic text-amber-50"
              style={{ background: 'rgba(var(--surface-modal, 20, 12, 6), 0.7)', borderColor: 'rgba(180, 83, 9, 0.5)' }}
            />
            {/* Phase 33h QA P9: bumped char counter contrast (was
                text-amber-700/70 — barely readable). */}
            <div className="text-xs italic text-amber-300 text-right mt-1 tabular-nums">{title.length}/200</div>
          </div>
          <div>
            <label className="text-xs text-amber-600 tracking-wider italic mb-1 block">⚔ DESCRIPTION</label>
            <textarea
              value={description}
              onChange={(e) => {
                // Phase 35a QA P1: only block ADDING past the limit. If the
                // existing value already exceeds the limit (legacy data), let
                // the user keep / shorten it but not grow past the current
                // length. The Save button is gated separately when over.
                const next = e.target.value;
                if (next.length > 600 && next.length > description.length) return;
                setDescription(next);
              }}
              rows={2}
              className="w-full p-2 rounded-sm border-2 focus:outline-hidden italic text-amber-50"
              style={{ background: 'rgba(var(--surface-modal, 20, 12, 6), 0.7)', borderColor: 'rgba(180, 83, 9, 0.5)' }}
            />
            <div
              className={`text-xs italic text-right mt-1 tabular-nums ${description.length > 600 ? 'text-red-300 font-bold' : 'text-amber-300'}`}
            >
              {description.length}/600
            </div>
            {/* Phase 36e / 37e / 42e QA P5 + P3 + round-9: surface the
                supported markdown subset + render a live preview row that
                also serves as a KaTeX lazy-load trigger so users can SEE
                math typesetting actually working without having to save a
                math expression themselves first. */}
            <div className="text-[10px] italic text-amber-100/60 mt-1 leading-relaxed">
              ⓘ Supported: <code className="text-amber-300">**bold**</code>,{' '}
              <code className="text-amber-300">*italic*</code>, <code className="text-amber-300">`inline code`</code>,{' '}
              <code className="text-amber-300">[link](url)</code>, <code className="text-amber-300">![alt](url)</code>{' '}
              images (data: or trusted hosts only), <code className="text-amber-300">$math$</code> (typeset via KaTeX,
              lazy-loaded on first use), and fenced <code className="text-amber-300">```code```</code> blocks.
              (Headings, lists, and tables render as plain text.)
            </div>
            <div className="text-[11px] italic text-amber-100/70 mt-1 leading-relaxed flex items-center gap-1 flex-wrap">
              <span className="text-amber-700">Live preview:</span>
              <RichContent
                as="span"
                text="**bold** · *italic* · `code` · [link](https://example.com) · $E=mc^2$"
                className="text-amber-100/85 italic"
              />
            </div>
            {/* Phase 35a QA P1 / 39d round-7: legacy descriptions can exceed
                the limit. Show different messaging based on whether the user
                touched it: untouched legacy = soft yellow notice + save still
                allowed; edited-and-over = red error + save blocked + Trim
                button. */}
            {description.length > 600 && descriptionUnchanged && (
              <div
                className="mt-2 p-2 rounded-sm text-xs italic flex items-center gap-2 flex-wrap"
                style={{
                  background: 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.35)',
                  border: '1px solid rgba(245, 158, 11, 0.55)',
                  color: '#fde68a',
                }}
              >
                <span className="flex-1">
                  ⓘ Legacy description ({description.length}/600). Save preserves it as-is; trim to make it editable.
                </span>
                <button
                  type="button"
                  onClick={() => setDescription(description.slice(0, 600))}
                  className="px-3 py-1 rounded-sm border border-amber-400 text-amber-100 hover:bg-amber-900/40"
                  style={{ background: 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.55)' }}
                >
                  Trim to 600
                </button>
              </div>
            )}
            {description.length > 600 && !descriptionUnchanged && (
              <div
                className="mt-2 p-2 rounded-sm text-xs italic flex items-center gap-2 flex-wrap"
                style={{
                  background: 'rgba(127, 29, 29, 0.4)',
                  border: '1px solid rgba(239, 68, 68, 0.6)',
                  color: '#fecaca',
                }}
              >
                <span className="flex-1">
                  ⚠ Description is {description.length - 600} char{description.length - 600 === 1 ? '' : 's'} over the
                  limit. Trim before saving.
                </span>
                <button
                  type="button"
                  onClick={() => setDescription(description.slice(0, 600))}
                  className="px-3 py-1 rounded-sm border border-red-400 text-red-100 hover:bg-red-900/40"
                  style={{ background: 'rgba(127, 29, 29, 0.6)' }}
                >
                  Trim to 600
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-amber-600 tracking-wider italic mb-1 block">📚 SUBJECT</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Cybersecurity"
                className="w-full p-2 rounded-sm border-2 focus:outline-hidden italic text-amber-50"
                style={{
                  background: 'rgba(var(--surface-modal, 20, 12, 6), 0.7)',
                  borderColor: 'rgba(180, 83, 9, 0.5)',
                }}
              />
            </div>
            <div>
              <label className="text-xs text-amber-600 tracking-wider italic mb-1 block">✒️ AUTHOR</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Optional"
                className="w-full p-2 rounded-sm border-2 focus:outline-hidden italic text-amber-50"
                style={{
                  background: 'rgba(var(--surface-modal, 20, 12, 6), 0.7)',
                  borderColor: 'rgba(180, 83, 9, 0.5)',
                }}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-amber-600 tracking-wider italic mb-1 block">⚔ DIFFICULTY</label>
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4, 5].map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className="flex-1 py-2 rounded-sm border-2 italic text-sm"
                  style={{
                    background:
                      difficulty === d
                        ? 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.6)'
                        : 'rgba(var(--surface-amber, 41, 24, 12), 0.5)',
                    borderColor:
                      difficulty === d
                        ? 'rgba(245, 158, 11, 0.8)'
                        : 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.4)',
                    color: difficulty === d ? '#fde047' : '#a8a29e',
                  }}
                >
                  {d === 0 ? '— None' : '★'.repeat(d)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-amber-600 tracking-wider italic mb-1 block">🏷️ TAGS (comma-separated)</label>
            <input
              type="text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="e.g., security+, cert-prep, exam-2024"
              className="w-full p-2 rounded-sm border-2 focus:outline-hidden italic text-amber-50"
              style={{ background: 'rgba(var(--surface-modal, 20, 12, 6), 0.7)', borderColor: 'rgba(180, 83, 9, 0.5)' }}
            />
          </div>
        </div>
        <div className="p-4 border-t border-amber-700/50 flex gap-2">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-sm border-2 border-amber-700 text-amber-200 italic"
            style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
            aria-label="Cancel metadata edit"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={descriptionBlocksSave || title.length > 200}
            title={
              descriptionBlocksSave
                ? `Trim description ${description.length - 600} chars before saving`
                : title.length > 200
                  ? 'Trim title before saving'
                  : undefined
            }
            className="flex-1 py-3 font-bold rounded-sm flex items-center justify-center gap-2 text-amber-950 border-2 border-amber-300 italic disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
              boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)',
            }}
          >
            <Check className="w-4 h-4" /> Save Metadata
          </button>
        </div>
      </div>
    </div>
  );
}

export default MetadataEditModal;
