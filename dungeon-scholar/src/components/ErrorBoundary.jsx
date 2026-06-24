import React from 'react';
import { logError } from '../services/logger.js';
import { guardedReloadOnce, isChunkLoadError } from '../utils/lazyWithReload.js';


// Phase 44d round-11 suggestion: React error boundary. A component crash
// (e.g., the Phase 43e hook-order regression that triggered React #310 on
// LabMode entry) would otherwise unmount the entire app to a white page.
// The boundary catches the render error, surfaces a recoverable panel,
// and lets the user navigate back to Hearth without a full reload.
//
// PHASE-01 (F1b): the boundary is also the backstop for a stale-chunk failed
// dynamic import that slips past the lazyWithReload/vite:preloadError recovery
// (01A) and the SW controllerchange handshake (01C). When the caught error is a
// chunk-load error it renders a terse "a new edition has arrived — Reload"
// affordance (and attempts one guarded auto-reload), instead of the generic
// "A spell misfired" crash copy.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    logError('ErrorBoundary caught', error);
    // PHASE-01 (F1b): belt-and-suspenders — if a chunk-load error reached the
    // boundary and 01A/01C have not already used the one-shot reload this
    // session, reload once to the latest build. guardedReloadOnce() no-ops when
    // the guard is already set (the chunk is genuinely gone), leaving the manual
    // Reload affordance below as the recovery path.
    if (isChunkLoadError(error)) guardedReloadOnce();
    // eslint-disable-next-line no-console
    if (!import.meta.env.PROD) console.error(info?.componentStack);
  }
  resetError = () => {
    this.setState({ hasError: false, error: null });
    if (typeof this.props.onReset === 'function') {
      try { this.props.onReset(); } catch { /* ignore */ }
    }
  };
  render() {
    if (!this.state.hasError) return this.props.children;

    // PHASE-01 (F1b): chunk-load errors get a dedicated "new version" panel.
    if (isChunkLoadError(this.state.error)) {
      return (
        <div className="max-w-2xl mx-auto my-12 p-6 rounded-sm relative" style={{
          background: 'linear-gradient(135deg, rgba(41, 24, 12, 0.92) 0%, rgba(10, 6, 4, 0.97) 100%)',
          border: '3px double rgba(245, 158, 11, 0.7)',
          boxShadow: '0 0 40px rgba(245, 158, 11, 0.25)',
        }} role="alert" aria-live="assertive">
          <div className="text-xs italic tracking-[0.25em] uppercase text-amber-300 mb-3">✦ The tome has been rebound ✦</div>
          <h2 className="text-2xl font-bold text-amber-200 italic mb-3">A new edition of the tome has arrived</h2>
          <p className="text-sm italic text-amber-100 mb-4">
            A fresh version of Dungeon Scholar was published while thou wast reading.
            Reload to fetch the latest pages — thy saved progress is safe.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}
              className="px-4 py-2 rounded-sm text-sm font-bold italic border-2 border-amber-300 text-amber-950"
              style={{ background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)' }}>
              Reload
            </button>
          </div>
        </div>
      );
    }

    const message = (this.state.error && (this.state.error.message || String(this.state.error))) || 'Unknown error';
    return (
      <div className="max-w-2xl mx-auto my-12 p-6 rounded-sm relative" style={{
        background: 'linear-gradient(135deg, rgba(80, 20, 20, 0.92) 0%, rgba(20, 6, 6, 0.97) 100%)',
        border: '3px double rgba(220, 38, 38, 0.7)',
        boxShadow: '0 0 40px rgba(220, 38, 38, 0.3)',
      }} role="alert" aria-live="assertive">
        <div className="text-xs italic tracking-[0.25em] uppercase text-red-300 mb-3">⚠ Something went wrong ⚠</div>
        <h2 className="text-2xl font-bold text-red-200 italic mb-3">A spell misfired in this chamber</h2>
        <p className="text-sm italic text-amber-100 mb-4">
          The page thou wast viewing crashed unexpectedly. Thy saved progress is safe —
          step back to the Hearth and try again, or refresh the page if the problem persists.
        </p>
        <details className="mb-4 text-xs italic text-amber-100/70">
          <summary className="cursor-pointer hover:text-amber-100">Technical details</summary>
          <pre className="mt-2 p-2 rounded-sm overflow-x-auto text-[10px] whitespace-pre-wrap" style={{
            background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(var(--surface-amber-strong, 120, 53, 15), 0.4)', color: '#fde68a',
          }}>{message}</pre>
        </details>
        <div className="flex gap-2 flex-wrap">
          <button onClick={this.resetError} className="px-4 py-2 rounded-sm text-sm font-bold italic border-2 border-amber-300 text-amber-950"
            style={{ background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)' }}>
            ← Return to Hearth
          </button>
          <button onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}
            className="px-4 py-2 rounded-sm text-sm italic border-2 border-amber-700 text-amber-200"
            style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}>
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
