import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock node:fs before importing the module
vi.mock('node:fs', () => ({
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  statSync: vi.fn()
}))

vi.mock('node:path', () => ({
  join: (...parts: string[]) => parts.join('/')
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/fake/userData')
  }
}))

import * as fs from 'node:fs'
import { logToFile } from './log'

describe('logToFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: statSync returns a small file size (below rotation threshold)
    vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as ReturnType<typeof fs.statSync>)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes a formatted log entry to the log file', () => {
    logToFile('INFO', 'test message')

    expect(fs.appendFileSync).toHaveBeenCalledOnce()
    const [path, content, encoding] = vi.mocked(fs.appendFileSync).mock.calls[0]
    expect(path).toContain('app.log')
    expect(content).toContain('[INFO]')
    expect(content).toContain('test message')
    expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T/)
    expect(encoding).toBe('utf-8')
  })

  it('appends a stack trace when provided', () => {
    logToFile('ERROR', 'something broke', 'Error: boom\n  at foo.ts:1')

    const [, content] = vi.mocked(fs.appendFileSync).mock.calls[0] as [string, string]
    expect(content).toContain('something broke')
    expect(content).toContain('Error: boom')
    expect(content).toContain('at foo.ts:1')
  })

  it('does not append a stack section when stack is omitted', () => {
    logToFile('WARN', 'just a warning')

    const [, content] = vi.mocked(fs.appendFileSync).mock.calls[0] as [string, string]
    expect(content).not.toContain('\n\n')
    expect(content).toContain('just a warning')
  })

  it('creates the log directory via mkdirSync', () => {
    logToFile('DEBUG', 'checking dir creation')

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('logs'), { recursive: true })
  })

  it('rotates the log when file size exceeds 5 MB', () => {
    const FIVE_MB = 5 * 1024 * 1024
    vi.mocked(fs.statSync).mockReturnValue({ size: FIVE_MB } as ReturnType<typeof fs.statSync>)

    logToFile('INFO', 'trigger rotation')

    // renameSync called at least once to rotate
    expect(fs.renameSync).toHaveBeenCalled()
    const calls = vi.mocked(fs.renameSync).mock.calls
    // The primary file should be renamed to .1
    const primaryRotation = calls.find(([from, _to]) => !String(from).includes('.') || String(from).endsWith('app.log'))
    expect(primaryRotation).toBeDefined()
    const [from, to] = primaryRotation!
    expect(String(to)).toContain('.1')
    // The source file should be the main app.log
    expect(String(from)).toContain('app.log')
  })

  it('does not rotate when file size is below 5 MB', () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as ReturnType<typeof fs.statSync>)

    logToFile('INFO', 'small file, no rotation')

    expect(fs.renameSync).not.toHaveBeenCalled()
  })

  it('does not throw when statSync fails (file does not exist yet)', () => {
    vi.mocked(fs.statSync).mockImplementation(() => {
      throw new Error('ENOENT')
    })

    expect(() => logToFile('INFO', 'first entry')).not.toThrow()
    expect(fs.appendFileSync).toHaveBeenCalled()
  })

  it('does not throw when appendFileSync fails (logging must never crash the app)', () => {
    vi.mocked(fs.appendFileSync).mockImplementation(() => {
      throw new Error('disk full')
    })

    expect(() => logToFile('INFO', 'safe message')).not.toThrow()
  })

  it('includes the ISO timestamp in the log entry', () => {
    const before = new Date()
    logToFile('INFO', 'timestamp test')
    const after = new Date()

    const [, content] = vi.mocked(fs.appendFileSync).mock.calls[0] as [string, string]
    const tsMatch = content.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\]/)
    expect(tsMatch).not.toBeNull()
    const ts = new Date(tsMatch![1])
    expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
    expect(ts.getTime()).toBeLessThanOrEqual(after.getTime() + 1000)
  })

  it('includes the level label in the log entry', () => {
    logToFile('CRITICAL', 'level label test')

    const [, content] = vi.mocked(fs.appendFileSync).mock.calls[0] as [string, string]
    expect(content).toContain('[CRITICAL]')
  })

  it('log entry ends with a newline', () => {
    logToFile('INFO', 'newline check')

    const [, content] = vi.mocked(fs.appendFileSync).mock.calls[0] as [string, string]
    expect(String(content).endsWith('\n')).toBe(true)
  })
})
