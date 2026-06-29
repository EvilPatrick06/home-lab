import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), ' +
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * WAI-ARIA APG modal-dialog behavior (PHASE-19 19A): initial focus, Tab/Shift+Tab
 * trap, Escape-to-close, focus restore to the invoker on close/unmount.
 * Attach the returned ref to the dialog PANEL element (the one that carries
 * role="dialog" aria-modal="true" + aria-label/aria-labelledby). `active` lets
 * always-mounted components (inline confirms) arm the hook only while their
 * overlay is rendered.
 */
/** @param {{ onClose?: () => void, active?: boolean }} [opts] */
export function useDialogA11y({ onClose, active = true } = {}) {
  const panelRef = useRef(null);
  useEffect(() => {
    if (!active) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;
    const previouslyFocused = /** @type {HTMLElement|null} */ (document.activeElement);
    const focusables = () => /** @type {HTMLElement[]} */ (Array.from(panel.querySelectorAll(FOCUSABLE)));
    // Initial focus: first [data-autofocus], else first focusable, else the panel.
    const preferred = /** @type {HTMLElement} */ (panel.querySelector('[data-autofocus]')) || focusables()[0];
    if (preferred) preferred.focus();
    else {
      panel.setAttribute('tabindex', '-1');
      panel.focus();
    }
    // Capture phase so the trap wins over app-wide hotkey listeners and any
    // legacy useEscapeKey still mounted mid-conversion (Escape stopPropagation
    // also prevents a double-close).
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (typeof onClose === 'function') {
          e.stopPropagation();
          e.preventDefault();
          onClose();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !panel.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !panel.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, [active, onClose]);
  return panelRef;
}
