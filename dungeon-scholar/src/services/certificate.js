// Exportable tome-completion certificate ("diploma").
//
// The progression layer (titles, achievements, the Ledger, Ascension) all stays
// inside the app. This produces a takeaway artifact: an illuminated-scroll-style
// "Certificate of Mastery" naming the scholar, the tome, the date, and the title
// earned, rendered to a canvas -> downloadable PNG (plus a print path for PDF).
//
// Mastery milestone: a tome counts as "mastered" once a strong majority of its
// flashcards are well-learned (reviewed at least twice AND stability past a
// one-week horizon, i.e. genuinely in long-term rotation, per the FSRS state).

export const MASTERY_THRESHOLD = 80; // percent of cards "mastered"
const MASTERED_MIN_REPS = 2;
const MASTERED_MIN_STABILITY_DAYS = 7;

export function tomeMasteryPct(progress, tome) {
  const cards = Array.isArray(tome?.flashcards) ? tome.flashcards : [];
  if (cards.length === 0) return 0;
  const map = (progress && progress.cardProgress) || {};
  let mastered = 0;
  for (const c of cards) {
    if (!c || typeof c.id !== 'string') continue;
    const st = map[c.id];
    if (st && (st.reps || 0) >= MASTERED_MIN_REPS && (st.stability || 0) >= MASTERED_MIN_STABILITY_DAYS) {
      mastered += 1;
    }
  }
  return Math.round((mastered / cards.length) * 100);
}

export function isTomeMastered(progress, tome) {
  const cards = Array.isArray(tome?.flashcards) ? tome.flashcards : [];
  return cards.length > 0 && tomeMasteryPct(progress, tome) >= MASTERY_THRESHOLD;
}

function safeName(s, fallback) {
  const t = (s == null ? '' : String(s)).trim();
  return t || fallback;
}

// Pure text builder — unit-testable without a canvas.
export function buildCertificateText({ scholarName, tomeTitle, title, masteryPct, date } = {}) {
  const d = date instanceof Date ? date : date ? new Date(date) : new Date();
  const dateText = Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const pct = Number.isFinite(masteryPct) ? Math.max(0, Math.min(100, Math.round(masteryPct))) : null;
  return {
    heading: 'Certificate of Mastery',
    intro: 'Be it known that',
    scholarName: safeName(scholarName, 'A Scholar'),
    titleText: safeName(title, ''),
    conferral: 'has demonstrated mastery of the tome',
    tomeTitle: safeName(tomeTitle, 'Untitled Tome'),
    masteryText: pct == null ? '' : `${pct}% mastery attained`,
    dateText,
    seal: 'Dungeon Scholar',
  };
}

export function certificateFilename({ tomeTitle } = {}) {
  const slug = safeName(tomeTitle, 'tome')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'tome';
  return `dungeon-scholar-certificate-${slug}.png`;
}

// Render the certificate to a PNG data URL. Returns null when no 2D canvas is
// available (e.g. test/headless env) so callers can degrade gracefully.
export function renderCertificatePng(opts = {}) {
  const t = buildCertificateText(opts);
  try {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 700;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;

    // Parchment background.
    ctx.fillStyle = '#f4e4c1';
    ctx.fillRect(0, 0, 1000, 700);
    const grad = ctx.createLinearGradient(0, 0, 0, 700);
    grad.addColorStop(0, 'rgba(120, 72, 20, 0.08)');
    grad.addColorStop(1, 'rgba(60, 30, 8, 0.16)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1000, 700);

    // Ornate double border.
    ctx.strokeStyle = '#7a4a12';
    ctx.lineWidth = 10;
    ctx.strokeRect(28, 28, 944, 644);
    ctx.lineWidth = 2;
    ctx.strokeRect(46, 46, 908, 608);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#5a360c';

    ctx.font = 'bold 52px Georgia, serif';
    ctx.fillText('✦ Certificate of Mastery ✦', 500, 150);

    ctx.font = 'italic 24px Georgia, serif';
    ctx.fillText(t.intro, 500, 230);

    ctx.font = 'bold 44px Georgia, serif';
    ctx.fillText(t.scholarName, 500, 295);

    if (t.titleText) {
      ctx.font = 'italic 22px Georgia, serif';
      ctx.fillText(t.titleText, 500, 332);
    }

    ctx.font = 'italic 24px Georgia, serif';
    ctx.fillText(t.conferral, 500, 400);

    ctx.font = 'bold 34px Georgia, serif';
    ctx.fillText(`“${t.tomeTitle}”`, 500, 450);

    if (t.masteryText) {
      ctx.font = '22px Georgia, serif';
      ctx.fillText(t.masteryText, 500, 500);
    }

    ctx.font = '20px Georgia, serif';
    if (t.dateText) ctx.fillText(t.dateText, 500, 590);
    ctx.font = 'italic 20px Georgia, serif';
    ctx.fillText(`— ${t.seal} —`, 500, 625);

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

// Trigger a browser download of a data URL.
export function downloadDataUrl(dataUrl, filename) {
  if (!dataUrl || typeof document === 'undefined') return false;
  try {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename || 'certificate.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}
