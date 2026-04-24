import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { app } from 'electron'
import type { StorageResult } from './types'

const IMAGE_ID_RE = /^[a-zA-Z0-9_-]+$/
const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB

let imageDirReady: Promise<string> | null = null

function getImageLibraryDir(): Promise<string> {
  if (!imageDirReady) {
    imageDirReady = (async () => {
      const dir = join(app.getPath('userData'), 'image-library')
      await mkdir(dir, { recursive: true })
      return dir
    })()
  }
  return imageDirReady
}

function isValidImageId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && IMAGE_ID_RE.test(id)
}

export interface ImageLibraryEntry {
  id: string
  name: string
  fileName: string
  savedAt: string
}

interface ImageLibraryMeta {
  id: string
  name: string
  fileName: string
  savedAt: string
}

/**
 * Save an image to the image library.
 */
export async function saveImage(
  id: string,
  name: string,
  buffer: Buffer,
  extension: string
): Promise<StorageResult<void>> {
  if (!isValidImageId(id)) {
    return { success: false, error: 'Invalid image ID' }
  }
  if (!name || typeof name !== 'string') {
    return { success: false, error: 'Invalid image name' }
  }
  const ext = extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { success: false, error: `Unsupported image format: ${ext}` }
  }
  if (buffer.length > MAX_IMAGE_SIZE) {
    return { success: false, error: `Image too large: ${buffer.length} bytes (max ${MAX_IMAGE_SIZE})` }
  }
  try {
    const dir = await getImageLibraryDir()
    const fileName = `${id}${ext}`
    await writeFile(join(dir, fileName), buffer)

    // Save metadata alongside the image
    const meta: ImageLibraryMeta = {
      id,
      name,
      fileName,
      savedAt: new Date().toISOString()
    }
    await writeFile(join(dir, `${id}.meta.json`), JSON.stringify(meta, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: `Failed to save image: ${(err as Error).message}` }
  }
}

/**
 * List all images in the library.
 */
export async function listImages(): Promise<
  StorageResult<Array<{ id: string; name: string; fileName: string; savedAt: string }>>
> {
  try {
    const dir = await getImageLibraryDir()
    const files = await readdir(dir)
    const entries: Array<{ id: string; name: string; fileName: string; savedAt: string }> = []

    for (const file of files) {
      if (!file.endsWith('.meta.json')) continue
      try {
        const content = await readFile(join(dir, file), 'utf-8')
        const meta = JSON.parse(content) as ImageLibraryMeta
        entries.push({
          id: meta.id,
          name: meta.name,
          fileName: meta.fileName,
          savedAt: meta.savedAt
        })
      } catch {
        // Skip corrupted metadata
      }
    }

    return { success: true, data: entries }
  } catch (err) {
    return { success: false, error: `Failed to list images: ${(err as Error).message}` }
  }
}

/**
 * Get the file path for a specific image.
 */
export async function getImage(id: string): Promise<StorageResult<{ path: string; name: string }>> {
  if (!isValidImageId(id)) {
    return { success: false, error: 'Invalid image ID' }
  }
  try {
    const dir = await getImageLibraryDir()
    const metaContent = await readFile(join(dir, `${id}.meta.json`), 'utf-8')
    const meta = JSON.parse(metaContent) as ImageLibraryMeta
    const imagePath = join(dir, meta.fileName)

    // Verify the image file actually exists
    await stat(imagePath)

    return { success: true, data: { path: imagePath, name: meta.name } }
  } catch (err) {
    return { success: false, error: `Failed to load image: ${(err as Error).message}` }
  }
}

/**
 * Delete an image and its metadata from the library.
 */
export async function deleteImage(id: string): Promise<StorageResult<void>> {
  if (!isValidImageId(id)) {
    return { success: false, error: 'Invalid image ID' }
  }
  try {
    const dir = await getImageLibraryDir()

    // Read metadata to find the image file name
    try {
      const metaContent = await readFile(join(dir, `${id}.meta.json`), 'utf-8')
      const meta = JSON.parse(metaContent) as ImageLibraryMeta
      try {
        await unlink(join(dir, meta.fileName))
      } catch {
        // Image file may already be gone
      }
    } catch {
      // Try to find and delete any image file with this ID
      const files = await readdir(dir)
      for (const file of files) {
        const fileExt = extname(file)
        if (file === `${id}${fileExt}` && ALLOWED_EXTENSIONS.has(fileExt)) {
          try {
            await unlink(join(dir, file))
          } catch {
            // Ignore
          }
        }
      }
    }

    // Always try to delete the metadata file
    try {
      await unlink(join(dir, `${id}.meta.json`))
    } catch {
      // Metadata may already be gone
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: `Failed to delete image: ${(err as Error).message}` }
  }
}
