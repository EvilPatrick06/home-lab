import { randomUUID } from 'node:crypto'
import { renameSync, writeFileSync } from 'node:fs'
import { rename, unlink, writeFile } from 'node:fs/promises'

/**
 * Safely write data to a file by writing to a unique temporary file first,
 * then atomically renaming it over the destination. Survives crash/kill
 * mid-write — the destination file is either fully old or fully new,
 * never truncated.
 *
 * The temp filename includes a per-call random suffix so two concurrent
 * `atomicWriteFile` calls targeting the same path don't stomp each other's
 * tmp file — last-rename-wins is fine; tmp-file-stomping would corrupt
 * the loser's content into a partial file before its rename.
 *
 * @param filePath Absolute path to the target file
 * @param data Content (string for text, Buffer for binary)
 * @param encoding Optional encoding hint for string data; ignored for Buffer
 */
export async function atomicWriteFile(
  filePath: string,
  data: string | Buffer,
  encoding: BufferEncoding = 'utf-8'
): Promise<void> {
  const tmpPath = `${filePath}.${randomUUID()}.tmp`
  try {
    if (typeof data === 'string') {
      await writeFile(tmpPath, data, encoding)
    } else {
      await writeFile(tmpPath, data)
    }
    await rename(tmpPath, filePath)
  } catch (err) {
    // Clean up the orphaned tmp on failure (best-effort).
    await unlink(tmpPath).catch(() => undefined)
    throw err
  }
}

/** Synchronous atomic write (main-process config that must stay sync). */
export function atomicWriteFileSync(filePath: string, data: string): void {
  const tmpPath = `${filePath}.${randomUUID()}.tmp`
  writeFileSync(tmpPath, data, 'utf-8')
  renameSync(tmpPath, filePath)
}
