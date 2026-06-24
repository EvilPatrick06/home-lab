// Accuracy palette helper (CVD).
//
// Centralizes the per-domain accuracy color ramp so the colorblind-safe
// option can re-color every analytics surface from one place. The DEFAULT
// (non-CVD) values are byte-for-byte the ramps the screens used inline before
// this module existed, so the standard palette is visually unchanged.
//
// When `cvd` is true, the red↔green scale (worst-case axis for deuteranopia /
// protanopia) is replaced with a CVD-safe blue↔orange scale drawn from the
// Okabe–Ito qualitative palette. Hue is never the SOLE signal — callers pair
// the color with the numeric % and a `tierLabel()` word.

const STANDARD = {
  high: {
    bg: 'rgba(245, 158, 11, 0.35)',
    border: '#fbbf24',
    text: '#fde047',
    fill: 'linear-gradient(to right, #f59e0b, #fde047)',
  },
  good: {
    bg: 'rgba(16, 185, 129, 0.32)',
    border: '#10b981',
    text: '#a7f3d0',
    fill: 'linear-gradient(to right, #10b981, #34d399)',
  },
  fair: {
    bg: 'rgba(245, 158, 11, 0.22)',
    border: 'rgba(245, 158, 11, 0.6)',
    text: '#fde68a',
    fill: 'linear-gradient(to right, #f59e0b, #fbbf24)',
  },
  weak: {
    bg: 'rgba(239, 68, 68, 0.25)',
    border: '#ef4444',
    text: '#fecaca',
    fill: 'linear-gradient(to right, #dc2626, #ef4444)',
  },
};

// CVD-safe (Okabe–Ito): blue = strong, bluish-green = good, orange = fair,
// vermillion = weak. Distinguishable across the common CVD types because the
// signal axis is blue↔orange rather than green↔red.
const CVD = {
  high: {
    bg: 'rgba(86, 180, 233, 0.30)',
    border: '#56B4E9',
    text: '#d4ecfb',
    fill: 'linear-gradient(to right, #0072B2, #56B4E9)',
  },
  good: {
    bg: 'rgba(0, 158, 115, 0.30)',
    border: '#009E73',
    text: '#bdeede',
    fill: 'linear-gradient(to right, #009E73, #56B4E9)',
  },
  fair: {
    bg: 'rgba(230, 159, 0, 0.25)',
    border: '#E69F00',
    text: '#ffe2b0',
    fill: 'linear-gradient(to right, #E69F00, #f0c44c)',
  },
  weak: {
    bg: 'rgba(213, 94, 0, 0.28)',
    border: '#D55E00',
    text: '#ffd3bb',
    fill: 'linear-gradient(to right, #9c4400, #D55E00)',
  },
};

function tierOf(pct) {
  if (pct >= 90) return 'high';
  if (pct >= 75) return 'good';
  if (pct >= 50) return 'fair';
  return 'weak';
}

// Full ramp swatch ({ bg, border, text, fill }) for a 0–100 accuracy percent.
export function rampForPct(pct, cvd = false) {
  return (cvd ? CVD : STANDARD)[tierOf(pct)];
}

// Single solid color for a simple two-state bar (weak < 70 vs strong).
export function barColor(acc, cvd = false) {
  if (acc < 70) return cvd ? '#D55E00' : '#f43f5e';
  return cvd ? '#0072B2' : '#10b981';
}

// Hue-independent tier word so accuracy is legible without relying on color.
export function tierLabel(pct) {
  if (pct >= 90) return 'Mastered';
  if (pct >= 75) return 'Strong';
  if (pct >= 50) return 'Fair';
  return 'Weak';
}
