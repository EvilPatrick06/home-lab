// Phase 26c: real exam date + daily target.
//
// Given a YYYY-MM-DD exam date and the total number of items the player
// wants to cover by then (typically the tome's quiz item count), return
// the days remaining and a recommended daily target so the Domain Codex
// can surface a "X riddles/day" hint.
//
// The daily target intentionally includes today as a study day so the
// math doesn't divide-by-zero on exam day and so an exam-tomorrow
// scenario suggests covering half today + half tomorrow rather than
// dumping the entire deck on either day.

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseLocalDate(dateString) {
  const m = ISO_DATE_RE.exec(dateString || '');
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

export function computeExamPace(examDate, totalItems, today = new Date()) {
  const exam = parseLocalDate(examDate);
  if (!exam) return null;
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysRemaining = Math.round((exam.getTime() - todayMidnight.getTime()) / msPerDay);
  const totalRaw = Number(totalItems);
  const total = Number.isFinite(totalRaw) && totalRaw > 0 ? Math.floor(totalRaw) : 0;
  if (daysRemaining < 0) {
    return { daysRemaining, total, dailyTarget: null, status: 'past' };
  }
  const studyDays = Math.max(1, daysRemaining + 1);
  const dailyTarget = total > 0 ? Math.ceil(total / studyDays) : 0;
  const status = daysRemaining === 0 ? 'today' : 'upcoming';
  return { daysRemaining, total, dailyTarget, status };
}
