// @vitest-environment happy-dom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MistakeVault from './MistakeVault.jsx';

const baseProps = (over = {}) => ({
  courseSet: { metadata: { title: 'T' } },
  tomeProgress: { mistakeVault: [] },
  playerState: { totalAnswered: 88, activeTomeId: 'tome_1' },
  onRemove: vi.fn(),
  checkAchievement: vi.fn(),
  unlockSpecialTitle: vi.fn(),
  awardXP: vi.fn(),
  onGoHome: vi.fn(),
  ...over,
});

describe('MistakeVault "Redeemed" unlock gate (PHASE-06 06A)', () => {
  it('grants nothing with no active tome', () => {
    const p = baseProps({ courseSet: null });
    render(<MistakeVault {...p} />);
    expect(p.checkAchievement).not.toHaveBeenCalled();
    expect(p.unlockSpecialTitle).not.toHaveBeenCalled();
  });

  it('grants nothing on a never-populated vault', () => {
    const p = baseProps();
    render(<MistakeVault {...p} />);
    expect(p.checkAchievement).not.toHaveBeenCalled();
    expect(p.unlockSpecialTitle).not.toHaveBeenCalled();
  });

  it('grants once when a populated vault is cleared', () => {
    const p = baseProps({ tomeProgress: { mistakeVault: [{ _type: 'flashcard', question: 'q' }] } });
    const { rerender } = render(<MistakeVault {...p} />);
    expect(p.checkAchievement).not.toHaveBeenCalled();
    rerender(<MistakeVault {...p} tomeProgress={{ mistakeVault: [] }} />);
    expect(p.checkAchievement).toHaveBeenCalledWith('vault_clear');
    expect(p.unlockSpecialTitle).toHaveBeenCalledWith('vaultkeeper');
    expect(p.checkAchievement).toHaveBeenCalledTimes(1);
  });

  it('does not re-grant on a subsequent empty render', () => {
    const p = baseProps({ tomeProgress: { mistakeVault: [{ _type: 'flashcard', question: 'q' }] } });
    const { rerender } = render(<MistakeVault {...p} />);
    rerender(<MistakeVault {...p} tomeProgress={{ mistakeVault: [] }} />);
    rerender(<MistakeVault {...p} tomeProgress={{ mistakeVault: [] }} />);
    expect(p.checkAchievement).toHaveBeenCalledTimes(1);
  });
});

describe('MistakeVault empty-vault copy (PHASE-11 F3)', () => {
  it('describes the vault, not the tome, when a tome is loaded with no mistakes', () => {
    const p = baseProps();
    const { container } = render(<MistakeVault {...p} />);
    expect(container.textContent).toContain('The Vault Stands Empty');
    expect(container.textContent).not.toContain('The Tome is Empty');
  });
});
