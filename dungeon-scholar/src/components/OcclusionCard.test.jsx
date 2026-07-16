import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import OcclusionCard from './OcclusionCard.jsx';

// Render-boundary guard (SECURITY-LOG 2026-06-29): OcclusionCard must enforce
// the data:image-only invariant itself, not trust its caller's isOcclusionCard
// gate. card.image arrives via importable/shareable tomes (untrusted), and the
// production CSP allowlists avatars.githubusercontent.com, so a remote image
// on that host would survive the CSP backstop — the component check is the
// only thing that blocks it from a future ungated call site.

const masks = [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2, answer: 'hippocampus' }];
const DATA_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

function imgs(container) {
  return container.querySelectorAll('img');
}

describe('OcclusionCard render-boundary image validation', () => {
  it('renders an <img> for an allowlisted data:image source', () => {
    const { container } = render(
      <OcclusionCard card={{ image: DATA_IMG, masks, front: 'Label the region' }} flipped={false} />,
    );
    expect(imgs(container)).toHaveLength(1);
    expect(imgs(container)[0].getAttribute('src')).toBe(DATA_IMG);
  });

  it('emits NO <img> for a remote https URL', () => {
    const { container } = render(
      <OcclusionCard card={{ image: 'https://evil.example/beacon.png', masks }} flipped={false} />,
    );
    expect(imgs(container)).toHaveLength(0);
  });

  it('emits NO <img> for a CSP-allowlisted avatars.githubusercontent.com URL', () => {
    const { container } = render(
      <OcclusionCard card={{ image: 'https://avatars.githubusercontent.com/u/1?v=4', masks }} flipped={false} />,
    );
    expect(imgs(container)).toHaveLength(0);
  });

  it('skips the positioned mask overlays when the image is rejected', () => {
    const { container, queryByText } = render(
      <OcclusionCard card={{ image: 'javascript:alert(1)', masks }} flipped={false} />,
    );
    expect(imgs(container)).toHaveLength(0);
    expect(queryByText('?')).toBeNull();
  });
});

// PHASE-14 14B: the rejected-image fallback must still teach — flip reveals the
// region answers as plain text (masks are validated independently of the image),
// while the unflipped state keeps them hidden so recall is still being tested.
describe('OcclusionCard rejected-image fallback answer reveal', () => {
  it('reveals the mask answers as text on flip when the image is rejected', () => {
    const { container, getByText } = render(
      <OcclusionCard card={{ image: 'https://evil.example/x.png', masks }} flipped={true} />,
    );
    expect(imgs(container)).toHaveLength(0);
    const answer = getByText('hippocampus');
    expect(answer.tagName).toBe('LI'); // text list, not a positioned overlay
    expect(getByText(/rate thy recall/i)).toBeTruthy();
  });

  it('does not leak answers (or the reveal hint) in the unflipped rejected-image state', () => {
    const { container, queryByText, getByText } = render(
      <OcclusionCard card={{ image: 'https://evil.example/x.png', masks }} flipped={false} />,
    );
    expect(imgs(container)).toHaveLength(0);
    expect(queryByText('hippocampus')).toBeNull();
    expect(getByText(/flip to reveal the answers as text/i)).toBeTruthy();
  });

  it('keeps the allowlisted-image flip behavior unchanged (positioned overlay, no text list)', () => {
    const { container, getByText } = render(
      <OcclusionCard card={{ image: DATA_IMG, masks, front: 'Label the region' }} flipped={true} />,
    );
    expect(imgs(container)).toHaveLength(1);
    expect(getByText('hippocampus').tagName).toBe('SPAN'); // overlay span, not a fallback list item
    expect(container.querySelector('ul')).toBeNull();
    expect(getByText('✦ Revealed — rate thy recall')).toBeTruthy();
  });
});
