// PHASE-40 40A (L14) — cap on raw tome-import payload size (chars for paste/share
// code, bytes for files). Legit tomes are ~100-300 KB; 2,000,000 gives >6x headroom
// while keeping worst-case JSON.parse work bounded (a 50 MB paste freezes the main
// thread for seconds).
export const MAX_TOME_IMPORT_BYTES = 2_000_000;

/** @returns {{ ok: boolean, message?: string }} */
export function checkImportSize(size) {
  if (typeof size === 'number' && size > MAX_TOME_IMPORT_BYTES) {
    const mb = (MAX_TOME_IMPORT_BYTES / 1_000_000).toFixed(0);
    return { ok: false, message: `Tome too large — the limit is ${mb} MB` };
  }
  return { ok: true };
}
