import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setMuted = vi.fn();
const playSfx = vi.fn();
let audioSettings = { muted: true };

vi.mock('../audio/sound.js', () => ({
  getAudioSettings: () => audioSettings,
  setMuted: (...a) => setMuted(...a),
  playSfx: (...a) => playSfx(...a),
}));

import { AudioInviteBanner } from './AudioInviteBanner.jsx';

const DISMISS_KEY = 'dungeon-scholar-audio-invite-dismissed';

describe('AudioInviteBanner (PHASE-19 19F)', () => {
  beforeEach(() => {
    localStorage.clear();
    setMuted.mockReset();
    playSfx.mockReset();
    audioSettings = { muted: true };
  });

  it('shows when muted and not dismissed', () => {
    render(<AudioInviteBanner />);
    expect(screen.getByRole('region', { name: /audio invitation/i })).toBeInTheDocument();
  });

  it('is hidden when the dismiss flag is set', () => {
    localStorage.setItem(DISMISS_KEY, '1');
    render(<AudioInviteBanner />);
    expect(screen.queryByRole('region', { name: /audio invitation/i })).toBeNull();
  });

  it('is hidden when audio is already unmuted', () => {
    audioSettings = { muted: false };
    render(<AudioInviteBanner />);
    expect(screen.queryByRole('region', { name: /audio invitation/i })).toBeNull();
  });

  it('"Enable sound" un-mutes and persists the flag', () => {
    render(<AudioInviteBanner />);
    fireEvent.click(screen.getByRole('button', { name: /enable sound/i }));
    expect(setMuted).toHaveBeenCalledWith(false);
    expect(localStorage.getItem(DISMISS_KEY)).toBe('1');
    expect(screen.queryByRole('region', { name: /audio invitation/i })).toBeNull();
  });

  it('"Not now" persists the flag without un-muting', () => {
    render(<AudioInviteBanner />);
    fireEvent.click(screen.getByRole('button', { name: /not now/i }));
    expect(setMuted).not.toHaveBeenCalled();
    expect(localStorage.getItem(DISMISS_KEY)).toBe('1');
  });
});
