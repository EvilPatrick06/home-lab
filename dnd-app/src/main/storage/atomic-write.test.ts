import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { atomicWriteFile, atomicWriteFileSync } from './atomic-write'

// Phase 28i — the atomic-write primitive's whole job is real fs (write-temp,
// then rename over destination). Test it against a real OS tmp dir, not mocks.

describe('atomic-write', () => {
  let dir: string
  let target: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'atomic-write-'))
    target = join(dir, 'out.json')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  describe('atomicWriteFile (async)', () => {
    it('writes string content to the target path', async () => {
      await atomicWriteFile(target, '{"hello":"world"}')
      expect(existsSync(target)).toBe(true)
      expect(readFileSync(target, 'utf-8')).toBe('{"hello":"world"}')
    })

    it('writes Buffer content (binary path) to the target', async () => {
      const buf = Buffer.from([0x00, 0x01, 0xff, 0x42])
      await atomicWriteFile(target, buf)
      expect(existsSync(target)).toBe(true)
      const written = readFileSync(target)
      expect(written.equals(buf)).toBe(true)
    })

    it('honours a non-default encoding for string data', async () => {
      // Latin-1 'é' (0xE9) round-trips byte-for-byte only with the matching encoding.
      await atomicWriteFile(target, 'café', 'latin1')
      const bytes = readFileSync(target)
      expect(bytes[bytes.length - 1]).toBe(0xe9)
    })

    it('overwrites existing content (last write wins)', async () => {
      writeFileSync(target, 'OLD CONTENT')
      await atomicWriteFile(target, 'NEW CONTENT')
      expect(readFileSync(target, 'utf-8')).toBe('NEW CONTENT')
    })

    it('leaves no .tmp files behind after a successful write', async () => {
      await atomicWriteFile(target, 'clean')
      const leftovers = readdirSync(dir).filter((f) => f.endsWith('.tmp'))
      expect(leftovers).toEqual([])
    })

    it('does not stomp on a concurrent write to the same path (unique tmp per call)', async () => {
      // Both resolve; the final file is one of the two payloads, never a torn mix.
      await Promise.all([atomicWriteFile(target, 'AAAA'), atomicWriteFile(target, 'BBBB')])
      const final = readFileSync(target, 'utf-8')
      expect(['AAAA', 'BBBB']).toContain(final)
      // No orphaned tmp survives either rename.
      expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
    })

    it('rejects and cleans up the tmp file when the destination dir is missing', async () => {
      const badTarget = join(dir, 'no-such-subdir', 'out.json')
      await expect(atomicWriteFile(badTarget, 'data')).rejects.toThrow()
      // The orphaned tmp lives next to the (nonexistent) target dir, so the
      // tmp write itself fails — assert nothing leaked into the real tmp dir.
      expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
    })
  })

  describe('atomicWriteFileSync', () => {
    it('writes string content synchronously to the target path', () => {
      atomicWriteFileSync(target, 'sync-payload')
      expect(existsSync(target)).toBe(true)
      expect(readFileSync(target, 'utf-8')).toBe('sync-payload')
    })

    it('overwrites existing content and leaves no tmp behind', () => {
      writeFileSync(target, 'stale')
      atomicWriteFileSync(target, 'fresh')
      expect(readFileSync(target, 'utf-8')).toBe('fresh')
      expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([])
    })
  })
})
