import { Check, ImagePlus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { generateTomeId } from '../../game/tome.js';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';
import { isAllowedOcclusionImage, normalizeMasks, validOcclusionCard } from '../../services/occlusion.js';

const SHELL_STYLE = {
  background:
    'linear-gradient(135deg, rgba(var(--surface-amber, 41, 24, 12), 0.97) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.99) 100%)',
  border: '3px double rgba(245, 158, 11, 0.6)',
  boxShadow: '0 0 40px rgba(245, 158, 11, 0.3)',
};

// Author an image-occlusion card: pick an image, click on it to drop masked
// regions, label each, and inscribe a one-card tome. Click-to-place (not drag)
// keeps it simple; mask boxes use a sensible default size and can be removed.
function OcclusionAuthor({ onClose, onCreate }) {
  const panelRef = useDialogA11y({ onClose });
  const [image, setImage] = useState('');
  const [masks, setMasks] = useState([]);
  const [title, setTitle] = useState('');
  const [front, setFront] = useState('');
  const [error, setError] = useState('');

  const onPickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      if (!isAllowedOcclusionImage(url)) {
        setError('Unsupported image — use a PNG, JPG, GIF, or WebP.');
        return;
      }
      setError('');
      setImage(url);
      setMasks([]);
    };
    reader.readAsDataURL(file);
  };

  const onImageClick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const w = 0.18;
    const h = 0.1;
    const x = Math.max(0, Math.min(1 - w, (e.clientX - r.left) / r.width - w / 2));
    const y = Math.max(0, Math.min(1 - h, (e.clientY - r.top) / r.height - h / 2));
    setMasks((ms) => [...ms, { x, y, w, h, answer: '' }]);
  };

  const setAnswer = (i, val) => setMasks((ms) => ms.map((m, idx) => (idx === i ? { ...m, answer: val } : m)));
  const removeMask = (i) => setMasks((ms) => ms.filter((_, idx) => idx !== i));

  const create = () => {
    const card = {
      id: `occ_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'occlusion',
      front: front.trim() || undefined,
      image,
      masks: normalizeMasks(masks),
    };
    if (!validOcclusionCard(card)) {
      setError('Add an image and at least one masked region first.');
      return;
    }
    const tome = {
      id: generateTomeId(),
      metadata: {
        title: title.trim() || 'Occlusion deck',
        subject: 'Imported',
        author: 'Occlusion author',
        description: `Image-occlusion card with ${card.masks.length} masked region${card.masks.length === 1 ? '' : 's'}.`,
      },
      flashcards: [card],
      quiz: [],
      labs: [],
    };
    const ok = onCreate?.(tome);
    if (ok !== false) onClose?.();
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Author an image-occlusion card"
        className="rounded-sm max-w-3xl w-full max-h-[92vh] overflow-auto flex flex-col relative p-5"
        style={SHELL_STYLE}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-amber-200 italic flex items-center gap-2">
            <ImagePlus className="w-5 h-5" /> Author Occlusion Card
          </h2>
          <button
            onClick={onClose}
            aria-label="Close occlusion author"
            className="p-2 rounded-sm border-2 border-amber-700 text-amber-200 hover:bg-amber-900/30"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-2 mb-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Deck title (optional)"
            aria-label="Deck title"
            className="px-3 py-2 rounded-sm border-2 border-amber-700 text-amber-100 italic text-sm"
            style={{ background: 'rgba(var(--surface-deep, 10, 6, 4), 0.5)' }}
          />
          <input
            value={front}
            onChange={(e) => setFront(e.target.value)}
            placeholder="Prompt shown above the image (optional)"
            aria-label="Card prompt"
            className="px-3 py-2 rounded-sm border-2 border-amber-700 text-amber-100 italic text-sm"
            style={{ background: 'rgba(var(--surface-deep, 10, 6, 4), 0.5)' }}
          />
        </div>

        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-sm border-2 border-amber-700 text-amber-200 italic text-sm cursor-pointer w-fit mb-3">
          <ImagePlus className="w-4 h-4" /> {image ? 'Choose a different image' : 'Choose an image'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={onPickImage}
            className="hidden"
          />
        </label>

        {error && <div className="text-sm text-red-300 italic mb-2">{error}</div>}

        {image ? (
          <>
            <div className="text-xs text-amber-300/80 italic mb-2">Click on the image to drop a masked region.</div>
            <div className="relative inline-block max-w-full mx-auto mb-3" style={{ lineHeight: 0 }}>
              {/* biome-ignore lint/a11y/noStaticElementInteractions: image canvas placement target */}
              <img
                src={image}
                alt="Occlusion source"
                onClick={onImageClick}
                className="max-w-full rounded-sm cursor-crosshair"
                style={{ maxHeight: 420 }}
              />
              {masks.map((m, i) => (
                <div
                  key={i}
                  className="absolute flex items-center justify-center text-amber-950 font-bold text-xs"
                  style={{
                    left: `${m.x * 100}%`,
                    top: `${m.y * 100}%`,
                    width: `${m.w * 100}%`,
                    height: `${m.h * 100}%`,
                    background: 'rgba(245, 158, 11, 0.55)',
                    border: '2px solid rgba(245, 158, 11, 0.9)',
                    borderRadius: 3,
                  }}
                >
                  {i + 1}
                </div>
              ))}
            </div>

            {masks.length > 0 && (
              <div className="space-y-2 mb-3">
                {masks.map((m, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-amber-300 text-xs w-5 text-right">{i + 1}.</span>
                    <input
                      value={m.answer}
                      onChange={(e) => setAnswer(i, e.target.value)}
                      placeholder={`Answer for region ${i + 1}`}
                      aria-label={`Answer for masked region ${i + 1}`}
                      className="flex-1 px-2 py-1 rounded-sm border-2 border-amber-700 text-amber-100 text-sm"
                      style={{ background: 'rgba(var(--surface-deep, 10, 6, 4), 0.5)' }}
                    />
                    <button
                      onClick={() => removeMask(i)}
                      aria-label={`Remove region ${i + 1}`}
                      className="p-1 rounded-sm border-2 border-red-800 text-red-300 hover:bg-red-900/30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-amber-100/60 italic py-6 text-center">
            Choose an image to begin. Then click on it to mask the regions you want to be quizzed on.
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-sm border-2 border-amber-700 text-amber-200 italic"
            style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
          >
            Cancel
          </button>
          <button
            onClick={create}
            disabled={!image || masks.length === 0}
            data-autofocus
            className="px-4 py-2 rounded-sm border-2 border-amber-300 btn-gold-ink font-bold italic flex items-center gap-2 disabled:opacity-40"
            style={{ background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 50%, #b45309 100%)' }}
          >
            <Check className="w-4 h-4" /> Inscribe Tome
          </button>
        </div>
      </div>
    </div>
  );
}

export default OcclusionAuthor;
