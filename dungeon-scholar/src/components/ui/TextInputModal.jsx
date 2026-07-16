import { useState } from 'react';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';

// PHASE-05 05B: a small reusable themed text-input modal — the in-app
// replacement for window.prompt (Library bulk-Tag). PromptModal is a different
// feature (org/prompt viewer), so this is a generic input dialog: title,
// optional label, input, Confirm/Cancel. Themed to the PHASE-03 light/dark
// surface convention + WAI-ARIA APG dialog a11y (focus trap, Escape->cancel,
// focus restore) via useDialogA11y (PHASE-19 19A). Confirm is disabled / a
// no-op on an empty value, so it never silently no-ops like prompt()===null.
export function TextInputModal({
  title,
  label,
  placeholder = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  initialValue = '',
  onConfirm,
  onCancel,
}) {
  const panelRef = useDialogA11y({ onClose: onCancel });
  const [value, setValue] = useState(initialValue);
  const submit = () => {
    const v = value.trim();
    if (v) onConfirm(v);
  };
  return (
    <div
      ref={panelRef}
      className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ds-textinput-title"
    >
      <div
        className="rounded-sm max-w-md w-full overflow-hidden flex flex-col relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-amber, 41, 24, 12), 0.97) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.99) 100%)',
          border: '3px double rgba(245, 158, 11, 0.6)',
          boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)',
        }}
      >
        <div className="p-4 border-b border-amber-700/40">
          <h3 id="ds-textinput-title" className="text-xl font-bold italic text-amber-300">
            {title}
          </h3>
        </div>
        <div className="p-4">
          {label && (
            <label htmlFor="ds-textinput-field" className="block text-sm italic text-amber-100/90 mb-2">
              {label}
            </label>
          )}
          <input
            id="ds-textinput-field"
            data-autofocus
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={placeholder}
            className="w-full p-3 rounded-sm border-2 border-amber-700 text-amber-50 italic focus:outline-hidden"
            style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
          />
        </div>
        <div className="p-4 border-t border-amber-700/40 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-sm font-bold italic border-2 border-amber-700 text-amber-200"
            style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={submit}
            disabled={!value.trim()}
            aria-label={confirmLabel}
            className="flex-1 py-3 rounded-sm font-bold italic border-2 border-amber-300 btn-gold-ink disabled:opacity-50"
            style={{
              background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
              boxShadow: '0 0 18px rgba(245, 158, 11, 0.5)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
