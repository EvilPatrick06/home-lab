import { useDialogA11y } from '../useDialogA11y.js';

// Phase 33c QA P3: generic in-DOM confirmation modal — replaces window.confirm
// which was unreliable across headless / test environments. Includes an
// alertdialog role + descriptive aria attributes so screen readers announce
// it correctly. The destructive (danger) variant uses red styling.
export function ConfirmModal({ title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', confirmVariant = 'default', onConfirm, onCancel }) {
  // 19A: dialog a11y (focus trap + Escape→cancel + focus restore). Initial focus
  // lands on the Cancel button via [data-autofocus] (APG: focus the least
  // destructive action so Enter can't confirm something unread).
  const panelRef = useDialogA11y({ onClose: onCancel });
  const confirmIsDanger = confirmVariant === 'danger';
  return (
    <div
      ref={panelRef}
      className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="ds-confirm-title"
      aria-describedby="ds-confirm-body"
    >
      <div className="rounded-sm max-w-md w-full overflow-hidden flex flex-col relative" style={{
        background: confirmIsDanger
          ? 'linear-gradient(135deg, rgba(80, 20, 20, 0.97) 0%, rgba(20, 6, 6, 0.99) 100%)'
          : 'linear-gradient(135deg, rgba(41, 24, 12, 0.97) 0%, rgba(10, 6, 4, 0.99) 100%)',
        border: confirmIsDanger
          ? '3px double rgba(220, 38, 38, 0.7)'
          : '3px double rgba(245, 158, 11, 0.6)',
        boxShadow: confirmIsDanger
          ? '0 0 40px rgba(220, 38, 38, 0.4)'
          : '0 0 40px rgba(245, 158, 11, 0.3)',
      }}>
        <div className="p-4 border-b border-amber-700/40">
          <h3 id="ds-confirm-title" className={`text-xl font-bold italic ${confirmIsDanger ? 'text-red-300' : 'text-amber-300'}`}>
            {title}
          </h3>
        </div>
        <div className="p-4">
          <p id="ds-confirm-body" className="text-sm italic text-amber-100/90 leading-relaxed">
            {body}
          </p>
        </div>
        <div className="p-4 border-t border-amber-700/40 flex gap-2">
          <button
            data-autofocus
            onClick={onCancel}
            className="flex-1 py-3 rounded-sm font-bold italic border-2 border-amber-700 text-amber-200"
            style={{ background: 'rgba(41, 24, 12, 0.7)' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            aria-label={confirmLabel}
            className={`flex-1 py-3 rounded-sm font-bold italic border-2 ${confirmIsDanger ? 'border-red-300 text-amber-50' : 'border-amber-300 text-amber-950'}`}
            style={{
              background: confirmIsDanger
                ? 'linear-gradient(to bottom, #dc2626 0%, #991b1b 100%)'
                : 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
              boxShadow: confirmIsDanger
                ? '0 0 18px rgba(220, 38, 38, 0.5)'
                : '0 0 18px rgba(245, 158, 11, 0.5)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
