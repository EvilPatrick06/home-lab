import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import DungeonScholarApp from './App.jsx';

// Smoke test for App's top-level screen router. Added as the safety net for the
// refactor that collapses the inline `screen === ...` ladder into the
// router/screens.js-driven `screenViews` dispatch: it mounts the full app and
// drives a few screens by hash so a broken dispatch / guard surfaces as a crash.
afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('App screen router (smoke)', () => {
  it('mounts on the home screen and renders chrome', () => {
    window.location.hash = '';
    const { container } = render(<DungeonScholarApp />);
    expect(container).toBeTruthy();
    expect(container.textContent.length).toBeGreaterThan(0);
  });

  it('routes to a non-courseSet screen (library) without crashing', () => {
    window.location.hash = '#/library';
    const { container } = render(<DungeonScholarApp />);
    expect(container).toBeTruthy();
    expect(container.textContent.length).toBeGreaterThan(0);
  });

  it('a courseSet-gated screen with no active tome bounces to home without crashing', () => {
    window.location.hash = '#/quiz';
    const { container } = render(<DungeonScholarApp />);
    expect(container).toBeTruthy();
  });

  it('routes to the ledger screen without crashing', () => {
    window.location.hash = '#/ledger';
    const { container } = render(<DungeonScholarApp />);
    expect(container).toBeTruthy();
  });
});
