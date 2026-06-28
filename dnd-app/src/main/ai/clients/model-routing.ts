/**
 * PHASE-29 29A — per-task model routing (pure, no I/O).
 *
 * Opt-in: sends mechanics/extraction/summary work to a small fast model while reserving the
 * primary model for narration (and vision). Inert by default — with `routing` undefined/disabled
 * or `smallModel` empty, every task resolves to the primary model, so runtime is byte-identical.
 *
 * Kept dependency-free (no ai-service import) so it unit-tests in isolation and any module can
 * import the resolver without a cycle.
 */

export type AiTaskClass = 'narration' | 'summary' | 'extraction' | 'mechanics' | 'vision'
export type RoutableTask = 'summary' | 'extraction' | 'mechanics'

export interface AiRoutingConfig {
  enabled: boolean // master switch — default false
  smallModel: string // '' = unset → everything falls back to primary
  overrides?: Record<string, string> // per-task model id; only ROUTABLE_TASKS keys are honoured
}

export const ROUTABLE_TASKS: readonly RoutableTask[] = ['summary', 'extraction', 'mechanics']

export function isRoutableTask(t: AiTaskClass): t is RoutableTask {
  return (ROUTABLE_TASKS as readonly string[]).includes(t)
}

/**
 * Pure resolver. `narration` and `vision` ALWAYS return the primary model. A routable task returns
 * `overrides[task] ?? smallModel` when routing is enabled and that value is non-empty, else the
 * primary model.
 */
export function resolveModelForTask(
  task: AiTaskClass,
  primaryModel: string,
  routing: AiRoutingConfig | undefined
): string {
  if (!routing?.enabled) return primaryModel
  if (!isRoutableTask(task)) return primaryModel
  const override = routing.overrides?.[task]?.trim()
  if (override) return override
  const small = routing.smallModel?.trim()
  return small ? small : primaryModel
}
