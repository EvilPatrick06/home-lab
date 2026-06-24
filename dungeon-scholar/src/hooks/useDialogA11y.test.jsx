import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useDialogA11y } from './useDialogA11y.js';

// Fixture: a trigger button outside the dialog, and a conditional panel with
// two focusable buttons inside.
function Fixture({ onClose, active = true }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    onClose?.();
  };
  const panelRef = useDialogA11y({ onClose: close, active: active && open });
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Test dialog">
          <button>First</button>
          <button>Last</button>
        </div>
      )}
    </div>
  );
}

describe('useDialogA11y (PHASE-19 19A)', () => {
  it('moves focus into the panel on open', () => {
    render(<Fixture />);
    fireEvent.click(screen.getByText('Open'));
    expect(document.activeElement).toBe(screen.getByText('First'));
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(<Fixture onClose={onClose} />);
    fireEvent.click(screen.getByText('Open'));
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Tab from the last focusable wraps to the first; Shift+Tab from first wraps to last', () => {
    render(<Fixture />);
    fireEvent.click(screen.getByText('Open'));
    const first = screen.getByText('First');
    const last = screen.getByText('Last');
    act(() => last.focus());
    fireEvent.keyDown(document.activeElement, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document.activeElement, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('restores focus to the trigger on close', () => {
    const onClose = vi.fn();
    render(<Fixture onClose={onClose} />);
    const trigger = screen.getByText('Open');
    // happy-dom doesn't focus on click; focus the trigger first (as a keyboard
    // user would) so the hook captures it as the element to restore to.
    act(() => trigger.focus());
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });

  it('does nothing when active is false', () => {
    const onClose = vi.fn();
    render(<Fixture onClose={onClose} active={false} />);
    fireEvent.click(screen.getByText('Open'));
    // No trap armed → focus stays on the trigger, Escape does nothing.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
