import { ArrowLeft, BookOpen, Brain, Calendar, Flame, Scroll, Swords, Target, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { rampForPct, tierLabel } from '../../services/accuracyPalette.js';
import { todayDateStr } from '../../services/devotion.js';
import { computeExamPace } from '../../services/examPace.js';
import { computeExamPrediction } from '../../services/examPrediction.js';
import { computeMilestones, computeRetentionCurve } from '../../services/forgettingCurve.js';
import {
  pickWeakestDomain,
  WEAK_DOMAIN_ACCURACY_THRESHOLD,
  WEAK_DOMAIN_MIN_SAMPLE,
} from '../../services/weakDomain.js';

// 25e2: Domain Study screen — cross-cutting per-domain progress bars and
// "Study via Riddles / Scrolls" launchers that filter Quiz/Flashcards by a
// single domain. Aggregates `runHistory[].questionLog[]` either across all
// tomes (Combined) or for a single tome. Exam-weight tags only render in
// single-tome view when `tome.data.metadata.domainWeights` exists; in
// Combined view (or on legacy tomes), the weight tag is hidden.
function DomainStudyScreen({ playerState, setScreen, onMarkVisited, onStudyDomain, onSetExamDate }) {
  const library = playerState.library || [];
  const activeId = playerState.activeTomeId;
  const [selectedTomeId, setSelectedTomeId] = useState(() => activeId || 'combined');

  // Credit a tutorial visit on first mount (the 25g `domain_intro` step
  // autoComplete-condition reads `tutorialVisits.domain_study_visited`).
  useEffect(() => {
    onMarkVisited?.();
  }, []);

  const isCombined = selectedTomeId === 'combined';
  const selectedTome = isCombined ? null : library.find((t) => t.id === selectedTomeId);
  const weights = (!isCombined && selectedTome?.data?.metadata?.domainWeights) || null;

  const stats = useMemo(() => {
    const buckets = {};
    const tomes = isCombined ? library : selectedTome ? [selectedTome] : [];
    tomes.forEach((t) => {
      // Source 1: dungeon-delve question log (the historical Codex source).
      (t.progress?.runHistory || []).forEach((run) => {
        (run.questionLog || []).forEach((q) => {
          const key = q.domain || 'Uncategorized';
          if (!buckets[key]) buckets[key] = { domain: key, total: 0, correct: 0 };
          buckets[key].total += 1;
          if (q.correct) buckets[key].correct += 1;
        });
      });
      // Phase 30e QA #10: source 2 — per-domain answer stats from every
      // non-delve answer path (Quiz, Riddles, Flashcards, Labs). Populated
      // by recordAnswer for tomes that have at least one domain-tagged
      // answer since Phase 30e shipped. Older data is unrecoverable.
      const ds = t.progress?.domainStats || {};
      Object.entries(ds).forEach(([domain, agg]) => {
        if (!agg || typeof agg !== 'object') return;
        const key = domain || 'Uncategorized';
        if (!buckets[key]) buckets[key] = { domain: key, total: 0, correct: 0 };
        buckets[key].total += Number(agg.total) || 0;
        buckets[key].correct += Number(agg.correct) || 0;
      });
    });
    return Object.values(buckets).map((b) => ({ ...b, accuracy: b.total ? b.correct / b.total : 0 }));
  }, [isCombined, library, selectedTome]);

  const sortedStats = useMemo(() => {
    const arr = [...stats];
    arr.sort((a, b) => {
      if (weights) {
        const aw = Number(weights[a.domain] || 0);
        const bw = Number(weights[b.domain] || 0);
        if (aw !== bw) return bw - aw;
      }
      return b.total - a.total;
    });
    return arr;
  }, [stats, weights]);

  // For the Study via buttons: gate visibility on whether the tome being
  // displayed actually has matching items. In Combined view, fall back to
  // the active tome (the player will Quiz/Flashcards against active anyway).
  const studyTome = selectedTome || library.find((t) => t.id === activeId) || null;
  const quizDomainSet = useMemo(() => {
    const set = new Set();
    (studyTome?.data?.quiz || []).forEach((q) => {
      if (q.domain) set.add(q.domain);
    });
    return set;
  }, [studyTome]);
  const flashcardDomainSet = useMemo(() => {
    const set = new Set();
    (studyTome?.data?.flashcards || []).forEach((f) => {
      if (f.domain) set.add(f.domain);
    });
    return set;
  }, [studyTome]);

  const totals = stats.reduce((a, s) => ({ correct: a.correct + s.correct, total: a.total + s.total }), {
    correct: 0,
    total: 0,
  });
  const overallPct = totals.total ? Math.round((totals.correct / totals.total) * 100) : 0;

  // 26a: aggregated confidence calibration across the selected scope.
  // For each bucket (low/med/high), sum total + correct across the
  // tomes in scope, then compute accuracy. Used by the Calibration
  // section to surface over/underconfidence patterns.
  const calibration = useMemo(() => {
    const tomes = isCombined ? library : selectedTome ? [selectedTome] : [];
    const sum = {
      low: { total: 0, correct: 0 },
      med: { total: 0, correct: 0 },
      high: { total: 0, correct: 0 },
    };
    tomes.forEach((t) => {
      const cs = t.progress?.confidenceStats;
      if (!cs) return;
      ['low', 'med', 'high'].forEach((k) => {
        const tile = cs[k] || { total: 0, correct: 0 };
        sum[k].total += tile.total || 0;
        sum[k].correct += tile.correct || 0;
      });
    });
    return sum;
  }, [isCombined, library, selectedTome]);
  const calibrationTotal = calibration.low.total + calibration.med.total + calibration.high.total;

  // 26b: weak-domain auto-targeting. Pick the single domain that most
  // warrants attention so the player has a prominent one-click shortcut.
  // The union of quiz + flashcard domain sets is the candidate filter —
  // a domain with no matching study items in the active tome can't be
  // practiced from this screen, so don't surface it.
  const studyCandidateSet = useMemo(() => {
    const set = new Set();
    quizDomainSet.forEach((d) => set.add(d));
    flashcardDomainSet.forEach((d) => set.add(d));
    return set;
  }, [quizDomainSet, flashcardDomainSet]);
  const weakestDomain = useMemo(
    () => pickWeakestDomain(stats, studyCandidateSet, weights),
    [stats, studyCandidateSet, weights],
  );

  // 26c: exam pace. Read examDate off the selected tome's progress and
  // total quiz items off its data. Recompute daily once per day (today
  // captured at render time is fine — the user reopening this screen on
  // a new calendar day naturally triggers a re-render).
  const examDate = selectedTome?.progress?.examDate || null;
  const quizCount = (selectedTome?.data?.quiz || []).length;
  const examPace = useMemo(
    () => (!isCombined && examDate ? computeExamPace(examDate, quizCount) : null),
    [isCombined, examDate, quizCount],
  );
  const todayIso = todayDateStr();

  // 26d: predicted exam score. Only meaningful with a single tome that
  // declares a domainWeights blueprint. Combined view aggregates across
  // tomes with different blueprints, so prediction would be apples-to-
  // oranges nonsense.
  const examPrediction = useMemo(
    () => (!isCombined && weights ? computeExamPrediction(stats, weights) : null),
    [isCombined, weights, stats],
  );

  // 26h: memory-forecast aggregation. Build a flat list of SRS states
  // for every flashcard in scope (single tome or combined). Cards
  // without state are null entries — the helper filters them out of
  // the average and the UI shows coverage so the player knows the
  // forecast only covers rated scrolls.
  const memoryStateList = useMemo(() => {
    const tomes = isCombined ? library : selectedTome ? [selectedTome] : [];
    const list = [];
    tomes.forEach((t) => {
      const cards = (t.data && t.data.flashcards) || [];
      const map = (t.progress && t.progress.cardProgress) || {};
      cards.forEach((c) => {
        if (c && typeof c.id === 'string') list.push(map[c.id] || null);
      });
    });
    return list;
  }, [isCombined, library, selectedTome]);
  const memoryCoverage = useMemo(() => {
    const total = memoryStateList.length;
    const rated = memoryStateList.filter(Boolean).length;
    return { total, rated };
  }, [memoryStateList]);
  const memoryCurve = useMemo(
    () => computeRetentionCurve(memoryStateList, { maxDays: 30, samples: 31 }),
    [memoryStateList],
  );
  const memoryMilestones = useMemo(() => computeMilestones(memoryStateList), [memoryStateList]);

  // CVD: colorblind-safe accuracy ramp comes from the shared palette helper.
  const cvd = !!playerState.colorblind;

  return (
    <div className="space-y-6">
      <div
        className="p-6 rounded-sm relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-emerald, 6, 78, 59), 0.7) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
          border: '3px double rgba(16, 185, 129, 0.6)',
          boxShadow: '0 0 30px rgba(16, 185, 129, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
        }}
      >
        <div className="absolute top-2 left-2 text-emerald-400 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-emerald-400 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-emerald-400 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-emerald-400 text-sm">⚜</div>

        <div className="flex items-center gap-3 mb-3">
          <BookOpen
            className="w-10 h-10 text-emerald-300"
            style={{ filter: 'drop-shadow(0 0 10px rgba(16, 185, 129, 0.6))' }}
          />
          <div className="flex-1">
            <h2
              className="text-2xl font-bold text-emerald-200 italic"
              style={{ textShadow: '0 0 12px rgba(16, 185, 129, 0.4)' }}
            >
              The Domain Codex
            </h2>
            <div className="text-xs text-emerald-400 tracking-[0.2em] italic">⚜ Mastery by domain ⚜</div>
          </div>
          <button
            onClick={() => setScreen('home')}
            className="px-3 py-2 rounded-sm text-sm border-2 border-amber-700 text-amber-200 italic hover:bg-amber-900/30"
            style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
          >
            <ArrowLeft className="w-4 h-4 inline mr-1" /> Home
          </button>
        </div>

        <div className="mt-4">
          <label className="block text-xs text-emerald-400 italic uppercase tracking-wider mb-1">Tome</label>
          <select
            value={selectedTomeId}
            onChange={(e) => setSelectedTomeId(e.target.value)}
            className="w-full p-2 rounded-sm text-amber-50 italic border-2 border-emerald-700"
            style={{ background: 'rgba(var(--surface-emerald, 6, 78, 59), 0.5)' }}
          >
            <option value="combined">Combined (all tomes)</option>
            {library.map((t) => (
              <option key={t.id} value={t.id}>
                {t.data?.metadata?.title || 'Untitled tome'}
              </option>
            ))}
          </select>
          {isCombined && (
            <div className="text-[10px] italic text-emerald-700 mt-1">
              Aggregating across {library.length} tome{library.length === 1 ? '' : 's'}. Exam-weight percentages hidden
              — different blueprints can't be combined fairly.
            </div>
          )}
          {!isCombined && !weights && (
            <div className="text-[10px] italic text-emerald-700 mt-1">
              This tome has no <code>metadata.domainWeights</code> — the "% of exam" tag is hidden. Regenerate with the
              updated prompt to populate it.
            </div>
          )}
        </div>
      </div>

      {/* 26c: Exam Pace card. Single-tome only — Combined view aggregates
          tomes with different exam dates so a unified pace can't be
          computed honestly. Shows the picker either way (set/clear is
          always available) and the daily-target stats once a date is set. */}
      {!isCombined && selectedTome && onSetExamDate && (
        <div
          className="p-4 rounded-sm"
          style={{
            background:
              'linear-gradient(135deg, rgba(var(--surface-amber-strong, 120, 53, 15), 0.45) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
            border: '2px solid rgba(245, 158, 11, 0.5)',
            boxShadow: '0 0 18px rgba(245, 158, 11, 0.15), inset 0 0 16px rgba(0,0,0,0.4)',
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Calendar
              className="w-5 h-5 text-amber-300"
              style={{ filter: 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.5))' }}
            />
            <h3 className="text-sm font-bold italic text-amber-200 tracking-wider">Exam Pace</h3>
            <div className="flex-1 h-px bg-linear-to-r from-amber-700/40 to-transparent" />
            {examDate && (
              <button
                onClick={() => onSetExamDate(selectedTomeId, null)}
                className="text-[10px] italic px-2 py-0.5 rounded-sm border border-amber-700 text-amber-300 hover:bg-amber-900/40"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <label className="text-xs italic text-amber-300 tracking-wider">Exam Date</label>
            <input
              type="date"
              value={examDate || ''}
              min={todayIso}
              onChange={(e) => onSetExamDate(selectedTomeId, e.target.value || null)}
              className="px-2 py-1 rounded-sm text-amber-50 italic border-2 border-amber-700"
              style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.6)', colorScheme: 'dark' }}
            />
          </div>
          {!examPace && (
            <div className="text-[11px] italic text-amber-700">
              ✦ Set thy exam date to receive a recommended riddles-per-day target.
            </div>
          )}
          {examPace && examPace.status === 'past' && (
            <div className="text-sm italic text-amber-200">
              <span className="font-bold text-red-300">
                Exam was {Math.abs(examPace.daysRemaining)} day{Math.abs(examPace.daysRemaining) === 1 ? '' : 's'} ago.
              </span>{' '}
              Clear or reset the date to plan thy next campaign.
            </div>
          )}
          {examPace && examPace.status === 'today' && (
            <div>
              <div
                className="text-base font-bold italic text-amber-100 mb-1"
                style={{ textShadow: '0 0 6px rgba(245, 158, 11, 0.4)' }}
              >
                ⚔ Exam day — sharpen thy mind.
              </div>
              <div className="text-xs italic text-amber-200">
                {examPace.total} riddle{examPace.total === 1 ? '' : 's'} in this tome. Final review.
              </div>
            </div>
          )}
          {examPace && examPace.status === 'upcoming' && (
            <div className="grid grid-cols-3 gap-2">
              <div
                className="p-2 rounded-sm text-center"
                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(245, 158, 11, 0.4)' }}
              >
                <div className="text-[10px] uppercase tracking-wider italic font-bold text-amber-700">
                  Days Remaining
                </div>
                <div className="text-xl font-bold tabular-nums italic text-amber-200">{examPace.daysRemaining}</div>
              </div>
              <div
                className="p-2 rounded-sm text-center"
                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(245, 158, 11, 0.4)' }}
              >
                <div className="text-[10px] uppercase tracking-wider italic font-bold text-amber-700">Quiz Items</div>
                <div className="text-xl font-bold tabular-nums italic text-amber-200">{examPace.total}</div>
              </div>
              <div
                className="p-2 rounded-sm text-center"
                style={{
                  background: 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.5)',
                  border: '1.5px solid rgba(251, 191, 36, 0.7)',
                  boxShadow: 'inset 0 0 8px rgba(245, 158, 11, 0.15)',
                }}
              >
                <div className="text-[10px] uppercase tracking-wider italic font-bold text-amber-300">Daily Target</div>
                <div
                  className="text-xl font-bold tabular-nums italic text-amber-100"
                  style={{ textShadow: '0 0 6px rgba(245, 158, 11, 0.5)' }}
                >
                  {examPace.dailyTarget}/day
                </div>
              </div>
            </div>
          )}
          {examPace && examPace.status === 'upcoming' && examPace.total === 0 && (
            <div className="text-[10px] italic text-amber-700 mt-2">
              ✦ No riddles in this tome yet — daily target will fill in once the deck has content.
            </div>
          )}
        </div>
      )}

      {/* 26d: Predicted Exam Score card. Single-tome with weights only —
          Combined aggregates incompatible blueprints, and tomes without
          domainWeights can't be weighted against a real exam shape. */}
      {!isCombined &&
        examPrediction &&
        (() => {
          const p = examPrediction;
          const showRing = p.predictedPct !== null;
          const ringPct = showRing ? p.predictedPct : 0;
          const ringColor = !showRing
            ? '#71717a'
            : ringPct >= 85
              ? '#fbbf24'
              : ringPct >= 70
                ? '#10b981'
                : ringPct >= 55
                  ? '#f59e0b'
                  : '#ef4444';
          const confPalette =
            p.confidence === 'high'
              ? { bg: 'rgba(16, 185, 129, 0.35)', border: '#10b981', text: '#a7f3d0' }
              : p.confidence === 'medium'
                ? { bg: 'rgba(245, 158, 11, 0.35)', border: '#fbbf24', text: '#fde68a' }
                : p.confidence === 'low'
                  ? { bg: 'rgba(239, 68, 68, 0.30)', border: '#ef4444', text: '#fecaca' }
                  : { bg: 'rgba(63, 63, 70, 0.45)', border: '#a1a1aa', text: '#e4e4e7' };
          return (
            <div
              className="p-4 rounded-sm"
              style={{
                background:
                  'linear-gradient(135deg, rgba(67, 56, 202, 0.4) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
                border: '2px solid rgba(129, 140, 248, 0.55)',
                boxShadow: '0 0 18px rgba(129, 140, 248, 0.18), inset 0 0 16px rgba(0,0,0,0.4)',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp
                  className="w-5 h-5 text-indigo-300"
                  style={{ filter: 'drop-shadow(0 0 6px rgba(129, 140, 248, 0.6))' }}
                />
                <h3 className="text-sm font-bold italic text-indigo-200 tracking-wider">Predicted Exam Score</h3>
                <div className="flex-1 h-px bg-linear-to-r from-indigo-700/40 to-transparent" />
                {/* Phase 37c QA P4: "no data" badge contradicts the visible
                  Domain-tagged Accuracy panel below when only the sample-
                  threshold gate isn't met (not actually missing data).
                  Rename to "below threshold" so the headline matches the
                  body explanation. */}
                <span
                  className="text-[10px] italic px-2 py-0.5 rounded-sm font-bold tracking-wider"
                  style={{
                    background: confPalette.bg,
                    color: confPalette.text,
                    border: `1px solid ${confPalette.border}`,
                  }}
                >
                  {p.confidence === 'none' ? 'below threshold' : p.confidence}
                </span>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <div
                  className="text-5xl font-bold tabular-nums italic"
                  style={{
                    color: showRing ? confPalette.text : '#a1a1aa',
                    textShadow: showRing ? `0 0 14px ${ringColor}80` : 'none',
                  }}
                >
                  {showRing ? `${ringPct}%` : '—'}
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="h-3 rounded-sm overflow-hidden mb-2" style={{ background: 'rgba(0,0,0,0.45)' }}>
                    {showRing && (
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${ringPct}%`,
                          background: `linear-gradient(to right, ${ringColor}90, ${ringColor})`,
                        }}
                      />
                    )}
                  </div>
                  <div className="text-xs italic text-indigo-200">
                    {/* Phase 37c QA P4: lead with the threshold relationship
                      ("X of Y domains have 5+ samples") so the reader
                      doesn't parse this as "X of Y total domains" when
                      Domain-tagged Accuracy below shows more samples. */}
                    <span className="font-bold">{p.sampledDomains}</span> of{' '}
                    <span className="font-bold">{p.totalDomains}</span> domain{p.totalDomains === 1 ? '' : 's'} have 5+
                    samples · <span className="font-bold">{p.coveragePct}%</span> of exam weight
                  </div>
                  {p.confidence === 'none' && (
                    <div className="text-[10px] italic text-amber-700 mt-1">
                      ✦ Needs 5+ answers per domain across {p.totalDomains} blueprint domain
                      {p.totalDomains === 1 ? '' : 's'}. Overall Mastery below shows your raw accuracy on whatever
                      you&apos;ve answered so far.
                    </div>
                  )}
                  {p.confidence === 'low' && (
                    <div className="text-[10px] italic text-red-300 mt-1">
                      ✦ Low coverage — the estimate is noisy. Sample more domains to firm it up.
                    </div>
                  )}
                  {p.confidence === 'medium' && (
                    <div className="text-[10px] italic text-amber-300 mt-1">
                      ✦ Partial coverage — the missing domains could swing this either way.
                    </div>
                  )}
                  {p.confidence === 'high' && (
                    <div className="text-[10px] italic text-emerald-300 mt-1">
                      ✦ Strong coverage — this estimate reflects most of the exam blueprint.
                    </div>
                  )}
                </div>
              </div>
              {p.missingDomains.length > 0 && (
                <div className="mt-3 pt-3 border-t border-indigo-700/40">
                  <div className="text-[10px] uppercase tracking-wider italic font-bold text-indigo-300 mb-1.5">
                    Domains awaiting samples (≥5 each) — click to study
                  </div>
                  {/* Phase 38b suggestion: missing-domain chips are now
                    one-click deep-links into a domain-filtered Quiz run.
                    Sorted by exam weight (heaviest first) so the most
                    impactful domain is the first option the user sees. */}
                  <div className="flex flex-wrap gap-1.5">
                    {[...p.missingDomains]
                      .sort((a, b) => (b.weight || 0) - (a.weight || 0))
                      .map((m) => (
                        <button
                          key={m.domain}
                          onClick={() => onStudyDomain('quiz', m.domain)}
                          title={`Study ${m.domain} riddles to unlock its prediction slot`}
                          aria-label={`Study ${m.domain} domain — ${m.weight}% of exam weight`}
                          className="text-[10px] italic px-1.5 py-0.5 rounded-sm hover:brightness-125 transition"
                          style={{
                            background: 'rgba(67, 56, 202, 0.5)',
                            border: '1px solid rgba(129, 140, 248, 0.7)',
                            color: '#e0e7ff',
                            cursor: 'pointer',
                          }}
                        >
                          ↗ {m.domain} · {m.weight}%
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      {totals.total === 0 ? (
        <div
          className="text-center py-12 rounded-sm"
          style={{
            background: 'rgba(var(--surface-deep, 10, 6, 4), 0.6)',
            border: '2px dashed rgba(16, 185, 129, 0.4)',
          }}
        >
          <div className="text-emerald-300 italic text-lg mb-2">No domain data yet.</div>
          <div className="text-emerald-700 italic text-sm mb-4">
            Brave the dungeon — every riddle answered tags its domain for this codex.
          </div>
          <button
            onClick={() => setScreen('dungeon')}
            className="px-5 py-3 rounded-sm font-bold italic border-2 border-red-400 text-amber-50 inline-flex items-center gap-2"
            style={{
              background: 'linear-gradient(to bottom, #dc2626 0%, #991b1b 100%)',
              boxShadow: '0 0 18px rgba(220, 38, 38, 0.4)',
            }}
          >
            <Swords className="w-4 h-4" /> Begin a Delve
          </button>
        </div>
      ) : (
        <>
          {/* Overall progress bar */}
          <div
            className="p-4 rounded-sm"
            style={{
              background:
                'linear-gradient(135deg, rgba(var(--surface-emerald, 6, 78, 59), 0.6) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
              border: '2px solid rgba(16, 185, 129, 0.45)',
            }}
          >
            <div className="flex items-baseline justify-between mb-2">
              {/* Phase 33g QA P7: the previous "Overall Mastery (sampled)"
                  label was ambiguous when the same screen's Confidence
                  Calibration block reported a much bigger N. This bar only
                  counts domain-tagged answers (from runHistory + Phase 30e
                  per-domain stats), so name it that explicitly. */}
              <h3 className="text-sm font-bold italic text-emerald-200 tracking-wider">
                Domain-tagged Accuracy
                <span className="ml-2 text-[10px] uppercase tracking-wider font-normal text-emerald-400 not-italic">
                  {totals.total} sample{totals.total === 1 ? '' : 's'}
                </span>
              </h3>
              <div className="text-sm font-bold tabular-nums italic text-emerald-200">
                {totals.correct}/{totals.total} · {overallPct}%
              </div>
            </div>
            <div className="h-3 rounded-sm overflow-hidden" style={{ background: 'rgba(0,0,0,0.45)' }}>
              <div
                className="h-full transition-all"
                style={{ width: `${overallPct}%`, background: rampForPct(overallPct, cvd).fill }}
              />
            </div>
            <div className="text-[10px] italic text-emerald-300/80 mt-2">
              ✦ Counts only riddles + dungeon answers that carried a domain tag. Older un-tagged answers (and any answer
              where the item lacked a `domain` field) aren&apos;t included here — those still appear in Confidence
              Calibration below. Predicted Exam Score uses the same domain-tagged source but additionally requires 5+
              samples per blueprint domain.
            </div>
          </div>

          {/* 26b: Weakest-domain auto-targeting CTA. Only renders when
              one domain qualifies (≥5 attempts, <75% accuracy, has
              matching items in the studied tome). Tie-breaks favor
              higher exam weight, then larger sample size. */}
          {weakestDomain && (
            <div
              className="p-4 rounded-sm"
              style={{
                background:
                  'linear-gradient(135deg, rgba(127, 29, 29, 0.5) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
                border: '2px solid rgba(239, 68, 68, 0.6)',
                boxShadow: '0 0 18px rgba(239, 68, 68, 0.18), inset 0 0 16px rgba(0,0,0,0.4)',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Flame
                  className="w-5 h-5 text-red-300"
                  style={{ filter: 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.6))' }}
                />
                <h3 className="text-sm font-bold italic text-red-200 tracking-wider">Weakest Domain</h3>
                <div className="flex-1 h-px bg-linear-to-r from-red-700/50 to-transparent" />
                <span className="text-[10px] italic text-amber-700 tracking-wider">auto-targeted</span>
              </div>
              <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
                <div
                  className="text-base italic font-bold text-amber-100"
                  style={{ textShadow: '0 0 6px rgba(239, 68, 68, 0.3)' }}
                >
                  {weakestDomain.domain}
                </div>
                <div className="text-sm font-bold tabular-nums italic text-red-200">
                  {weakestDomain.correct}/{weakestDomain.total} · {Math.round(weakestDomain.accuracy * 100)}%
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {quizDomainSet.has(weakestDomain.domain) && (
                  <button
                    onClick={() => onStudyDomain('quiz', weakestDomain.domain)}
                    className="px-3 py-2 rounded-sm text-sm font-bold border-2 border-purple-400 text-purple-100 italic hover:bg-purple-900/40"
                    style={{ background: 'rgba(126, 34, 206, 0.5)' }}
                  >
                    <Target className="w-4 h-4 inline mr-1" /> Practice via Riddles
                  </button>
                )}
                {flashcardDomainSet.has(weakestDomain.domain) && (
                  <button
                    onClick={() => onStudyDomain('flashcards', weakestDomain.domain)}
                    className="px-3 py-2 rounded-sm text-sm font-bold border-2 border-sky-400 text-sky-100 italic hover:bg-sky-900/40"
                    style={{ background: 'rgba(29, 78, 216, 0.5)' }}
                  >
                    <Scroll className="w-4 h-4 inline mr-1" /> Practice via Scrolls
                  </button>
                )}
              </div>
              <div className="text-[10px] italic text-amber-700 mt-2">
                ✦ Picked from domains with ≥{WEAK_DOMAIN_MIN_SAMPLE} attempts and accuracy below{' '}
                {Math.round(WEAK_DOMAIN_ACCURACY_THRESHOLD * 100)}%
                {weights ? ', ties broken by exam weight then sample size' : ', ties broken by sample size'}.
              </div>
            </div>
          )}

          {/* Per-domain rows. Phase 45b: gate the color ramp behind a
              sample-size threshold so a 6/6 = 100% row doesn't read as
              "mastered" when the sample is tiny. Below DOMAIN_VERDICT_MIN_SAMPLE
              attempts, switch to a muted gray palette and show a "needs
              N more for verdict" tag — the raw correct/total + accuracy
              are still displayed, but the visual signal of "high mastery"
              is reserved for samples large enough to mean it. */}
          <div className="space-y-2">
            {sortedStats.map((s) => {
              const DOMAIN_VERDICT_MIN_SAMPLE = 10;
              const lowSample = s.total < DOMAIN_VERDICT_MIN_SAMPLE;
              const pct = Math.round(s.accuracy * 100);
              const rampReal = rampForPct(pct, cvd);
              const rampMuted = {
                bg: 'rgba(63, 63, 70, 0.30)',
                border: 'rgba(161, 161, 170, 0.55)',
                text: '#e4e4e7',
                fill: 'linear-gradient(to right, #71717a, #a1a1aa)',
              };
              const ramp = lowSample ? rampMuted : rampReal;
              const weight = weights ? Number(weights[s.domain] || 0) : 0;
              const showWeight = !!weights && weight > 0;
              const hasQuiz = quizDomainSet.has(s.domain);
              const hasFlashcards = flashcardDomainSet.has(s.domain);
              return (
                <div
                  key={s.domain}
                  className="p-3 rounded-sm"
                  style={{ background: ramp.bg, border: `1.5px solid ${ramp.border}` }}
                >
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <div className="flex items-baseline gap-2 flex-wrap min-w-0">
                      <div className="text-sm italic font-bold truncate" style={{ color: ramp.text }}>
                        {s.domain}
                      </div>
                      {showWeight && (
                        <span
                          className="text-[10px] italic tracking-wider px-1.5 py-0.5 rounded-sm"
                          style={{
                            background: 'rgba(0,0,0,0.4)',
                            color: ramp.text,
                            border: `1px solid ${ramp.border}`,
                          }}
                        >
                          {weight}% of exam
                        </span>
                      )}
                      {lowSample && (
                        <span
                          className="text-[10px] italic tracking-wider px-1.5 py-0.5 rounded-sm"
                          title={`Color ramp gates at ${DOMAIN_VERDICT_MIN_SAMPLE}+ attempts so a tiny perfect sample doesn't read as mastery. Practice ${DOMAIN_VERDICT_MIN_SAMPLE - s.total} more for a stable verdict.`}
                          style={{
                            background: 'rgba(0,0,0,0.4)',
                            color: '#fde68a',
                            border: '1px solid rgba(245, 158, 11, 0.6)',
                          }}
                        >
                          low sample · {DOMAIN_VERDICT_MIN_SAMPLE - s.total} more for verdict
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-bold tabular-nums italic shrink-0" style={{ color: ramp.text }}>
                      {s.correct}/{s.total} · {pct}%{lowSample ? '' : ` · ${tierLabel(pct)}`}
                    </div>
                  </div>
                  <div className="h-2 rounded-sm overflow-hidden mb-2" style={{ background: 'rgba(0,0,0,0.45)' }}>
                    <div className="h-full transition-all" style={{ width: `${pct}%`, background: ramp.fill }} />
                  </div>
                  {(hasQuiz || hasFlashcards) && (
                    <div className="flex flex-wrap gap-2">
                      {hasQuiz && (
                        <button
                          onClick={() => onStudyDomain('quiz', s.domain)}
                          className="px-3 py-1.5 rounded-sm text-xs font-bold border-2 border-purple-400 text-purple-100 italic"
                          style={{ background: 'rgba(126, 34, 206, 0.45)' }}
                        >
                          <Target className="w-3 h-3 inline mr-1" /> Study via Riddles
                        </button>
                      )}
                      {hasFlashcards && (
                        <button
                          onClick={() => onStudyDomain('flashcards', s.domain)}
                          className="px-3 py-1.5 rounded-sm text-xs font-bold border-2 border-sky-400 text-sky-100 italic"
                          style={{ background: 'rgba(29, 78, 216, 0.45)' }}
                        >
                          <Scroll className="w-3 h-3 inline mr-1" /> Study via Scrolls
                        </button>
                      )}
                    </div>
                  )}
                  {!hasQuiz && !hasFlashcards && s.domain !== 'Uncategorized' && (
                    <div className="text-[10px] italic text-amber-700">
                      No riddles or scrolls in {studyTome ? 'this tome' : 'the active tome'} carry this domain tag —
                      only past delve riddles count toward the bar above.
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 26a: Calibration tiles — only render once the player has
              rated at least one riddle's confidence in Quiz mode. Each
              tile shows accuracy for one bucket and a verdict comparing
              expectation vs reality (ideal: high → 90%+, med → ~70%,
              low → ~40-50%). */}
          {calibrationTotal > 0 && (
            <div
              className="p-4 rounded-sm"
              style={{
                background:
                  'linear-gradient(135deg, rgba(var(--surface-emerald, 6, 78, 59), 0.55) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
                border: '2px solid rgba(16, 185, 129, 0.45)',
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">⚖</span>
                <h3 className="text-sm font-bold italic text-emerald-200 tracking-wider">Confidence Calibration</h3>
                <div className="flex-1 h-px bg-linear-to-r from-emerald-700/40 to-transparent" />
                <span className="text-[10px] italic text-amber-700">{calibrationTotal} rated</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {[
                  {
                    key: 'low',
                    label: 'Uncertain',
                    ideal: 50,
                    palette: { bg: 'rgba(63, 63, 70, 0.45)', border: '#a1a1aa', text: '#e4e4e7' },
                  },
                  {
                    key: 'med',
                    label: 'Likely',
                    ideal: 70,
                    palette: {
                      bg: 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.45)',
                      border: '#fbbf24',
                      text: '#fde68a',
                    },
                  },
                  {
                    key: 'high',
                    label: 'Confident',
                    ideal: 90,
                    palette: {
                      bg: 'rgba(var(--surface-emerald, 6, 78, 59), 0.45)',
                      border: '#10b981',
                      text: '#a7f3d0',
                    },
                  },
                ].map(({ key, label, ideal, palette }) => {
                  const tile = calibration[key];
                  const total = tile.total;
                  const correct = tile.correct;
                  const pct = total > 0 ? Math.round((correct / total) * 100) : null;
                  // Verdict: where does observed accuracy sit vs the ideal for this bucket?
                  // Phase 45c: replaced gappy if/else chain with a single
                  // band. Phase 46a: tightened ±15 → ±10 (Confident at
                  // diff=-12 was reading as "calibrated" — the user
                  // expectation per the QA footnote is "within ±10%").
                  // Same signed-diff edges classify over/underconfident.
                  const CAL_BAND = 10;
                  let verdict = null;
                  if (pct !== null && total >= 5) {
                    const diff = pct - ideal;
                    const within = Math.abs(diff) <= CAL_BAND;
                    if (within) verdict = 'calibrated';
                    else if (key === 'high')
                      verdict = 'overconfident'; // pct far below 90 → claimed Confident but missed
                    else if (key === 'low')
                      verdict = diff > 0 ? 'underconfident' : 'calibrated'; // pct far above 50 with Uncertain = underconfident
                    else verdict = diff < 0 ? 'overconfident' : 'underconfident';
                  }
                  // Phase 46a target-band overlay: 0-100% scale with an
                  // emerald band marking ideal±CAL_BAND, plus a marker
                  // for the observed pct. Lets the player see at a glance
                  // whether they're inside the ideal range.
                  const bandLo = Math.max(0, ideal - CAL_BAND);
                  const bandHi = Math.min(100, ideal + CAL_BAND);
                  return (
                    <div
                      key={key}
                      className="p-2.5 rounded-sm"
                      style={{
                        background: palette.bg,
                        border: `1.5px solid ${palette.border}`,
                      }}
                    >
                      <div
                        className="text-[10px] uppercase tracking-wider italic font-bold mb-1"
                        style={{ color: palette.text }}
                      >
                        ✦ {label}
                      </div>
                      <div className="text-lg font-bold tabular-nums italic" style={{ color: palette.text }}>
                        {pct === null ? '—' : `${pct}%`}
                      </div>
                      <div className="text-[10px] italic" style={{ color: palette.text }}>
                        {correct}/{total} correct
                      </div>
                      {pct !== null && (
                        <div
                          className="mt-1.5 relative"
                          style={{
                            height: '8px',
                            background: 'rgba(0,0,0,0.45)',
                            borderRadius: '3px',
                            overflow: 'hidden',
                          }}
                          title={`Ideal ${ideal}% · acceptable band ${bandLo}–${bandHi}% · observed ${pct}%`}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              left: `${bandLo}%`,
                              width: `${bandHi - bandLo}%`,
                              top: 0,
                              bottom: 0,
                              background: 'rgba(16, 185, 129, 0.45)',
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              left: `${ideal}%`,
                              top: 0,
                              bottom: 0,
                              width: '2px',
                              background: 'rgba(16, 185, 129, 0.9)',
                              transform: 'translateX(-1px)',
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              left: `${Math.max(0, Math.min(100, pct))}%`,
                              top: '-1px',
                              bottom: '-1px',
                              width: '3px',
                              background: palette.text,
                              transform: 'translateX(-1.5px)',
                              boxShadow: '0 0 4px rgba(0,0,0,0.6)',
                            }}
                          />
                        </div>
                      )}
                      {verdict && (
                        <div
                          className="text-[10px] italic mt-1.5 px-1.5 py-0.5 rounded-sm text-center font-bold"
                          style={{
                            background:
                              verdict === 'calibrated'
                                ? 'rgba(16, 185, 129, 0.35)'
                                : verdict === 'overconfident'
                                  ? 'rgba(239, 68, 68, 0.35)'
                                  : 'rgba(245, 158, 11, 0.35)',
                            color:
                              verdict === 'calibrated'
                                ? '#a7f3d0'
                                : verdict === 'overconfident'
                                  ? '#fecaca'
                                  : '#fde68a',
                            border: `1px solid ${verdict === 'calibrated' ? '#10b981' : verdict === 'overconfident' ? '#ef4444' : '#fbbf24'}`,
                          }}
                        >
                          {verdict}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] italic text-emerald-700">
                ✦ Ideal: Uncertain ≈ 50%, Likely ≈ 70%, Confident ≈ 90%. Verdicts appear after 5+ ratings per bucket;
                calibrated = within ±10% of the ideal.
              </div>
            </div>
          )}
        </>
      )}

      {/* 26h: Memory Forecast — projects retrievability decay across all
          flashcards in scope (single tome or aggregated across the
          library). The SVG curve covers +0d → +30d; the four milestone
          tiles surface Now / +1d / +7d / +30d for quick scanning. */}
      {memoryCoverage.total > 0 && (
        <div
          className="p-4 rounded-sm"
          style={{
            background:
              'linear-gradient(135deg, rgba(29, 78, 216, 0.4) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.95) 100%)',
            border: '2px solid rgba(59, 130, 246, 0.55)',
            boxShadow: '0 0 18px rgba(59, 130, 246, 0.15), inset 0 0 16px rgba(0,0,0,0.4)',
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Brain
              className="w-5 h-5 text-sky-300"
              style={{ filter: 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.55))' }}
            />
            <h3 className="text-sm font-bold italic text-sky-200 tracking-wider">Memory Forecast</h3>
            <div className="flex-1 h-px bg-linear-to-r from-sky-700/40 to-transparent" />
            {/* Phase 33h: when forecast is locked, hide the redundant
                "X of Y scrolls rated" badge — the same number is in the
                consolidated unlock message below. Keep it visible once
                the curve is drawing. Phase 45a: title attribute clarifies
                that the count is Flashcard SRS ratings only — confidence
                ratings on Quiz riddles don't feed this curve. */}
            {memoryCoverage.rated >= 10 && (
              <span
                className="text-[10px] italic text-amber-700 tracking-wider"
                title="Counts unique Scrolls of Knowledge (Flashcards) rated Again/Hard/Good/Easy. Riddle confidence ratings do not count here."
              >
                {memoryCoverage.rated} of {memoryCoverage.total} scrolls rated
              </span>
            )}
          </div>

          {memoryCoverage.rated === 0 ? (
            <div className="text-xs italic text-amber-700 py-3 text-center">
              ✦ Open Scrolls of Knowledge (Flashcards) and rate cards Again/Hard/Good/Easy to begin charting thy memory
              decay. Riddle confidence ratings do not feed this curve.
            </div>
          ) : memoryCoverage.rated < 10 ? (
            /* Phase 30e / 33h / 38b QA #11 + suggestions: gate the curve
               until the sample is large enough; consolidate progress copy;
               add a deep-link CTA into Flashcards (Scrolls of Knowledge)
               so the user can act on the unlock immediately. Phase 45a:
               clarify that only Flashcard SRS ratings count. */
            <div className="text-xs italic text-sky-300 py-3 text-center space-y-2">
              <div>
                ✦ Rate {10 - memoryCoverage.rated} more scroll{10 - memoryCoverage.rated === 1 ? '' : 's'} in{' '}
                <span className="text-sky-200 font-bold">Scrolls of Knowledge</span> to unlock the decay curve (
                {memoryCoverage.rated}/10 rated). Riddle confidence ratings do not count.
              </div>
              <button
                onClick={() => setScreen('flashcards')}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-sm text-xs italic font-bold hover:brightness-110"
                style={{
                  background: 'linear-gradient(to bottom, #38bdf8 0%, #0369a1 100%)',
                  border: '2px solid rgba(56, 189, 248, 0.7)',
                  color: '#e0f2fe',
                  boxShadow: '0 0 10px rgba(56, 189, 248, 0.35)',
                }}
              >
                <Scroll className="w-3.5 h-3.5" /> Start a {10 - memoryCoverage.rated}-scroll session →
              </button>
            </div>
          ) : (
            <>
              <div className="mb-3 relative pl-8 pr-2" style={{ height: '128px' }}>
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  style={{ width: '100%', height: '100%', display: 'block' }}
                >
                  <defs>
                    <linearGradient id="mem-curve-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <line
                    x1="0"
                    y1="25"
                    x2="100"
                    y2="25"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="0.5"
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1="0"
                    y1="50"
                    x2="100"
                    y2="50"
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth="0.5"
                    strokeDasharray="2,2"
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1="0"
                    y1="75"
                    x2="100"
                    y2="75"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="0.5"
                    vectorEffect="non-scaling-stroke"
                  />
                  {(() => {
                    const validPoints = memoryCurve.filter((p) => p.pct !== null);
                    if (validPoints.length < 2) return null;
                    const maxOffset = memoryCurve[memoryCurve.length - 1].offsetDays || 1;
                    const pts = validPoints.map((p) => `${(p.offsetDays / maxOffset) * 100},${100 - p.pct}`).join(' ');
                    return (
                      <>
                        <polygon points={`0,100 ${pts} 100,100`} fill="url(#mem-curve-grad)" />
                        <polyline
                          points={pts}
                          fill="none"
                          stroke="#60a5fa"
                          strokeWidth="1.4"
                          vectorEffect="non-scaling-stroke"
                        />
                      </>
                    );
                  })()}
                </svg>
                <div className="absolute top-0 left-0 text-[9px] italic text-sky-700 select-none">100%</div>
                <div className="absolute top-1/2 -translate-y-1/2 left-0 text-[9px] italic text-sky-700 select-none">
                  50%
                </div>
                <div className="absolute bottom-0 left-0 text-[9px] italic text-sky-700 select-none">0%</div>
                <div className="absolute -bottom-4 left-8 text-[9px] italic text-sky-700 select-none">Now</div>
                <div className="absolute -bottom-4 right-2 text-[9px] italic text-sky-700 select-none">+30d</div>
              </div>

              <div className="grid grid-cols-4 gap-2 mt-4 mb-2">
                {memoryMilestones.map((m) => {
                  const label = m.offsetDays === 0 ? 'Now' : `+${m.offsetDays}d`;
                  const pct = m.pct === null ? null : Math.round(m.pct);
                  const color =
                    pct === null
                      ? '#71717a'
                      : pct >= 75
                        ? '#a7f3d0'
                        : pct >= 50
                          ? '#fde68a'
                          : pct >= 25
                            ? '#fdba74'
                            : '#fecaca';
                  return (
                    <div
                      key={m.offsetDays}
                      className="p-2 rounded-sm text-center"
                      style={{
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid rgba(59, 130, 246, 0.4)',
                      }}
                    >
                      <div className="text-[10px] uppercase tracking-wider italic font-bold text-sky-700">{label}</div>
                      <div
                        className="text-lg font-bold tabular-nums italic"
                        style={{ color, textShadow: pct !== null ? `0 0 6px ${color}66` : 'none' }}
                      >
                        {pct === null ? '—' : `${pct}%`}
                      </div>
                    </div>
                  );
                })}
              </div>

              {(() => {
                const nowPct = memoryMilestones[0]?.pct;
                const wkPct = memoryMilestones[2]?.pct;
                if (nowPct == null || wkPct == null) return null;
                const nowR = Math.round(nowPct);
                const wkR = Math.round(wkPct);
                const drop = nowR - wkR;
                let msg;
                if (drop >= 25) {
                  msg = `Memory drops sharply — ${nowR}% now → ${wkR}% by next week. Drill due scrolls today to hold the line.`;
                } else if (drop >= 12) {
                  msg = `Steady decay — ${nowR}% now → ${wkR}% over the next week. Light review keeps thee sharp.`;
                } else if (drop >= 4) {
                  msg = `Gentle slope — ${nowR}% now → ${wkR}% over the next week. Maintain thy rhythm.`;
                } else {
                  msg = `Memory holds firm — ${nowR}% now → ${wkR}% over the next week. The Oracle is well-pleased.`;
                }
                return <div className="text-[11px] italic text-sky-200">✦ {msg}</div>;
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default DomainStudyScreen;
