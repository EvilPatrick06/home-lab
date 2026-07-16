import { ArrowLeft, Check, ChevronRight, Flag, Flame, Loader2, Mic, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import RichContent from '../../components/RichContent.jsx';
import { BloomBadge, DifficultyStars } from '../../components/ui/badges.jsx';
import { FilteredModeBanner } from '../../components/ui/FilteredModeBanner.jsx';
import { gradeAnswer } from '../../services/oracleGrader.js';
import { addReport, makeReport, REPORT_REASONS, reasonLabel } from '../../services/reportProblem.js';
import { loadSession, SESSION_KIND, saveSession } from '../../services/sessionResume.js';
import { speechRecognitionSupported, startDictation } from '../../services/speech.js';
import { speak, ttsSupported } from '../../services/tts.js';

function QuizMode({
  courseSet,
  tomeId,
  questions: questionsProp,
  tomeProgress,
  awardXP,
  recordAnswer,
  checkAchievement,
  playerState,
  updateTomeProgress,
  domainFilter,
  onExitFilter,
  onResumeNotify,
  onGoToLibrary,
}) {
  const [index, setIndex] = useState(0);
  // Phase 35d QA P3: user-facing session progress counter, decoupled from
  // deck position. Increments only on `next()` so a refresh-resume (which
  // restores the index via questionId and may land at a different deck
  // position in the new shuffle) doesn't make the counter jump.
  const [progressCount, setProgressCount] = useState(0);
  // Phase 39a QA round-7 P1: session deck — when restored from saved
  // deckIds, this overrides the parent's freshly-shuffled deck so the
  // resumed index actually points to the saved riddle. Prior fixes saved
  // a single questionId, but findIndex(...questionId) returned -1 in some
  // tomes (missing/non-unique ids) and silently fell through to setIndex
  // with the old deck's index → wrong riddle. Saving the full deck order
  // and reconstructing it is robust to id absence.
  const [sessionDeck, setSessionDeck] = useState(null);
  // Phase 41c round-8 suggestion: brief inline "· resumed" indicator on
  // the riddle counter for ~3s after restore — quieter than the toast.
  const [resumedRecently, setResumedRecently] = useState(false);
  const [answered, setAnswered] = useState(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [streak, setStreak] = useState(0);
  const [grading, setGrading] = useState(false);
  // PHASE-17 17B (M2): abort an in-flight Oracle grade on unmount / resubmit so
  // a verdict that lands after leaving the mode can't record progress.
  const gradeAbortRef = useRef(null);
  useEffect(
    () => () => {
      gradeAbortRef.current?.abort();
    },
    [],
  );
  // 26a: confidence calibration. User rates 'low' / 'med' / 'high' before
  // they see the answer choices; the rating is passed through to
  // recordAnswer so the per-tome confidenceStats can track calibration.
  // Reset to null on every next() so the picker re-appears.
  const [confidence, setConfidence] = useState(null);
  const [showHint, setShowHint] = useState(false);
  // sugg-report-problem: inline defect reporter shown after answering.
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  // sugg-speech-input: optional mic dictation for the free-text answer.
  const [listening, setListening] = useState(false);
  const dictationRef = useRef(null);
  const speechOk = speechRecognitionSupported();
  const toggleDictation = () => {
    if (listening) {
      dictationRef.current?.stop();
      setListening(false);
      return;
    }
    const handle = startDictation({
      onResult: (text, { isFinal }) => {
        if (text) setTextAnswer(text);
        if (isFinal) setListening(false);
      },
      onError: () => setListening(false),
      onEnd: () => setListening(false),
    });
    if (handle) {
      dictationRef.current = handle;
      setListening(true);
    }
  };
  // issue-quiz-dictation-leak (2026-07-15): abort any live dictation on
  // unmount so the mic (and the browser's mic-in-use indicator) is released
  // the moment this screen goes away — and so onResult/onEnd can no longer
  // setState on an unmounted component. Every other resource here (timers,
  // sessions) already cleans up on unmount; the dictation handle was the
  // exception.
  useEffect(
    () => () => {
      dictationRef.current?.abort();
      dictationRef.current = null;
    },
    [],
  );
  // Pre-shuffled deck comes from App level (stable across re-renders / cloud
  // sync). Fall back to the raw quiz array if a parent hasn't provided one.
  // Phase 39a: sessionDeck (when set by a resume) overrides the parent's
  // shuffle so the saved index points to the right riddle.
  // PHASE-40 40B (L15): defensive copy with a stable identity (see FlashcardsMode).
  const baseDeck = useMemo(
    () => (questionsProp?.length ? questionsProp : courseSet.quiz || []).slice(),
    [questionsProp, courseSet],
  );
  // 25e2: Domain Study can launch this mode with a single-domain filter.
  const questions = useMemo(() => {
    const deck = sessionDeck || baseDeck;
    if (!domainFilter) return deck;
    return deck.filter((q) => q && q.domain === domainFilter);
  }, [sessionDeck, baseDeck, domainFilter]);
  const q = questions[index];

  // Phase 33b/35d/37a QA P2/P3/round-6-P1: resume from session.
  //
  // The first version (33b) had a race: the persist effect ran on render 1
  // when `questions` was still empty (parent's shuffle effect hadn't fired
  // yet) and overwrote the saved session with defaults before the restore
  // effect could run. The user observed a partial-restore on refresh: a
  // different riddle (the next in the new queue, since `index=0` after
  // overwrite), a reset progressCount/streak, but the confidence still
  // intact (because confidence was set inside the restore's questionId
  // branch which ran on render 2 after the deck arrived).
  //
  // Fix: introduce a `restored` state flag. The restore effect sets it
  // AFTER applying all restore state updates. The persist effect waits
  // until restored=true before saving anything — so render 1's persist is
  // a no-op, render 2's restore applies the session state, and render 3's
  // persist saves the actually-restored values. progressCount + streak are
  // restored BEFORE the position branch so the questionId early-return
  // doesn't skip them.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (restored) return;
    if (!questions || questions.length === 0) return;
    if (domainFilter) {
      setRestored(true);
      return;
    }
    const saved = loadSession(SESSION_KIND.QUIZ);
    if (!saved) {
      setRestored(true);
      return;
    }
    if (saved.tomeId && tomeId && saved.tomeId !== tomeId) {
      setRestored(true);
      return;
    }
    // Always-applies state first — these were missed by the prior version
    // because the questionId branch early-returned.
    if (saved.confidence) setConfidence(saved.confidence);
    if (typeof saved.progressCount === 'number' && saved.progressCount >= 0) {
      setProgressCount(saved.progressCount);
    }
    if (typeof saved.streak === 'number' && saved.streak >= 0) {
      setStreak(saved.streak);
    }
    // Phase 39a QA P1: prefer saved.deckIds — reconstruct the exact deck
    // order the user was navigating, then the saved index naturally points
    // at the right riddle. Falls back to questionId-in-current-shuffle and
    // then raw-index for legacy sessions that lack deckIds.
    let positioned = false;
    let restoredQuestion = null;
    if (Array.isArray(saved.deckIds) && saved.deckIds.length > 0) {
      const byId = new Map();
      for (const item of baseDeck) {
        if (item?.id) byId.set(item.id, item);
      }
      const ordered = [];
      const seen = new Set();
      for (const id of saved.deckIds) {
        const item = byId.get(id);
        if (item && !seen.has(id)) {
          ordered.push(item);
          seen.add(id);
        }
      }
      for (const item of baseDeck) {
        if (item?.id && !seen.has(item.id)) {
          ordered.push(item);
          seen.add(item.id);
        }
      }
      if (ordered.length > 0) {
        setSessionDeck(ordered);
        const wantedIdx =
          typeof saved.index === 'number' && saved.index >= 0 && saved.index < ordered.length ? saved.index : 0;
        setIndex(wantedIdx);
        restoredQuestion = ordered[wantedIdx];
        positioned = true;
      }
    }
    if (!positioned && saved.questionId) {
      const pos = questions.findIndex((q) => q?.id === saved.questionId);
      if (pos >= 0) {
        setIndex(pos);
        restoredQuestion = questions[pos];
        positioned = true;
      }
    }
    if (!positioned && typeof saved.index === 'number' && saved.index >= 0 && saved.index < questions.length) {
      setIndex(saved.index);
      restoredQuestion = questions[saved.index];
      positioned = true;
    }
    // Phase 38c suggestion: fire a toast so the user knows the
    // refresh-resume worked (otherwise the silent restore looks
    // suspiciously like a fresh start). Phase 41c also flips an inline
    // "· resumed" indicator on the riddle counter that auto-clears after
    // ~3s — quieter signal that doesn't depend on the toast.
    if (positioned) {
      const restoredProgress = typeof saved.progressCount === 'number' ? saved.progressCount : 0;
      const restoredStreak = typeof saved.streak === 'number' ? saved.streak : 0;
      onResumeNotify?.({
        kind: 'quiz',
        progressCount: restoredProgress,
        streak: restoredStreak,
        total: questions.length,
        riddleId: restoredQuestion?.id || null,
      });
      setResumedRecently(true);
      setTimeout(() => setResumedRecently(false), 3000);
    }
    setRestored(true);
  }, [questions, baseDeck, tomeId, domainFilter, restored]);

  // Phase 30b/33b/35d/37a/39a QA #2/P3/round-6-P1/round-7-P1: persist QUIZ
  // session — gated on the `restored` flag so render-1 persist can't
  // overwrite the saved session before render-2 restore reads it. Saves
  // the full deck of question IDs so the resume can reconstruct the exact
  // deck order on next refresh (prior versions only saved a single
  // questionId which silently fell back to wrong-position when not found).
  useEffect(() => {
    if (!restored) return;
    if (domainFilter) return;
    saveSession(SESSION_KIND.QUIZ, {
      tomeId: tomeId ?? null,
      index,
      questionId: questions[index]?.id ?? null,
      deckIds: questions.map((qq) => qq?.id || null),
      confidence,
      progressCount,
      streak,
    });
  }, [restored, index, tomeId, domainFilter, questions, confidence, progressCount, streak]);

  // Phase 30g QA #12: keyboard answers for Riddles. 1/2/3 picks confidence;
  // after confidence is set, 1-9 or A-Z indexes MC options, T/F picks
  // true/false. The listener reads from a ref that's updated every render
  // (assigned AFTER handleAnswer is declared, below this block, via
  // refreshKeyRef()) so the listener always sees the latest closure.
  // Inputs/textareas are skipped so typing in the fill-in-blank doesn't
  // misfire.
  const keyRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      const s = keyRef.current;
      if (!s?.q) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Phase 43d round-10 P4: Enter / Space advances on the explanation
      // screen so keyboard users can chain riddles without mousing.
      if (s.answered) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          s.next?.();
        }
        return;
      }
      if (!s.confidence) {
        if (e.key === '1') {
          e.preventDefault();
          s.setConfidence('low');
          return;
        }
        if (e.key === '2') {
          e.preventDefault();
          s.setConfidence('med');
          return;
        }
        if (e.key === '3') {
          e.preventDefault();
          s.setConfidence('high');
          return;
        }
        return;
      }
      const key = e.key.toLowerCase();
      if (s.isMC) {
        let idx = -1;
        if (/^[1-9]$/.test(key)) idx = Number(key) - 1;
        else if (/^[a-z]$/.test(key)) idx = key.charCodeAt(0) - 97;
        if (idx >= 0 && idx < s.q.options.length) {
          e.preventDefault();
          s.handleAnswer?.(idx === s.q.correctIndex);
        }
      } else if (s.isTF) {
        if (key === 't') {
          e.preventDefault();
          s.handleAnswer?.(s.q.correctAnswer === true);
        } else if (key === 'f') {
          e.preventDefault();
          s.handleAnswer?.(s.q.correctAnswer === false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleAnswer = (correct, extra = {}) => {
    setAnswered({ correct, confidence, ...extra });
    recordAnswer(correct, q, { confidence });
    updateTomeProgress((prev) => ({ quizAnswered: (prev.quizAnswered || 0) + 1 })); // 17D functional form
    const totalQuizAcrossLib = playerState.library.reduce((s, t) => s + (t.progress?.quizAnswered || 0), 0) + 1;
    if (totalQuizAcrossLib >= 100) checkAchievement('quiz_warrior');
    if (correct) {
      checkAchievement('first_quiz');
      awardXP(10 + streak);
      // PHASE-17 17C: streak math + achievement checks hoisted out of the
      // setStreak updater (`streak` from the render closure is current in this
      // event handler — awardXP above already relies on it).
      const ns = streak + 1;
      setStreak(ns);
      if (ns >= 10) checkAchievement('streak_10');
      if (ns >= 25) checkAchievement('perfectionist');
      if (ns >= 50) checkAchievement('streak_50');
      if (ns >= 100) checkAchievement('streak_100');
    } else setStreak(0);
  };

  const submitFillBlankWithOracle = async () => {
    if (!textAnswer.trim() || grading) return;
    gradeAbortRef.current?.abort();
    const controller = new AbortController();
    gradeAbortRef.current = controller;
    setGrading(true);
    let verdict;
    try {
      verdict = await gradeAnswer({
        question: q.question,
        expectedAnswer: q.correctAnswer,
        acceptedAnswers: q.acceptedAnswers,
        userAnswer: textAnswer,
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted || err?.name === 'AbortError') return; // unmounted / superseded — record nothing
      throw err;
    }
    if (controller.signal.aborted) return;
    setGrading(false);
    handleAnswer(verdict.correct, {
      oracleFeedback: verdict.feedback,
      source: verdict.source,
      fallbackReason: verdict.fallbackReason,
    });
  };

  // Override the verdict from the Oracle. Adjusts streak and counters since
  // we already recorded the original verdict.
  const overrideVerdict = (newCorrect) => {
    // PHASE-17 17C: side effects hoisted out of the setAnswered updater (it must
    // stay pure — StrictMode double-invokes it, double-recording the override).
    if (!answered || answered.correct === newCorrect) return;
    // Re-record so totalCorrect / streak stay accurate.
    recordAnswer(newCorrect, q);
    if (newCorrect) {
      // Going wrong → correct: refund some XP, restart streak at 1.
      awardXP(10);
      setStreak(1);
    } else {
      // correct → wrong: zero streak.
      setStreak(0);
    }
    setAnswered((prev) => (prev ? { ...prev, correct: newCorrect, overridden: true } : prev));
  };

  const handleSkip = () => {
    setAnswered({ correct: false, skipped: true });
    // Skip is "I don't know" — record without a confidence bucket so it
    // doesn't muddy the calibration analysis.
    recordAnswer(false, q);
    updateTomeProgress((prev) => ({ quizAnswered: (prev.quizAnswered || 0) + 1 })); // 17D functional form
    setStreak(0);
  };

  // Optional per-question hint hides again whenever the riddle changes.
  useEffect(() => {
    setShowHint(false);
  }, [index]);

  const submitReport = (reason) => {
    if (!q?.id) return;
    const report = makeReport({ itemId: q.id, itemType: 'quiz', reason });
    if (!report) return;
    updateTomeProgress((prev) => ({ reportedProblems: addReport(prev.reportedProblems, report) }));
    setReportOpen(false);
    setReported(true);
  };

  const next = () => {
    setAnswered(null);
    setTextAnswer('');
    setConfidence(null);
    setReportOpen(false);
    setReported(false);
    setIndex((index + 1) % questions.length);
    // Phase 35d QA P3: bump the user-facing counter only on explicit
    // advance, never on index restoration. This is what keeps "Riddle X of N"
    // stable across a refresh-resume.
    setProgressCount((p) => p + 1);
  };

  // Phase 30g / 43d: keep keyRef in sync with the latest closure values so
  // the keydown listener always uses fresh handleAnswer / next / state.
  keyRef.current = {
    q,
    isMC: q?.options && Array.isArray(q.options),
    isTF: q && q.type === 'truefalse',
    answered,
    confidence,
    handleAnswer,
    next,
    setConfidence,
  };

  if (!q)
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        {domainFilter && <FilteredModeBanner domainFilter={domainFilter} onExitFilter={onExitFilter} accent="purple" />}
        <div className="text-center py-12 text-amber-600 italic">
          {domainFilter ? `No riddles tagged "${domainFilter}" in this tome.` : 'No riddles in this tome.'}
        </div>
        {/* Phase 30d QA #7: explicit "back" affordance instead of just the header Hearth. */}
        {domainFilter && (
          <button
            onClick={() => onExitFilter?.()}
            className="w-full py-3 px-4 rounded-sm italic border-2 border-amber-700 text-amber-200"
            style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
          >
            <ArrowLeft className="w-4 h-4 inline mr-2" /> Clear Filter
          </button>
        )}
        {/* 19E (L17): unfiltered dead-end gets a path to add content. */}
        {!domainFilter && (
          <button
            onClick={() => onGoToLibrary?.()}
            className="w-full py-3 px-4 rounded-sm italic border-2 border-amber-700 text-amber-200"
            style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
          >
            📜 Visit the Grand Library — import or forge a tome with riddles
          </button>
        )}
      </div>
    );

  const isMC = q.options && Array.isArray(q.options);
  const isTF = q.type === 'truefalse';
  const isFIB = q.type === 'fillblank' || q.type === 'fill_in_blank';

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <h2 className="sr-only">Quiz</h2>
      {domainFilter && <FilteredModeBanner domainFilter={domainFilter} onExitFilter={onExitFilter} accent="purple" />}
      <div className="flex justify-between items-center text-sm text-amber-600 italic flex-wrap gap-2">
        <span className="flex items-center gap-2 flex-wrap">
          🔮 Riddle {Math.min(progressCount + 1, questions.length)} of {questions.length}
          {resumedRecently && (
            <span
              className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm not-italic ml-1"
              style={{
                background: 'rgba(var(--surface-emerald, 6, 78, 59), 0.45)',
                border: '1px solid rgba(16, 185, 129, 0.6)',
                color: '#a7f3d0',
              }}
              aria-live="polite"
            >
              · resumed
            </span>
          )}
          {/* Phase 35c QA P4: per-riddle difficulty only. The tome-avg
              fallback (Phase 32e) was visually identical across every riddle
              and gave the misleading impression that the difficulty was
              per-item, so the QA reporter (correctly) flagged it as worse
              than nothing. Drop the fallback; chip is hidden when the
              riddle lacks a per-item rating. */}
          {typeof q.difficulty === 'number' && <DifficultyStars value={q.difficulty} />}
          {q.bloomLevel && <BloomBadge level={q.bloomLevel} />}
        </span>
        <span className="flex items-center gap-1">
          <Flame className="w-4 h-4 text-orange-400" /> Streak: {streak}
        </span>
      </div>
      {/* Phase 30g QA #12: keyboard hotkey legend. Hidden once the riddle
          is answered to reduce noise. */}
      {!answered && (
        <div className="text-[11px] italic text-amber-100/60 text-center">
          {!confidence
            ? '⌨ Hotkeys: 1 Uncertain · 2 Likely · 3 Confident'
            : q.options && Array.isArray(q.options)
              ? '⌨ Hotkeys: 1–' +
                q.options.length +
                ' or A–' +
                String.fromCharCode(64 + q.options.length) +
                ' to pick an answer'
              : q.type === 'truefalse'
                ? '⌨ Hotkeys: T for True · F for False'
                : ''}
        </div>
      )}
      <div
        className="rounded-sm p-6 relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-purple, 31, 12, 41), 0.85) 0%, rgba(15, 6, 20, 0.95) 100%)',
          border: '3px double rgba(126, 34, 206, 0.6)',
          boxShadow: '0 0 30px rgba(168, 85, 247, 0.25), inset 0 0 25px rgba(0,0,0,0.5)',
        }}
      >
        {/* Phase 33f / 35c / 36b / 40c QA P6, P4, P2, round-8: render the
            chip row. 40c hides the difficulty + Bloom placeholders entirely
            when BOTH are absent (was: always showing greyed-out placeholders
            on every riddle, which the round-8 QA called visual noise). When
            one of the two has data, the other still shows its placeholder
            so the asymmetry is visible. Domain still shows a placeholder
            when missing — it's a higher-signal slot. */}
        {(() => {
          const hasDifficulty = typeof q.difficulty === 'number';
          const hasBloom = !!q.bloomLevel;
          const hideOptionalChips = !hasDifficulty && !hasBloom;
          return (
            <div className="flex items-center gap-2 flex-wrap mb-4 pb-3 border-b border-purple-700/40">
              {q.domain ? (
                <span
                  className="text-[10px] italic uppercase tracking-wider px-2 py-0.5 rounded-sm font-bold"
                  style={{
                    background: 'rgba(126, 34, 206, 0.35)',
                    border: '1px solid rgba(168, 85, 247, 0.6)',
                    color: '#e9d5ff',
                  }}
                >
                  {q.domain}
                </span>
              ) : (
                <span
                  className="text-[10px] italic uppercase tracking-wider px-2 py-0.5 rounded-sm"
                  style={{
                    background: 'rgba(63, 63, 70, 0.25)',
                    border: '1px dashed rgba(120, 113, 108, 0.45)',
                    color: 'rgba(214, 211, 209, 0.7)',
                  }}
                  title="No domain tagged on this riddle"
                >
                  domain —
                </span>
              )}
              {hasDifficulty ? (
                <span
                  className="flex items-center gap-1 px-2 py-0.5 rounded-sm"
                  style={{
                    background: 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.35)',
                    border: '1px solid rgba(245, 158, 11, 0.5)',
                  }}
                >
                  <DifficultyStars value={q.difficulty} />
                </span>
              ) : (
                !hideOptionalChips && (
                  <span
                    className="flex items-center gap-1 px-2 py-0.5 rounded-sm"
                    style={{
                      background: 'rgba(63, 63, 70, 0.2)',
                      border: '1px dashed rgba(120, 113, 108, 0.4)',
                      color: 'rgba(214, 211, 209, 0.7)',
                    }}
                    title="Per-riddle difficulty not rated by the tome author"
                  >
                    <span className="text-xs tabular-nums">▱▱▱▱▱</span>
                    <span className="text-[9px] italic">not rated</span>
                  </span>
                )
              )}
              {hasBloom ? (
                <BloomBadge level={q.bloomLevel} />
              ) : (
                !hideOptionalChips && (
                  <span
                    className="text-[10px] uppercase tracking-wider italic px-2 py-0.5 rounded-sm"
                    style={{
                      background: 'rgba(63, 63, 70, 0.2)',
                      border: '1px dashed rgba(120, 113, 108, 0.4)',
                      color: 'rgba(214, 211, 209, 0.7)',
                    }}
                    title="Bloom's-level not tagged on this riddle"
                  >
                    bloom —
                  </span>
                )
              )}
            </div>
          );
        })()}
        <RichContent as="div" text={q.question} className="text-lg text-amber-50 mb-6 italic" />
        {!answered && q.hint && (
          <div className="mb-4 -mt-2">
            {showHint ? (
              <div className="text-sm text-amber-200/80 italic">
                <span className="text-amber-400 not-italic">Hint: </span>
                <RichContent as="span" text={q.hint} />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowHint(true)}
                className="px-3 py-1 rounded-sm border border-amber-700 text-amber-200 italic text-xs hover:bg-amber-900/30"
              >
                Show hint
              </button>
            )}
          </div>
        )}
        {ttsSupported() && (
          <button
            type="button"
            onClick={() => speak(q.question)}
            aria-label="Read the riddle aloud"
            title="Read aloud"
            className="text-amber-500 hover:text-amber-300 text-sm mb-4"
          >
            🔊 Read aloud
          </button>
        )}
        {/* 26a: confidence calibration. Gate the answer choices behind a
            confidence rating so we can compare "how sure I was" vs "did I
            get it right". The rating locks once picked and is shown as a
            badge above the choices. Skipping the riddle bypasses this
            (no rating recorded — skip is "I don't know" and shouldn't
            muddy calibration math). */}
        {!answered && !confidence && (
          <div className="space-y-3">
            <div className="text-xs text-amber-100/70 italic mb-2 text-center">
              Before answering, how sure art thou?
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setConfidence('low')}
                className="p-3 rounded-sm font-bold border-2 border-zinc-400 text-zinc-200 italic"
                style={{ background: 'rgba(63, 63, 70, 0.45)' }}
              >
                ✦ Uncertain
              </button>
              <button
                onClick={() => setConfidence('med')}
                className="p-3 rounded-sm font-bold border-2 border-amber-400 text-amber-200 italic"
                style={{ background: 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.45)' }}
              >
                ✦ Likely
              </button>
              <button
                onClick={() => setConfidence('high')}
                className="p-3 rounded-sm font-bold border-2 border-emerald-400 text-emerald-200 italic"
                style={{ background: 'rgba(var(--surface-emerald, 6, 78, 59), 0.45)' }}
              >
                ✦ Confident
              </button>
            </div>
          </div>
        )}
        {!answered && confidence && (
          <div className="mb-3 flex items-center gap-2 text-[11px] italic">
            <span className="text-amber-700">Thy confidence:</span>
            <span
              className="px-2 py-0.5 rounded-sm border italic font-bold"
              style={
                confidence === 'high'
                  ? {
                      borderColor: '#10b981',
                      color: '#a7f3d0',
                      background: 'rgba(var(--surface-emerald, 6, 78, 59), 0.35)',
                    }
                  : confidence === 'med'
                    ? {
                        borderColor: '#fbbf24',
                        color: '#fde68a',
                        background: 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.35)',
                      }
                    : { borderColor: '#a1a1aa', color: '#e4e4e7', background: 'rgba(63, 63, 70, 0.35)' }
              }
            >
              {confidence === 'high' ? 'Confident' : confidence === 'med' ? 'Likely' : 'Uncertain'}
            </span>
          </div>
        )}
        {!answered && confidence && isMC && (
          <div className="space-y-2">
            {q.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleAnswer(i === q.correctIndex)}
                className="w-full text-left p-3 rounded-sm border-2 transition text-amber-50"
                style={{
                  background: 'rgba(var(--surface-purple, 31, 12, 41), 0.6)',
                  borderColor: 'rgba(126, 34, 206, 0.5)',
                }}
              >
                <span className="text-purple-400 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                {opt}
              </button>
            ))}
          </div>
        )}
        {!answered && confidence && isTF && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleAnswer(q.correctAnswer === true)}
              className="p-4 rounded-sm font-bold border-2 border-emerald-400 text-emerald-200 italic"
              style={{ background: 'rgba(var(--surface-emerald, 6, 78, 59), 0.4)' }}
            >
              ⚖ Verily True ⚖
            </button>
            <button
              onClick={() => handleAnswer(q.correctAnswer === false)}
              className="p-4 rounded-sm font-bold border-2 border-red-400 text-red-200 italic"
              style={{ background: 'rgba(127, 29, 29, 0.4)' }}
            >
              ⚖ A Falsehood ⚖
            </button>
          </div>
        )}
        {!answered && confidence && isFIB && (
          <div className="space-y-3">
            <input
              type="text"
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && textAnswer.trim() && !grading) submitFillBlankWithOracle();
              }}
              disabled={grading}
              placeholder="Inscribe thy answer..."
              className="w-full p-3 rounded-sm border-2 focus:outline-hidden italic text-amber-50"
              style={{
                background: 'rgba(var(--surface-purple, 31, 12, 41), 0.6)',
                borderColor: 'rgba(126, 34, 206, 0.5)',
              }}
              autoFocus
            />
            {speechOk && (
              <button
                type="button"
                onClick={toggleDictation}
                aria-pressed={listening}
                aria-label={listening ? 'Stop dictation' : 'Dictate answer'}
                className={`px-3 py-2 rounded-sm text-xs italic border-2 flex items-center gap-1 ${listening ? 'border-red-400 text-red-200' : 'border-purple-500 text-purple-200'}`}
                style={{ background: 'rgba(var(--surface-purple, 31, 12, 41), 0.6)' }}
              >
                <Mic className="w-4 h-4" /> {listening ? 'Listening... (tap to stop)' : 'Dictate'}
              </button>
            )}
            <button
              onClick={submitFillBlankWithOracle}
              disabled={!textAnswer.trim() || grading}
              className="w-full py-3 font-bold rounded-sm disabled:opacity-50 text-amber-50 border-2 border-purple-400 italic flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(to bottom, #a855f7 0%, #6b21a8 100%)',
                boxShadow: '0 0 20px rgba(168, 85, 247, 0.4)',
              }}
            >
              {grading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> The Oracle deliberates...
                </>
              ) : (
                'Submit Thy Answer'
              )}
            </button>
          </div>
        )}
        {answered && (
          <div className="space-y-3">
            <div
              role="status"
              className="p-4 rounded-sm border-2 space-y-2"
              style={{
                background: answered.correct
                  ? 'rgba(var(--surface-emerald, 6, 78, 59), 0.5)'
                  : 'rgba(127, 29, 29, 0.5)',
                borderColor: answered.correct ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)',
                borderStyle: answered.correct ? 'solid' : 'dashed', // 19C: non-color cue
              }}
            >
              <div className="font-bold flex items-center gap-2 italic flex-wrap">
                {answered.correct ? (
                  <Check className="w-5 h-5 text-emerald-400" />
                ) : (
                  <X className="w-5 h-5 text-red-400" />
                )}
                <span>
                  {answered.correct
                    ? '⚔ Strike True! ⚔'
                    : answered.skipped
                      ? '↳ Skipped — Added to Tome of Failures'
                      : '✗ The Blow Falters'}
                </span>
                {answered.overridden && (
                  <span className="text-xs px-2 py-0.5 rounded-sm border border-amber-400/60 text-amber-200 italic">
                    overridden
                  </span>
                )}
                {answered.source === 'oracle' && (
                  <span className="text-xs px-2 py-0.5 rounded-sm border border-purple-400/60 text-purple-200 italic flex items-center gap-1">
                    <Wand2 className="w-3 h-3" /> Graded by the Oracle
                  </span>
                )}
                {answered.source === 'fallback' && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-sm border border-amber-700/60 text-amber-300 italic"
                    title={answered.fallbackReason || ''}
                  >
                    Tome match (Oracle silent)
                  </span>
                )}
                {answered.confidence &&
                  (() => {
                    // 26a: show the calibration result inline — whether the
                    // confidence rating matched the outcome. Surfaces over-
                    // and under-confidence in real time.
                    const calibrationOk =
                      (answered.confidence === 'high' && answered.correct) ||
                      (answered.confidence === 'low' && !answered.correct);
                    const mismatch =
                      (answered.confidence === 'high' && !answered.correct) ||
                      (answered.confidence === 'low' && answered.correct);
                    const label =
                      answered.confidence === 'high'
                        ? 'Confident'
                        : answered.confidence === 'med'
                          ? 'Likely'
                          : 'Uncertain';
                    const tag = mismatch
                      ? answered.confidence === 'high'
                        ? '· overconfident'
                        : '· underconfident'
                      : calibrationOk
                        ? '· calibrated'
                        : '';
                    return (
                      <span
                        className="text-xs px-2 py-0.5 rounded-sm border italic flex items-center gap-1"
                        style={
                          answered.confidence === 'high'
                            ? {
                                borderColor: '#10b981',
                                color: '#a7f3d0',
                                background: 'rgba(var(--surface-emerald, 6, 78, 59), 0.35)',
                              }
                            : answered.confidence === 'med'
                              ? {
                                  borderColor: '#fbbf24',
                                  color: '#fde68a',
                                  background: 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.35)',
                                }
                              : { borderColor: '#a1a1aa', color: '#e4e4e7', background: 'rgba(63, 63, 70, 0.35)' }
                        }
                      >
                        ✦ {label} {tag}
                      </span>
                    );
                  })()}
              </div>
              {answered.oracleFeedback && (
                <p className="text-sm text-amber-100/90 italic leading-relaxed">{answered.oracleFeedback}</p>
              )}
              {q.explanation && (
                <div className="text-sm text-amber-100/70 italic">
                  <span className="text-purple-300">From the tome:</span> <RichContent as={null} text={q.explanation} />
                </div>
              )}
              {!answered.correct && q.correctAnswer !== undefined && (
                <p className="text-sm text-amber-100/70 italic">
                  The truth was:{' '}
                  <span className="text-emerald-300">
                    {isMC ? q.options[q.correctIndex] : isTF ? String(q.correctAnswer) : q.correctAnswer}
                  </span>
                </p>
              )}
            </div>
            {isFIB && (answered.source === 'oracle' || answered.source === 'fallback') && (
              <div className="flex gap-2 flex-wrap">
                {!answered.correct && (
                  <button
                    onClick={() => overrideVerdict(true)}
                    className="flex-1 py-2 rounded-sm text-xs italic border-2 border-emerald-500 text-emerald-200 flex items-center justify-center gap-1"
                    style={{ background: 'rgba(var(--surface-emerald, 6, 78, 59), 0.4)' }}
                  >
                    <Check className="w-3 h-3" /> Mark as correct
                  </button>
                )}
                {answered.correct && (
                  <button
                    onClick={() => overrideVerdict(false)}
                    className="flex-1 py-2 rounded-sm text-xs italic border-2 border-red-500 text-red-200 flex items-center justify-center gap-1"
                    style={{ background: 'rgba(127, 29, 29, 0.4)' }}
                  >
                    <X className="w-3 h-3" /> Mark as wrong
                  </button>
                )}
              </div>
            )}
            {/* sugg-report-problem: flag a defective riddle for the author. */}
            <div className="flex flex-col gap-2">
              {!reportOpen && !reported && (
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="self-start px-3 py-1.5 rounded-sm text-[11px] italic border border-amber-800/70 text-amber-400/80 hover:text-amber-200 flex items-center gap-1"
                >
                  <Flag className="w-3 h-3" /> Report a problem with this riddle
                </button>
              )}
              {reported && (
                <p className="self-start text-[11px] italic text-emerald-300 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Reported — thank you. The tome author can review it.
                </p>
              )}
              {reportOpen && (
                <div
                  className="p-3 rounded-sm border border-amber-800/70"
                  style={{ background: 'rgba(var(--surface-deep, 10, 6, 4), 0.6)' }}
                >
                  <p className="text-[11px] italic text-amber-200 mb-2">What's wrong with this riddle?</p>
                  <div className="flex flex-wrap gap-2">
                    {REPORT_REASONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => submitReport(reason)}
                        className="px-2.5 py-1 rounded-sm text-[11px] italic border border-amber-700 text-amber-100 hover:border-amber-400"
                      >
                        {reasonLabel(reason)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setReportOpen(false)}
                      className="px-2.5 py-1 rounded-sm text-[11px] italic text-amber-500 hover:text-amber-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={next}
              className="w-full py-3 font-bold rounded-sm text-amber-50 border-2 border-purple-400 italic"
              style={{
                background: 'linear-gradient(to bottom, #a855f7 0%, #6b21a8 100%)',
                boxShadow: '0 0 20px rgba(168, 85, 247, 0.4)',
              }}
            >
              Next Riddle →
            </button>
          </div>
        )}
        {!answered && (
          <div className="mt-3 flex justify-end">
            <button
              onClick={handleSkip}
              className="px-3 py-1.5 rounded-sm text-xs border-2 border-red-800 text-red-300 hover:bg-red-900/30 italic flex items-center gap-1"
              style={{ background: 'rgba(var(--surface-red, 41, 12, 12), 0.6)' }}
              title="Skip — counts as wrong, breaks streak"
            >
              <ChevronRight className="w-3 h-3" /> Skip Riddle
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default QuizMode;
