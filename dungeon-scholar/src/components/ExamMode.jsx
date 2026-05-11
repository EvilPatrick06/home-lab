// Phase 26e: full-length timed practice exam.
//
// Three phases: setup → inProgress → results. Setup picks a length,
// inProgress is the actual exam (one question at a time, prev/next
// navigation, prominent countdown, auto-submit on timeout), results
// shows the score and per-domain breakdown plus a collapsible list of
// missed riddles with their explanations.
//
// Exam answers are intentionally NOT routed through the global
// recordAnswer flow. Practice exams are snapshot events that should not
// inflate lifetime totalAnswered / mistakeVault / per-domain stats —
// those reflect ongoing dungeon-and-quiz study, not mock test taking.
// The results live on tome.progress.practiceExams as a capped history.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Clock, ArrowLeft, ArrowRight, Award, AlertTriangle } from 'lucide-react';
import {
  EXAM_PRESETS,
  pickStratifiedSample,
  gradeExamItem,
  summarizeExamResults,
} from '../services/examSession.js';

function formatClock(sec) {
  const s = Math.max(0, sec | 0);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function ExamMode({ courseSet, tomeProgress, updateTomeProgress, awardXP, onExit }) {
  const weights = courseSet?.metadata?.domainWeights || null;
  const quizPool = useMemo(
    () => (courseSet?.quiz || []).filter(q => q && typeof q.id === 'string'),
    [courseSet],
  );

  const [phase, setPhase] = useState('setup');
  const [sample, setSample] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [resultsSummary, setResultsSummary] = useState(null);
  const [textInput, setTextInput] = useState('');

  const startedAtRef = useRef(null);
  const totalSecondsRef = useRef(0);
  const submitExamRef = useRef(null);

  const startExam = (preset) => {
    const target = Math.min(preset.count, quizPool.length);
    if (target < 5) return;
    const picked = pickStratifiedSample(quizPool, weights || {}, target);
    if (picked.length === 0) return;
    setSample(picked);
    setAnswers(new Array(picked.length).fill(null));
    setCurrentIdx(0);
    setSecondsLeft(preset.minutes * 60);
    totalSecondsRef.current = preset.minutes * 60;
    startedAtRef.current = Date.now();
    setTextInput('');
    setShowSubmitConfirm(false);
    setPhase('inProgress');
  };

  const doSubmit = (reason = 'submitted') => {
    const summary = summarizeExamResults(sample, answers);
    const elapsedSec = Math.max(0, totalSecondsRef.current - secondsLeft);
    const record = {
      startedAt: startedAtRef.current,
      durationSec: elapsedSec,
      totalCount: summary.total,
      answered: summary.answered,
      correct: summary.correct,
      scorePct: summary.scorePct,
      byDomain: summary.byDomain,
      status: reason,
    };
    const prior = Array.isArray(tomeProgress?.practiceExams) ? tomeProgress.practiceExams : [];
    updateTomeProgress?.({ practiceExams: [...prior, record].slice(-20) });
    awardXP?.(10 + summary.correct, `Mock exam: ${summary.scorePct}%`);
    setResultsSummary({ ...summary, durationSec: elapsedSec, status: reason });
    setShowSubmitConfirm(false);
    setPhase('results');
  };
  submitExamRef.current = doSubmit;

  useEffect(() => {
    if (phase !== 'inProgress') return undefined;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          submitExamRef.current?.('timeout');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const setAnswerAt = (idx, val) => {
    setAnswers((prev) => {
      const copy = prev.slice();
      copy[idx] = val;
      return copy;
    });
  };

  const goTo = (delta) => {
    const next = Math.min(Math.max(0, currentIdx + delta), sample.length - 1);
    setCurrentIdx(next);
    const a = answers[next];
    setTextInput(typeof a === 'string' ? a : '');
  };

  if (phase === 'setup') {
    const past = Array.isArray(tomeProgress?.practiceExams) ? tomeProgress.practiceExams : [];
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 p-5 rounded relative" style={{
          background: 'linear-gradient(135deg, rgba(67, 56, 202, 0.5) 0%, rgba(10, 6, 4, 0.95) 100%)',
          border: '3px double rgba(129, 140, 248, 0.6)',
          boxShadow: '0 0 24px rgba(129, 140, 248, 0.2), inset 0 0 24px rgba(0,0,0,0.5)',
        }}>
          <Clock className="w-10 h-10 text-indigo-300" style={{ filter: 'drop-shadow(0 0 10px rgba(129, 140, 248, 0.6))' }} />
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-indigo-200 italic" style={{ textShadow: '0 0 12px rgba(129, 140, 248, 0.4)' }}>The Trial of Hours</h2>
            <div className="text-xs italic text-indigo-400 tracking-[0.2em]">⏳ Timed practice exam ⏳</div>
          </div>
          <button onClick={onExit} className="px-3 py-2 rounded border-2 border-amber-700 text-amber-200 italic" style={{ background: 'rgba(41, 24, 12, 0.7)' }}>
            <ArrowLeft className="w-4 h-4 inline mr-1" /> Home
          </button>
        </div>

        {quizPool.length < 5 ? (
          <div className="p-4 rounded text-amber-200 italic flex items-start gap-2" style={{ background: 'rgba(127, 29, 29, 0.4)', border: '2px solid #ef4444' }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-300" />
            <div>This tome has only {quizPool.length} riddle{quizPool.length === 1 ? '' : 's'} — too few for a practice exam. Regenerate the tome with the updated prompt to populate the deck.</div>
          </div>
        ) : (
          <>
            <div className="text-sm italic text-amber-200">
              ⚖ Choose a length. Riddles will be drawn in proportion to the tome's blueprint{weights ? '' : ' (evenly across domains, since this tome has no published weights)'}. Once the trial begins, the timer cannot be paused.
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              {EXAM_PRESETS.map(preset => {
                const effective = Math.min(preset.count, quizPool.length);
                const disabled = effective < 5;
                return (
                  <button key={preset.id}
                    onClick={() => !disabled && startExam({ ...preset, count: effective })}
                    disabled={disabled}
                    className="p-4 rounded text-left disabled:opacity-40 disabled:cursor-not-allowed transition hover:brightness-110"
                    style={{
                      background: 'linear-gradient(135deg, rgba(67, 56, 202, 0.4) 0%, rgba(10, 6, 4, 0.95) 100%)',
                      border: '2px solid rgba(129, 140, 248, 0.5)',
                    }}>
                    <div className="text-base font-bold italic text-indigo-200">{preset.label}</div>
                    <div className="text-xs italic text-amber-100 mt-1">
                      {effective} riddle{effective === 1 ? '' : 's'} · {preset.minutes} minute{preset.minutes === 1 ? '' : 's'}
                    </div>
                    {effective < preset.count && (
                      <div className="text-[10px] italic text-amber-700 mt-1">
                        ✦ Capped at {effective} (tome size)
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {past.length > 0 && (
              <div className="p-4 rounded" style={{
                background: 'linear-gradient(135deg, rgba(120, 53, 15, 0.35) 0%, rgba(10, 6, 4, 0.9) 100%)',
                border: '2px solid rgba(245, 158, 11, 0.4)',
              }}>
                <div className="flex items-center gap-2 mb-3">
                  <Award className="w-4 h-4 text-amber-300" />
                  <h3 className="text-sm italic font-bold text-amber-200 tracking-wider">Past Trials</h3>
                  <div className="flex-1 h-px bg-gradient-to-r from-amber-700/40 to-transparent" />
                  <span className="text-[10px] italic text-amber-700">last {Math.min(5, past.length)} of {past.length}</span>
                </div>
                <div className="space-y-1 text-xs italic">
                  {past.slice(-5).reverse().map((rec, i) => {
                    const color = rec.scorePct >= 75 ? '#a7f3d0' : rec.scorePct >= 60 ? '#fde68a' : '#fecaca';
                    return (
                      <div key={i} className="flex items-center gap-3 text-amber-100">
                        <span className="text-amber-700 tabular-nums">{rec.startedAt ? new Date(rec.startedAt).toLocaleDateString() : '—'}</span>
                        <span>{rec.totalCount} riddles · {Math.floor((rec.durationSec || 0) / 60)}m {(rec.durationSec || 0) % 60}s</span>
                        <span className="ml-auto font-bold tabular-nums" style={{ color }}>
                          {rec.scorePct}%
                        </span>
                        {rec.status === 'timeout' && <span className="text-[10px] text-red-300 italic">timed out</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (phase === 'inProgress') {
    const q = sample[currentIdx];
    if (!q) return null;
    const a = answers[currentIdx];
    const isMC = Array.isArray(q.options);
    const isTF = q.type === 'truefalse';
    const isFIB = q.type === 'fillblank' || q.type === 'fill_in_blank';
    const answeredCount = answers.filter(x => x !== null && x !== undefined && x !== '').length;
    const lowTime = secondsLeft < 5 * 60;

    return (
      <div className="space-y-3 max-w-3xl mx-auto">
        <div className="p-3 rounded sticky top-0 z-20 backdrop-blur" style={{
          background: 'linear-gradient(135deg, rgba(67, 56, 202, 0.65) 0%, rgba(10, 6, 4, 0.97) 100%)',
          border: '2px solid rgba(129, 140, 248, 0.55)',
        }}>
          <div className="flex items-center gap-3 flex-wrap">
            <Clock className={`w-5 h-5 ${lowTime ? 'text-red-300' : 'text-indigo-300'}`} />
            <span className={`font-bold tabular-nums text-lg italic ${lowTime ? 'text-red-200 animate-pulse' : 'text-indigo-100'}`} style={{ textShadow: lowTime ? '0 0 10px rgba(239, 68, 68, 0.6)' : 'none' }}>
              {formatClock(secondsLeft)}
            </span>
            <div className="flex-1 text-xs italic text-amber-200">
              Riddle <span className="font-bold tabular-nums">{currentIdx + 1}</span> of <span className="font-bold tabular-nums">{sample.length}</span> · {answeredCount} answered
            </div>
            <button onClick={() => setShowSubmitConfirm(true)}
              className="px-3 py-1.5 rounded text-xs font-bold italic border-2 border-amber-400 text-amber-100"
              style={{ background: 'rgba(120, 53, 15, 0.6)' }}>
              Submit Exam
            </button>
          </div>
          <div className="h-1.5 rounded overflow-hidden mt-2" style={{ background: 'rgba(0,0,0,0.45)' }}>
            <div className="h-full transition-all" style={{
              width: `${(answeredCount / sample.length) * 100}%`,
              background: 'linear-gradient(to right, #6366f1, #a855f7)',
            }} />
          </div>
        </div>

        <div className="p-5 rounded" style={{
          background: 'linear-gradient(135deg, rgba(31, 12, 41, 0.85) 0%, rgba(15, 6, 20, 0.95) 100%)',
          border: '3px double rgba(126, 34, 206, 0.6)',
          boxShadow: '0 0 24px rgba(168, 85, 247, 0.18), inset 0 0 24px rgba(0,0,0,0.5)',
        }}>
          {q.domain && (
            <div className="text-[10px] italic text-amber-700 tracking-wider uppercase mb-2">{q.domain}</div>
          )}
          <div className="text-lg text-amber-50 italic mb-4 leading-relaxed">{q.question}</div>

          {isMC && (
            <div className="space-y-2">
              {q.options.map((opt, i) => {
                const picked = a === i;
                return (
                  <button key={i} onClick={() => setAnswerAt(currentIdx, i)}
                    className="w-full text-left p-3 rounded border-2 italic text-amber-50 transition"
                    style={{
                      background: picked ? 'rgba(126, 34, 206, 0.55)' : 'rgba(31, 12, 41, 0.6)',
                      borderColor: picked ? 'rgba(168, 85, 247, 0.9)' : 'rgba(126, 34, 206, 0.5)',
                      boxShadow: picked ? '0 0 10px rgba(168, 85, 247, 0.4)' : 'none',
                    }}>
                    <span className="text-purple-300 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>{opt}
                  </button>
                );
              })}
            </div>
          )}

          {isTF && (
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setAnswerAt(currentIdx, true)}
                className="p-4 rounded font-bold border-2 italic"
                style={{
                  borderColor: a === true ? '#10b981' : 'rgba(16, 185, 129, 0.5)',
                  background: a === true ? 'rgba(6, 78, 59, 0.7)' : 'rgba(6, 78, 59, 0.3)',
                  color: a === true ? '#a7f3d0' : '#d1fae5',
                  boxShadow: a === true ? '0 0 12px rgba(16, 185, 129, 0.5)' : 'none',
                }}>⚖ Verily True ⚖</button>
              <button onClick={() => setAnswerAt(currentIdx, false)}
                className="p-4 rounded font-bold border-2 italic"
                style={{
                  borderColor: a === false ? '#ef4444' : 'rgba(239, 68, 68, 0.5)',
                  background: a === false ? 'rgba(127, 29, 29, 0.7)' : 'rgba(127, 29, 29, 0.3)',
                  color: a === false ? '#fecaca' : '#fee2e2',
                  boxShadow: a === false ? '0 0 12px rgba(239, 68, 68, 0.5)' : 'none',
                }}>⚖ A Falsehood ⚖</button>
            </div>
          )}

          {isFIB && (
            <div>
              <input type="text"
                value={textInput}
                onChange={(e) => {
                  setTextInput(e.target.value);
                  setAnswerAt(currentIdx, e.target.value);
                }}
                placeholder="Inscribe thy answer..."
                className="w-full p-3 rounded border-2 focus:outline-none italic text-amber-50"
                style={{ background: 'rgba(31, 12, 41, 0.6)', borderColor: 'rgba(126, 34, 206, 0.5)' }}
                autoFocus
              />
              <div className="text-[10px] italic text-amber-700 mt-2">
                ✦ Practice exams grade locally — case-insensitive, accepts the tome's listed alternatives. The Oracle is silent here.
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => goTo(-1)} disabled={currentIdx === 0}
            className="px-3 py-2 rounded text-sm font-bold italic border-2 border-amber-700 text-amber-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'rgba(41, 24, 12, 0.7)' }}>
            <ArrowLeft className="w-4 h-4 inline mr-1" /> Prior
          </button>
          <div className="flex-1 text-center text-[10px] italic text-amber-700">
            ✦ Tap an option to lock thine answer — advance with Next. Thou may revisit prior riddles.
          </div>
          <button onClick={() => goTo(1)} disabled={currentIdx >= sample.length - 1}
            className="px-3 py-2 rounded text-sm font-bold italic border-2 border-indigo-400 text-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'rgba(67, 56, 202, 0.55)' }}>
            Next <ArrowRight className="w-4 h-4 inline ml-1" />
          </button>
        </div>

        {showSubmitConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="max-w-md rounded p-5" style={{
              background: 'linear-gradient(135deg, rgba(67, 56, 202, 0.75) 0%, rgba(10, 6, 4, 0.97) 100%)',
              border: '3px solid rgba(129, 140, 248, 0.7)',
              boxShadow: '0 0 30px rgba(129, 140, 248, 0.3)',
            }}>
              <h3 className="text-base font-bold italic text-indigo-200 mb-2">⚖ Submit thy answers? ⚖</h3>
              <p className="text-sm italic text-amber-100 mb-3">
                Thou hast answered <span className="font-bold tabular-nums">{answeredCount}</span> of <span className="font-bold tabular-nums">{sample.length}</span>. Unanswered riddles count as wrong.
              </p>
              <p className="text-xs italic text-amber-700 mb-4">
                Time remaining: <span className="tabular-nums">{formatClock(secondsLeft)}</span>. Once submitted, thy verdict is final.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowSubmitConfirm(false)}
                  className="flex-1 px-3 py-2 rounded text-sm font-bold italic border-2 border-amber-700 text-amber-200"
                  style={{ background: 'rgba(41, 24, 12, 0.7)' }}>
                  Keep going
                </button>
                <button onClick={() => doSubmit('submitted')}
                  className="flex-1 px-3 py-2 rounded text-sm font-bold italic border-2 border-emerald-400 text-emerald-100"
                  style={{ background: 'rgba(6, 78, 59, 0.7)' }}>
                  Submit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (phase === 'results' && resultsSummary) {
    const r = resultsSummary;
    const ramp = r.scorePct >= 85 ? '#fbbf24' : r.scorePct >= 70 ? '#10b981' : r.scorePct >= 55 ? '#f59e0b' : '#ef4444';
    const domainRows = Object.entries(r.byDomain).map(([d, b]) => ({
      domain: d,
      total: b.total,
      correct: b.correct,
      answered: b.answered,
      pct: b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0,
    })).sort((a, b) => b.total - a.total);

    const wrongs = sample.map((q, i) => ({ q, a: answers[i], i })).filter(x => !gradeExamItem(x.q, x.a));

    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <div className="p-5 rounded text-center" style={{
          background: 'linear-gradient(135deg, rgba(67, 56, 202, 0.55) 0%, rgba(10, 6, 4, 0.96) 100%)',
          border: '3px double rgba(129, 140, 248, 0.65)',
          boxShadow: '0 0 30px rgba(129, 140, 248, 0.25), inset 0 0 25px rgba(0,0,0,0.5)',
        }}>
          <div className="text-xs italic tracking-[0.25em] text-amber-700 uppercase mb-2">
            {r.status === 'timeout' ? '⏳ The Sands Ran Out ⏳' : '⚖ Verdict Rendered ⚖'}
          </div>
          <div className="text-6xl font-bold tabular-nums italic" style={{ color: ramp, textShadow: `0 0 20px ${ramp}80` }}>
            {r.scorePct}%
          </div>
          <div className="text-sm italic text-amber-100 mt-2">
            {r.correct}/{r.total} correct · {r.answered} answered · {Math.floor(r.durationSec / 60)}m {r.durationSec % 60}s elapsed
          </div>
        </div>

        <div className="p-4 rounded" style={{
          background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.45) 0%, rgba(10, 6, 4, 0.95) 100%)',
          border: '2px solid rgba(16, 185, 129, 0.45)',
        }}>
          <h3 className="text-sm font-bold italic text-emerald-200 tracking-wider mb-3">By Domain</h3>
          <div className="space-y-2">
            {domainRows.map(row => {
              const c = row.pct >= 85 ? { bg: 'rgba(245, 158, 11, 0.25)', border: '#fbbf24', text: '#fde68a' }
                : row.pct >= 70 ? { bg: 'rgba(16, 185, 129, 0.25)', border: '#10b981', text: '#a7f3d0' }
                : row.pct >= 55 ? { bg: 'rgba(245, 158, 11, 0.18)', border: 'rgba(245, 158, 11, 0.55)', text: '#fde68a' }
                : { bg: 'rgba(239, 68, 68, 0.22)', border: '#ef4444', text: '#fecaca' };
              return (
                <div key={row.domain} className="p-2 rounded" style={{ background: c.bg, border: `1.5px solid ${c.border}` }}>
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-xs italic font-bold truncate" style={{ color: c.text }}>{row.domain}</div>
                    <div className="text-xs italic tabular-nums font-bold" style={{ color: c.text }}>
                      {row.correct}/{row.total} · {row.pct}%
                    </div>
                  </div>
                  <div className="h-1.5 rounded overflow-hidden mt-1" style={{ background: 'rgba(0,0,0,0.45)' }}>
                    <div className="h-full transition-all" style={{ width: `${row.pct}%`, background: c.border }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {wrongs.length > 0 && (
          <details className="p-3 rounded" style={{
            background: 'rgba(127, 29, 29, 0.35)',
            border: '2px solid rgba(239, 68, 68, 0.5)',
          }}>
            <summary className="text-sm italic font-bold text-red-200 cursor-pointer">
              ⚔ {wrongs.length} riddle{wrongs.length === 1 ? '' : 's'} missed — review the explanations
            </summary>
            <div className="mt-3 space-y-2 text-xs italic">
              {wrongs.map(w => {
                const q = w.q;
                let correctLabel = '';
                if (Array.isArray(q.options)) {
                  correctLabel = `${String.fromCharCode(65 + q.correctIndex)}. ${q.options[q.correctIndex]}`;
                } else if (q.type === 'truefalse') {
                  correctLabel = q.correctAnswer ? 'True' : 'False';
                } else {
                  correctLabel = q.correctAnswer || (q.acceptedAnswers || [])[0] || '';
                }
                return (
                  <div key={w.i} className="p-2 rounded" style={{ background: 'rgba(10, 6, 4, 0.5)', border: '1px solid rgba(239, 68, 68, 0.35)' }}>
                    <div className="text-amber-100 mb-1">
                      <span className="text-amber-700 mr-1">Q{w.i + 1}.</span>
                      {q.question}
                    </div>
                    <div className="text-emerald-200">✓ {correctLabel}</div>
                    {q.explanation && <div className="text-amber-300 mt-1">{q.explanation}</div>}
                  </div>
                );
              })}
            </div>
          </details>
        )}

        <div className="flex gap-2">
          <button onClick={() => {
            setResultsSummary(null);
            setSample([]);
            setAnswers([]);
            setCurrentIdx(0);
            setPhase('setup');
          }} className="flex-1 px-4 py-3 rounded text-sm font-bold italic border-2 border-indigo-400 text-indigo-100"
            style={{ background: 'rgba(67, 56, 202, 0.55)' }}>
            <Clock className="w-4 h-4 inline mr-1" /> Another Trial
          </button>
          <button onClick={onExit}
            className="flex-1 px-4 py-3 rounded text-sm font-bold italic border-2 border-amber-700 text-amber-200"
            style={{ background: 'rgba(41, 24, 12, 0.7)' }}>
            <ArrowLeft className="w-4 h-4 inline mr-1" /> Home
          </button>
        </div>
      </div>
    );
  }

  return null;
}
