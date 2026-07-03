// Report-a-problem (sugg-report-problem).
//
// The README warns that AI-generated tomes can be imperfect, but a learner who
// spots a wrong answer key, a typo, or an ambiguous option mid-study has no way
// to record it. These pure helpers manage a per-tome list of problem reports
// (stored on the tome's `progress.reportedProblems`) that the author can review
// in the Tome Editor. Kept pure + storage-agnostic so the reducer/UI stay thin
// and the behaviour is unit-testable.

const REASONS = ['wrong-answer', 'typo', 'ambiguous', 'other'];
export const REPORT_REASONS = REASONS.slice();
export const REPORT_NOTE_MAX = 400;

export function reasonLabel(reason) {
  switch (reason) {
    case 'wrong-answer':
      return 'Wrong answer key';
    case 'typo':
      return 'Typo / error';
    case 'ambiguous':
      return 'Ambiguous / unclear';
    default:
      return 'Other';
  }
}

// Build a normalized report record. Returns null when there is no item to flag.
export function makeReport({ itemId, itemType = 'quiz', reason = 'other', note = '', now = Date.now() } = {}) {
  const id = itemId == null ? '' : String(itemId);
  if (!id) return null;
  const cleanReason = REASONS.includes(reason) ? reason : 'other';
  const cleanNote = String(note || '')
    .trim()
    .slice(0, REPORT_NOTE_MAX);
  return {
    id: `rpt_${now}_${Math.random().toString(36).slice(2, 8)}`,
    itemId: id,
    itemType: itemType === 'flashcard' ? 'flashcard' : 'quiz',
    reason: cleanReason,
    note: cleanNote,
    reportedAt: now,
    resolved: false,
  };
}

// Add a report to a list, de-duplicating by (itemId, reason): a learner
// re-flagging the same item for the same reason updates the note/timestamp
// rather than piling up duplicates. Returns a NEW array (input untouched).
export function addReport(existing, report) {
  const list = Array.isArray(existing) ? existing.slice() : [];
  if (!report || !report.itemId) return list;
  const dupeIdx = list.findIndex((r) => r && r.itemId === report.itemId && r.reason === report.reason && !r.resolved);
  if (dupeIdx >= 0) {
    list[dupeIdx] = { ...list[dupeIdx], note: report.note, reportedAt: report.reportedAt };
    return list;
  }
  list.push(report);
  return list;
}

// Mark a report resolved (author reviewed it) by report id. New array.
export function resolveReport(existing, reportId) {
  const list = Array.isArray(existing) ? existing : [];
  return list.map((r) => (r && r.id === reportId ? { ...r, resolved: true } : r));
}

// Remove a report by id. New array.
export function removeReport(existing, reportId) {
  const list = Array.isArray(existing) ? existing : [];
  return list.filter((r) => r && r.id !== reportId);
}

// Count of open (unresolved) reports — for the author's review badge.
export function openReportCount(existing) {
  const list = Array.isArray(existing) ? existing : [];
  return list.filter((r) => r && !r.resolved).length;
}
