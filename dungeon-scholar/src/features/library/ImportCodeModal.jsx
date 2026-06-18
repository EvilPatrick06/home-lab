import { useState } from 'react';
import { Hash, X } from 'lucide-react';
import { useDialogA11y } from '../../components/useDialogA11y.js';

function ImportCodeModal({ onClose, onSubmit }) {
  const panelRef = useDialogA11y({ onClose }); // 19A
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!text.trim()) {
      setError('Paste the share code first');
      return;
    }
    const success = onSubmit(text);
    if (success) onClose();
    else setError('Could not decode — make sure the entire code (starting with TOME-V1:) is pasted');
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Import tome code" className="rounded-sm max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col relative" style={{
        background: 'linear-gradient(135deg, rgba(var(--surface-purple, 31, 12, 41), 0.97) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.99) 100%)',
        border: '3px double rgba(168, 85, 247, 0.6)',
        boxShadow: '0 0 40px rgba(168, 85, 247, 0.3)',
      }}>
        <div className="absolute top-2 left-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-purple-400 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-purple-400 text-sm">⚜</div>

        <div className="p-4 border-b border-purple-700/50 flex justify-between items-center">
          <h3 className="text-xl font-bold text-purple-300 flex items-center gap-2 italic">
            <Hash className="w-5 h-5" /> ✦ Import Share Code ✦
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-purple-900/30 rounded-sm text-purple-300" aria-label="Close import share code dialog">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto overscroll-contain flex-1 flex flex-col gap-3">
          <p className="text-sm text-amber-100/80 italic">
            "Paste the sacred share code from a fellow scholar below. The code shall be deciphered and the tome added to thy library."
          </p>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setError(''); }}
            placeholder="TOME-V1:..."
            className="flex-1 min-h-[200px] p-3 rounded-sm border-2 focus:outline-hidden text-amber-50 font-mono text-xs"
            style={{
              background: 'rgba(var(--surface-deep, 10, 6, 4), 0.7)',
              borderColor: 'rgba(126, 34, 206, 0.5)',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
            }}
            autoFocus
          />
          {error && (
            <div className="p-3 rounded-sm text-sm italic" style={{
              background: 'rgba(127, 29, 29, 0.5)',
              border: '1px solid rgba(239, 68, 68, 0.7)',
              color: '#fecaca',
            }}>
              ✗ {error}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-purple-700/50 flex gap-2">
          <button onClick={onClose} className="px-6 py-3 rounded-sm border-2 border-amber-700 text-amber-200 italic" style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={!text.trim()} className="flex-1 py-3 font-bold rounded-sm flex items-center justify-center gap-2 text-amber-50 border-2 border-purple-300 italic disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(to bottom, #a855f7 0%, #6b21a8 100%)', boxShadow: '0 0 20px rgba(168, 85, 247, 0.5)' }}>
            <Hash className="w-4 h-4" /> Decode & Inscribe
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImportCodeModal;
