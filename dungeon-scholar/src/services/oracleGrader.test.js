import { describe, it, expect, vi } from 'vitest';
import { gradeAnswer, stringMatchAnswer } from './oracleGrader.js';

const okOracleResponse = (verdict) => ({
  ok: true,
  status: 200,
  json: async () => ({ content: [{ type: 'text', text: JSON.stringify(verdict) }] }),
  text: async () => JSON.stringify(verdict),
});

const failOracleResponse = (status = 500, body = '') => ({
  ok: false,
  status,
  json: async () => ({}),
  text: async () => body,
});

describe('stringMatchAnswer', () => {
  it('matches exact normalized answer', () => {
    expect(stringMatchAnswer({ userAnswer: 'Phishing', acceptedAnswers: ['phishing'] })).toBe(true);
  });

  it('matches partial substring against expectedAnswer', () => {
    expect(stringMatchAnswer({ userAnswer: 'cross-site scripting', expectedAnswer: 'XSS — cross-site scripting' })).toBe(true);
  });

  it('rejects unrelated answers', () => {
    expect(stringMatchAnswer({ userAnswer: 'phishing', acceptedAnswers: ['SQL injection'] })).toBe(false);
  });

  it('rejects empty user answer', () => {
    expect(stringMatchAnswer({ userAnswer: '', acceptedAnswers: ['anything'] })).toBe(false);
  });
});

describe('gradeAnswer', () => {
  it('returns local verdict on empty user answer without calling fetch', async () => {
    const fetchImpl = vi.fn();
    const result = await gradeAnswer({
      question: 'q', userAnswer: '   ', acceptedAnswers: ['x'], fetchImpl,
    });
    expect(result.correct).toBe(false);
    expect(result.source).toBe('local');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns Oracle verdict when API responds with parsable JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okOracleResponse({ correct: true, feedback: 'Indeed, scholar.' })
    );
    const result = await gradeAnswer({
      question: 'What is XSS?',
      expectedAnswer: 'Cross-site scripting',
      userAnswer: 'cross site scripting',
      fetchImpl,
    });
    expect(result.correct).toBe(true);
    expect(result.feedback).toBe('Indeed, scholar.');
    expect(result.source).toBe('oracle');
  });

  it('parses JSON wrapped in surrounding prose', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: 'Here is my judgment: {"correct": false, "feedback": "Nay."} Hope this helps.' }],
      }),
    });
    const result = await gradeAnswer({
      question: 'q', userAnswer: 'wrong', expectedAnswer: 'right', fetchImpl,
    });
    expect(result.correct).toBe(false);
    expect(result.source).toBe('oracle');
  });

  it('falls back to string match on HTTP error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(failOracleResponse(429, 'rate limit exceeded'));
    const result = await gradeAnswer({
      question: 'q',
      acceptedAnswers: ['phishing'],
      userAnswer: 'phishing',
      fetchImpl,
    });
    expect(result.correct).toBe(true);
    expect(result.source).toBe('fallback');
    expect(result.fallbackReason).toMatch(/rate limit/i);
  });

  it('falls back to string match on network error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'));
    const result = await gradeAnswer({
      question: 'q',
      acceptedAnswers: ['phishing'],
      userAnswer: 'phishing',
      fetchImpl,
    });
    expect(result.correct).toBe(true);
    expect(result.source).toBe('fallback');
    expect(result.fallbackReason).toBe('boom');
  });

  it('falls back to string match on unparseable verdict', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'I cannot grade this.' }] }),
    });
    const result = await gradeAnswer({
      question: 'q', acceptedAnswers: ['x'], userAnswer: 'x', fetchImpl,
    });
    expect(result.source).toBe('fallback');
    expect(result.correct).toBe(true);
  });

  it('Oracle verdict overrides what string match would return', async () => {
    // Oracle says correct, but string match would say wrong
    const fetchImpl = vi.fn().mockResolvedValue(
      okOracleResponse({ correct: true, feedback: 'A reasonable paraphrase.' })
    );
    const result = await gradeAnswer({
      question: 'What is the principle of least privilege?',
      expectedAnswer: 'Give users the minimum permissions necessary',
      userAnswer: 'only granting the access someone needs to do their job',
      fetchImpl,
    });
    expect(result.correct).toBe(true);
    expect(result.source).toBe('oracle');
  });
});
