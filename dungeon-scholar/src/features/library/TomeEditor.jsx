import { BookOpen, Check, HelpCircle, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { normalizeTomeData } from '../../game/tome.js';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';

// S15: in-app tome content editor (flashcards + quiz). Emits the same shape
// normalizeTomeData accepts, so edited tomes round-trip through the app.
const nid = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function TomeEditor({ tome, onSave, onClose }) {
  const panelRef = useDialogA11y({ onClose });
  const data = tome?.data || {};
  const [tab, setTab] = useState('flashcards');
  const [cards, setCards] = useState(() => (data.flashcards || []).map((c) => ({ ...c })));
  const [quiz, setQuiz] = useState(() =>
    (data.quiz || []).map((q) => ({
      ...q,
      _optsText: Array.isArray(q.options) ? q.options.join('\n') : '',
    })),
  );
  const [err, setErr] = useState('');

  const setCard = (i, patch) => setCards((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const setQ = (i, patch) => setQuiz((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  const save = () => {
    const flashcards = cards
      .map((c) => ({ ...c, id: c.id || nid('card'), front: (c.front || '').trim(), back: (c.back || '').trim() }))
      .filter((c) => c.front && c.back);
    const outQuiz = quiz
      .map((q) => {
        const options = (q._optsText || '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        let ci = Number.isInteger(q.correctIndex) ? q.correctIndex : 0;
        if (ci < 0 || ci >= options.length) ci = 0;
        const { _optsText, ...rest } = q;
        return { ...rest, id: q.id || nid('q'), question: (q.question || '').trim(), options, correctIndex: ci };
      })
      .filter((q) => q.question && q.options.length >= 2);
    if (flashcards.length === 0 && outQuiz.length === 0) {
      setErr('A tome needs at least one valid flashcard or quiz question.');
      return;
    }
    onSave(normalizeTomeData({ ...data, flashcards, quiz: outQuiz }));
  };

  const tabBtn = (id, label, Icon) => (
    <button
      onClick={() => setTab(id)}
      className={`px-3 py-2 rounded-sm text-sm italic border-2 flex items-center gap-1 ${tab === id ? 'border-amber-300 text-amber-100' : 'border-amber-800 text-amber-400'}`}
      style={{ background: tab === id ? 'rgba(120, 53, 15, 0.5)' : 'rgba(var(--surface-amber, 41, 24, 12), 0.5)' }}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
  const ta = 'w-full p-2 rounded-sm border-2 text-amber-50 text-sm italic';
  const taStyle = { background: 'rgba(var(--surface-deep, 10, 6, 4), 0.7)', borderColor: 'rgba(126, 34, 206, 0.4)' };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Edit tome content"
        className="rounded-sm max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-amber, 41, 24, 12), 0.97) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.99) 100%)',
          border: '3px double rgba(245, 158, 11, 0.6)',
        }}
      >
        <div className="p-4 border-b border-amber-700/50 flex justify-between items-center">
          <h3 className="text-xl font-bold text-amber-300 italic">✦ Edit Tome Content ✦</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-amber-900/30 rounded-sm text-amber-300"
            aria-label="Close editor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-4 pt-3 flex gap-2">
          {tabBtn('flashcards', `Flashcards (${cards.length})`, BookOpen)}
          {tabBtn('quiz', `Quiz (${quiz.length})`, HelpCircle)}
        </div>
        <div className="p-4 overflow-y-auto overscroll-contain flex-1 flex flex-col gap-3">
          {tab === 'flashcards' && (
            <>
              {cards.map((c, i) => (
                <div
                  key={c.id || i}
                  className="p-3 rounded-sm border border-amber-800/50 flex flex-col gap-2"
                  style={{ background: 'rgba(0,0,0,0.25)' }}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-amber-700 italic">Card {i + 1}</span>
                    <button
                      onClick={() => setCards((cs) => cs.filter((_, j) => j !== i))}
                      className="text-red-300 hover:text-red-200"
                      aria-label={`Delete card ${i + 1}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    value={c.front || ''}
                    onChange={(e) => setCard(i, { front: e.target.value })}
                    placeholder="Front (question)"
                    className={ta}
                    style={taStyle}
                  />
                  <textarea
                    value={c.back || ''}
                    onChange={(e) => setCard(i, { back: e.target.value })}
                    placeholder="Back (answer)"
                    rows={2}
                    className={ta}
                    style={taStyle}
                  />
                  <input
                    value={c.domain || ''}
                    onChange={(e) => setCard(i, { domain: e.target.value })}
                    placeholder="Domain (optional)"
                    className={ta}
                    style={taStyle}
                  />
                </div>
              ))}
              <button
                onClick={() => setCards((cs) => [...cs, { id: nid('card'), front: '', back: '' }])}
                className="px-3 py-2 rounded-sm border-2 border-amber-700 text-amber-200 italic flex items-center gap-1 justify-center"
              >
                <Plus className="w-4 h-4" /> Add flashcard
              </button>
            </>
          )}
          {tab === 'quiz' && (
            <>
              {quiz.map((q, i) => (
                <div
                  key={q.id || i}
                  className="p-3 rounded-sm border border-purple-800/50 flex flex-col gap-2"
                  style={{ background: 'rgba(0,0,0,0.25)' }}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-purple-300 italic">Question {i + 1}</span>
                    <button
                      onClick={() => setQuiz((qs) => qs.filter((_, j) => j !== i))}
                      className="text-red-300 hover:text-red-200"
                      aria-label={`Delete question ${i + 1}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    value={q.question || ''}
                    onChange={(e) => setQ(i, { question: e.target.value })}
                    placeholder="Question"
                    rows={2}
                    className={ta}
                    style={taStyle}
                  />
                  <textarea
                    value={q._optsText}
                    onChange={(e) => setQ(i, { _optsText: e.target.value })}
                    placeholder="Options — one per line"
                    rows={3}
                    className={ta}
                    style={taStyle}
                  />
                  <label className="text-xs text-amber-200 italic flex items-center gap-2">
                    Correct option # (1-based):
                    <input
                      type="number"
                      min={1}
                      value={(Number.isInteger(q.correctIndex) ? q.correctIndex : 0) + 1}
                      onChange={(e) => setQ(i, { correctIndex: Math.max(0, (parseInt(e.target.value, 10) || 1) - 1) })}
                      className="w-16 p-1 rounded-sm border text-amber-50"
                      style={taStyle}
                    />
                  </label>
                  <textarea
                    value={q.explanation || ''}
                    onChange={(e) => setQ(i, { explanation: e.target.value })}
                    placeholder="Explanation (optional)"
                    rows={2}
                    className={ta}
                    style={taStyle}
                  />
                </div>
              ))}
              <button
                onClick={() => setQuiz((qs) => [...qs, { id: nid('q'), question: '', _optsText: '', correctIndex: 0 }])}
                className="px-3 py-2 rounded-sm border-2 border-purple-700 text-purple-200 italic flex items-center gap-1 justify-center"
              >
                <Plus className="w-4 h-4" /> Add question
              </button>
            </>
          )}
          {err && <div className="text-sm italic text-red-300">✗ {err}</div>}
        </div>
        <div className="p-4 border-t border-amber-700/50 flex gap-2">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-sm border-2 border-amber-700 text-amber-200 italic"
            style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="flex-1 py-3 font-bold rounded-sm flex items-center justify-center gap-2 text-amber-950 border-2 border-amber-300 italic"
            style={{ background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)' }}
          >
            <Check className="w-4 h-4" /> Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

export default TomeEditor;
