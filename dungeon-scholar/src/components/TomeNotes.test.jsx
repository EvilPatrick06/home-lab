import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { decryptPayload, encryptPayload } from '../services/notesCrypto.js';
import TomeNotes from './TomeNotes.jsx';

// Real WebCrypto (jsdom + node provide SubtleCrypto). To keep the locked-tome
// fixtures fast we build their `notes` blob with a low iteration count.
const FAST_ITER = 1000;

function makeTome(overrides = {}) {
  return { id: 't1', data: { metadata: { title: 'Test Tome' } }, ...overrides };
}

// Build a pre-existing locked tome whose notes decrypt to `text` with `pass`.
async function makeLockedTome(pass, text) {
  const notes = await encryptPayload(pass, text, { iterations: FAST_ITER });
  return makeTome({ notes });
}

describe('TomeNotes', () => {
  it('create-flow calls onSave with a v1 payload', async () => {
    const onSave = vi.fn();
    render(<TomeNotes tome={makeTome()} onSave={onSave} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'hunter2hunter2' } });
    fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: 'hunter2hunter2' } });
    fireEvent.click(screen.getByRole('button', { name: /inscribe private notes/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    expect(payload.v).toBe(1);
    expect(payload.kdf).toBe('PBKDF2-SHA-256');
    expect(payload).toHaveProperty('salt');
    expect(payload).toHaveProperty('iv');
    expect(payload).toHaveProperty('ct');
    // After create, the unlocked editor appears.
    await waitFor(() => expect(screen.getByLabelText('Private notes')).toBeInTheDocument());
  });

  it('mismatched confirm blocks save', async () => {
    const onSave = vi.fn();
    render(<TomeNotes tome={makeTome()} onSave={onSave} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'one-passphrase' } });
    fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: 'two-passphrase' } });
    fireEvent.click(screen.getByRole('button', { name: /inscribe private notes/i }));

    await screen.findByText(/passphrases do not match/i);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejects a passphrase shorter than the shared minimum (entropy floor)', async () => {
    const onSave = vi.fn();
    render(<TomeNotes tome={makeTome()} onSave={onSave} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: /inscribe private notes/i }));

    await screen.findByText(/at least 8 characters/i);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('unlock with correct passphrase reveals the text in the textarea', async () => {
    const tome = await makeLockedTome('correct horse', 'my secret battle plan');
    render(<TomeNotes tome={tome} onSave={vi.fn()} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'correct horse' } });
    fireEvent.click(screen.getByRole('button', { name: /^unlock$/i }));

    const textarea = await screen.findByLabelText('Private notes');
    expect(textarea.value).toBe('my secret battle plan');
  });

  it('wrong passphrase shows the error and does NOT call onSave', async () => {
    const onSave = vi.fn();
    const tome = await makeLockedTome('right', 'hidden');
    render(<TomeNotes tome={tome} onSave={onSave} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /^unlock$/i }));

    await screen.findByText(/wrong passphrase — the seal holds/i);
    expect(onSave).not.toHaveBeenCalled();
    // Still locked: no textarea revealed.
    expect(screen.queryByLabelText('Private notes')).not.toBeInTheDocument();
  });

  it('Save re-encrypts (new iv, same salt) and the saved payload round-trips', async () => {
    const onSave = vi.fn();
    const tome = await makeLockedTome('pw', 'original');
    const originalNotes = tome.notes;
    render(<TomeNotes tome={tome} onSave={onSave} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /^unlock$/i }));

    const textarea = await screen.findByLabelText('Private notes');
    fireEvent.change(textarea, { target: { value: 'updated secret' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const payload = onSave.mock.calls[0][0];
    expect(payload.salt).toBe(originalNotes.salt); // same salt
    expect(payload.iv).not.toBe(originalNotes.iv); // fresh iv
    // Privacy: the at-rest blob must not contain the plaintext.
    expect(JSON.stringify(payload)).not.toContain('updated secret');
    // Round-trips with the same passphrase.
    await expect(decryptPayload('pw', payload)).resolves.toBe('updated secret');
  });

  it('Lock clears the textarea (returns to locked view)', async () => {
    const tome = await makeLockedTome('pw', 'visible secret');
    render(<TomeNotes tome={tome} onSave={vi.fn()} onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /^unlock$/i }));
    await screen.findByLabelText('Private notes');

    fireEvent.click(screen.getByRole('button', { name: /^lock$/i }));

    await waitFor(() => expect(screen.queryByLabelText('Private notes')).not.toBeInTheDocument());
    // Back to the locked unlock form.
    expect(screen.getByRole('button', { name: /^unlock$/i })).toBeInTheDocument();
  });

  it('Delete after confirm calls onSave(null)', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const tome = await makeLockedTome('pw', 'doomed');
    render(<TomeNotes tome={tome} onSave={onSave} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /^unlock$/i }));
    await screen.findByLabelText('Private notes');

    fireEvent.click(screen.getByRole('button', { name: /^delete notes$/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete notes forever/i }));

    expect(onSave).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape calls onClose', async () => {
    const onClose = vi.fn();
    render(<TomeNotes tome={makeTome()} onSave={vi.fn()} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
