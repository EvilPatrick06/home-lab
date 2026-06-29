// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TextInputModal } from './TextInputModal.jsx';

describe('TextInputModal (PHASE-05 05B)', () => {
  const setup = (over = {}) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <TextInputModal
        title="Tag"
        label="Add a tag:"
        confirmLabel="Apply Tag"
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...over}
      />,
    );
    return { onConfirm, onCancel };
  };

  it('confirms with the trimmed value', () => {
    const { onConfirm } = setup();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  exam  ' } });
    fireEvent.click(screen.getByRole('button', { name: /apply tag/i }));
    expect(onConfirm).toHaveBeenCalledWith('exam');
  });

  it('Enter submits the value', () => {
    const { onConfirm } = setup();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'midterm' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledWith('midterm');
  });

  it('does not confirm on an empty value', () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole('button', { name: /apply tag/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancel calls onCancel', () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
