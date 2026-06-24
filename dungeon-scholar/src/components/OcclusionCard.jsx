import { normalizeMasks } from '../services/occlusion.js';

// Renders an image-occlusion flashcard face. Unflipped: every labeled region is
// masked (opaque box with a "?") so the learner recalls what's hidden. Flipped:
// the masks turn translucent and reveal each region's answer text.
function OcclusionCard({ card, flipped }) {
  const masks = normalizeMasks(card?.masks);
  return (
    <div className="w-full">
      {card?.front && <div className="text-sm italic text-sky-200 mb-3 text-center">{card.front}</div>}
      <div className="relative inline-block max-w-full mx-auto" style={{ lineHeight: 0 }}>
        <img
          src={card?.image}
          alt={card?.front || 'Occlusion image'}
          className="max-w-full rounded-sm"
          style={{ maxHeight: 420 }}
        />
        {masks.map((m, i) => (
          <div
            key={i}
            className="absolute flex items-center justify-center text-center overflow-hidden"
            style={{
              left: `${m.x * 100}%`,
              top: `${m.y * 100}%`,
              width: `${m.w * 100}%`,
              height: `${m.h * 100}%`,
              background: flipped ? 'rgba(16, 185, 129, 0.18)' : 'rgba(17, 24, 39, 0.96)',
              border: flipped ? '2px solid rgba(16, 185, 129, 0.85)' : '2px solid rgba(245, 158, 11, 0.75)',
              borderRadius: 3,
            }}
          >
            <span
              className="text-xs font-bold px-1 leading-tight"
              style={{ color: flipped ? '#bbf7d0' : '#fcd34d' }}
            >
              {flipped ? m.answer || '✓' : '?'}
            </span>
          </div>
        ))}
      </div>
      <div className="text-center text-xs text-amber-700 mt-3 italic">
        {flipped ? '✦ Revealed — rate thy recall' : '~ Name each masked region, then flip ~'}
      </div>
    </div>
  );
}

export default OcclusionCard;
