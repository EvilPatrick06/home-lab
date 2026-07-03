// Tome versioning (sugg-tome-versioning).
//
// A tome carried no version marker, so a shared tome was an immutable snapshot:
// once imported, a learner had no signal that the author later fixed a wrong
// answer key or typo, and no way to pull the fix short of delete+re-import
// (which discards local study progress). These pure helpers add a monotonic
// `revision` to tome metadata (absent = revision 0, back-compatible) and decide,
// on re-import of a tome whose id already exists locally, whether the incoming
// copy is NEWER so the app can offer a progress-preserving merge instead of a
// blind overwrite. Kept pure + unit-testable.

// Read a tome's revision from metadata (library entry OR raw tome-data).
// Absent / non-numeric -> 0, so old tomes compare as the base revision.
export function tomeRevision(tome) {
  const data = tome && tome.data && typeof tome.data === 'object' ? tome.data : tome;
  const rev = data && data.metadata ? data.metadata.revision : undefined;
  const n = Number(rev);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// Bump a tome-data object's revision by 1 (author "publish a fix" action).
// Returns a new data object; stamps updatedAt. Non-object input passes through.
export function bumpRevision(data, now = Date.now()) {
  if (!data || typeof data !== 'object') return data;
  const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const next = (Number(meta.revision) || 0) + 1;
  return { ...data, metadata: { ...meta, revision: next, updatedAt: now } };
}

/**
 * Compare an incoming tome against a local copy with the same id.
 * @returns {{ newer: boolean, same: boolean, older: boolean, incomingRevision: number, localRevision: number }}
 */
export function compareTomeVersions(incoming, local) {
  const incomingRevision = tomeRevision(incoming);
  const localRevision = tomeRevision(local);
  return {
    incomingRevision,
    localRevision,
    newer: incomingRevision > localRevision,
    same: incomingRevision === localRevision,
    older: incomingRevision < localRevision,
  };
}

/**
 * Decide what to do when importing a tome whose id already exists locally.
 *  - 'new'         : no local copy — a plain add.
 *  - 'update'      : incoming revision is newer — offer a progress-preserving merge.
 *  - 'up-to-date'  : same or older revision — nothing to pull.
 * @param {object} incoming — incoming tome (or tome-data).
 * @param {object[]} library — the local library entries ({ id, data, progress }).
 */
export function importDecision(incoming, library) {
  const data = incoming && incoming.data ? incoming.data : incoming;
  const id = data && (data.id || (incoming && incoming.id));
  const lib = Array.isArray(library) ? library : [];
  const local = lib.find((t) => t && (t.id === id || (t.data && t.data.id === id)));
  if (!local) return { action: 'new', local: null, ...compareTomeVersions(incoming, null) };
  const cmp = compareTomeVersions(incoming, local);
  if (cmp.newer) return { action: 'update', local, ...cmp };
  return { action: 'up-to-date', local, ...cmp };
}
