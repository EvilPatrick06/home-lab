import { describe, expect, it } from 'vitest';
import { speak, stripForSpeech, ttsSupported } from './tts.js';

describe('tts (S14)', () => {
  it('strips code fences and markdown punctuation', () => {
    expect(stripForSpeech('**Bold** and `code`')).toBe('Bold and');
    expect(stripForSpeech('see ```js\nx=1\n``` end')).toContain('(code block)');
    expect(stripForSpeech('a [link](http://x) here')).toBe('a link here');
  });
  it('returns empty string for non-strings', () => {
    expect(stripForSpeech(null)).toBe('');
    expect(stripForSpeech(42)).toBe('');
  });
  it('speak is a no-op (returns false) when speechSynthesis is unavailable', () => {
    if (!ttsSupported()) expect(speak('hi')).toBe(false);
    else expect(typeof speak('hi')).toBe('boolean');
  });
});
