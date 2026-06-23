import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MergeChooser } from './MergeChooser.jsx';

const local = { level: 5, library: [{}], totalCorrect: 10, totalXp: 500 };
const cloud = { level: 3, library: [{}, {}], totalCorrect: 4, totalXp: 200 };

describe('MergeChooser (PHASE-19 19A + M12 lock)', () => {
  it('shows the always-visible destructive warning (M12 regression lock)', () => {
    render(<MergeChooser localState={local} cloudState={cloud} onResolve={() => {}} />);
    expect(screen.getByText(/the other will be replaced/i)).toBeInTheDocument();
  });

  it('is a labelled modal dialog', () => {
    render(<MergeChooser localState={local} cloudState={cloud} onResolve={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'merge-chooser-title');
  });

  it('Escape resolves to cancel (the safe path)', () => {
    const onResolve = vi.fn();
    render(<MergeChooser localState={local} cloudState={cloud} onResolve={onResolve} />);
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(onResolve).toHaveBeenCalledWith('cancel');
  });
});
