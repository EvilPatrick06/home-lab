import { access, copyFile, mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { isValidUUID } from '../../shared/utils/uuid'
import { logToFile } from '../log'
import { CURRENT_SCHEMA_VERSION, migrateData } from './migrations'
import type { StorageResult } from './types'

let charactersDirReady: Promise<string> | null = null

function getCharactersDir(): Promise<string> {
  if (!charactersDirReady) {
    charactersDirReady = (async () => {
      const dir = join(app.getPath('userData'), 'characters')
      await mkdir(dir, { recursive: true })
      return dir
    })()
  }
  return charactersDirReady
}

async function getCharacterPath(id: string): Promise<string> {
  const dir = await getCharactersDir()
  return join(dir, `${id}.json`)
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function getVersionsDir(characterId: string): Promise<string> {
  const dir = await getCharactersDir()
  const versionsDir = join(dir, '.versions', characterId)
  await mkdir(versionsDir, { recursive: true })
  return versionsDir
}

export async function saveCharacter(character: Record<string, unknown>): Promise<StorageResult<void>> {
  try {
    const id = character.id as string
    if (!id) {
      return { success: false, error: 'Character must have an id' }
    }
    if (!isValidUUID(id)) {
      return { success: false, error: 'Invalid character ID' }
    }
    character.schemaVersion = CURRENT_SCHEMA_VERSION
    const path = await getCharacterPath(id)

    // Create versioned backup of existing file before overwriting
    if (await fileExists(path)) {
      try {
        const versionsDir = await getVersionsDir(id)
        const ts = new Date().toISOString().replace(/[:.]/g, '-')
        const bakPath = join(versionsDir, `${id}_${ts}.json`)
        await copyFile(path, bakPath)

        // Prune old versions, keep latest 20
        const allVersions = (await readdir(versionsDir)).filter((f) => f.endsWith('.json')).sort()
        if (allVersions.length > 20) {
          const toDelete = allVersions.slice(0, allVersions.length - 20)
          await Promise.allSettled(toDelete.map((f) => unlink(join(versionsDir, f))))
        }
      } catch {
        // Non-fatal: versioning failure shouldn't block saving
      }
    }

    await writeFile(path, JSON.stringify(character, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: `Failed to save character: ${(err as Error).message}` }
  }
}

export interface CharacterVersion {
  fileName: string
  timestamp: string
  sizeBytes: number
}

export async function listCharacterVersions(id: string): Promise<StorageResult<CharacterVersion[]>> {
  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid character ID' }
  }
  try {
    const dir = await getCharactersDir()
    const versionsDir = join(dir, '.versions', id)
    if (!(await fileExists(versionsDir))) {
      return { success: true, data: [] }
    }

    const files = (await readdir(versionsDir))
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
    const versions: CharacterVersion[] = []
    for (const f of files) {
      const fileStat = await stat(join(versionsDir, f))
      // Extract timestamp from filename: id_YYYY-MM-DDTHH-MM-SS-MMMZ.json
      const tsMatch = f.match(/_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/)
      const timestamp = tsMatch
        ? tsMatch[1]
            .replace(/-/g, (m, offset: number) => (offset > 9 ? ':' : m))
            .replace(/T(\d{2}):(\d{2}):(\d{2})/, 'T$1:$2:$3')
        : fileStat.mtime.toISOString()
      versions.push({ fileName: f, timestamp, sizeBytes: fileStat.size })
    }
    return { success: true, data: versions }
  } catch (err) {
    return { success: false, error: `Failed to list versions: ${(err as Error).message}` }
  }
}

export async function restoreCharacterVersion(
  id: string,
  fileName: string
): Promise<StorageResult<Record<string, unknown>>> {
  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid character ID' }
  }
  if (!fileName.endsWith('.json') || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return { success: false, error: 'Invalid version file name' }
  }
  try {
    const dir = await getCharactersDir()
    const versionPath = join(dir, '.versions', id, fileName)
    if (!(await fileExists(versionPath))) {
      return { success: false, error: 'Version file not found' }
    }
    const data = await readFile(versionPath, 'utf-8')
    const parsed = migrateData(JSON.parse(data))

    // Save the restored version as the current character (which creates its own backup)
    await saveCharacter(parsed)
    return { success: true, data: parsed }
  } catch (err) {
    return { success: false, error: `Failed to restore version: ${(err as Error).message}` }
  }
}

export async function loadCharacters(): Promise<StorageResult<Record<string, unknown>[]>> {
  try {
    const dir = await getCharactersDir()
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
    const results = await Promise.allSettled(
      files.map(async (f) => {
        const data = await readFile(join(dir, f), 'utf-8')
        return migrateData(JSON.parse(data))
      })
    )
    const characters: Record<string, unknown>[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') {
        characters.push(r.value)
      } else {
        logToFile('ERROR', 'Failed to load a character file:', String(r.reason))
      }
    }
    return { success: true, data: characters }
  } catch (err) {
    return { success: false, error: `Failed to load characters: ${(err as Error).message}` }
  }
}

export async function loadCharacter(id: string): Promise<StorageResult<Record<string, unknown> | null>> {
  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid character ID' }
  }
  try {
    const path = await getCharacterPath(id)
    if (!(await fileExists(path))) {
      return { success: true, data: null }
    }
    const data = await readFile(path, 'utf-8')
    return { success: true, data: migrateData(JSON.parse(data)) }
  } catch (err) {
    return { success: false, error: `Failed to load character: ${(err as Error).message}` }
  }
}

export async function deleteCharacter(id: string): Promise<StorageResult<boolean>> {
  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid character ID' }
  }
  try {
    const path = await getCharacterPath(id)
    if (!(await fileExists(path))) {
      return { success: true, data: false }
    }
    await unlink(path)
    return { success: true, data: true }
  } catch (err) {
    return { success: false, error: `Failed to delete character: ${(err as Error).message}` }
  }
}
