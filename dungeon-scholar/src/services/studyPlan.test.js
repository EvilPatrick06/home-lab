import { describe, expect, it } from 'vitest';
import { buildStudyPlan } from './studyPlan.js';

describe('buildStudyPlan', () => {
  it('gives a generic momentum action with no inputs', () => {
    const plan = buildStudyPlan();
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.onTrack).toBe(null);
  });

  it('leads with clearing due reviews', () => {
    const plan = buildStudyPlan({ dueCount: 12 });
    expect(plan.actions[0]).toContain('12 due reviews');
  });

  it('adds the exam-pace daily target when upcoming', () => {
    const plan = buildStudyPlan({
      examPace: { status: 'upcoming', daysRemaining: 5, dailyTarget: 8 },
    });
    expect(plan.actions.join(' ')).toContain('8 riddles today');
    expect(plan.actions.join(' ')).toContain('5 days');
  });

  it('targets the weakest domain', () => {
    const plan = buildStudyPlan({ weakestDomain: { domain: 'Subnetting', accuracy: 0.42 } });
    expect(plan.actions.join(' ')).toContain('Subnetting');
    expect(plan.actions.join(' ')).toContain('42%');
  });

  it('marks on-track when prediction meets the threshold', () => {
    const plan = buildStudyPlan({
      prediction: { predictedScore: 82, passThreshold: 70 },
      examPace: { status: 'upcoming', daysRemaining: 3, dailyTarget: 4 },
    });
    expect(plan.onTrack).toBe(true);
    expect(plan.headline).toContain('On track');
  });

  it('marks below-target and adds a gap-closing action', () => {
    const plan = buildStudyPlan({ prediction: { predictedScore: 55, passThreshold: 70 } });
    expect(plan.onTrack).toBe(false);
    expect(plan.headline).toContain('Below your target');
    expect(plan.actions.join(' ')).toContain('55%');
    expect(plan.actions.join(' ')).toContain('70%');
  });

  it('handles exam-day mode', () => {
    const plan = buildStudyPlan({ examPace: { status: 'today' } });
    expect(plan.headline).toContain('Exam day');
  });
});

describe('past-exam state (issue-studyplan-past-headline)', () => {
  it("gives the past-exam state its own headline instead of 'No exam scheduled'", () => {
    const plan = buildStudyPlan({ examPace: { status: 'past', daysRemaining: -3 } });
    expect(plan.headline).toBe('Exam date passed - set a new goal');
    expect(plan.actions.join(' ')).toMatch(/new exam date/i);
  });

  it('never renders negative days in the on-track headline after the exam date', () => {
    const plan = buildStudyPlan({
      examPace: { status: 'past', daysRemaining: -3 },
      prediction: { predictedScore: 90 },
    });
    expect(plan.headline).toBe('On track - keep it up');
    expect(plan.headline).not.toMatch(/-3/);
  });
});
