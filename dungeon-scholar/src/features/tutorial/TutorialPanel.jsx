import { ChevronDown, ChevronUp, Compass } from 'lucide-react';
import { TUTORIAL_STEPS } from '../../game/tutorial.js';

function TutorialPanel({ stepIndex, collapsed, onToggle, onAdvance, onSkip, onAction }) {
  const step = TUTORIAL_STEPS[stepIndex];
  if (!step) return null;
  const progress = ((stepIndex + 1) / TUTORIAL_STEPS.length) * 100;

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm w-full md:w-96" style={{ pointerEvents: 'auto' }}>
      <div
        className="rounded-sm relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-purple, 31, 12, 41), 0.97) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.99) 100%)',
          border: '3px double rgba(168, 85, 247, 0.7)',
          boxShadow: '0 0 30px rgba(168, 85, 247, 0.4), inset 0 0 20px rgba(0,0,0,0.5)',
        }}
      >
        <div className="absolute top-1 left-1 text-purple-400/60 text-xs">⚜</div>
        <div className="absolute top-1 right-1 text-purple-400/60 text-xs">⚜</div>
        <div className="absolute bottom-1 left-1 text-purple-400/60 text-xs">⚜</div>
        <div className="absolute bottom-1 right-1 text-purple-400/60 text-xs">⚜</div>

        <button onClick={onToggle} className="w-full flex items-center justify-between p-3 hover:bg-purple-900/20">
          <div className="flex items-center gap-2">
            <Compass
              className="w-4 h-4 text-purple-400"
              style={{ filter: 'drop-shadow(0 0 6px rgba(168, 85, 247, 0.6))' }}
            />
            <span className="text-xs text-purple-300 italic tracking-widest">
              ⚜ THE AWAKENING — {stepIndex + 1}/{TUTORIAL_STEPS.length}
            </span>
          </div>
          {collapsed ? (
            <ChevronUp className="w-4 h-4 text-purple-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-purple-400" />
          )}
        </button>

        {!collapsed && (
          <div className="px-4 pb-4 space-y-3">
            <div
              className="h-1.5 rounded-full overflow-hidden border border-purple-800"
              style={{ background: 'rgba(var(--surface-deep, 10, 6, 4), 0.7)' }}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(to right, #a855f7, #d8b4fe)',
                  boxShadow: '0 0 8px rgba(168, 85, 247, 0.6)',
                }}
              />
            </div>

            <h4
              className="font-bold text-purple-200 italic text-sm"
              style={{ textShadow: '0 0 8px rgba(168, 85, 247, 0.4)' }}
            >
              {step.title}
            </h4>
            <p className="text-xs text-amber-100/80 italic leading-relaxed">{step.description}</p>

            {step.xp && (
              <div className="text-[10px] text-purple-400 italic">
                ✦ Reward: +{step.xp} XP{stepIndex === TUTORIAL_STEPS.length - 1 && ' + The Initiated title'}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              {step.autoComplete ? (
                step.actionLabel ? (
                  <button
                    onClick={() => onAction(step.id)}
                    className="flex-1 py-2 rounded-sm text-sm font-bold text-amber-50 border-2 border-purple-300 italic"
                    style={{
                      background: 'linear-gradient(to bottom, #a855f7 0%, #6b21a8 100%)',
                      boxShadow: '0 0 12px rgba(168, 85, 247, 0.4)',
                    }}
                  >
                    {step.actionLabel}
                  </button>
                ) : (
                  <div
                    className="flex-1 py-2 px-3 rounded-sm text-xs italic text-purple-300 text-center"
                    style={{
                      background: 'rgba(var(--surface-purple, 31, 12, 41), 0.6)',
                      border: '1px dashed rgba(168, 85, 247, 0.5)',
                    }}
                  >
                    {step.completionLabel}
                  </div>
                )
              ) : (
                <button
                  onClick={() => {
                    if (step.actionLabel) onAction(step.id);
                    onAdvance(step.id);
                  }}
                  className="flex-1 py-2 rounded-sm text-sm font-bold text-amber-50 border-2 border-purple-300 italic"
                  style={{
                    background: 'linear-gradient(to bottom, #a855f7 0%, #6b21a8 100%)',
                    boxShadow: '0 0 12px rgba(168, 85, 247, 0.4)',
                  }}
                >
                  {step.completionLabel}
                </button>
              )}
              <button
                onClick={onSkip}
                className="px-3 py-2 rounded-sm text-xs border-2 border-amber-700 text-amber-300 hover:bg-amber-900/30 italic"
                style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
                title="Skip the tutorial — thy path is thine own"
              >
                Skip
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TutorialPanel;
