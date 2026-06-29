// Library bulk / multi-select actions (export, tag, delete many tomes at once).
// Pure helpers so the LibraryScreen UI stays thin and the logic is unit-tested.

export function buildTomeBundle(tomes) {
  const list = (Array.isArray(tomes) ? tomes : []).filter(Boolean);
  return {
    bundle: 'dungeon-scholar',
    version: 1,
    exportedAt: new Date().toISOString(),
    count: list.length,
    tomes: list.map((t) => t.data).filter(Boolean),
  };
}

export function bundleFilename(count) {
  const n = Number.isFinite(count) ? count : 0;
  return `dungeon-scholar-bundle-${n}-tome${n === 1 ? '' : 's'}.json`;
}

// Add a shared tag to every tome whose id is in `ids`. Returns a NEW library
// array (non-mutating); de-dupes the tag and skips tomes that already have it.
export function applyTagToTomes(library, ids, tag) {
  const lib = Array.isArray(library) ? library : [];
  const set = new Set(Array.isArray(ids) ? ids : []);
  const clean = String(tag == null ? '' : tag).trim();
  if (!clean || set.size === 0) return lib;
  return lib.map((t) => {
    if (!t || !set.has(t.id)) return t;
    const meta = t.data?.metadata || {};
    const tags = Array.isArray(meta.tags) ? meta.tags : [];
    if (tags.includes(clean)) return t;
    return { ...t, data: { ...t.data, metadata: { ...meta, tags: [...tags, clean] } } };
  });
}

// Trigger a browser download of text content as a file.
export function downloadTextFile(text, filename, mime = 'application/json') {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return false;
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch {
    return false;
  }
}
