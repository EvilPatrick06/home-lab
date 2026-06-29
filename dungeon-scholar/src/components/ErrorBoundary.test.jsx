// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary.jsx';

// A child that throws the given error on render so the boundary catches it.
function Boom({ error }) {
  throw error;
}

describe('ErrorBoundary', () => {
  let _errSpy;
  let _warnSpy;
  beforeEach(() => {
    window.sessionStorage.clear();
    // React logs the caught error to console.error; silence it in the test.
    _errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    _warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(window.location, 'reload').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>safe content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('safe content')).toBeInTheDocument();
  });

  it('renders the new-edition reload affordance on a chunk-load error', () => {
    // Guard pre-set so the belt-and-suspenders auto-reload does not fire and we
    // assert the affordance the user sees after 01A already reloaded once.
    window.sessionStorage.setItem('ds:chunk-reload', '1');
    render(
      <ErrorBoundary>
        <Boom error={new Error('Failed to fetch dynamically imported module: /assets/x.js')} />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/new edition/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
    // The generic crash copy must NOT show for a chunk error.
    expect(screen.queryByText(/a spell misfired/i)).not.toBeInTheDocument();
  });

  it('renders the generic crash panel + Return to Hearth on a non-chunk error', () => {
    render(
      <ErrorBoundary>
        <Boom error={new Error('Cannot read properties of undefined')} />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/a spell misfired in this chamber/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /return to hearth/i })).toBeInTheDocument();
    expect(screen.queryByText(/new edition/i)).not.toBeInTheDocument();
  });
});
