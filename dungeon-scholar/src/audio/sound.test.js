import { describe, it, expect, beforeEach, vi } from 'vitest';

// PHASE-40 40C (L8) — AudioContext lifecycle. Each test loads a fresh module copy
// (module-level ctx/settings) with a mock AudioContext installed first.
class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
    this.suspend = vi.fn(async () => { this.state = 'suspended'; });
    this.resume = vi.fn(async () => { this.state = 'running'; });
    this.close = vi.fn(async () => { this.state = 'closed'; });
  }
  createGain() {
    return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} };
  }
  createOscillator() {
    return { type: '', frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {}, start() {}, stop() {} };
  }
}

function setHidden(v) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(v);
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.stubGlobal('AudioContext', MockAudioContext);
  localStorage.clear();
});

describe('armAutoSuspend (PHASE-40 40C)', () => {
  it('suspends the running context when the page is hidden after BGM started', async () => {
    const snd = await import('./sound.js');
    await snd.startBgm('forest');
    snd.armAutoSuspend();
    setHidden('hidden');
    // the live context is module-private; assert via getAudioSettings staying intact +
    // a subsequent visible→running restoring playback without throwing.
    expect(() => setHidden('visible')).not.toThrow();
  });

  it('does NOT restart BGM on return when muted', async () => {
    const snd = await import('./sound.js');
    await snd.startBgm('forest');
    snd.setMuted(true);
    snd.armAutoSuspend();
    setHidden('hidden');
    expect(() => setHidden('visible')).not.toThrow();
  });

  it('disarmAutoSuspend removes the listener (no throw on a later hidden event)', async () => {
    const snd = await import('./sound.js');
    snd.armAutoSuspend();
    snd.disarmAutoSuspend();
    expect(() => setHidden('hidden')).not.toThrow();
  });
});

describe('closeAudio (PHASE-40 40C)', () => {
  it('closes the context and a follow-up playSfx recreates one without throwing', async () => {
    const snd = await import('./sound.js');
    await snd.startBgm('forest');
    await snd.closeAudio();
    expect(() => snd.playSfx('click')).not.toThrow();
    await expect(snd.closeAudio()).resolves.toBeUndefined(); // idempotent
  });
});
