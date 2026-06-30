import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// PHASE-11 F2: the three study modes must expose a semantic <h2> page heading
// so `main h1, main h2` returns a landmark for the active mode (a11y outline).
describe('study-mode headings (PHASE-11 F2)', () => {
  for (const f of [
    'src/features/study/FlashcardsMode.jsx',
    'src/features/study/QuizMode.jsx',
    'src/features/study/ChatMode.jsx',
  ]) {
    it(`${f} renders an <h2>`, () => {
      expect(readFileSync(f, 'utf-8')).toMatch(/<h2[\s>]/);
    });
  }
});

// PHASE-11 F5: Quest Board header verb agrees in number (1 reward awaits / N rewards await).
describe('quest board verb agreement (PHASE-11 F5)', () => {
  it('switches the verb on the singular case', () => {
    const src = readFileSync('src/features/quests/QuestBoard.jsx', 'utf-8');
    expect(src).toContain("await{totalClaimable === 1 ? 's' : ''} thy hand");
    expect(src).not.toContain("'s'} await thy hand");
  });
});
