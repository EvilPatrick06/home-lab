import { describe, expect, it } from 'vitest';
import ExamMode from './ExamMode.jsx';

// Smoke test added when ExamMode moved into features/study/ (was the only
// study mode lacking a co-located test).
describe('ExamMode', () => {
  it('exports a component', () => {
    expect(typeof ExamMode).toBe('function');
  });
});
