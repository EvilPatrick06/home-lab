// Production-safe logging (PHASE-18 18A / H6 + L7). In PROD builds, errors are
// logged message-only via console.warn so Supabase error objects (user UUIDs,
// JWT fragments, response bodies) never reach the console. In dev, full objects
// go to console.error. `import.meta.env.PROD` is read at call time (not module
// scope) so vitest's vi.stubEnv works with static imports.
const PREFIX = '[Dungeon Scholar]';

export function errorMessageOf(err) {
  if (err == null) return 'unknown error';
  if (typeof err === 'string') return err;
  if (typeof err.message === 'string' && err.message) return err.message;
  try {
    return String(err);
  } catch {
    return 'unknown error';
  }
}

export function logError(context, err) {
  if (import.meta.env.PROD) {
    // eslint-disable-next-line no-console
    console.warn(`${PREFIX} ${context}: ${errorMessageOf(err)}`);
  } else {
    // eslint-disable-next-line no-console
    console.error(`${PREFIX} ${context}:`, err);
  }
}

export function logWarn(context, detail = '') {
  // eslint-disable-next-line no-console
  console.warn(`${PREFIX} ${context}${detail ? `: ${detail}` : ''}`);
}
