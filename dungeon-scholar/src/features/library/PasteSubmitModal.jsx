import { X } from 'lucide-react';
import { useState } from 'react';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';

// Shared paste/submit dialog (S19) — extracted from the near-identical
// ImportCodeModal and PasteTomeModal. Props configure the cosmetic + copy
// differences; the dialog scaffolding (focus trap, escape, error handling)
// lives here once.
//
// accent: 'purple' | 'amber'
const ACCENTS = {
  purple: {
    ornament: 'text-purple-400',
    title: 'text-purple-300',
    hover: 'hover:bg-purple-900/30',
    headerBorder: 'border-purple-700/50',
    bg: 'linear-gradient(135deg, rgba(var(--surface-purple, 31, 12, 41), 0.97) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.99) 100%)',
    boxBorder: '3px double rgba(168, 85, 247, 0.6)',
    boxShadow: '0 0 40px rgba(168, 85, 247, 0.3)',
    taBorder: 'rgba(126, 34, 206, 0.5)',
    btnBg: 'linear-gradient(to bottom, #a855f7 0%, #6b21a8 100%)',
    btnShadow: '0 0 20px rgba(168, 85, 247, 0.5)',
    btnBorder: 'border-purple-300',
    btnText: 'text-amber-50',
  },
  amber: {
    ornament: 'text-amber-500',
    title: 'text-amber-300',
    hover: 'hover:bg-amber-900/30',
    headerBorder: 'border-amber-700/50',
    bg: 'linear-gradient(135deg, rgba(var(--surface-amber, 41, 24, 12), 0.97) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.99) 100%)',
    boxBorder: '3px double rgba(245, 158, 11, 0.6)',
    boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)',
    taBorder: 'rgba(180, 83, 9, 0.5)',
    btnBg: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
    btnShadow: '0 0 20px rgba(245, 158, 11, 0.5)',
    btnBorder: 'border-amber-300',
    btnText: 'btn-gold-ink',
  },
};

function PasteSubmitModal({
  onClose,
  onSubmit,
  accent = 'amber',
  maxW = 'max-w-2xl',
  minH = 'min-h-[200px]',
  ariaLabel,
  title,
  TitleIcon,
  SubmitIcon,
  intro,
  placeholder,
  emptyError,
  failError,
  submitLabel,
  closeAriaLabel,
  monoBreakAll = false,
}) {
  const a = ACCENTS[accent] || ACCENTS.amber;
  const panelRef = useDialogA11y({ onClose });
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!text.trim()) {
      setError(emptyError);
      return;
    }
    const success = onSubmit(text);
    if (success) onClose();
    else setError(failError);
  };

  const label = typeof submitLabel === 'function' ? submitLabel(text) : submitLabel;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`rounded-sm ${maxW} w-full max-h-[90vh] overflow-hidden flex flex-col relative`}
        style={{ background: a.bg, border: a.boxBorder, boxShadow: a.boxShadow }}
      >
        <div className={`absolute top-2 left-2 ${a.ornament} text-sm`}>⚜</div>
        <div className={`absolute top-2 right-2 ${a.ornament} text-sm`}>⚜</div>
        <div className={`absolute bottom-2 left-2 ${a.ornament} text-sm`}>⚜</div>
        <div className={`absolute bottom-2 right-2 ${a.ornament} text-sm`}>⚜</div>

        <div className={`p-4 border-b ${a.headerBorder} flex justify-between items-center`}>
          <h3 className={`text-xl font-bold ${a.title} flex items-center gap-2 italic`}>
            {TitleIcon ? <TitleIcon className="w-5 h-5" /> : null} {title}
          </h3>
          <button onClick={onClose} className={`p-2 ${a.hover} rounded-sm ${a.title}`} aria-label={closeAriaLabel}>
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto overscroll-contain flex-1 flex flex-col gap-3">
          <p className="text-sm text-amber-100/80 italic">{intro}</p>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError('');
            }}
            placeholder={placeholder}
            className={`flex-1 ${minH} p-3 rounded-sm border-2 focus:outline-hidden text-amber-50 font-mono text-xs`}
            style={{
              background: 'rgba(var(--surface-deep, 10, 6, 4), 0.7)',
              borderColor: a.taBorder,
              fontFamily: 'monospace',
              ...(monoBreakAll ? { wordBreak: 'break-all' } : {}),
            }}
            autoFocus
          />
          {error && (
            <div
              className="p-3 rounded-sm text-sm italic"
              style={{
                background: 'rgba(127, 29, 29, 0.5)',
                border: '1px solid rgba(239, 68, 68, 0.7)',
                color: '#fecaca',
              }}
            >
              ✗ {error}
            </div>
          )}
        </div>
        <div className={`p-4 border-t ${a.headerBorder} flex gap-2`}>
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-sm border-2 border-amber-700 text-amber-200 italic"
            style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className={`flex-1 py-3 font-bold rounded-sm flex items-center justify-center gap-2 ${a.btnText} border-2 ${a.btnBorder} italic disabled:opacity-50 disabled:cursor-not-allowed`}
            style={{ background: a.btnBg, boxShadow: a.btnShadow }}
          >
            {SubmitIcon ? <SubmitIcon className="w-4 h-4" /> : null} {label}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PasteSubmitModal;
