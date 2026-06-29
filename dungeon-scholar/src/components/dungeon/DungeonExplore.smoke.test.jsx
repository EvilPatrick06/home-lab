import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DungeonExplore from './DungeonExplore.jsx';

// Smoke-level mount test: the setup phase renders no canvas and starts no audio
// (both gated on phase === 'world'), so it mounts cleanly in jsdom. This guards
// the component's top-level hook wiring across the useDungeonInput /
// useDungeonState extraction — if the hook order or props break, this fails.
function makeProps(overrides = {}) {
  const quiz = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`,
    type: 'multiplechoice',
    question: `Question ${i}?`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
    domain: 'General',
  }));
  const courseSet = { quiz, flashcards: [{ id: 'f1', front: 'F', back: 'B' }] };
  const playerState = {
    library: [{ id: 't1', progress: {} }],
    equipped: {},
    pets: {},
    level: 1,
    achievements: [],
    inventory: {},
    permUpgrades: {},
    equippedSpells: [null, null, null],
  };
  return {
    onExit: vi.fn(),
    playerState,
    subject: 'Networking',
    courseSet,
    tomeProgress: {},
    awardXP: vi.fn(),
    awardGold: vi.fn(),
    recordAnswer: vi.fn(),
    checkAchievement: vi.fn(),
    unlockSpecialTitle: vi.fn(),
    updateProgress: vi.fn(),
    updateTomeProgress: vi.fn(),
    trackDungeonAttempt: vi.fn(),
    onViewHistory: vi.fn(),
    consumeItem: vi.fn(),
    giveItem: vi.fn(),
    recordBestiary: vi.fn(),
    ...overrides,
  };
}

describe('DungeonExplore — mount (setup phase)', () => {
  it('renders the setup screen with the Begin button', () => {
    render(<DungeonExplore {...makeProps()} />);
    expect(screen.getByText(/Begin the Delve/i)).toBeInTheDocument();
  });

  it('mounts without an active battle or crash given a minimal course set', () => {
    const { container } = render(<DungeonExplore {...makeProps()} />);
    // setup phase: no canvas yet (drawing is gated on the world phase)
    expect(container.querySelector('canvas')).toBeNull();
  });
});
