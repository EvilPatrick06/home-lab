// Daily study plan (sugg-study-plan).
//
// The primitives for a guided cram-toward-the-exam experience already exist
// independently - examDate/pace (examPace.js), predicted score (examPrediction.js),
// weak domains (weakDomain.js), and the forgetting curve. Nothing orchestrated
// them into an actionable "what to study today" recommendation. This pure
// composer takes those already-computed values and produces a prioritized daily
// recommendation: how many riddles to clear today, which weak domain to target,
// and whether the learner is on track. Kept pure so DomainStudyScreen just feeds
// it the values it already derives.

/**
 * @param {{
 *   examPace?: { status?: string, daysRemaining?: number, dailyTarget?: number, total?: number } | null,
 *   prediction?: { predictedScore?: number, passThreshold?: number } | null,
 *   weakestDomain?: { domain?: string, accuracy?: number } | null,
 *   dueCount?: number,
 * }} inputs
 * @returns {{ headline: string, actions: string[], onTrack: (boolean|null) }}
 */
export function buildStudyPlan({ examPace = null, prediction = null, weakestDomain = null, dueCount = 0 } = {}) {
  const actions = [];
  let onTrack = null;
  let headline = 'Keep a steady pace';

  const days = examPace && Number.isFinite(examPace.daysRemaining) ? examPace.daysRemaining : null;

  // 1) Clear today's due reviews first (retention protection).
  const due = Math.max(0, Math.floor(Number(dueCount) || 0));
  if (due > 0) {
    actions.push(`Clear ${due} due review${due === 1 ? '' : 's'} to protect what you've learned.`);
  }

  // 2) Exam-pace daily target.
  if (examPace && examPace.status === 'upcoming' && Number.isFinite(examPace.dailyTarget)) {
    actions.push(
      `Study ${examPace.dailyTarget} riddle${examPace.dailyTarget === 1 ? '' : 's'} today to stay on pace for your exam${
        days != null ? ` in ${days} day${days === 1 ? '' : 's'}` : ''
      }.`,
    );
  } else if (examPace && examPace.status === 'today') {
    headline = 'Exam day - final review';
    actions.push('Do a light confidence pass over your weakest domains; avoid cramming new material.');
  } else if (examPace && examPace.status === 'past') {
    // issue-studyplan-past-headline (2026-07-15): the screen rendering this
    // plan also shows "Exam was N days ago" for this state — don't contradict
    // it with the no-exam copy.
    headline = 'Exam date passed - set a new goal';
    actions.push('Set a new exam date for a tailored plan, or keep reviewing to hold your gains.');
  }

  // 3) Target the weakest domain.
  if (weakestDomain && weakestDomain.domain) {
    const pct = Number.isFinite(weakestDomain.accuracy) ? Math.round(weakestDomain.accuracy * 100) : null;
    actions.push(`Prioritize your weakest domain: ${weakestDomain.domain}${pct != null ? ` (${pct}% accuracy)` : ''}.`);
  }

  // 4) On-track verdict from the prediction vs its pass threshold.
  if (prediction && Number.isFinite(prediction.predictedScore)) {
    const threshold = Number.isFinite(prediction.passThreshold) ? prediction.passThreshold : 70;
    onTrack = prediction.predictedScore >= threshold;
    if (onTrack) {
      headline =
        days != null && days >= 0
          ? `On track - keep it up (${days} day${days === 1 ? '' : 's'} to go)`
          : 'On track - keep it up';
    } else {
      headline = 'Below your target - focus your reviews';
      actions.push(
        `Predicted ${Math.round(prediction.predictedScore)}% is under the ${threshold}% target - the weak-domain drills above close the gap fastest.`,
      );
    }
  }

  if (actions.length === 0) {
    actions.push(
      'Study a set of riddles or review scrolls to build momentum, then set an exam date for a tailored plan.',
    );
  }

  return { headline, actions, onTrack };
}
