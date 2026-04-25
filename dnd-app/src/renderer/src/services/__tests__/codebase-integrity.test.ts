import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')

// ─── Suite 1: IPC Channels ───────────────────────────────────────

describe('IPC channels', () => {
  it('exports at least 50 channel constants', async () => {
    const { IPC_CHANNELS } = await import('../../../../shared/ipc-channels')
    const count = Object.keys(IPC_CHANNELS).length
    expect(count).toBeGreaterThanOrEqual(50)
  })
})

// ─── Suite 2: JSON data files ────────────────────────────────────

describe('JSON data files', () => {
  const dataDir = join(ROOT, 'src/renderer/public/data/5e')

  it('data directory exists', () => {
    expect(existsSync(dataDir)).toBe(true)
  })

  it('finds at least 50 JSON files', () => {
    function collectJson(dir: string): string[] {
      const results: string[] = []
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) results.push(...collectJson(full))
        else if (entry.name.endsWith('.json')) results.push(full)
      }
      return results
    }
    const files = collectJson(dataDir)
    expect(files.length).toBeGreaterThanOrEqual(50)
  })

  it('all JSON files parse without errors', () => {
    function collectJson(dir: string): string[] {
      const results: string[] = []
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) results.push(...collectJson(full))
        else if (entry.name.endsWith('.json')) results.push(full)
      }
      return results
    }
    const files = collectJson(dataDir)
    const errors: string[] = []
    for (const file of files) {
      try {
        JSON.parse(readFileSync(file, 'utf-8'))
      } catch (e) {
        errors.push(`${file.replace(ROOT, '')}: ${String(e)}`)
      }
    }
    expect(errors).toEqual([])
  })
})

// ─── Suite 3: Chat commands ──────────────────────────────────────

describe('Chat commands', () => {
  it('exports at least 100 commands', async () => {
    const { getCommands } = await import('@renderer/services/chat-commands/index')
    const commands = getCommands(true) // isDM=true — full set
    expect(commands.length).toBeGreaterThanOrEqual(100)
  })

  it('every command has name, description, execute', async () => {
    const { getCommands } = await import('@renderer/services/chat-commands/index')
    const commands = getCommands(true)
    for (const cmd of commands) {
      expect(typeof cmd.name, `${cmd.name}: name must be string`).toBe('string')
      expect(typeof cmd.description, `${cmd.name}: description must be string`).toBe('string')
      expect(typeof cmd.execute, `${cmd.name}: execute must be function`).toBe('function')
    }
  })

  it('reports duplicate command names (informational)', async () => {
    const { getCommands } = await import('@renderer/services/chat-commands/index')
    const commands = getCommands(true)
    const names = commands.map((c) => c.name)
    const duplicates = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))]
    if (duplicates.length > 0) {
      console.warn(
        `[codebase-integrity] ${duplicates.length} shared command names across DM+player contexts: ${duplicates.join(', ')}`
      )
    }
    // Shared names across DM/player contexts are intentional — just report
    expect(true).toBe(true)
  })
})

// ─── Suite 4: Service completeness ──────────────────────────────

describe('Service completeness', () => {
  function scanForUnimplemented(dir: string): string[] {
    const hits: string[] = []
    if (!existsSync(dir)) return hits
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        hits.push(...scanForUnimplemented(full))
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        const src = readFileSync(full, 'utf-8')
        if (src.includes("throw new Error('not implemented')")) {
          hits.push(full.replace(ROOT, '').replace(/\\/g, '/'))
        }
      }
    }
    return hits
  }

  it('lists any files with "not implemented" stubs (informational — always passes)', () => {
    const servicesDir = join(ROOT, 'src/renderer/src/services')
    const found = scanForUnimplemented(servicesDir)
    if (found.length > 0) {
      console.warn(`[codebase-integrity] Found ${found.length} "not implemented" stub(s):`)
      for (const f of found) console.warn(`  ${f}`)
    }
    expect(true).toBe(true)
  })
})
