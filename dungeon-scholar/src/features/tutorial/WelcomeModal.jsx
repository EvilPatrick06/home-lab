import { Castle, Compass } from 'lucide-react';
import { TUTORIAL_STEPS } from '../../game/tutorial.js';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';

function WelcomeModal({ onStart, onSkip }) {
  const panelRef = useDialogA11y({ onClose: onSkip }); // 19A
  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Welcome"
        className="rounded-sm max-w-2xl w-full overflow-hidden flex flex-col relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-amber, 41, 24, 12), 0.99) 0%, rgba(var(--surface-deep, 10, 6, 4), 1) 100%)',
          border: '4px double rgba(245, 158, 11, 0.7)',
          boxShadow: '0 0 60px rgba(245, 158, 11, 0.4)',
        }}
      >
        <div className="absolute top-2 left-2 text-amber-500 text-lg">⚜</div>
        <div className="absolute top-2 right-2 text-amber-500 text-lg">⚜</div>
        <div className="absolute bottom-2 left-2 text-amber-500 text-lg">⚜</div>
        <div className="absolute bottom-2 right-2 text-amber-500 text-lg">⚜</div>

        <div className="p-8 text-center space-y-4">
          <Castle
            className="w-20 h-20 mx-auto text-amber-400"
            style={{ filter: 'drop-shadow(0 0 16px rgba(245, 158, 11, 0.8))' }}
          />
          <h2
            className="text-3xl font-bold tracking-wider"
            style={{
              background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 50%, #92400e 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 0 20px rgba(245, 158, 11, 0.4)',
            }}
          >
            ⚔ WELCOME, BRAVE SCHOLAR ⚔
          </h2>
          <p className="text-amber-100/80 italic leading-relaxed">
            "Long has the realm awaited thy arrival. Within these halls, knowledge becomes adventure — riddles become
            quests, scrolls become spells of memory, and every studied page brings thee closer to mastery."
          </p>
          <p className="text-amber-100/70 italic text-sm">
            Wouldst thou follow the path of the Scholar&apos;s Awakening? A {TUTORIAL_STEPS.length}-step tutorial shall
            guide thee through each of these sacred halls. Or thou mayest set forth alone, if thy spirit demands it.
          </p>
          <div className="text-xs text-amber-700 italic mt-4">
            ✦ Completing the Awakening grants the title <span className="text-amber-300 font-bold">The Initiated</span>{' '}
            ✦
          </div>
        </div>
        <div className="p-4 border-t border-amber-700/50 flex gap-2">
          <button
            onClick={onSkip}
            className="flex-1 py-3 rounded-sm border-2 border-amber-700 text-amber-200 italic"
            style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
          >
            Walk Alone
          </button>
          <button
            onClick={onStart}
            className="flex-1 py-3 font-bold rounded-sm flex items-center justify-center gap-2 text-amber-950 border-2 border-amber-300 italic"
            style={{
              background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
              boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)',
            }}
          >
            <Compass className="w-4 h-4" /> Begin the Awakening
          </button>
        </div>
      </div>
    </div>
  );
}

export default WelcomeModal;
