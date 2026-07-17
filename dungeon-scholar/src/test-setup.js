import '@testing-library/jest-dom/vitest';

// Pin the test document to standards mode so it matches production and KaTeX
// stops warning "KaTeX doesn't work in quirks mode" on stderr in every suite
// that renders math (ISSUES-LOG 2026-07-17). Two halves:
//   1. Give the happy-dom document a real <!DOCTYPE html> (production's
//      index.html always has one).
//   2. happy-dom (20.x) does not implement `document.compatMode` at all, so
//      KaTeX's `compatMode !== 'CSS1Compat'` check would warn even WITH the
//      doctype — define it explicitly as the standards-mode value.
if (!document.doctype) {
  document.insertBefore(document.implementation.createDocumentType('html', '', ''), document.documentElement);
}
if (document.compatMode !== 'CSS1Compat') {
  Object.defineProperty(document, 'compatMode', {
    value: 'CSS1Compat',
    configurable: true,
  });
}
