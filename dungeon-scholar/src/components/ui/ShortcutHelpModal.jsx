import { Keyboard, X } from 'lucide-react';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';
import { SHORTCUT_GROUPS } from '../../services/shortcuts.js';

// In-app keyboard-shortcut reference (opened with `?` or the header help
// button). The modes already implement these bindings; this overlay just makes
// them discoverable. The binding list is sourced from services/shortcuts.js so
// the overlay stays in step with the real handlers.
function KeyCap({ children }) {
  // A non-key separator ("–") renders as plain text, not a key cap.
  if (children === '–' || children === '/') {
    return <span className="text-amber-500/70 px-0.5">{children}</span>;
  }
  return (
    <kbd
      className="inline-block px-1.5 py-0.5 rounded-sm text-[11px] font-bold not-italic border border-amber-600/70 text-amber-100"
      style={{ background: 'rgba(0,0,0,0.45)', boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.4)' }}
    >
      {children}
    </kbd>
  );
}

export function ShortcutHelpModal({ onClose }) {
  const panelRef = useDialogA11y({ onClose });

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="rounded-sm max-w-2xl w-full max-h-[85vh] overflow-y-auto flex flex-col relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-amber, 41, 24, 12), 0.97) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.99) 100%)',
          border: '3px double rgba(245, 158, 11, 0.6)',
          boxShadow: '0 0 40px rgba(245, 158, 11, 0.25)',
        }}
      >
        <div
          className="p-4 border-b border-amber-700/50 flex justify-between items-center sticky top-0"
          style={{ background: 'rgba(var(--surface-deep, 10, 6, 4), 0.92)' }}
        >
          <h3 className="text-xl font-bold text-amber-300 flex items-center gap-2 italic">
            <Keyboard className="w-5 h-5" /> ✦ Keyboard Shortcuts ✦
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-amber-900/30 rounded-sm text-amber-300"
            aria-label="Close keyboard shortcuts dialog"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4 grid md:grid-cols-2 gap-4">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h4 className="text-sm font-bold text-amber-200 italic mb-2 tracking-wide">{group.title}</h4>
              <ul className="space-y-1.5">
                {group.items.map((item, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 text-xs">
                    <span className="flex flex-wrap items-center gap-1 shrink-0">
                      {item.keys.map((k, ki) => (
                        <KeyCap key={ki}>{k}</KeyCap>
                      ))}
                      {item.alt && (
                        <>
                          <span className="text-amber-500/70 px-0.5 not-italic">or</span>
                          {item.alt.map((k, ki) => (
                            <KeyCap key={`a${ki}`}>{k}</KeyCap>
                          ))}
                        </>
                      )}
                    </span>
                    <span className="text-amber-100/80 italic text-right">{item.action}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-amber-700/40 text-center text-[10px] italic text-amber-700/80">
          Press <KeyCap>?</KeyCap> any time to reopen this list, or <KeyCap>Esc</KeyCap> to close.
        </div>
      </div>
    </div>
  );
}

export default ShortcutHelpModal;
