import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SealedTomeGate from './SealedTomeGate.jsx';

// PHASE-41 41B: the gate awaits onUnlock(passphrase) → { ok, reason? } and
// NEVER sees a thrown error (App's unlockSealedTome catches + returns a value).
describe('SealedTomeGate', () => {
  it('renders the tome title and a password input', () => {
    render(<SealedTomeGate title="Cryptography Primer" onUnlock={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByText('Cryptography Primer')).toBeInTheDocument();
    expect(screen.getByText(/this tome is sealed/i)).toBeInTheDocument();
    const input = screen.getByLabelText('Proctor passphrase');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('shows an error (role=alert) when unlock returns { ok: false }', async () => {
    const onUnlock = vi.fn().mockResolvedValue({ ok: false, reason: 'wrong-passphrase' });
    render(<SealedTomeGate title="Sealed Tome" onUnlock={onUnlock} onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Proctor passphrase'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: /^unlock$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/does not match/i);
    expect(onUnlock).toHaveBeenCalledWith('nope');
  });

  it('calls onUnlock with the typed passphrase on a successful unlock', async () => {
    const onUnlock = vi.fn().mockResolvedValue({ ok: true });
    render(<SealedTomeGate title="Sealed Tome" onUnlock={onUnlock} onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Proctor passphrase'), { target: { value: 'correct horse' } });
    fireEvent.click(screen.getByRole('button', { name: /^unlock$/i }));

    await waitFor(() => expect(onUnlock).toHaveBeenCalledWith('correct horse'));
    // No error surfaces on success.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('calls onBack when "Return to library" is clicked', () => {
    const onBack = vi.fn();
    render(<SealedTomeGate title="Sealed Tome" onUnlock={vi.fn()} onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: /return to library/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
