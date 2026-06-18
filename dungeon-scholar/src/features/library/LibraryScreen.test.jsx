import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import LibraryScreen from './LibraryScreen.jsx';
import { blankTomeProgress } from '../../game/tome.js';

// Phase 41G — Phase-30 QA gap: render the Grand Library with a large
// collection (the QA pass "couldn't test" 100+ tomes) and confirm every row
// renders + the switch callback carries the clicked tome's id.

const makeTome = (i) => ({
  id: `tome_${i}`,
  // lastOpened increasing with i keeps the recency sort deterministic.
  lastOpened: 1_700_000_000_000 + i,
  addedAt: 1_700_000_000_000 + i,
  pinned: false,
  data: {
    metadata: { title: `Tome ${i}`, subject: `Subject ${i % 7}` },
    flashcards: [{ id: `c_${i}`, front: 'Q', back: 'A' }],
    quiz: [],
    labs: [],
  },
  progress: { ...blankTomeProgress(), cardsReviewed: i, quizAnswered: i * 2, runsCompleted: i % 5 },
});

const makeLibrary = (n) => Array.from({ length: n }, (_, i) => makeTome(i));

function renderLibrary(library, overrides = {}) {
  const props = {
    playerState: { library, activeTomeId: null },
    onSwitch: vi.fn(),
    onDelete: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onShare: vi.fn(),
    onEditMetadata: vi.fn(),
    onNotes: vi.fn(),
    onTogglePin: vi.fn(),
    onImport: vi.fn(),
    onPaste: vi.fn(),
    onImportCode: vi.fn(),
    onShowPrompt: vi.fn(),
    setScreen: vi.fn(),
    ...overrides,
  };
  render(<LibraryScreen {...props} />);
  return props;
}

describe('LibraryScreen — 120 tomes (Phase-30 QA gap)', () => {
  it('renders one card per tome for a 120-entry library', () => {
    renderLibrary(makeLibrary(120));
    // Each card's title is a Tome N heading; none is active so each card also
    // shows an "Open Tome" switch button. Count by the switch buttons.
    const openButtons = screen.getAllByRole('button', { name: /Open Tome/i });
    expect(openButtons).toHaveLength(120);
    // The header reports the collection size.
    expect(screen.getByText(/120 tomes in your collection/i)).toBeInTheDocument();
  });

  it('clicking a tome\'s Open Tome fires onSwitch with that tome\'s id', () => {
    const library = makeLibrary(120);
    const { onSwitch } = renderLibrary(library);

    // Target tome 73 by locating its title heading, then its enclosing card.
    const heading = screen.getByText('Tome 73');
    // Card root is the nearest ancestor that holds the Open Tome button.
    const card = heading.closest('div.rounded-sm.p-5');
    expect(card).toBeTruthy();
    const openBtn = within(card).getByRole('button', { name: /Open Tome/i });
    fireEvent.click(openBtn);

    expect(onSwitch).toHaveBeenCalledTimes(1);
    expect(onSwitch).toHaveBeenCalledWith('tome_73');
  });
});
