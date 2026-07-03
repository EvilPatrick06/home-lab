import { afterEach, describe, expect, it, vi } from 'vitest';
import { speechRecognitionSupported, startDictation } from './speech.js';

let lastInstance = null;
class FakeRecognition {
  constructor() {
    lastInstance = this;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
  abort() {
    this.aborted = true;
  }
}

describe('speech', () => {
  afterEach(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    lastInstance = null;
    vi.restoreAllMocks();
  });

  it('reports unsupported when no API is present', () => {
    expect(speechRecognitionSupported()).toBe(false);
    const onError = vi.fn();
    expect(startDictation({ onError })).toBe(null);
    expect(onError).toHaveBeenCalled();
  });

  it('detects the webkit-prefixed API', () => {
    window.webkitSpeechRecognition = FakeRecognition;
    expect(speechRecognitionSupported()).toBe(true);
  });

  it('starts recognition and returns stop/abort handles', () => {
    window.SpeechRecognition = FakeRecognition;
    const handle = startDictation({ lang: 'en-GB' });
    expect(handle).not.toBe(null);
    expect(lastInstance.started).toBe(true);
    expect(lastInstance.lang).toBe('en-GB');
    handle.stop();
    expect(lastInstance.stopped).toBe(true);
    handle.abort();
    expect(lastInstance.aborted).toBe(true);
  });

  it('delivers a joined transcript via onResult', () => {
    window.SpeechRecognition = FakeRecognition;
    const onResult = vi.fn();
    startDictation({ onResult });
    lastInstance.onresult({
      resultIndex: 0,
      results: [
        Object.assign([{ transcript: 'hello ' }], { isFinal: false }),
        Object.assign([{ transcript: 'world' }], { isFinal: true }),
      ],
    });
    expect(onResult).toHaveBeenCalledWith('hello world', { isFinal: true });
  });

  it('forwards errors via onError', () => {
    window.SpeechRecognition = FakeRecognition;
    const onError = vi.fn();
    startDictation({ onError });
    lastInstance.onerror({ error: 'no-speech' });
    expect(onError).toHaveBeenCalledWith('no-speech');
  });
});
