import { isAbsolute, relative, resolve } from 'node:path'

/**
 * True iff `target` resolves to `base` itself or to a path strictly inside
 * `base`, checked at a path-component boundary via `relative()` — NOT a bare
 * string prefix. A prefix check (`target.startsWith(base)`) wrongly accepts a
 * sibling directory whose name merely begins with `base` (e.g. base
 * `<dir>/myplugin` matched by `<dir>/myplugin-evil`). Mirrors the existing
 * `isAiReadAllowed` containment pattern in `ai/file-reader.ts`.
 * (SECURITY-LOG 2026-06-22: plugin/game-data path-traversal boundary.)
 */
export function isPathInside(base: string, target: string): boolean {
  const rb = resolve(base)
  const rt = resolve(target)
  if (rt === rb) return true
  const rel = relative(rb, rt)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}
