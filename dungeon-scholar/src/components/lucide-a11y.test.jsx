import { render } from '@testing-library/react';
import { X } from 'lucide-react';
import { describe, expect, it } from 'vitest';

// PHASE-19 19H / L3 regression lock. The audit's "aria-hidden sweep" is
// unnecessary because lucide-react (1.17.0) applies aria-hidden="true" by
// default to icons rendered without children/a11y props, and opts out when a
// meaningful icon supplies aria-label. If a future lucide major drops that
// default, this test goes red instead of the app silently regressing.
describe('lucide-react icon a11y defaults (19H)', () => {
  it('decorative icon (no a11y props) is aria-hidden', () => {
    const { container } = render(<X />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('meaningful icon with aria-label is NOT aria-hidden', () => {
    const { container } = render(<X aria-label="Close" />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('aria-hidden')).toBeNull();
    expect(svg.getAttribute('aria-label')).toBe('Close');
  });
});
