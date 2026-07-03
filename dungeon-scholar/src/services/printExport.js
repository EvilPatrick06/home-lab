// Printable / PDF study-sheet export (sugg-pdf-print-export).
//
// The app is an installable offline PWA but has no way to get a tome's
// questions/flashcards out as a printable sheet for paper annotation, last-
// minute cram on a device that can't run the app, or a study group. This builds
// a clean, self-contained HTML study sheet and hands it to the browser's print
// path (Print -> Save as PDF). The HTML builder is pure + unit-testable; the
// launcher opens a new window and triggers print.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PRINT_CSS = [
  '*{box-sizing:border-box}',
  'body{font-family:Georgia,"Times New Roman",serif;color:#111;margin:2rem;line-height:1.5}',
  'h1{font-size:1.6rem;margin:0 0 .25rem}',
  '.sub{color:#555;font-size:.9rem;margin:0 0 1.5rem}',
  'h2{font-size:1.1rem;border-bottom:1px solid #ccc;padding-bottom:.25rem;margin:1.5rem 0 .75rem}',
  '.item{margin:0 0 1rem;page-break-inside:avoid}',
  '.q{font-weight:bold}',
  '.opts{margin:.25rem 0 0 1.25rem;padding:0}',
  '.opts li{margin:.1rem 0}',
  '.ans{color:#0a6b2e;margin-top:.35rem;font-style:italic}',
  '.blank{color:#888}',
  '@media print{body{margin:1rem} a{color:#111;text-decoration:none}}',
].join('');

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Build a printable HTML study sheet for a tome.
 * @param {object} tome — library entry ({ data }) or raw tome-data.
 * @param {{ withAnswers?: boolean }} [opts] — include the answer key.
 * @returns {string} a full standalone HTML document.
 */
export function buildPrintableHtml(tome, { withAnswers = true } = {}) {
  const data = tome && tome.data && typeof tome.data === 'object' ? tome.data : tome || {};
  const title = (data.metadata && data.metadata.title) || 'Study sheet';
  const subject = (data.metadata && data.metadata.subject) || '';
  const flashcards = Array.isArray(data.flashcards) ? data.flashcards : [];
  const quiz = Array.isArray(data.quiz) ? data.quiz : [];

  const parts = [];
  parts.push('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">');
  parts.push(`<title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>`);
  parts.push(`<h1>${esc(title)}</h1>`);
  const subline = [subject, withAnswers ? 'with answers' : 'questions only'].filter(Boolean).join(' · ');
  if (subline) parts.push(`<p class="sub">${esc(subline)}</p>`);

  if (flashcards.length) {
    parts.push('<h2>Flashcards</h2>');
    flashcards.forEach((c, i) => {
      parts.push('<div class="item">');
      parts.push(`<div class="q">${i + 1}. ${esc(c.front)}</div>`);
      if (withAnswers) parts.push(`<div class="ans">${esc(c.back)}</div>`);
      else parts.push('<div class="blank">__________________________</div>');
      parts.push('</div>');
    });
  }

  if (quiz.length) {
    parts.push('<h2>Questions</h2>');
    quiz.forEach((q, i) => {
      parts.push('<div class="item">');
      parts.push(`<div class="q">${i + 1}. ${esc(q.question)}</div>`);
      if (Array.isArray(q.options) && q.options.length) {
        parts.push('<ol class="opts" type="A">');
        q.options.forEach((o) => {
          parts.push(`<li>${esc(o)}</li>`);
        });
        parts.push('</ol>');
      }
      if (withAnswers) {
        let ans = '';
        if (Array.isArray(q.options) && Number.isInteger(q.correctIndex)) {
          ans = `${LETTERS[q.correctIndex] || '?'}. ${q.options[q.correctIndex] ?? ''}`;
        } else if (q.type === 'truefalse') {
          ans = String(!!q.correctAnswer);
        } else if (q.correctAnswer != null) {
          ans = String(q.correctAnswer);
        }
        if (ans) parts.push(`<div class="ans">Answer: ${esc(ans)}</div>`);
        if (q.explanation) parts.push(`<div class="ans">${esc(q.explanation)}</div>`);
      }
      parts.push('</div>');
    });
  }

  if (!flashcards.length && !quiz.length) {
    parts.push('<p class="blank">This tome has no printable flashcards or questions.</p>');
  }

  parts.push('</body></html>');
  return parts.join('');
}

// Open the printable sheet in a new window and trigger the browser print
// dialog (from which the user can "Save as PDF"). Best-effort; returns false
// if the popup was blocked. Not covered by unit tests (needs a real window).
export function openPrintableTome(tome, opts) {
  const html = buildPrintableHtml(tome, opts);
  const w = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Give the new document a tick to lay out before invoking print.
  w.focus();
  setTimeout(() => {
    try {
      w.print();
    } catch {
      /* user can still print manually */
    }
  }, 250);
  return true;
}
