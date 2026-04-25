import { renameSync, writeFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'

/**
 * Safely writes data to a file by writing to a temporary file first,
 * then atomically renaming it over the destination file.
 * This prevents data corruption (truncated files) if the app crashes
 * or is forcefully terminated during a write operation.
 *
 * @param filePath The absolute path to the target file
 * @param data The string data to write
 */
export async function atomicWriteFile(filePath: string, data: string): Promise<void> {
  const tmpPath = `${filePath}.tmp`
  // Write to temporary file
  await writeFile(tmpPath, data, 'utf-8')
  // Atomically overwrite the target file (on Windows NTFS, this is atomic for same-volume renames)
  await rename(tmpPath, filePath)
}

/** Synchronous atomic write (main-process config that must stay sync). */
export function atomicWriteFileSync(filePath: string, data: string): void {
  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, data, 'utf-8')
  renameSync(tmpPath, filePath)
}
