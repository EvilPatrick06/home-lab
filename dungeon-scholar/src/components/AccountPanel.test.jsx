import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Phase 41G — Phase-30 QA gap: the AccountPanel destructive flows
// (delete-cloud, delete-account, and the rejected-delete-account "panel stays
// open" path) had no component-level test. Mock the cloudSync service the
// same way the hook/component tests elsewhere do; signOut comes from supabase.
vi.mock('../services/cloudSync.js', () => ({
  deleteCloudSave: vi.fn(() => Promise.resolve()),
  deleteAccount: vi.fn(() => Promise.resolve()),
}));
vi.mock('../services/supabase.js', () => ({
  signOut: vi.fn(() => Promise.resolve()),
}));
// Silence the logError call on the rejected-delete path so the test output
// stays clean (the component swallows the rejection and logs it).
vi.mock('../services/logger.js', () => ({ logError: vi.fn() }));

import { deleteAccount, deleteCloudSave } from '../services/cloudSync.js';
import { signOut } from '../services/supabase.js';
import { AccountPanel } from './AccountPanel.jsx';

const USER = { id: 'u1', githubLogin: 'pat', avatarUrl: 'a.png' };

function renderPanel(overrides = {}) {
  const spies = {
    onClose: vi.fn(),
    onAfterDeleteCloud: vi.fn(),
    onAfterDeleteAccount: vi.fn(),
    ...overrides,
  };
  render(
    <AccountPanel
      user={USER}
      syncStatus="idle"
      lastSyncedAt={null}
      onClose={spies.onClose}
      onAfterDeleteCloud={spies.onAfterDeleteCloud}
      onAfterDeleteAccount={spies.onAfterDeleteAccount}
    />,
  );
  return spies;
}

describe('AccountPanel — destructive flows (Phase-30 QA gap)', () => {
  beforeEach(() => {
    deleteCloudSave.mockReset();
    deleteCloudSave.mockResolvedValue();
    deleteAccount.mockReset();
    deleteAccount.mockResolvedValue();
    signOut.mockReset();
    signOut.mockResolvedValue();
  });

  it('renders the signed-in handle and a dialog', () => {
    renderPanel();
    expect(screen.getByText('@pat')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('delete-cloud confirm → deleteCloudSave(user.id) + onAfterDeleteCloud', async () => {
    const { onAfterDeleteCloud } = renderPanel();

    // Step 1: open the inline cloud confirm.
    fireEvent.click(screen.getByText(/Delete cloud save/i));
    // Step 2: confirm.
    fireEvent.click(screen.getByText(/Yes, delete cloud save/i));

    await waitFor(() => expect(deleteCloudSave).toHaveBeenCalledWith('u1'));
    expect(onAfterDeleteCloud).toHaveBeenCalledTimes(1);
  });

  it('delete-account confirm → deleteAccount + signOut + onAfterDeleteAccount + onClose', async () => {
    const { onClose, onAfterDeleteAccount } = renderPanel();

    // Step 1: open the inline account confirm.
    fireEvent.click(screen.getByText(/^Delete account$/i));
    // Step 2: type the github login to enable the permanent-delete button.
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'pat' } });
    // Step 3: confirm.
    fireEvent.click(screen.getByText(/Permanently delete account/i));

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith('u1'));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(onAfterDeleteAccount).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a rejected deleteAccount leaves the panel open (no onClose, no onAfterDeleteAccount)', async () => {
    deleteAccount.mockRejectedValue(new Error('delete failed'));
    const { onClose, onAfterDeleteAccount } = renderPanel();

    fireEvent.click(screen.getByText(/^Delete account$/i));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'pat' } });
    fireEvent.click(screen.getByText(/Permanently delete account/i));

    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith('u1'));
    // signOut runs only AFTER a successful deleteAccount — the throw skips it.
    expect(signOut).not.toHaveBeenCalled();
    expect(onAfterDeleteAccount).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // The account-confirm UI is still mounted (panel stayed open).
    expect(screen.getByText(/Permanently delete account/i)).toBeInTheDocument();
  });
});
