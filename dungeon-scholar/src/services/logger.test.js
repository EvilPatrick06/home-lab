import { describe, it, expect, vi, afterEach } from 'vitest';
import { logError, logWarn, errorMessageOf } from './logger.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('errorMessageOf', () => {
  it('handles null/undefined', () => {
    expect(errorMessageOf(null)).toBe('unknown error');
    expect(errorMessageOf(undefined)).toBe('unknown error');
  });
  it('passes strings through', () => {
    expect(errorMessageOf('boom')).toBe('boom');
  });
  it('extracts .message', () => {
    expect(errorMessageOf(new Error('kaboom'))).toBe('kaboom');
    expect(errorMessageOf({ message: 'msg' })).toBe('msg');
  });
  it('stringifies a message-less object', () => {
    expect(errorMessageOf({})).toBe('[object Object]');
  });
});

describe('logError', () => {
  it('PROD: logs message-only via console.warn, never console.error', () => {
    vi.stubEnv('PROD', true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError('Delete failed', new Error('boom'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Delete failed: boom');
    expect(error).not.toHaveBeenCalled();
  });

  it('PROD: does not leak enumerable payload from the error object', () => {
    vi.stubEnv('PROD', true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logError('Cloud pull failed', { message: 'boom', secret: 'uuid-123' });
    const logged = warn.mock.calls[0].join(' ');
    expect(logged).toContain('boom');
    expect(logged).not.toContain('uuid-123');
  });

  it('dev: logs the original object reference via console.error', () => {
    vi.stubEnv('PROD', false);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const obj = new Error('boom');
    logError('ctx', obj);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][1]).toBe(obj); // original object reference
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('logWarn', () => {
  it('always logs message-only via console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logWarn('Base path mismatch', 'served from /x/');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Base path mismatch: served from /x/');
  });
  it('omits the detail separator when detail is empty', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logWarn('Just a context');
    expect(warn.mock.calls[0][0]).toBe('[Dungeon Scholar] Just a context');
  });
});
