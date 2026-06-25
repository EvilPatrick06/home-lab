import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isSealedTome } from '../../services/sealedTome.js';
import ShareTomeModal from './ShareTomeModal.jsx';

// PHASE-41 41C: the seal-for-proctored-use export. We assert the download by
// capturing the JSON written to the Blob that the component hands to
// URL.createObjectURL (the same machinery downloadTomeJson always uses), then
// validate it via isSealedTome. NO user-event — fireEvent only, matching the
// rest of the library test suite.

function makePlainTome() {
  return {
    id: 'lib-1',
    data: {
      metadata: { id: 'tome-1', title: 'Cryptography Primer', domain: 'Security' },
      flashcards: [
        { id: 'f1', front: 'What hashes passwords?', back: 'bcrypt' },
        { id: 'f2', front: 'Symmetric cipher?', back: 'AES' },
      ],
      quiz: [],
      labs: [],
    },
  };
}

// A minimal valid sealed envelope (structural — isSealedTome only checks shape).
function makeSealedEnvelope() {
  return {
    sealVersion: 1,
    metadata: { id: 'tome-1', title: 'Cryptography Primer', sealed: true },
    sealCounts: { flashcards: 2, quiz: 0, labs: 0 },
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600_000, salt: 'c2FsdA==' },
    cipher: { name: 'AES-GCM', iv: 'aXY=', ciphertext: 'Y2lwaGVy' },
  };
}

describe('ShareTomeModal — seal for proctored use', () => {
  let blobTexts;
  let createdAnchors;
  let origCreateObjectURL;
  let origRevokeObjectURL;
  let origCreateElement;

  beforeEach(() => {
    blobTexts = [];
    createdAnchors = [];

    // Capture every Blob the component turns into an object URL, decoding its
    // text so we can inspect the downloaded JSON.
    origCreateObjectURL = URL.createObjectURL;
    origRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((blob) => {
      blobTexts.push(blob.text());
      return 'blob:mock';
    });
    URL.revokeObjectURL = vi.fn();

    // Stub the anchor's click so jsdom/happy-dom doesn't try a real navigation,
    // and record the download filename(s).
    origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreateElement(tag);
      if (tag === 'a') {
        el.click = vi.fn();
        createdAnchors.push(el);
      }
      return el;
    });
  });

  afterEach(() => {
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('renders the seal section for a plain (unsealed) tome', () => {
    render(<ShareTomeModal tome={makePlainTome()} onClose={vi.fn()} />);

    expect(screen.getByText(/seal for proctored use/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Proctor passphrase')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Confirm passphrase')).toHaveAttribute('type', 'password');
    expect(screen.getByText(/keep this passphrase safe/i)).toBeInTheDocument();
    expect(screen.queryByText(/this tome is already sealed/i)).toBeNull();
  });

  it('blocks the download when passphrases do not match', () => {
    render(<ShareTomeModal tome={makePlainTome()} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Proctor passphrase'), { target: { value: 'longenough1' } });
    fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: 'different123' } });

    const sealBtn = screen.getByRole('button', { name: /seal & download/i });
    expect(sealBtn).toBeDisabled();
    // Even if forced, the guard rejects: no download Blob is created.
    fireEvent.click(sealBtn);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects a passphrase shorter than 8 chars (button stays disabled)', () => {
    render(<ShareTomeModal tome={makePlainTome()} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Proctor passphrase'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: 'short' } });

    expect(screen.getByRole('button', { name: /seal & download/i })).toBeDisabled();
  });

  it('seals and downloads a valid sealed envelope on a matching passphrase', async () => {
    render(<ShareTomeModal tome={makePlainTome()} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Proctor passphrase'), { target: { value: 'correct horse battery' } });
    fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: 'correct horse battery' } });

    const sealBtn = screen.getByRole('button', { name: /seal & download/i });
    expect(sealBtn).not.toBeDisabled();
    fireEvent.click(sealBtn);

    // The async seal → download completes: a Blob was created.
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));

    // The downloaded JSON is a real sealed envelope, and the plaintext answer
    // ('bcrypt') is NOT present in it.
    const json = await blobTexts[0];
    const envelope = JSON.parse(json);
    expect(isSealedTome(envelope)).toBe(true);
    expect(json).not.toContain('bcrypt');

    // Filename uses the existing slug convention with a `-sealed.json` suffix.
    expect(createdAnchors.at(-1).download).toBe('Cryptography_Primer-sealed.json');

    // No error surfaces and the fields clear after a successful seal.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Proctor passphrase')).toHaveValue('');
    expect(screen.getByLabelText('Confirm passphrase')).toHaveValue('');
  });

  it('shows the static "already sealed" note and no seal form for a sealed tome', () => {
    const sealedTome = { id: 'lib-1', data: makeSealedEnvelope() };
    render(<ShareTomeModal tome={sealedTome} onClose={vi.fn()} />);

    expect(screen.getByText(/this tome is already sealed/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Proctor passphrase')).toBeNull();
    expect(screen.queryByLabelText('Confirm passphrase')).toBeNull();
    expect(screen.queryByRole('button', { name: /seal & download/i })).toBeNull();
  });
});
