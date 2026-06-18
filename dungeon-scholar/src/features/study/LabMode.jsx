import { useState, useEffect, useRef } from 'react';
import { ChevronRight, X, Check, ArrowLeft, Loader2, Wand2 } from 'lucide-react';
import { gradeAnswer } from '../../services/oracleGrader.js';
import { ConfirmModal } from '../../components/ui/ConfirmModal.jsx';
import { DifficultyStars, BloomBadge } from '../../components/ui/badges.jsx';
import RichContent from '../../components/RichContent.jsx';

function LabMode({ courseSet, tomeProgress, awardXP, updateTomeProgress, playerState, checkAchievement, recordAnswer, onPendingConfirm, onGoToLibrary }) {
  const [selectedLab, setSelectedLab] = useState(null);
  const [step, setStep] = useState(0);
  const [textAnswer, setTextAnswer] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [grading, setGrading] = useState(false);
  const labs = courseSet.labs || [];
  const labProgress = tomeProgress?.labProgress || {};

  // PHASE-17 17B (M2): abort an in-flight Oracle grade when the player leaves
  // the lab detail view (selectedLab changes) or unmounts, so a verdict can't
  // record a step for a lab they walked away from. Declared above the early
  // return alongside labKeyRef so hook order is stable (see the note below).
  const gradeAbortRef = useRef(null);
  useEffect(() => () => { gradeAbortRef.current?.abort(); }, [selectedLab]);

  // Phase 44a round-11 P1 CRITICAL FIX: ALL hooks must run on every render
  // regardless of `selectedLab` state. The Phase 43e version put this
  // useRef + useEffect AFTER the `if (!selectedLab) return ...` early
  // return — list view ran N hooks, detail view ran N+2, triggering React
  // error #310 ("Rendered more hooks than during the previous render")
  // and unmounting the entire app. Now declared above the early return;
  // the ref's content is updated conditionally further down where
  // `submitStep` is in scope. The listener body guards on `s.options`
  // being an array, so the no-op behavior on the list screen is preserved.
  const labKeyRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      const s = labKeyRef.current;
      if (!s || !Array.isArray(s.options) || s.feedback) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      let idx = -1;
      if (/^[1-9]$/.test(key)) idx = Number(key) - 1;
      else if (/^[a-z]$/.test(key)) idx = key.charCodeAt(0) - 97;
      if (idx >= 0 && idx < s.options.length) {
        e.preventDefault();
        s.submitStep?.(idx === s.correctIndex);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!selectedLab) {
    return (
      <div className="space-y-3 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-rose-300 mb-4 italic">⚗️ Choose Thy Trial ⚗️</h2>
        {labs.length === 0 && (
          <div className="space-y-3">
            <div className="text-amber-600 italic">No trials in this tome.</div>
            {/* 19E (L17): give the dead-end a path to add content. */}
            <button onClick={() => onGoToLibrary?.()}
              className="w-full py-3 px-4 rounded-sm italic border-2 border-amber-700 text-amber-200"
              style={{ background: 'rgba(41, 24, 12, 0.7)' }}>
              📜 Visit the Grand Library — import or forge a tome with trials
            </button>
          </div>
        )}
        {labs.map((lab, i) => {
          // Phase 43e round-10 P5: per-trial status pill on each list card.
          // labProgress[lab.id] = { step, completed } updated on advance.
          const progress = lab.id ? labProgress[lab.id] : null;
          const totalStages = (lab.steps || lab.stages)?.length || 0;
          const isCompleted = progress?.completed;
          const inProgress = !isCompleted && progress && (progress.step ?? 0) > 0;
          return (
            <button key={i} onClick={() => {
              const resumeStep = inProgress ? Math.min(progress.step ?? 0, Math.max(0, totalStages - 1)) : 0;
              setSelectedLab(lab); setStep(resumeStep); setFeedback(null); setTextAnswer('');
            }} className="w-full text-left p-4 rounded-sm transition relative" style={{
              background: 'linear-gradient(135deg, rgba(41, 12, 27, 0.85) 0%, rgba(20, 6, 13, 0.95) 100%)',
              border: '2px solid rgba(190, 24, 93, 0.5)', boxShadow: '0 0 15px rgba(244, 63, 94, 0.15)',
            }}>
              <div className="font-bold text-rose-300 text-lg italic flex items-center justify-between gap-2 flex-wrap">
                <span>{lab.title}</span>
                {typeof lab.difficulty === 'number' && <DifficultyStars value={lab.difficulty} />}
              </div>
              {lab.scenario && <div className="text-sm text-amber-100/70 mt-1 italic">{lab.scenario}</div>}
              <div className="text-xs text-amber-700 mt-2 italic flex items-center gap-2 flex-wrap">
                <span>⚔ {totalStages} stages ⚔</span>
                {isCompleted && (
                  <span className="px-2 py-0.5 rounded-sm text-[10px] uppercase tracking-wider font-bold not-italic" style={{
                    background: 'rgba(6, 78, 59, 0.55)', border: '1px solid rgba(16, 185, 129, 0.6)', color: '#a7f3d0',
                  }}>Completed</span>
                )}
                {inProgress && (
                  <span className="px-2 py-0.5 rounded-sm text-[10px] uppercase tracking-wider font-bold not-italic" style={{
                    background: 'rgba(120, 53, 15, 0.55)', border: '1px solid rgba(245, 158, 11, 0.6)', color: '#fde68a',
                  }}>In progress · stage {(progress.step ?? 0) + 1} of {totalStages}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  // Tolerate AI-generated tomes that use `stages` instead of `steps`.
  const steps = selectedLab.steps || selectedLab.stages || [];
  const currentStep = steps[step];

  // Phase 43e: helpers for the per-lab progress map. Merge-write into the
  // tome's labProgress object so other entries are preserved.
  const writeLabProgress = (entry) => {
    if (!selectedLab?.id) return;
    updateTomeProgress((prev) => ({ // 17D functional form
      labProgress: { ...(prev.labProgress || {}), [selectedLab.id]: entry },
    }));
  };

  // Multiple-choice steps and Oracle-graded text steps both flow through here
  // once a verdict exists. `extra` carries Oracle feedback/source for display.
  const submitStep = (correct, extra = {}) => {
    const stepItem = {
      id: `${selectedLab.id}_step_${step}`,
      question: currentStep?.prompt || currentStep?.question,
      explanation: currentStep?.explanation,
      _type: 'lab',
    };
    if (recordAnswer) recordAnswer(correct, stepItem);
    setFeedback({ correct, explanation: currentStep?.explanation, ...extra });
    if (correct && !extra.awaitContinue) {
      awardXP(15);
      setTimeout(() => {
        if (step + 1 >= steps.length) {
          // Phase 43e: mark completed in labProgress AND bump global count.
          const completedAt = Date.now(); // hoisted — Date.now() is impure inside the updater (17D)
          updateTomeProgress((prev) => ({
            labsCompleted: (prev.labsCompleted || 0) + 1,
            labProgress: { ...(prev.labProgress || {}), [selectedLab.id]: { step: steps.length, completed: true, completedAt } },
          }));
          checkAchievement('first_lab');
          const totalLabsAcrossLib = playerState.library.reduce((s, t) => s + (t.progress?.labsCompleted || 0), 0) + 1;
          if (totalLabsAcrossLib >= 10) checkAchievement('lab_master');
          if (totalLabsAcrossLib >= 25) checkAchievement('lab_grandmaster');
          setSelectedLab(null);
          setFeedback(null);
        } else {
          // Phase 43e: record the next step so re-entering the trial
          // resumes here (and the list card shows "in progress · stage N").
          writeLabProgress({ step: step + 1, completed: false });
          setStep(step + 1); setTextAnswer(''); setFeedback(null);
        }
      }, 1500);
    } else if (!extra.awaitContinue) {
      setTimeout(() => setFeedback(null), 2000);
    }
  };

  // Continue manually after Oracle-graded feedback (or override). Awards XP if
  // the final verdict was correct, then advances or finishes the trial.
  const continueAfterGrade = () => {
    const correct = !!feedback?.correct;
    if (correct) {
      awardXP(15);
      if (step + 1 >= steps.length) {
        // Phase 43e: same completion write as submitStep.
        const completedAt = Date.now(); // hoisted — Date.now() is impure inside the updater (17D)
        updateTomeProgress((prev) => ({
          labsCompleted: (prev.labsCompleted || 0) + 1,
          labProgress: { ...(prev.labProgress || {}), [selectedLab.id]: { step: steps.length, completed: true, completedAt } },
        }));
        checkAchievement('first_lab');
        const totalLabsAcrossLib = playerState.library.reduce((s, t) => s + (t.progress?.labsCompleted || 0), 0) + 1;
        if (totalLabsAcrossLib >= 10) checkAchievement('lab_master');
        if (totalLabsAcrossLib >= 25) checkAchievement('lab_grandmaster');
        setSelectedLab(null);
      } else {
        writeLabProgress({ step: step + 1, completed: false });
        setStep(step + 1);
        setTextAnswer('');
      }
    }
    setFeedback(null);
  };

  const submitTextWithOracle = async () => {
    if (!textAnswer.trim() || grading) return;
    gradeAbortRef.current?.abort();
    const controller = new AbortController();
    gradeAbortRef.current = controller;
    setGrading(true);
    let verdict;
    try {
      verdict = await gradeAnswer({
        question: currentStep?.prompt || currentStep?.question,
        expectedAnswer: currentStep?.answer,
        acceptedAnswers: currentStep?.acceptedAnswers,
        userAnswer: textAnswer,
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted || err?.name === 'AbortError') return; // left the lab / superseded — record nothing
      throw err;
    }
    if (controller.signal.aborted) return;
    setGrading(false);
    submitStep(verdict.correct, {
      awaitContinue: true,
      oracleFeedback: verdict.feedback,
      source: verdict.source,
      fallbackReason: verdict.fallbackReason,
    });
  };

  // Override the verdict (user disagrees with the Oracle).
  const overrideVerdict = (newCorrect) => {
    setFeedback(prev => prev ? { ...prev, correct: newCorrect, overridden: true } : prev);
  };

  const skipStep = () => {
    const stepItem = {
      id: `${selectedLab.id}_step_${step}`,
      question: currentStep?.prompt || currentStep?.question,
      explanation: currentStep?.explanation,
      _type: 'lab',
    };
    if (recordAnswer) recordAnswer(false, stepItem);
    setFeedback({ correct: false, skipped: true, explanation: currentStep?.explanation });
    setTimeout(() => {
      if (step + 1 >= steps.length) {
        setSelectedLab(null);
        setFeedback(null);
      } else {
        setStep(step + 1);
        setTextAnswer('');
        setFeedback(null);
      }
    }, 1500);
  };

  // Phase 43e / 44a: sync labKeyRef.current with current closure values
  // each render so the keydown listener (declared at the top of LabMode)
  // sees fresh options / correctIndex / submitStep. Only runs in the
  // detail view (after the early return), so submitStep is in scope.
  labKeyRef.current = {
    options: currentStep?.options,
    correctIndex: currentStep?.correctIndex,
    feedback,
    submitStep,
  };

  // Phase 42a QA round-9 P1: confirm before destroying mid-trial progress.
  // Re-uses the App-level ConfirmModal (same pattern as Trial of Hours
  // abandon). Only fires when the user has actually progressed past
  // stage 1 — first-stage exits don't lose anything meaningful.
  const handleBackToTrials = () => {
    if (step <= 0 || !onPendingConfirm) {
      setSelectedLab(null);
      setStep(0);
      setFeedback(null);
      return;
    }
    onPendingConfirm({
      title: '⚗️ Abandon This Trial? ⚗️',
      body: `Thou art on stage ${step + 1} of ${steps.length}. Stepping back now discards thy progress on this trial — the per-stage XP and gold thou hast earned remain, but the trial-completion credit for this attempt is forfeit.`,
      confirmLabel: 'Abandon Trial',
      cancelLabel: 'Keep Going',
      confirmVariant: 'danger',
      onConfirm: () => {
        setSelectedLab(null);
        setStep(0);
        setFeedback(null);
        setTextAnswer('');
      },
    });
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <button onClick={handleBackToTrials} className="flex items-center gap-2 text-amber-600 hover:text-amber-400 italic">
        <ArrowLeft className="w-4 h-4" /> Back to Trials
      </button>
      <div className="rounded-sm p-6 relative" style={{
        background: 'linear-gradient(135deg, rgba(41, 12, 27, 0.85) 0%, rgba(20, 6, 13, 0.95) 100%)',
        border: '3px double rgba(190, 24, 93, 0.6)', boxShadow: '0 0 25px rgba(244, 63, 94, 0.2)',
      }}>
        <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
          <h3 className="text-xl font-bold text-rose-300 italic">{selectedLab.title}</h3>
          {typeof selectedLab.difficulty === 'number' && <DifficultyStars value={selectedLab.difficulty} />}
        </div>
        {selectedLab.scenario && (
          <RichContent as="div" text={selectedLab.scenario} className="text-sm text-amber-100/70 mb-4 italic" />
        )}
        <div className="text-xs text-amber-700 mb-3 italic flex items-center gap-2 flex-wrap">
          <span>⚔ Stage {step + 1} of {steps.length} ⚔</span>
          {currentStep && typeof currentStep.difficulty === 'number' && <DifficultyStars value={currentStep.difficulty} />}
          {currentStep && currentStep.bloomLevel && <BloomBadge level={currentStep.bloomLevel} />}
        </div>
        {currentStep && !feedback && (
          <div className="space-y-3">
            <RichContent as="div" text={currentStep.prompt || currentStep.question}
              className="p-4 rounded-sm text-amber-50 italic"
              style={{ background: 'rgba(41, 12, 27, 0.7)', border: '1px solid rgba(190, 24, 93, 0.4)' }} />
            {currentStep.options ? (
              <div className="space-y-2">
                {/* Phase 43e: visible hotkey hint matching the Riddles pattern. */}
                <div className="text-[11px] italic text-amber-100/60 text-center">
                  ⌨ Hotkeys: 1–{currentStep.options.length} or A–{String.fromCharCode(64 + currentStep.options.length)} to pick
                </div>
                {currentStep.options.map((opt, i) => (
                  <button key={i} onClick={() => submitStep(i === currentStep.correctIndex)} className="w-full text-left p-3 rounded-sm border-2 text-amber-50" style={{ background: 'rgba(41, 12, 27, 0.6)', borderColor: 'rgba(190, 24, 93, 0.5)' }}>
                    <span className="text-rose-300 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>{opt}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <input type="text" value={textAnswer} onChange={(e) => setTextAnswer(e.target.value)}
                  placeholder="Inscribe thy answer..." className="w-full p-3 rounded-sm border-2 focus:outline-hidden italic text-amber-50"
                  disabled={grading}
                  onKeyDown={(e) => { if (e.key === 'Enter' && textAnswer.trim() && !grading) submitTextWithOracle(); }}
                  style={{ background: 'rgba(41, 12, 27, 0.6)', borderColor: 'rgba(190, 24, 93, 0.5)' }} />
                <button onClick={submitTextWithOracle} disabled={!textAnswer.trim() || grading} className="w-full py-3 font-bold rounded-sm disabled:opacity-50 text-amber-50 border-2 border-rose-400 italic flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(to bottom, #f43f5e 0%, #9f1239 100%)', boxShadow: '0 0 20px rgba(244, 63, 94, 0.4)' }}>
                  {grading ? (<><Loader2 className="w-4 h-4 animate-spin" /> The Oracle deliberates...</>) : 'Submit Stage'}
                </button>
              </div>
            )}
            <div className="pt-2 mt-2 border-t border-amber-900/40 flex justify-end">
              <button
                onClick={skipStep}
                className="px-3 py-1.5 rounded-sm text-xs border-2 border-red-800 text-red-300 hover:bg-red-900/30 italic flex items-center gap-1"
                style={{ background: 'rgba(41, 12, 12, 0.6)' }}
                title="Skip this stage — counts as failed, abandons the trial"
              >
                <ChevronRight className="w-3 h-3" /> Skip Stage
              </button>
            </div>
          </div>
        )}
        {feedback && (
          <div role="status" className="p-4 rounded-sm border-2 space-y-3" style={{
            background: feedback.correct ? 'rgba(6, 78, 59, 0.5)' : 'rgba(127, 29, 29, 0.5)',
            borderColor: feedback.correct ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)',
            borderStyle: feedback.correct ? 'solid' : 'dashed', // 19C: non-color cue
          }}>
            <div className="font-bold flex items-center gap-2 italic flex-wrap">
              {feedback.correct ? <Check className="w-5 h-5 text-emerald-400" /> : <X className="w-5 h-5 text-red-400" />}
              <span>{feedback.correct ? '⚔ Stage Conquered! ⚔' : (feedback.skipped ? '↳ Skipped — Trial Abandoned' : '✗ Try Again, Brave One')}</span>
              {feedback.overridden && (
                <span className="text-xs px-2 py-0.5 rounded-sm border border-amber-400/60 text-amber-200 italic">overridden</span>
              )}
              {feedback.source === 'oracle' && (
                <span className="text-xs px-2 py-0.5 rounded-sm border border-purple-400/60 text-purple-200 italic flex items-center gap-1">
                  <Wand2 className="w-3 h-3" /> Graded by the Oracle
                </span>
              )}
              {feedback.source === 'fallback' && (
                <span className="text-xs px-2 py-0.5 rounded-sm border border-amber-700/60 text-amber-300 italic" title={feedback.fallbackReason || ''}>
                  Tome match (Oracle silent)
                </span>
              )}
            </div>
            {feedback.oracleFeedback && (
              <p className="text-sm text-amber-100/90 italic leading-relaxed">{feedback.oracleFeedback}</p>
            )}
            {feedback.explanation && (
              <div className="text-sm text-amber-100/70 italic">
                <span className="text-purple-300">From the tome:</span>{' '}
                <RichContent as={null} text={feedback.explanation} />
              </div>
            )}
            {feedback.awaitContinue && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-amber-900/40 flex-wrap">
                <div className="flex gap-2">
                  {!feedback.correct && (
                    <button onClick={() => overrideVerdict(true)} className="px-3 py-1.5 rounded-sm text-xs italic border-2 border-emerald-500 text-emerald-200 flex items-center gap-1" style={{ background: 'rgba(6, 78, 59, 0.4)' }}>
                      <Check className="w-3 h-3" /> Mark as correct
                    </button>
                  )}
                  {feedback.correct && (
                    <button onClick={() => overrideVerdict(false)} className="px-3 py-1.5 rounded-sm text-xs italic border-2 border-red-500 text-red-200 flex items-center gap-1" style={{ background: 'rgba(127, 29, 29, 0.4)' }}>
                      <X className="w-3 h-3" /> Mark as wrong
                    </button>
                  )}
                </div>
                <button onClick={continueAfterGrade} className="px-4 py-2 rounded-sm text-sm font-bold italic border-2 border-amber-300 text-amber-950 flex items-center gap-2"
                  style={{ background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)', boxShadow: '0 0 12px rgba(245, 158, 11, 0.5)' }}>
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default LabMode;
