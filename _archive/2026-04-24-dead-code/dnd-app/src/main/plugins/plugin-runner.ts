/**
 * Plugin Runner — Sandboxed V8 Isolate Execution
 *
 * Executes plugin and game-system code in an isolated V8 context
 * with no access to Node.js APIs (fs, net, child_process, etc.).
 *
 * IMPORTANT: Requires `npm install isolated-vm` before use.
 * isolated-vm is NOT currently in package.json — it must be added.
 *
 * Security model:
 * - 8MB memory limit per isolate (prevents memory bombs)
 * - 30-second execution timeout (prevents infinite loops)
 * - Only a controlled API surface is injected (gameState, registerAction, log)
 * - No access to require(), process, fs, net, or any Node.js globals
 */

import { logToFile } from '../log'

// Use dynamic require so TypeScript doesn't fail when isolated-vm is not installed.
// eslint-disable-next-line @typescript-eslint/no-require-imports
let ivm: typeof import('isolated-vm') | null = null
try {
  ivm = require('isolated-vm')
} catch {
  logToFile('WARN', 'isolated-vm not installed — plugin sandbox unavailable. Run: npm install isolated-vm')
}

// ── Public API surface exposed to plugins ──

export interface PluginGameState {
  /** Current campaign ID */
  campaignId?: string
  /** List of character names in the session */
  characterNames?: string[]
  /** Whether combat is active */
  combatActive?: boolean
  /** Current round number (if in combat) */
  combatRound?: number
  /** Current turn index (if in combat) */
  combatTurnIndex?: number
  /** Generic key-value store for plugins */
  custom?: Record<string, unknown>
}

export interface PluginAction {
  name: string
  label: string
  description?: string
  handler: string // serialized function name in the isolate
}

export interface PluginAPI {
  /** Read-only snapshot of game state */
  gameState: PluginGameState
  /** Register a named action that can be triggered from the UI */
  registerAction: (name: string, label: string, description?: string) => void
  /** Log a message (routed to the app log file, not console) */
  log: (...args: unknown[]) => void
}

export interface PluginRunResult {
  success: boolean
  actions: PluginAction[]
  logs: string[]
  error?: string
}

const MEMORY_LIMIT_MB = 8
const EXECUTION_TIMEOUT_MS = 30_000

/**
 * Run a plugin's JavaScript code inside a sandboxed V8 isolate.
 *
 * The plugin receives a controlled API surface:
 * - `gameState` — read-only snapshot of current game state
 * - `registerAction(name, label, description)` — declare a plugin action
 * - `log(...args)` — write to the app log (not the system console)
 *
 * The plugin has NO access to:
 * - require / import
 * - process, fs, net, child_process, etc.
 * - window, document, or DOM APIs
 * - Any globals beyond standard ECMAScript built-ins
 */
export async function runPlugin(code: string, api: PluginAPI): Promise<PluginRunResult> {
  if (!ivm) {
    return {
      success: false,
      actions: [],
      logs: [],
      error: 'isolated-vm is not installed. Run: npm install isolated-vm'
    }
  }

  const actions: PluginAction[] = []
  const logs: string[] = []

  let isolate: InstanceType<typeof ivm.Isolate> | null = null

  try {
    // 1. Create an isolate with a strict memory limit
    isolate = new ivm.Isolate({ memoryLimit: MEMORY_LIMIT_MB })
    const context = await isolate.createContext()

    // 2. Get the global object inside the isolate
    const jail = context.global

    // 3. Inject `gameState` as a frozen, read-only copy
    await jail.set('gameState', new ivm.ExternalCopy(api.gameState).copyInto({ release: true }), { copy: true })

    // 4. Inject `registerAction` as a Reference callback
    await jail.set(
      'registerAction',
      new ivm.Reference((name: string, label: string, description?: string) => {
        if (typeof name !== 'string' || typeof label !== 'string') return
        if (actions.length >= 100) return // cap the number of actions
        actions.push({
          name: name.slice(0, 128),
          label: label.slice(0, 128),
          description: typeof description === 'string' ? description.slice(0, 512) : undefined,
          handler: name
        })
      })
    )

    // 5. Inject `log` as a Reference callback
    await jail.set(
      'log',
      new ivm.Reference((...args: unknown[]) => {
        const line = args
          .map((a) => {
            if (typeof a === 'string') return a
            try {
              return JSON.stringify(a)
            } catch {
              return String(a)
            }
          })
          .join(' ')
        if (logs.length < 1000) {
          logs.push(line.slice(0, 2048))
        }
      })
    )

    // 6. Compile and run the plugin code
    const script = await isolate.compileScript(code)
    await script.run(context, { timeout: EXECUTION_TIMEOUT_MS })

    // 7. Log all output
    for (const line of logs) {
      logToFile('INFO', '[plugin]', line)
    }

    return {
      success: true,
      actions,
      logs
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logToFile('ERROR', `Plugin execution failed: ${message}`)
    return {
      success: false,
      actions,
      logs,
      error: message
    }
  } finally {
    // 8. Always dispose the isolate to free memory
    if (isolate) {
      try {
        isolate.dispose()
      } catch {
        // already disposed or gc'd
      }
    }
  }
}

/**
 * Load and execute a plugin from its scanned manifest.
 * Reads the entry file from the plugin directory and runs it in a sandbox.
 */
export async function loadAndRunPlugin(
  pluginDir: string,
  entryFile: string,
  gameState: PluginGameState
): Promise<PluginRunResult> {
  if (!ivm) {
    return {
      success: false,
      actions: [],
      logs: [],
      error: 'isolated-vm is not installed. Run: npm install isolated-vm'
    }
  }

  try {
    const { readFile } = await import('node:fs/promises')
    const { join, resolve } = await import('node:path')

    // Path traversal protection
    const entryPath = resolve(join(pluginDir, entryFile))
    if (!entryPath.startsWith(resolve(pluginDir))) {
      return {
        success: false,
        actions: [],
        logs: [],
        error: `Entry path traversal detected: ${entryFile}`
      }
    }

    const code = await readFile(entryPath, 'utf-8')

    const api: PluginAPI = {
      gameState,
      registerAction: () => {},
      log: (...args) => logToFile('INFO', '[plugin]', ...args.map(String))
    }

    return await runPlugin(code, api)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      actions: [],
      logs: [],
      error: message
    }
  }
}
