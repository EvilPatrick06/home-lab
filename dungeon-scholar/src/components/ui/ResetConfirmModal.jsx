import { useState } from 'react';
import { Skull, X } from 'lucide-react';
import { useDialogA11y } from '../useDialogA11y.js';

export function ResetConfirmModal({ onConfirm, onCancel }) {
  const panelRef = useDialogA11y({ onClose: onCancel }); // 19A
  const [confirmText, setConfirmText] = useState('');
  const isMatch = confirmText.trim().toUpperCase() === 'BEGIN ANEW';

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Reset progress" className="rounded-sm max-w-md w-full overflow-hidden flex flex-col relative" style={{
        background: 'linear-gradient(135deg, rgba(80, 20, 20, 0.95) 0%, rgba(20, 6, 6, 0.99) 100%)',
        border: '3px double rgba(220, 38, 38, 0.7)',
        boxShadow: '0 0 40px rgba(220, 38, 38, 0.4)',
      }}>
        <div className="absolute top-2 left-2 text-red-500 text-sm">⚔</div>
        <div className="absolute top-2 right-2 text-red-500 text-sm">⚔</div>
        <div className="absolute bottom-2 left-2 text-red-500 text-sm">⚔</div>
        <div className="absolute bottom-2 right-2 text-red-500 text-sm">⚔</div>

        <div className="p-4 border-b border-red-700/50 flex justify-between items-center">
          <h3 className="text-xl font-bold text-red-300 flex items-center gap-2 italic">
            <Skull className="w-5 h-5" /> ⚠ Erase Thy Saga ⚠
          </h3>
          <button onClick={onCancel} className="p-2 hover:bg-red-900/30 rounded-sm text-red-300" aria-label="Cancel and close erase saga dialog">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <p className="text-amber-100 italic leading-relaxed">
            "Brave scholar, dost thou truly wish to erase thy saga? All levels, achievements, titles, gold, tomes, and progress shall be lost to the void — never to return."
          </p>
          <p className="text-red-300 italic text-sm font-bold">
            This act cannot be undone.
          </p>
          <div className="text-xs text-amber-700 italic mt-2">
            Type <span className="text-amber-300 font-bold">BEGIN ANEW</span> below to confirm:
          </div>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && isMatch) onConfirm(); }}
            placeholder="BEGIN ANEW"
            className="w-full p-3 rounded-sm border-2 focus:outline-hidden italic text-amber-50 tracking-wider"
            style={{
              background: 'rgba(20, 6, 6, 0.8)',
              borderColor: isMatch ? 'rgba(239, 68, 68, 0.8)' : 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.5)',
              boxShadow: isMatch ? '0 0 15px rgba(239, 68, 68, 0.4)' : 'none',
            }}
            autoFocus
          />
        </div>
        <div className="p-4 border-t border-red-700/50 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-sm border-2 border-amber-700 text-amber-200 italic"
            style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!isMatch}
            className="flex-1 py-3 font-bold rounded-sm text-amber-50 border-2 border-red-400 italic disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(to bottom, #dc2626 0%, #991b1b 100%)',
              boxShadow: isMatch ? '0 0 20px rgba(220, 38, 38, 0.5)' : 'none',
            }}
          >
            ⚔ Erase Saga ⚔
          </button>
        </div>
      </div>
    </div>
  );
}
