import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RlsWarningBanner } from './RlsWarningBanner.jsx';

describe('RlsWarningBanner (PHASE-18 18C)', () => {
  it('renders an alert naming the saves table + RLS', () => {
    render(<RlsWarningBanner />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/Row Level Security/i);
    expect(alert).toHaveTextContent(/saves/);
  });

  it('fires onDismiss when the Dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(<RlsWarningBanner onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('omits the Dismiss button when no handler is provided', () => {
    render(<RlsWarningBanner />);
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull();
  });
});
