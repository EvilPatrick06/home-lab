import { describe, it, expect } from 'vitest';
import {
  isAllowedOcclusionImage,
  normalizeMask,
  normalizeMasks,
  isOcclusionCard,
  validOcclusionCard,
  addMask,
  updateMaskAnswer,
  removeMask,
} from './occlusion.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('isAllowedOcclusionImage', () => {
  it('accepts data:image base64 and https URLs', () => {
    expect(isAllowedOcclusionImage(PNG)).toBe(true);
    expect(isAllowedOcclusionImage('https://user-images.githubusercontent.com/x.png')).toBe(true);
  });
  it('rejects junk / svg / non-string', () => {
    expect(isAllowedOcclusionImage('data:image/svg+xml;base64,abc')).toBe(false);
    expect(isAllowedOcclusionImage('javascript:alert(1)')).toBe(false);
    expect(isAllowedOcclusionImage(null)).toBe(false);
    expect(isAllowedOcclusionImage('')).toBe(false);
  });
});

describe('normalizeMask', () => {
  it('clamps coords to [0,1] and keeps the box in bounds', () => {
    const m = normalizeMask({ x: 0.8, y: -0.5, w: 0.5, h: 2, answer: 42 });
    expect(m.x).toBe(0.8);
    expect(m.y).toBe(0);
    expect(m.w).toBeLessThanOrEqual(1 - 0.8 + 1e-9);
    expect(m.h).toBeLessThanOrEqual(1);
    expect(m.answer).toBe('42'); // coerced to string
  });
  it('gives a default size to zero/invalid w/h', () => {
    const m = normalizeMask({ x: 0, y: 0, w: 0, h: 0 });
    expect(m.w).toBeGreaterThan(0);
    expect(m.h).toBeGreaterThan(0);
  });
  it('returns null for non-objects', () => {
    expect(normalizeMask(null)).toBeNull();
    expect(normalizeMask(5)).toBeNull();
  });
});

describe('isOcclusionCard / validOcclusionCard', () => {
  const card = { id: 'o1', type: 'occlusion', image: PNG, masks: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1, answer: 'A' }] };
  it('recognizes a well-formed occlusion card', () => {
    expect(isOcclusionCard(card)).toBe(true);
    expect(validOcclusionCard(card)).toBe(true);
  });
  it('rejects non-occlusion / image-less / mask-less cards', () => {
    expect(isOcclusionCard({ type: 'occlusion', image: PNG, masks: [] })).toBe(false);
    expect(isOcclusionCard({ type: 'occlusion', image: 'nope', masks: [{ x: 0, y: 0, w: 0.1, h: 0.1 }] })).toBe(false);
    expect(isOcclusionCard({ front: 'q', back: 'a' })).toBe(false);
  });
});

describe('authoring helpers', () => {
  it('addMask normalizes and appends', () => {
    let c = { type: 'occlusion', image: PNG, masks: [] };
    c = addMask(c, { x: 0.2, y: 0.2, w: 0.1, h: 0.1, answer: 'one' });
    c = addMask(c, { x: 0.5, y: 0.5, w: 0.1, h: 0.1, answer: 'two' });
    expect(c.masks).toHaveLength(2);
    expect(c.masks[1].answer).toBe('two');
  });
  it('updateMaskAnswer + removeMask', () => {
    let c = { type: 'occlusion', image: PNG, masks: [{ x: 0, y: 0, w: 0.1, h: 0.1, answer: '' }] };
    c = updateMaskAnswer(c, 0, 'edited');
    expect(c.masks[0].answer).toBe('edited');
    c = removeMask(c, 0);
    expect(c.masks).toHaveLength(0);
  });
});
