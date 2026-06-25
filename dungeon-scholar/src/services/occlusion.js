// Image-occlusion flashcards: mask one or more labeled regions of an image and
// ask the learner to recall what's hidden (the staple Anki "Image Occlusion"
// study mode). A diagram-heavy cert deck (subnet layouts, OSI stacks, port
// maps, trust boundaries) is exactly where this shines.
//
// Card shape (a flashcard with type:'occlusion'):
//   {
//     id, type: 'occlusion',
//     front?: string,          // optional prompt shown above the image
//     image: string,           // data:image/* base64 OR https URL
//     masks: [{ x, y, w, h, answer }]  // coords are FRACTIONS 0..1 of the image
//   }
// Fractional coords keep the overlay correct at any rendered image size.
//
// Occlusion cards flow through the SAME SRS path as any flashcard (they carry a
// card id, so scheduleCard schedules them normally) and the SAME import paths
// (they live in a tome's `flashcards` array).

const DATA_IMG_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-zA-Z0-9+/=]+$/i;

export function isAllowedOcclusionImage(src) {
  if (typeof src !== 'string' || src.length === 0) return false;
  if (DATA_IMG_RE.test(src)) return true;
  return /^https:\/\//i.test(src); // production CSP img-src further restricts hosts
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function normalizeMask(m) {
  if (!m || typeof m !== 'object') return null;
  const x = clamp01(m.x);
  const y = clamp01(m.y);
  let w = clamp01(m.w);
  let h = clamp01(m.h);
  if (w <= 0) w = 0.12;
  if (h <= 0) h = 0.08;
  // keep the box inside the image bounds
  w = Math.min(w, 1 - x);
  h = Math.min(h, 1 - y);
  const answer = m.answer == null ? '' : String(m.answer);
  return { x, y, w, h, answer };
}

export function normalizeMasks(masks) {
  return (Array.isArray(masks) ? masks : []).map(normalizeMask).filter(Boolean);
}

export function isOcclusionCard(card) {
  return (
    !!card &&
    card.type === 'occlusion' &&
    isAllowedOcclusionImage(card.image) &&
    Array.isArray(card.masks) &&
    card.masks.length > 0
  );
}

export function normalizeOcclusionCard(card) {
  if (!card || card.type !== 'occlusion') return card;
  return { ...card, masks: normalizeMasks(card.masks) };
}

export function validOcclusionCard(card) {
  return isOcclusionCard(card) && normalizeMasks(card.masks).length > 0;
}

// --- authoring helpers ------------------------------------------------------

export function addMask(card, mask) {
  const base = card && card.type === 'occlusion' ? card : { ...(card || {}), type: 'occlusion' };
  const masks = normalizeMasks([...(base.masks || []), mask]);
  return { ...base, type: 'occlusion', masks };
}

export function updateMaskAnswer(card, index, answer) {
  const masks = (card?.masks || []).map((m, i) => (i === index ? { ...m, answer: String(answer ?? '') } : m));
  return { ...card, masks };
}

export function removeMask(card, index) {
  const masks = (card?.masks || []).filter((_, i) => i !== index);
  return { ...card, masks };
}
