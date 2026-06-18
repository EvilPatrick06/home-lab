import { useState } from 'react';
import { Copy, X, Scroll } from 'lucide-react';
import { useDialogA11y } from '../../components/useDialogA11y.js';

function PasteTomeModal({ onClose, onSubmit }) {
  const panelRef = useDialogA11y({ onClose }); // 19A
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!text.trim()) {
      setError('Paste the tome text first');
      return;
    }
    const success = onSubmit(text);
    if (success) onClose();
    else setError('Could not parse — make sure you pasted the entire JSON object');
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Paste tome text" className="rounded-sm max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col relative" style={{
        background: 'linear-gradient(135deg, rgba(var(--surface-amber, 41, 24, 12), 0.97) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.99) 100%)',
        border: '3px double rgba(245, 158, 11, 0.6)',
        boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)',
      }}>
        <div className="absolute top-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-amber-500 text-sm">⚜</div>

        <div className="p-4 border-b border-amber-700/50 flex justify-between items-center">
          <h3 className="text-xl font-bold text-amber-300 flex items-center gap-2 italic">
            <Copy className="w-5 h-5" /> ✦ Paste Tome Text ✦
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-amber-900/30 rounded-sm text-amber-300" aria-label="Close paste tome dialog">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto overscroll-contain flex-1 flex flex-col gap-3">
          <p className="text-sm text-amber-100/80 italic">
            "Paste the tome's sacred text below. Code-block fences (```json) shall be stripped automatically. Only valid tome JSON shall be accepted."
          </p>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setError(''); }}
            placeholder='{"metadata": {"title": "..."}, "flashcards": [...], ...}'
            className="flex-1 min-h-[300px] p-3 rounded-sm border-2 focus:outline-hidden text-amber-50 font-mono text-xs"
            style={{
              background: 'rgba(var(--surface-deep, 10, 6, 4), 0.7)',
              borderColor: 'rgba(180, 83, 9, 0.5)',
              fontFamily: 'monospace',
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
        <div className="p-4 border-t border-amber-700/50 flex gap-2">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-sm border-2 border-amber-700 text-amber-200 italic"
            style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            title={text.trim() ? 'Inscribe the pasted tome' : 'Paste tome JSON to enable'}
            className="flex-1 py-3 font-bold rounded-sm flex items-center justify-center gap-2 text-amber-950 border-2 border-amber-300 italic disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
              boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)',
            }}
          >
            <Scroll className="w-4 h-4" /> {text.trim() ? 'Inscribe the Tome' : 'Paste JSON first'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PasteTomeModal;
